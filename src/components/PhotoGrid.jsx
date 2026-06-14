import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import PhotoItem from './PhotoItem'
import { useTheme } from '../context/ThemeContext'

export default function PhotoGrid({ photos, onPhotoClick, onReachEnd, hasMore = false, isLoadingMore = false }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [hoveredId, setHoveredId] = useState(null)
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef(null)
  const [containerHeight, setContainerHeight] = useState(0)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const [ratios, setRatios] = useState({})

  const { columns, itemWidth, gap } = useMemo(() => {
    const w = windowWidth
    const cols = Math.max(2, Math.floor((w + 4) / 274))
    const iw = (w - (cols - 1) * 4) / cols
    return { columns: cols, itemWidth: iw, gap: 4, containerWidth: w }
  }, [windowWidth])

  useEffect(() => {
    const onResize = () => {
      setWindowWidth(window.innerWidth)
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight)
      }
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      setScrollTop(el.scrollTop)
      if (!onReachEnd || !hasMore || isLoadingMore) return
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) {
        onReachEnd()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onReachEnd, hasMore, isLoadingMore])

  const getRatio = useCallback((photo) => {
    if (ratios[photo.id]) return ratios[photo.id]
    if (photo.width && photo.height) return photo.height / photo.width
    return 0.75
  }, [ratios])

  const layout = useMemo(() => {
    const heights = new Array(columns).fill(0)
    const items = []
    photos.forEach((photo) => {
      const ratio = getRatio(photo)
      const h = itemWidth * ratio
      const minIdx = heights.indexOf(Math.min(...heights))
      const left = minIdx * (itemWidth + gap)
      const top = heights[minIdx]
      items.push({ top, left, height: h, width: itemWidth })
      heights[minIdx] += h + gap
    })
    return { items, totalHeight: Math.max(...heights, 0) }
  }, [photos, columns, itemWidth, gap, getRatio])

  const visibleRange = useMemo(() => {
    const viewTop = Math.max(0, scrollTop - 500)
    const viewBottom = scrollTop + containerHeight + 500
    const indices = []
    layout.items.forEach((item, i) => {
      if (item.top + item.height >= viewTop && item.top <= viewBottom) {
        indices.push(i)
      }
    })
    return indices
  }, [scrollTop, containerHeight, layout])

  const handleHoverStart = useCallback((id) => setHoveredId(id), [])
  const handleHoverEnd = useCallback(() => setHoveredId(null), [])

  const handlePhotoLoaded = useCallback((photoId, w, h) => {
    setRatios(prev => {
      const newRatio = h / w
      if (Math.abs((prev[photoId] || 0.75) - newRatio) < 0.01) return prev
      return { ...prev, [photoId]: newRatio }
    })
  }, [])

  return (
    <div ref={containerRef} className="w-full h-screen py-1 overflow-auto virtual-scroll-container">
      <div
        style={{
          height: `${layout.totalHeight + (hasMore || isLoadingMore ? 80 : 0)}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {visibleRange.map((i) => {
          const photo = photos[i]
          const pos = layout.items[i]
          if (!pos || !photo) return null
          return (
            <div
              key={`${photo.id}-${i}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `translateX(${pos.left}px) translateY(${pos.top}px)`,
                width: `${pos.width}px`,
                height: `${pos.height}px`,
              }}
            >
              <PhotoItem
                photo={photo}
                index={i}
                hoveredId={hoveredId}
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
                onClick={() => onPhotoClick(photo)}
                onPhotoLoaded={handlePhotoLoaded}
              />
            </div>
          )
        })}
      </div>
      {isLoadingMore && (
        <div className="flex justify-center py-6">
          <div className={`w-8 h-8 border-2 rounded-full animate-spin ${isDark ? 'border-white/10 border-t-white/60' : 'border-[#1a1a1a]/10 border-t-[#1a1a1a]'}`} />
        </div>
      )}
    </div>
  )
}
