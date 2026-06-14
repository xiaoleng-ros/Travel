import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { getAlbumPhotos, getAlbumById } from '../api/mock'
import PhotoGrid from './PhotoGrid'
import Lightbox from './Lightbox'
import ThemeToggle from './ThemeToggle'
import { useTheme } from '../context/ThemeContext'
import { ArrowLeft, Calendar } from '../icons'

const PAGE_SIZE = 40

export default function PhotoDetailPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const { id } = useParams()
  const navigate = useNavigate()

  const [album, setAlbum] = useState(null)
  const [photos, setPhotos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingRef = useRef(false)

  const hasMore = photos.length < total

  useEffect(() => {
    if (id === undefined) return
    const albumId = parseInt(id, 10)
    if (isNaN(albumId)) return

    const fetch = async () => {
      setLoading(true)
      setPhotos([])
      setPage(1)
      try {
        const [albumRes, photoRes] = await Promise.all([
          getAlbumById(albumId),
          getAlbumPhotos(albumId, { page: 1, limit: PAGE_SIZE, scene: 'grid' }),
        ])
        if (albumRes.code === 200) setAlbum(albumRes.data)
        if (photoRes.code === 200 && photoRes.data) {
          setPhotos(photoRes.data.result || [])
          setTotal(photoRes.data.total || 0)
          setPage(1)
        }
      } catch (err) {
        console.error('获取相册照片失败:', err)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [id])

  const loadMore = useCallback(() => {
    const albumId = parseInt(id, 10)
    if (isNaN(albumId) || !hasMore || loadingMore || loadingRef.current) return
    loadingRef.current = true
    setLoadingMore(true)

    const nextPage = page + 1
    getAlbumPhotos(albumId, { page: nextPage, limit: PAGE_SIZE, scene: 'grid' })
      .then((res) => {
        if (res.code === 200 && res.data) {
          setPhotos((prev) => [...prev, ...(res.data.result || [])])
          setTotal(res.data.total || 0)
          setPage(nextPage)
        }
      })
      .catch(console.error)
      .finally(() => {
        setLoadingMore(false)
        loadingRef.current = false
      })
  }, [id, page, hasMore, loadingMore])

  const openLightbox = useCallback(async (photo) => {
    const idx = photos.findIndex((p) => p.id === photo.id)
    const src = photo.original_url || photo.url
    setLightboxPhoto(photo)
    setLightboxIndex(idx)
    setLightboxSrc(src)
    setImgLoading(true)
    setLightboxOpen(true)
    const img = new Image()
    img.src = src
    await new Promise((resolve) => {
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
    })
    setImgLoading(false)
  }, [photos])

  const goPrev = useCallback(() => {
    if (lightboxIndex === null || lightboxIndex <= 0) return
    const idx = lightboxIndex - 1
    const photo = photos[idx]
    openLightbox(photo)
  }, [lightboxIndex, photos, openLightbox])

  const goNext = useCallback(() => {
    if (lightboxIndex === null || lightboxIndex >= photos.length - 1) return
    const idx = lightboxIndex + 1
    const photo = photos[idx]
    openLightbox(photo)
  }, [lightboxIndex, photos, openLightbox])

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false)
    setTimeout(() => {
      setLightboxPhoto(null)
      setLightboxSrc('')
      setLightboxIndex(null)
    }, 300)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (!lightboxOpen) return
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          goNext()
          break
        case 'Escape':
          e.preventDefault()
          closeLightbox()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, goPrev, goNext, closeLightbox])

  const goBack = useCallback(() => navigate('/'), [navigate])

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#1a1a1a]' : 'bg-[#faf9f6]'}`}>
      <ThemeToggle />

      {loading && photos.length === 0 && (
        <div className={`fixed inset-0 ${isDark ? 'bg-[#1a1a1a]/90' : 'bg-[#faf9f6]/90'} backdrop-blur-md flex items-center justify-center z-50`}>
          <div className="flex flex-col items-center gap-4">
            <div className={`w-10 h-10 border-2 rounded-full animate-spin ${isDark ? 'border-white/10 border-t-white/60' : 'border-[#1a1a1a]/10 border-t-[#1a1a1a]'}`} />
            <div className={`text-sm font-sans-body ${isDark ? 'text-[#8a8580]' : 'text-[#7a7568]'}`}>加载中</div>
          </div>
        </div>
      )}

      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        onClick={goBack}
        className={`fixed top-8 left-8 z-40 flex items-center gap-2 backdrop-blur-md px-5 py-2.5 rounded-full transition-all duration-300 border group cursor-pointer shadow-sm
          ${isDark
            ? 'hover:bg-white/10 text-[#f5f5f5] border-white/10'
            : 'hover:bg-black/5 text-[#1a1a1a] border-black/10'
          }`}
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        <span className="hidden md:inline text-sm font-medium font-sans-body">返回</span>
      </motion.button>

      {/* Album Title */}
      {album && photos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`fixed top-7 left-1/2 -translate-x-1/2 z-40 backdrop-blur-md px-6 py-2.5 rounded-full border shadow-sm
            ${isDark ? 'bg-black/60 border-white/10' : 'bg-white/90 border-black/10'}`}
        >
          <div className="flex items-center gap-3">
            <h2 className={`text-lg font-medium font-serif-display ${isDark ? 'text-[#f5f5f5]' : 'text-[#1a1a1a]'}`}>{album.name}</h2>
            <span className={`text-xs font-sans-body ${isDark ? 'text-[#8a8580]' : 'text-[#a89f91]'}`}>
              {photos.length}{total > photos.length ? ` / ${total}` : ''} 张
            </span>
          </div>
        </motion.div>
      )}

      {photos.length === 0 && !loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className={`mb-6 ${isDark ? 'text-[#3a3a3a]' : 'text-[#d5d0c8]'}`}>
              <svg className="w-48 h-48 mx-auto opacity-40" viewBox="0 0 1040 720" fill="currentColor">
                <path d="M8.912,559.569c-30.885-86.071,78.034-109.959,123.487-173.448S3.884,304.088,98.41,205.692 S281.83,29.19,484.356,14.791c124.333-8.84,515.466,55.852,466.393,223.846s140.984,212.501,70.995,325.078 S671.596,748.725,530.412,674.983C475.707,646.184,110.477,813.523,8.912,559.569z"/>
              </svg>
            </div>
            <p className={`text-lg font-sans-body ${isDark ? 'text-[#6a6560]' : 'text-[#9a9588]'}`}>空空如也</p>
          </div>
        </div>
      ) : (
        <PhotoGrid
          photos={photos}
          onPhotoClick={openLightbox}
          onReachEnd={loadMore}
          hasMore={hasMore}
          isLoadingMore={loadingMore}
        />
      )}

      {lightboxOpen && lightboxPhoto && (
        <Lightbox
          photo={{ ...lightboxPhoto, url: lightboxSrc }}
          currentIndex={lightboxIndex}
          totalCount={total || photos.length}
          onClose={closeLightbox}
          onPrev={goPrev}
          onNext={goNext}
          isLoading={imgLoading}
        />
      )}
    </div>
  )
}
