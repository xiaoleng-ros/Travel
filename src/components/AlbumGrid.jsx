import { motion } from 'framer-motion'
import { useTheme } from '../context/ThemeContext'

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
}

const itemAnim = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
}

export default function AlbumGrid({ albums, onAlbumClick }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#1a1a1a]' : 'bg-[#faf9f6]'}`}>
      {/* Hero */}
      <header className="pt-14 pb-10 px-6 md:px-12 lg:px-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl"
        >
          <p className={`text-[11px] uppercase tracking-[0.25em] mb-4 font-sans-body font-medium ${isDark ? 'text-[#6a6560]' : 'text-[#a89f91]'}`}>
            Photo Memoir
          </p>
          <h1 className={`text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.05] font-light mb-4 ${isDark ? 'text-[#f5f5f5]' : 'text-[#1a1a1a]'}`}>
            心之所向
          </h1>
          <p className={`text-lg font-light max-w-md leading-relaxed ${isDark ? 'text-[#8a8580]' : 'text-[#7a7568]'}`}>
            每一张照片，都是一段不愿遗忘的时光
          </p>
        </motion.div>
      </header>

      {/* Album Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="px-6 md:px-12 lg:px-20 pb-24"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 lg:gap-6">
          {albums.map((album, idx) => (
            <motion.div
              key={album.id}
              variants={itemAnim}
              whileHover={{ y: -4, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
              onClick={() => onAlbumClick(album)}
              className={`group cursor-pointer ${idx === 0 ? 'sm:col-span-2 lg:col-span-2' : ''}`}
            >
              <div className={`relative overflow-hidden rounded-xl ${isDark ? 'bg-[#2a2a2a]' : 'bg-[#f0eeeb]'}`}>
                <div className={`relative overflow-hidden ${idx === 0 ? 'aspect-[16/9]' : 'aspect-[3/4]'}`}>
                  <img
                    src={album.cover}
                    alt={album.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-[#f5f5f5] text-xs px-3 py-1.5 rounded-full font-medium font-sans-body opacity-0 group-hover:opacity-100 transition-all duration-400 translate-y-2 group-hover:translate-y-0">
                    {album.photo_count} 张
                  </div>
                </div>

                <div className="p-5 pt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className={`text-xl font-medium truncate font-serif-display ${isDark ? 'text-[#f5f5f5]' : 'text-[#1a1a1a]'}`}>
                      {album.name}
                    </h3>
                    <span className={`text-xs font-sans-body shrink-0 ${isDark ? 'text-[#6a6560]' : 'text-[#a89f91]'}`}>
                      {album.photo_count} 张
                    </span>
                  </div>
                  {album.description && (
                    <p className={`text-sm mt-1.5 font-light truncate font-sans-body ${isDark ? 'text-[#6a6560]' : 'text-[#9a9588]'}`}>
                      {album.description}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
