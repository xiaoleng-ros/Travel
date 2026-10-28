import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  IconAdjustmentsHorizontal,
  IconClock,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconMinus,
  IconX,
} from '@tabler/icons-react'
import BackPill from '../components/BackPill'
import PhotoViewer from '../components/PhotoViewer'
import { useGalleryData } from '../context/GalleryDataContext'
import { useTheme } from '../context/ThemeContext'
import { useLocale } from '../context/LocaleContext'
import { dayjs, formatExposure, formatFocalLength, thumbnailFor } from '../lib/format'

const ANNOTATIONS = ['default', 'disable', 'focalLength', 'shutter', 'altitude']

function annotationColor(photo, mode) {
  const exif = photo?.exif || {}
  switch (mode) {
    case 'focalLength': {
      const focal = Number(exif.FocalLength ?? exif.FocalLength35 ?? 0)
      if (!focal) return null
      if (focal <= 24) return '#3b82f6'
      if (focal <= 60) return '#22c55e'
      return '#ef4444'
    }
    case 'shutter': {
      const shutter = Number(exif.ExposureTime ?? exif.Exposure ?? 0)
      if (!shutter) return null
      if (shutter >= 1 / 250) return '#3b82f6'
      if (shutter >= 1 / 60) return '#22c55e'
      return '#ef4444'
    }
    case 'altitude': {
      const altitude = Number(exif.GPSAltitude ?? exif.GPSAltitudeAlt ?? 0)
      if (!altitude) return null
      if (altitude < 500) return '#22c55e'
      if (altitude < 2000) return '#f59e0b'
      return '#ef4444'
    }
    default:
      return null
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

const AMAP_TILES = [1, 2, 3, 4].map(
  (n) =>
    `https://webrd0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`,
)

function styleFor(dark) {
  return {
    version: 8,
    sources: {
      amap: {
        type: 'raster',
        tiles: AMAP_TILES,
        tileSize: 256,
        maxzoom: 18,
        attribution: '© 高德地图',
      },
    },
    layers: [
      {
        id: 'amap',
        type: 'raster',
        source: 'amap',
        // 高德没有官方深色瓦片，深色主题靠图层调色压暗
        paint: dark
          ? {
              'raster-saturation': -0.82,
              'raster-contrast': 0.32,
              'raster-brightness-max': 0.52,
            }
          : {},
      },
    ],
  }
}

export default function GlobePage() {
  const { photos } = useGalleryData()
  const { mode } = useTheme()
  const { t } = useLocale()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const markersGroupRef = useRef(null)
  const fittedRef = useRef(false)
  const [dark, setDark] = useState(false)
  const [annotationOpen, setAnnotationOpen] = useState(false)
  const [annotation, setAnnotation] = useState('default')
  const [timelineOn, setTimelineOn] = useState(true)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [activePhoto, setActivePhoto] = useState(null)
  const [mapError, setMapError] = useState('')

  const geoPhotos = useMemo(
    () =>
      photos.filter(
        (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number',
      ),
    [photos],
  )

  const sortedPhotos = useMemo(
    () =>
      [...geoPhotos].sort((a, b) =>
        String(a.dateTaken || '').localeCompare(String(b.dateTaken || '')),
      ),
    [geoPhotos],
  )

  useEffect(() => {
    setIndex(sortedPhotos.length)
  }, [sortedPhotos.length])

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setIndex((value) => {
        if (value >= sortedPhotos.length) {
          setPlaying(false)
          return value
        }
        return value + 1
      })
    }, 260)
    return () => clearInterval(timer)
  }, [playing, sortedPhotos.length])

  const visiblePhotos = useMemo(() => {
    if (!timelineOn) return geoPhotos
    return sortedPhotos.slice(0, index)
  }, [timelineOn, sortedPhotos, index, geoPhotos])

  // 初始化地图
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const prefersDark = document.documentElement.classList.contains('dark')
    setDark(prefersDark)
    if (!webglAvailable()) {
      setMapError('WebGL is not available in this environment.')
      return
    }
    let map
    try {
      map = new maplibregl.Map({
        container,
        style: styleFor(prefersDark),
        center: [108, 32],
        zoom: 2.4,
        attributionControl: false,
      })
    } catch (error) {
      console.warn('[globe] WebGL unavailable:', error?.message)
      setMapError(error?.message || 'WebGL unavailable')
      return
    }
    mapRef.current = map
    map.on('error', (event) => {
      console.warn('[globe] map error:', event?.error?.message || event)
    })
    markersGroupRef.current = document.createElement('div')
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current = []
    }
  }, [])

  // 主题切换
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    setDark(isDark)
    map.setStyle(styleFor(isDark))
  }, [mode])

  // 首次拿到坐标后，视野收拢到照片实际分布范围
  useEffect(() => {
    const map = mapRef.current
    if (!map || fittedRef.current || geoPhotos.length === 0) return
    const lats = geoPhotos.map((p) => p.latitude)
    const lons = geoPhotos.map((p) => p.longitude)
    fittedRef.current = true
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 56, maxZoom: 11, duration: 0 },
    )
  }, [geoPhotos])

  // 标记渲染（屏幕网格聚合）
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const rebuild = () => {
      const group = markersGroupRef.current
      if (!group) return
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []

      const CELL = 52
      const cells = new Map()
      for (const photo of visiblePhotos) {
        const point = map.project([photo.longitude, photo.latitude])
        if (!point) continue
        const key = `${Math.floor(point.x / CELL)}:${Math.floor(point.y / CELL)}`
        const list = cells.get(key)
        if (list) list.push(photo)
        else cells.set(key, [photo])
      }

      for (const list of cells.values()) {
        const head = list[0]
        const element = document.createElement('div')
        if (list.length === 1) {
          element.className = 'map-single-marker'
          const color = annotationColor(head, annotation)
          if (color && annotation !== 'disable') {
            element.style.boxShadow = `0 0 0 3px ${color}, 0 4px 12px rgba(0,0,0,.35)`
          }
          const img = document.createElement('img')
          img.src = thumbnailFor(head)
          img.alt = ''
          img.draggable = false
          element.appendChild(img)
          element.addEventListener('click', (event) => {
            event.stopPropagation()
            setActivePhoto(head)
          })
        } else {
          element.className = 'map-cluster-marker'
          element.textContent = String(list.length)
          element.addEventListener('click', (event) => {
            event.stopPropagation()
            map.easeTo({
              center: [head.longitude, head.latitude],
              zoom: Math.min((map.getZoom() || 0) + 2.5, 16),
            })
          })
        }
        const marker = new maplibregl.Marker({ element })
          .setLngLat([head.longitude, head.latitude])
          .addTo(map)
        markersRef.current.push(marker)
      }
    }

    rebuild()
    map.on('moveend', rebuild)
    map.on('zoomend', rebuild)
    return () => {
      map.off('moveend', rebuild)
      map.off('zoomend', rebuild)
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
    }
  }, [visiblePhotos, annotation])

  const currentDate = timelineOn && index > 0 && sortedPhotos[index - 1]
    ? dayjs(sortedPhotos[index - 1].dateTaken).format('MMM D, YYYY')
    : '—'

  return (
    <div className="fixed inset-0 z-30">
      <div ref={containerRef} className="absolute inset-0" />
      {mapError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-100 dark:bg-neutral-900">
          <p className="text-4xl">🗺️</p>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Map could not be initialized
          </p>
          <p className="max-w-sm text-center text-xs text-neutral-500 dark:text-neutral-400">
            WebGL is unavailable in this browser or environment. Open the site in a regular
            browser to view the photo globe.
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute left-4 top-4">
          <BackPill label={t('backHome')} className="!static shadow-md" />
        </div>

        {/* 右上按钮组 */}
        <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAnnotationOpen((open) => !open)}
              className="glass-pill inline-flex h-10 w-10 items-center justify-center text-neutral-700 transition hover:bg-white/60 dark:text-neutral-200 dark:hover:bg-neutral-800/70"
              aria-label={t('globe.annotation')}
            >
              <IconAdjustmentsHorizontal size={19} />
            </button>
            {annotationOpen && (
              <div className="glass-menu absolute right-0 top-12 w-64 p-2">
                <div className="flex items-center justify-between px-2 pb-2 pt-1">
                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    {t('globe.annotation')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAnnotationOpen(false)}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <IconX size={15} />
                  </button>
                </div>
                <p className="px-2 pb-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {t('globe.annotation.subtitle')}
                </p>
                {ANNOTATIONS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setAnnotation(key)
                      setAnnotationOpen(false)
                    }}
                    className={`menu-item w-full ${annotation === key ? 'bg-neutral-100 dark:bg-neutral-700/60' : ''}`}
                  >
                    <span className="flex flex-col items-start">
                      <span>{t(`globe.annotation.${key}`)}</span>
                      {key !== 'default' && key !== 'disable' && (
                        <span className="text-xs text-neutral-400">
                          {t(`globe.annotation.${key}.desc`)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setTimelineOn((value) => !value)}
            className={`glass-pill inline-flex h-10 w-10 items-center justify-center transition hover:bg-white/60 dark:hover:bg-neutral-800/70 ${
              timelineOn
                ? 'bg-neutral-900/85 text-white dark:bg-white/85 dark:text-neutral-900'
                : 'text-neutral-700 dark:text-neutral-200'
            }`}
            aria-label={t('globe.timeline')}
          >
            <IconClock size={19} />
          </button>
        </div>

        {/* 左下缩放组 */}
        <div className="pointer-events-auto absolute bottom-28 left-4 flex flex-col overflow-hidden rounded-lg shadow-md md:bottom-6">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            className="glass-pill inline-flex h-10 w-10 items-center justify-center rounded-none text-neutral-700 transition hover:bg-white/60 dark:text-neutral-200 dark:hover:bg-neutral-800/70"
          >
            <IconPlus size={18} />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            className="glass-pill inline-flex h-10 w-10 items-center justify-center rounded-none border-t border-black/5 text-neutral-700 transition hover:bg-white/60 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-neutral-800/70"
          >
            <IconMinus size={18} />
          </button>
        </div>

        {/* 底部时间轴 */}
        {timelineOn && (
          <div className="pointer-events-auto absolute bottom-6 left-1/2 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2">
            <div className="card flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  if (index >= sortedPhotos.length) setIndex(0)
                  setPlaying((value) => !value)
                }}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
              </button>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>{currentDate}</span>
                  <span>
                    {index} / {sortedPhotos.length}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={sortedPhotos.length}
                  value={index}
                  onChange={(event) => {
                    setPlaying(false)
                    setIndex(Number(event.target.value))
                  }}
                  className="timeline-range w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {activePhoto && (
        <div className="absolute inset-0 z-40">
          <div className="absolute left-4 top-16 z-50 max-w-xs rounded-lg bg-black/70 p-3 text-xs leading-relaxed text-white/90 backdrop-blur">
            <p className="font-medium">{activePhoto.title || '—'}</p>
            <p className="mt-1 text-white/70">
              {formatFocalLength(activePhoto.exif?.FocalLength)} ·{' '}
              {formatExposure(activePhoto.exif?.ExposureTime)}
            </p>
          </div>
          <PhotoViewer
            photoId={activePhoto.id}
            photos={visiblePhotos}
            albums={[]}
            onClose={() => setActivePhoto(null)}
          />
        </div>
      )}
    </div>
  )
}
