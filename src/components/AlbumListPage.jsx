import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { getAlbumPhotos } from '../api/real'
import PhotoGrid from './PhotoGrid'
import ThemeToggle from './ThemeToggle'
import { useTheme } from '../context/ThemeContext'
import { motion } from 'motion/react'

// 灯箱只在点开时才加载，减小首屏主包体积
const Lightbox = lazy(() => import('./Lightbox'))

const PAGE_SIZE = 40
// 前台统一展示全部照片（albumId=0 表示「全部」）
const ALL_PHOTOS_ALBUM = 0

export default function AlbumListPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [photos, setPhotos] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState(null)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState('')
  const loadingRef = useRef(false)
  // 灯箱关闭动画的定时器。必须持有它才能取消：
  // 否则「关闭后 300ms 内点开另一张」时，上一个定时器会把新打开的灯箱清成 null。
  const closeTimerRef = useRef(null)

  const hasMore = photos.length < total

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      loadingRef.current = false
      try {
        const res = await getAlbumPhotos(ALL_PHOTOS_ALBUM, { page: 1, limit: PAGE_SIZE, scene: 'grid' })
        if (res.code === 200 && res.data) {
          setPhotos(res.data.result || [])
          setTotal(res.data.total || 0)
          setPage(1)
        }
      } catch (err) {
        console.error('获取照片失败:', err)
        setPhotos([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  const loadMore = async () => {
    if (!hasMore || loadingMore || loadingRef.current) return
    loadingRef.current = true
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      const res = await getAlbumPhotos(ALL_PHOTOS_ALBUM, { page: nextPage, limit: PAGE_SIZE, scene: 'grid' })
      if (res.code === 200 && res.data) {
        setPhotos((prev) => [...prev, ...(res.data.result || [])])
        setTotal(res.data.total || 0)
        setPage(nextPage)
      }
    } catch (err) {
      console.error('加载更多失败:', err)
    } finally {
      setLoadingMore(false)
      loadingRef.current = false
    }
  }

  const openLightbox = async (photo) => {
    // 上一次关闭动画可能还没结束，先取消它，避免它把这次打开的灯箱清掉
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
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
  }

  const goPrev = () => {
    if (lightboxIndex === null || lightboxIndex <= 0) return
    openLightbox(photos[lightboxIndex - 1])
  }

  const goNext = () => {
    if (lightboxIndex === null || lightboxIndex >= photos.length - 1) return
    openLightbox(photos[lightboxIndex + 1])
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null
      setLightboxPhoto(null)
      setLightboxSrc('')
      setLightboxIndex(null)
    }, 300)
  }

  // 组件卸载时清掉未触发的定时器，避免对已卸载组件 setState
  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (!lightboxOpen) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, lightboxIndex, photos])

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#1a1a1a]' : 'bg-[#faf9f6]'}`}>
      <ThemeToggle />

      {loading && photos.length === 0 && (
        <div className={`fixed inset-0 ${isDark ? 'bg-[#1a1a1a]/90' : 'bg-[#faf9f6]/90'} backdrop-blur-md flex items-center justify-center z-50`}>
          <div className="flex flex-col items-center gap-4">
            <div className={`w-10 h-10 border-2 rounded-full animate-spin ${isDark ? 'border-white/10 border-t-white/60' : 'border-[#1a1a1a]/10 border-t-[#1a1a1a]'}`} />
            <div className={`text-sm font-sans-body ${isDark ? 'text-[#9a9588]' : 'text-[#7a7568]'}`}>加载中</div>
          </div>
        </div>
      )}

      {/* Hero */}
      <header className="flex-none px-6 md:px-12 lg:px-20 pt-14 pb-7">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className={`flex items-center gap-3 mb-4 ${isDark ? 'text-[#6a6560]' : 'text-[#a89f91]'}`}>
            <span className={`h-px w-8 ${isDark ? 'bg-[#44403c]' : 'bg-[#d9d2c6]'}`} />
            <p className="text-[11px] uppercase tracking-[0.3em] font-sans-body font-medium">Photo Memoir</p>
          </div>
          <h1 className={`text-[clamp(2.4rem,5vw,3.8rem)] leading-[1.05] font-light mb-3 ${isDark ? 'text-[#f5f5f5]' : 'text-[#1a1a1a]'}`}>
            心之所向
          </h1>
          <p className={`text-base font-light max-w-md leading-relaxed ${isDark ? 'text-[#8a8580]' : 'text-[#7a7568]'}`}>
            每一张照片，都是一段不愿遗忘的时光
          </p>
          {!loading && total > 0 && (
            <p className={`mt-4 flex items-center gap-2 text-[12px] font-sans-body ${isDark ? 'text-[#6a6560]' : 'text-[#a89f91]'}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${isDark ? 'bg-[#57534e]' : 'bg-[#d9d2c6]'}`} />
              共收录 {total} 张照片，留驻此刻
            </p>
          )}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`mt-6 h-px origin-left ${isDark ? 'bg-[#2a2a2a]' : 'bg-[#ece7dd]'}`}
        />
      </header>

      {/* Photo Masonry Grid：跟随文档流，照片左右留白由 PhotoGrid 内部控制 */}
      <main className="pb-16">
        {photos.length > 0 ? (
          <PhotoGrid
            photos={photos}
            onPhotoClick={openLightbox}
            onReachEnd={loadMore}
            hasMore={hasMore}
            isLoadingMore={loadingMore}
          />
        ) : !loading ? (
          <div className="py-24 flex items-center justify-center">
            <p className={`text-lg font-sans-body ${isDark ? 'text-[#6a6560]' : 'text-[#9a9588]'}`}>暂无照片</p>
          </div>
        ) : null}
      </main>

      {lightboxOpen && lightboxPhoto && (
        <Suspense fallback={null}>
          <Lightbox
            photo={{ ...lightboxPhoto, url: lightboxSrc }}
            currentIndex={lightboxIndex}
            totalCount={total || photos.length}
            onClose={closeLightbox}
            onPrev={goPrev}
            onNext={goNext}
            isLoading={imgLoading}
          />
        </Suspense>
      )}
    </div>
  )
}
