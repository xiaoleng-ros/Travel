import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'

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
      { rootMargin: '50px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const isHovered = hoveredId === photo.id

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
      className="relative overflow-hidden cursor-pointer group photo-item rounded-xl"
      style={{
        width: '100%',
        height: '100%',
        boxShadow: isHovered
          ? (isDark ? '0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06)' : '0 20px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)')
          : (isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.06)'),
      }}
    >
      {!loaded && !error && (
        <div className={`w-full h-full animate-pulse flex items-center justify-center ${isDark ? 'bg-[#2a2a2a]' : 'bg-[#f0eeeb]'}`}>
          <div className={`w-8 h-8 border-2 rounded-full animate-spin ${isDark ? 'border-white/10 border-t-white/60' : 'border-[#1a1a1a]/10 border-t-[#1a1a1a]'}`} />
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
          src={shouldLoad ? photo.url : undefined}
          alt={photo.title}
          loading="lazy"
          decoding="async"
          onLoad={(e) => {
            setLoaded(true)
            const img = e.target
            if (img.naturalWidth && img.naturalHeight) {
              onPhotoLoaded?.(photo.id, img.naturalWidth, img.naturalHeight)
            }
          }}
          onError={() => setError(true)}
          className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {loaded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0"
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: isHovered ? 0 : 20, opacity: isHovered ? 1 : 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-0 left-0 right-0 p-4"
          >
            <motion.h3
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: isHovered ? 0 : 10, opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="text-white font-medium text-lg mb-1.5 break-all w-[95%] line-clamp-1 font-sans-body"
            >
              {photo.title}
            </motion.h3>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: isHovered ? 0 : 10, opacity: isHovered ? 1 : 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="text-white/70 text-xs font-sans-body"
            >
              {photo.width} × {photo.height}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
