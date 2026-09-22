import { Link } from 'react-router'
import { motion } from 'motion/react'
import { useTheme } from '../context/ThemeContext'

/**
 * 404 兜底页。
 * 此前未匹配的路径会渲染成空白页 —— 由于后端在 /api 与 /uploads 之外的路径
 * 一律回退到 index.html，任何拼错的链接都会落到这里。
 */
export default function NotFound() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-6 ${isDark ? 'bg-[#1a1a1a]' : 'bg-[#faf9f6]'}`}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center text-center"
      >
        <h1 className={`font-serif-display text-6xl md:text-7xl leading-none ${isDark ? 'text-white/90' : 'text-[#1a1a1a]'}`}>
          404
        </h1>
        <p className={`mt-5 text-sm font-sans-body ${isDark ? 'text-[#6a6560]' : 'text-[#9a9588]'}`}>
          这一页没有留下任何照片。
        </p>
        <Link
          to="/"
          className={`mt-8 px-6 py-2.5 rounded-full text-sm font-sans-body transition-colors ${
            isDark
              ? 'bg-white/10 text-white/80 hover:bg-white/20'
              : 'bg-[#1a1a1a]/5 text-[#1a1a1a]/70 hover:bg-[#1a1a1a]/10'
          }`}
        >
          回到首页
        </Link>
      </motion.div>
    </div>
  )
}
