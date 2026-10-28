import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  IconAperture,
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFileDescription,
  IconFocusCentered,
  IconInfoCircle,
  IconMapPin,
  IconPhoto,
  IconRuler2,
  IconShare3,
  IconStar,
  IconSun,
  IconTag,
  IconX,
  IconCamera,
  IconPalette,
  IconAlbum,
  IconBolt,
  IconAdjustments,
  IconBulb,
  IconGridDots,
  IconRoute,
} from '@tabler/icons-react'
import { api } from '../lib/api'
import { useLocale } from '../context/LocaleContext'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../context/ToastContext'
import {
  basename,
  colorSpaceLabel,
  exposureProgramLabel,
  flashLabel,
  formatAperture,
  formatBytes,
  formatCoordinate,
  formatDateTime,
  formatExposure,
  formatFocalLength,
  formatMegapixels,
  meteringModeLabel,
  photoAspect,
  originalFor,
  sensingMethodLabel,
  thumbnailFor,
} from '../lib/format'
import ThumbHash from './ThumbHash'
import MiniMap from './MiniMap'
import Histogram from './Histogram'

const REACTIONS = [
  ['like', '👍'],
  ['love', '❤️'],
  ['wow', '😮'],
  ['funny', '😂'],
  ['fire', '🔥'],
  ['sparkle', '✨'],
  ['sad', '😢'],
  ['amazing', '🎉'],
]

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="viewer-panel-title">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function Row({ icon: Icon, label, value, children }) {
  return (
    <div className="viewer-row">
      <span className="viewer-row-label">
        {Icon && <Icon size={16} />}
        {label}
      </span>
      {children || <span className="viewer-row-value">{value || '—'}</span>}
    </div>
  )
}

function getFingerprint() {
  let fingerprint = localStorage.getItem('memora-fingerprint')
  if (!fingerprint) {
    fingerprint = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
    localStorage.setItem('memora-fingerprint', fingerprint)
  }
  return fingerprint
}

