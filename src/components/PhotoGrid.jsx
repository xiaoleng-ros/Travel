// @refresh reset
import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import PhotoItem from './PhotoItem'
import { useTheme } from '../context/ThemeContext'
import { computeGridLayout } from '../utils/masonry'

export default function PhotoGrid({ photos, onPhotoClick, onReachEnd, hasMore = false, isLoadingMore = false }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [hoveredId, setHoveredId] = useState(null)
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [ratios, setRatios] = useState({})

  // 量测容器真实内容宽度（clientWidth 不含滚动条），避免按 window.innerWidth 算导致网格超宽被裁
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      setContainerWidth(el.clientWidth)
      setViewportHeight(window.innerHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // 列宽取整 + 剩余像素对称分配到两侧，保证左右间距一致
  const { columns, itemWidth, gap, offsetX } = useMemo(
    () => computeGridLayout(containerWidth),
    [containerWidth]
  )

  // 用 ref 持有最新的 onReachEnd：父组件每次渲染都会传入新的函数引用，
  // 若把它放进依赖数组，滚动监听会被反复解绑重绑、并在每次绑定后立即触发一次触底检测，
  // 滚动过程中可能连续触发加载更多。
  const onReachEndRef = useRef(onReachEnd)
  useEffect(() => {
    onReachEndRef.current = onReachEnd
  }, [onReachEnd])

  // 整页滚动：监听 window 滚动，Hero 等内容随文档一起滚走
  useEffect(() => {
    let ticking = false
    let rafId = 0
    const onScroll = () => {
      if (ticking) return
      ticking = true
      rafId = requestAnimationFrame(() => {
        ticking = false
        const el = containerRef.current
        if (!el) return
        setScrollTop(window.scrollY)
        if (!onReachEndRef.current || !hasMore || isLoadingMore) return
        // 触底检测：网格底部（文档坐标）进入视口底部 600px 内即加载更多
        const rect = el.getBoundingClientRect()
        const gridBottomDoc = rect.top + window.scrollY + rect.height
        if (window.scrollY + window.innerHeight > gridBottomDoc - 600) {
          onReachEndRef.current()
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      // 取消尚未执行的那一帧，否则组件卸载后回调仍会跑一次
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [hasMore, isLoadingMore])

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
      const left = offsetX + minIdx * (itemWidth + gap)
      const top = heights[minIdx]
      items.push({ top, left, height: h, width: itemWidth })
      heights[minIdx] += h + gap
    })
    return { items, totalHeight: Math.max(...heights, 0) }
  }, [photos, columns, itemWidth, gap, offsetX, getRatio])

  const visibleRange = useMemo(() => {
    // 上方保留 500px；下方扩到 1500px，配合 PhotoItem 的 1200px 预加载距离，
    // 让即将滚入视口的图片提前开始下载，消除滚动时的转圈等待
    const viewTop = Math.max(0, scrollTop - 500)
    const viewBottom = scrollTop + viewportHeight + 1500
    const indices = []
    layout.items.forEach((item, i) => {
      if (item.top + item.height >= viewTop && item.top <= viewBottom) {
        indices.push(i)
      }
    })
    return indices
  }, [scrollTop, viewportHeight, layout])

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
    <div className="px-3 md:px-10 lg:px-16">
      <div ref={containerRef} className="w-full">
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
    </div>
  )
}
