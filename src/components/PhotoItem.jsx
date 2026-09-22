import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'motion/react'
import { useTheme } from '../context/ThemeContext'
import { getDisplayTitle } from '../utils/title'

export default function PhotoItem({ photo, index, hoveredId, onHoverStart, onHoverEnd, onClick, onPhotoLoaded }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldLoad(true)
            observer.unobserve(entry.target)
          }
        })
      },
      // 预加载距离：提前约 1.2 个屏幕开始下载，避免滚动时看到转圈
      { rootMargin: '1200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const isHovered = hoveredId === photo.id
  // 无意义 hash / 空标题返回 null，此时隐藏标题文字
  const displayTitle = getDisplayTitle(photo.title)

  const handleClick = useCallback(() => onClick(photo), [onClick, photo])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.005, 0.2), ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ zIndex: 10, transition: { duration: 0.3 } }}
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => onHoverStart(photo.id)}
      onHoverEnd={onHoverEnd}
      onClick={handleClick}
      // 此前只有 onClick：卡片不可聚焦，键盘用户无法打开灯箱 —— 而这是前台最核心的交互
      role="button"
      tabIndex={0}
      aria-label={displayTitle || '查看照片'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className={`relative overflow-hidden cursor-pointer group photo-item rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        isDark
          ? 'focus-visible:ring-white/60 focus-visible:ring-offset-[#1a1a1a]'
          : 'focus-visible:ring-[#1a1a1a]/40 focus-visible:ring-offset-[#faf9f6]'
      }`}
      style={{
        width: '100%',
        height: '100%',
        boxShadow: isHovered
          ? (isDark ? '0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)' : '0 20px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)')
          : (isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.06)'),
      }}
    >
      {!loaded && !error && (
        <div className={`w-full h-full overflow-hidden ${isDark ? 'bg-[#2b2b2b]' : 'bg-[#ece9e4]'}`}>
          <div className={`w-full h-full animate-pulse ${isDark ? 'bg-[#2b2b2b]' : 'bg-[#ece9e4]'}`} />
        </div>
      )}

      {error && (
        <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-[#2a2a2a]' : 'bg-[#f0eeeb]'}`}>
          <span className={`text-sm font-sans-body ${isDark ? 'text-[#6a6560]' : 'text-[#9a9588]'}`}>加载失败</span>
        </div>
      )}

      {!error && (
        <img
          ref={ref}
          src={shouldLoad ? (photo.thumb || photo.url) : undefined}
          alt={photo.title || '照片'}
          decoding="async"
          onLoad={(e) => {
            setLoaded(true)
            const img = e.target
            if (img.naturalWidth && img.naturalHeight) {
              onPhotoLoaded?.(photo.id, img.naturalWidth, img.naturalHeight)
            }
          }}
          onError={() => setError(true)}
          className={`w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {loaded && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: isHovered ? 1 : 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 ${
              displayTitle ? '' : 'opacity-0 group-hover:opacity-100'
            }`}
          />
          {displayTitle && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="absolute bottom-0 left-0 right-0 p-4"
            >
              <motion.h3
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: isHovered ? 0 : 12, opacity: isHovered ? 1 : 0 }}
                transition={{ duration: 0.35, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="text-white font-medium text-lg break-all w-[92%] line-clamp-2 font-sans-body drop-shadow-sm"
              >
                {displayTitle}
              </motion.h3>
            </motion.div>
          )}
        </>
      )}
    </motion.div>
  )
}
