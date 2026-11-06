import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'

const GalleryDataContext = createContext(null)

// 首屏只取一页；需要全量的页面（相册详情、地球页）再主动 loadAll()。
const PAGE_SIZE = 24

export function GalleryDataProvider({ children }) {
  const [photos, setPhotos] = useState([])
  const [albums, setAlbums] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  // 这些值在回调里要用到最新值，state 闭包会过期，所以额外用 ref 记一份。
  const offsetRef = useRef(0)
  const loadedRef = useRef(0)
  const totalRef = useRef(0)
  const busyRef = useRef(false)

  const applyList = useCallback((list, nextTotal) => {
    setPhotos(list)
    offsetRef.current = list.length
    loadedRef.current = list.length
    totalRef.current = nextTotal
    setTotal(nextTotal)
  }, [])

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const [page, albumList] = await Promise.all([
        api.getPage(`/api/photos?limit=${PAGE_SIZE}&offset=0`),
        api.get('/api/albums'),
      ])
      const list = Array.isArray(page.data) ? page.data : []
      applyList(list, page.total ?? list.length)
      setAlbums(Array.isArray(albumList) ? albumList : [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [applyList])

  const loadMore = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setLoadingMore(true)
    try {
      const page = await api.getPage(`/api/photos?limit=${PAGE_SIZE}&offset=${offsetRef.current}`)
      const list = Array.isArray(page.data) ? page.data : []
      const nextTotal = page.total ?? totalRef.current
      offsetRef.current += list.length
      totalRef.current = nextTotal
      setTotal(nextTotal)
      if (list.length) {
        setPhotos((prev) => {
          const seen = new Set(prev.map((photo) => photo.id))
          const merged = [...prev, ...list.filter((photo) => !seen.has(photo.id))]
          loadedRef.current = merged.length
          return merged
        })
      }
    } catch (err) {
      setError(err)
    } finally {
      busyRef.current = false
      setLoadingMore(false)
    }
  }, [])

  // 拉全量。已经拉全过就直接返回，避免每次进相册页都重新请求。
  const loadAll = useCallback(async () => {
    if (busyRef.current) return
    if (totalRef.current > 0 && loadedRef.current >= totalRef.current) return
    busyRef.current = true
    try {
      const [photoList, albumList] = await Promise.all([api.get('/api/photos'), api.get('/api/albums')])
      const list = Array.isArray(photoList) ? photoList : []
      applyList(list, list.length)
      setAlbums(Array.isArray(albumList) ? albumList : [])
    } catch (err) {
      setError(err)
    } finally {
      busyRef.current = false
    }
  }, [applyList])

  useEffect(() => {
    refresh()
  }, [refresh])

  const hasMore = photos.length < total

  const value = useMemo(
    () => ({
      photos,
      albums,
      total,
      hasMore,
      loading,
      loadingMore,
      error,
      refresh,
      loadMore,
      loadAll,
    }),
    [photos, albums, total, hasMore, loading, loadingMore, error, refresh, loadMore, loadAll],
  )
  return <GalleryDataContext.Provider value={value}>{children}</GalleryDataContext.Provider>
}

export function useGalleryData() {
  return useContext(GalleryDataContext)
}
