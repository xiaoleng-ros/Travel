import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { IconChevronDown } from '@tabler/icons-react'
import TopBar from '../components/TopBar'
import PhotoWall from '../components/PhotoWall'
import FooterBadge from '../components/FooterBadge'
import PhotoViewer from '../components/PhotoViewer'
import { useGalleryData } from '../context/GalleryDataContext'
import { useGallery, applyFilters, sortPhotos } from '../context/GalleryContext'
import { useSettings } from '../context/SettingsContext'
import { useLocale } from '../context/LocaleContext'

const BATCH_SIZE = 33

export default function HomePage() {
  const { photoId: viewerId } = useParams()
  const navigate = useNavigate()
  const { photos, albums, loading, error } = useGalleryData()
  const { filters, search, sort, hasActiveFilters } = useGallery()
  const { getSetting } = useSettings()
  const { t } = useLocale()
  const [limit, setLimit] = useState(BATCH_SIZE)
  const [scrolled, setScrolled] = useState(false)
  const [activePhoto, setActivePhoto] = useState(null)
  const ticking = useRef(false)

  const filtered = useMemo(() => {
    const result = applyFilters(photos, { filters, search })
    return sortPhotos(result, sort)
  }, [photos, filters, search, sort])

  const visible = filtered.slice(0, limit)
  const hasMore = limit < filtered.length

  const filterKey = JSON.stringify(filters)
  useEffect(() => {
    setLimit(BATCH_SIZE)
  }, [sort, filterKey, search])

  const photoMap = useMemo(() => {
    const map = new Map()
    for (const photo of photos) map.set(photo.id, photo)
    return map
  }, [photos])

  useEffect(() => {
    const update = () => {
      ticking.current = false
      const y = window.scrollY
      if (y < 70) {
        setScrolled(false)
        setActivePhoto(null)
        return
      }
      setScrolled(true)
      const cards = Array.from(document.querySelectorAll('.photo-card'))
      let best = null
      let bestDistance = Infinity
      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        if (rect.top > 90) continue
        if (rect.bottom < 60) continue
        const distance = Math.abs(rect.top - 54)
        if (distance < bestDistance) {
          bestDistance = distance
          best = card.getAttribute('data-photo-id')
        }
      }
      if (best) setActivePhoto(photoMap.get(best) || null)
    }
    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(update)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => window.removeEventListener('scroll', onScroll)
  }, [photoMap, visible.length])

  const openPhoto = (id) => {
    navigate(`/${id}`)
  }

  const closeViewer = () => {
    navigate('/')
  }

  return (
    <div className="relative min-h-screen">
      <TopBar
        photos={photos}
        total={photos.length}
        activePhoto={activePhoto}
        scrolled={scrolled}
      />

      <div className="px-1 pb-10 pt-[45px] md:pt-[54px]">
        {loading ? (
          <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
            <img
              src={getSetting('app:avatarUrl') || '/brand/avatar.webp'}
              alt=""
              className="size-14 animate-pulse rounded-full object-cover"
            />
            <span className="animate-pulse text-sm font-medium text-neutral-500">
              {t('loading')}
            </span>
          </div>
        ) : error ? (
          <div className="flex min-h-[60vh] items-center justify-center text-sm text-neutral-500">
            {error.message}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[60vh] items-center justify-center text-sm text-neutral-500">
            {hasActiveFilters ? t('noResults') : t('noPhotos')}
          </div>
        ) : (
          <>
            <PhotoWall photos={visible} onOpen={openPhoto} />
            {hasMore && (
              <div className="flex justify-center pt-6">
                <button
                  type="button"
                  onClick={() => setLimit((value) => value + BATCH_SIZE)}
                  className="inline-flex h-8 items-center gap-1 rounded-md bg-neutral-100 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  {t('moreMoments')}
                  <IconChevronDown size={18} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <FooterBadge />

      {viewerId && (
        <PhotoViewer
          photoId={viewerId}
          photos={filtered}
          albums={albums}
          onClose={closeViewer}
        />
      )}
    </div>
  )
}
