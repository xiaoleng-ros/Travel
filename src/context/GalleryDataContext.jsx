import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

const GalleryDataContext = createContext(null)

export function GalleryDataProvider({ children }) {
  const [photos, setPhotos] = useState([])
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const [photoList, albumList] = await Promise.all([
        api.get('/api/photos'),
        api.get('/api/albums'),
      ])
      setPhotos(Array.isArray(photoList) ? photoList : [])
      setAlbums(Array.isArray(albumList) ? albumList : [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ photos, albums, loading, error, refresh }),
    [photos, albums, loading, error, refresh],
  )
  return <GalleryDataContext.Provider value={value}>{children}</GalleryDataContext.Provider>
}

export function useGalleryData() {
  return useContext(GalleryDataContext)
}