export default function PhotoViewer({ photoId, photos = [], albums = [], onClose }) {
  const navigate = useNavigate()
  const { t } = useLocale()
  const { dark } = useTheme()
  const toast = useToast()
  const [fallbackPhoto, setFallbackPhoto] = useState(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [reactions, setReactions] = useState({ counts: {}, mine: null })
  const [pickerOpen, setPickerOpen] = useState(false)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })
  const imageAreaRef = useRef(null)
  const stripRef = useRef(null)
  const activeThumbRef = useRef(null)

  const list = photos.length ? photos : fallbackPhoto ? [fallbackPhoto] : []
  const index = list.findIndex((photo) => photo.id === photoId)
  const photo = index >= 0 ? list[index] : fallbackPhoto

  useEffect(() => {
    if (index >= 0) {
      setFallbackPhoto(null)
      return
    }
    let cancelled = false
    api
      .get(`/api/photos/${encodeURIComponent(photoId)}`)
      .then((data) => {
        if (!cancelled) setFallbackPhoto(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [photoId, index])

  useEffect(() => {
    setImageLoaded(false)
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setPickerOpen(false)
  }, [photoId])

  useEffect(() => {
    const fingerprint = getFingerprint()
    api
      .get(`/api/photos/${encodeURIComponent(photoId)}/reactions?fingerprint=${encodeURIComponent(fingerprint)}`)
      .then((data) => setReactions(data || { counts: {}, mine: null }))
      .catch(() => {})
  }, [photoId])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(event.target.tagName)) return
      if (event.key === 'ArrowLeft') goPrev()
      if (event.key === 'ArrowRight') goNext()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  })

  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }, [photoId])

  useEffect(() => {
    const element = imageAreaRef.current
    if (!element) return
    const onWheel = (event) => {
      event.preventDefault()
      setScale((current) => {
        const next = Math.min(6, Math.max(1, current - event.deltaY * 0.002))
        if (next === 1) setPosition({ x: 0, y: 0 })
        return next
      })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [photoId])

  const goPrev = () => {
    if (index > 0) navigate(`/${list[index - 1].id}`)
  }
  const goNext = () => {
    if (index >= 0 && index < list.length - 1) navigate(`/${list[index + 1].id}`)
  }

  const includedAlbums = useMemo(
    () => albums.filter((album) => (album.photoIds || []).includes(photo?.id)),
    [albums, photo?.id],
  )

  if (!photo) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/60 backdrop-blur-2xl dark:bg-black/60">
        <button type="button" className="btn btn-soft" onClick={onClose}>
          {t('viewer.close')}
        </button>
      </div>
    )
  }

  const exif = photo.exif || {}
  const aspect = photoAspect(photo)
  const camera = exif.Model || exif.Make
  const focal = exif.FocalLength
  const aperture = exif.Aperture ?? exif.FNumber
  const exposure = exif.ExposureTime
  const iso = exif.ISO
  const focal35 = exif.FocalLengthIn35mmFilm || exif.FocalLengthIn35mmFormat
  const maxAperture = exif.MaxApertureValue ?? exif.FNumber
  const rating = Number(photo.rating || 0)
  const totalReactions = Object.values(reactions.counts || {}).reduce((sum, n) => sum + n, 0)

  const handleDoubleClick = () => {
    setScale((current) => {
      if (current > 1) {
        setPosition({ x: 0, y: 0 })
        return 1
      }
      return 2.5
    })
  }

  const onPointerDown = (event) => {
    if (scale <= 1) return
    dragging.current = true
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      px: position.x,
      py: position.y,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event) => {
    if (!dragging.current) return
    const dx = event.clientX - dragStart.current.x
    const dy = event.clientY - dragStart.current.y
    setPosition({ x: dragStart.current.px + dx, y: dragStart.current.py + dy })
  }

  const onPointerUp = () => {
    dragging.current = false
  }

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: photo.title || 'Memora', url: window.location.href })
      } else {
        await navigator.clipboard.writeText(window.location.href)
        toast?.push('Link copied to clipboard')
      }
    } catch {}
  }

  const react = async (type) => {
    try {
      const data = await api.post(`/api/photos/${encodeURIComponent(photo.id)}/reactions`, {
        type,
        fingerprint: getFingerprint(),
      })
      setReactions(data)
      setPickerOpen(false)
    } catch {}
  }

  return (
    <div className="viewer-fade fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label={t('viewer.close')}
        className="absolute inset-0 bg-white/50 backdrop-blur-2xl dark:bg-black/50"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full flex-col lg:flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={imageAreaRef}
            className="group/image relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 pb-0 lg:p-4 lg:pb-0"
            onDoubleClick={handleDoubleClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <div
              className="relative flex h-full w-full items-center justify-center"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transition: dragging.current ? 'none' : 'transform 0.18s ease-out',
                cursor: scale > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'default',
              }}
            >
              {photo.thumbnailHash && !imageLoaded && (
                <ThumbHash
                  hash={photo.thumbnailHash}
                  className="absolute max-h-full max-w-full object-contain opacity-70 blur-sm"
                />
              )}
              <img
                key={photo.id}
                src={originalFor(photo)}
                alt={photo.title || photo.id}
                onLoad={() => setImageLoaded(true)}
                onError={(event) => {
                  if (thumbnailFor(photo) && event.currentTarget.src !== thumbnailFor(photo)) {
                    event.currentTarget.src = thumbnailFor(photo)
                  }
                }}
                className={`max-h-full max-w-full object-contain shadow-2xl transition-opacity duration-300 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ aspectRatio: String(aspect) }}
                draggable={false}
              />
            </div>

            {scale === 1 && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full bg-black/25 px-3 py-1 text-[11px] text-white/80 backdrop-blur lg:block">
                {t('viewer.zoomHint')}
              </div>
            )}

            {scale !== 1 && (
              <div className="pointer-events-none absolute top-4 left-4 rounded-md bg-black/30 px-2 py-0.5 text-xs text-white/70 tabular-nums backdrop-blur">
                {Math.round(scale * 100)}%
              </div>
            )}

            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={share}
                title={t('viewer.share')}
                className="flex size-9 items-center justify-center rounded-full bg-white/30 text-neutral-800 backdrop-blur transition hover:bg-white/50 dark:bg-white/20 dark:text-white dark:hover:bg-white/30"
              >
                <IconShare3 size={17} />
              </button>
              <button
                type="button"
                onClick={onClose}
                title={t('viewer.close')}
                className="flex size-9 items-center justify-center rounded-full bg-white/30 text-neutral-800 backdrop-blur transition hover:bg-white/50 dark:bg-white/20 dark:text-white dark:hover:bg-white/30"
              >
                <IconX size={18} />
              </button>
            </div>

            {index > 0 && (
              <button
                type="button"
                onClick={goPrev}
                title={t('viewer.prev')}
                className="absolute top-1/2 left-3 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur transition hover:bg-black/50 group-hover/image:opacity-100"
              >
                <IconChevronLeft size={18} />
              </button>
            )}
            {index >= 0 && index < list.length - 1 && (
              <button
                type="button"
                onClick={goNext}
                title={t('viewer.next')}
                className="absolute top-1/2 right-3 z-20 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white opacity-0 backdrop-blur transition hover:bg-black/50 group-hover/image:opacity-100"
              >
                <IconChevronRight size={18} />
              </button>
            )}

            <div className="absolute right-4 bottom-4 z-20 flex flex-col items-end gap-2">
              {pickerOpen && (
                <div className="glass-menu flex items-center gap-1 p-1.5">
                  {REACTIONS.map(([type, emoji]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => react(type)}
                      className={`flex size-8 items-center justify-center rounded-md text-lg transition hover:bg-black/10 dark:hover:bg-white/10 ${
                        reactions.mine === type ? 'bg-black/10 dark:bg-white/15' : ''
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setPickerOpen((value) => !value)}
                className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-sm font-medium text-neutral-800 shadow-lg backdrop-blur-xl transition hover:bg-white dark:bg-neutral-900/90 dark:text-neutral-100"
              >
                <span>😊</span>
                <span>{t('viewer.react')}</span>
                {totalReactions > 0 && (
                  <span className="rounded-full bg-black/10 px-1.5 text-xs dark:bg-white/15">
                    {totalReactions}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div
            ref={stripRef}
            className="flex h-[97px] shrink-0 items-center gap-1 overflow-x-auto px-3 pb-2 pt-2"
          >
            {list.map((item) => {
              const active = item.id === photo.id
              return (
                <button
                  key={item.id}
                  ref={active ? activeThumbRef : undefined}
                  type="button"
                  onClick={() => navigate(`/${item.id}`)}
                  className={`relative shrink-0 overflow-hidden rounded-lg transition-all ${
                    active
                      ? 'size-[70px] ring-2 ring-white shadow-lg dark:ring-white/80'
                      : 'size-16 opacity-70 hover:opacity-100'
                  }`}
                  title={item.title || item.id}
                >
                  <img
                    src={thumbnailFor(item)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    draggable={false}
                  />
                </button>
              )
            })}
          </div>
        </div>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-white/10 bg-black/20 text-white backdrop-blur-2xl lg:flex">
          <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-4">
            <h2 className="truncate text-base font-black">{photo.title || photo.id}</h2>
          </div>
          <div className="viewer-info-scroll flex-1 space-y-4 overflow-y-auto p-4 pb-16">
            {photo.description && (
              <div className="viewer-card p-3 text-sm leading-6 text-white/95 text-justify">
                {photo.description}
              </div>
            )}

            {typeof photo.latitude === 'number' && typeof photo.longitude === 'number' && (
              <div className="h-44 overflow-hidden rounded-lg border border-white/10">
                <MiniMap
                  latitude={photo.latitude}
                  longitude={photo.longitude}
                  dark={dark}
                />
              </div>
            )}

            <Section title={t('viewer.basic')}>
              <Row icon={IconFileDescription} label={t('viewer.filename')} value={basename(photo.storageKey)} />
              <Row icon={IconRuler2} label={t('viewer.fileSize')} value={formatBytes(photo.fileSize)} />
              <Row icon={IconGridDots} label={t('viewer.resolution')} value={`${photo.width} × ${photo.height}`} />
              <Row icon={IconPhoto} label={t('viewer.pixels')} value={formatMegapixels(photo.width, photo.height)} />
              <Row icon={IconClock} label={t('viewer.shootingTime')} value={formatDateTime(photo.dateTaken)} />
              <Row icon={IconPalette} label={t('viewer.colorSpace')} value={colorSpaceLabel(exif.ColorSpace)} />
              <Row icon={IconMapPin} label={t('viewer.country')} value={photo.country} />
              <Row icon={IconRoute} label={t('viewer.city')} value={photo.city} />
              <Row
                icon={IconFocusCentered}
                label={t('viewer.coordinate')}
                value={formatCoordinate(photo.latitude, photo.longitude)}
              />
            </Section>

            <Section title={t('viewer.rating')}>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <IconStar
                    key={star}
                    size={16}
                    className={star <= rating ? 'text-amber-400' : 'text-white/60'}
                    fill={star <= rating ? 'currentColor' : 'none'}
                  />
                ))}
              </div>
            </Section>

            {includedAlbums.length > 0 && (
              <Section title={t('viewer.albums')}>
                {includedAlbums.map((album) => (
                  <div key={album.id} className="viewer-card p-2.5">
                    <div className="text-sm font-medium">{album.title}</div>
                    {album.description && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-white/60">{album.description}</div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {photo.tags?.length > 0 && (
              <Section title={t('viewer.keywords')}>
                <div className="flex flex-wrap gap-1">
                  {photo.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px]"
                    >
                      <IconTag size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            <Section title={t('viewer.shooting')}>
              <Row icon={IconFocusCentered} label={t('viewer.focalLength')} value={focal ? formatFocalLength(focal) : '—'} />
              <Row icon={IconAperture} label={t('viewer.aperture')} value={formatAperture(aperture)} />
              <Row icon={IconClock} label={t('viewer.exposureTime')} value={formatExposure(exposure)} />
              <Row icon={IconSun} label={t('viewer.iso')} value={iso} />
            </Section>

            <Section title={t('viewer.histogram')}>
              <div className="viewer-card p-2">
                <Histogram src={photo.thumbnailUrl || photo.originalUrl} seed={photo.id.length} />
              </div>
            </Section>

            <Section title={t('viewer.equipment')}>
              <Row icon={IconCamera} label={t('viewer.camera')} value={camera} />
              <Row icon={IconAperture} label={t('viewer.maxAperture')} value={formatAperture(maxAperture)} />
              <Row icon={IconFocusCentered} label={t('viewer.focalLength')} value={focal ? `${focal}` : '—'} />
              <Row icon={IconRuler2} label={t('viewer.equivalent')} value={focal35 ? `${focal35}` : '—'} />
            </Section>

            <Section title={t('viewer.mode')}>
              <Row icon={IconAdjustments} label={t('viewer.exposureProgram')} value={exposureProgramLabel(exif.ExposureProgram)} />
              <Row icon={IconBulb} label={t('viewer.meteringMode')} value={meteringModeLabel(exif.MeteringMode)} />
              <Row icon={IconBolt} label={t('viewer.flash')} value={flashLabel(exif.Flash)} />
            </Section>

            <Section title={t('viewer.technical')}>
              <Row
                icon={IconChartBar}
                label={t('viewer.brightness')}
                value={exif.BrightnessValue ? `${Number(exif.BrightnessValue).toFixed(1)} EV` : '—'}
              />
              <Row icon={IconInfoCircle} label={t('viewer.sensingMethod')} value={sensingMethodLabel(exif.SensingMethod)} />
            </Section>
          </div>
        </aside>
      </div>
    </div>
  )
}
