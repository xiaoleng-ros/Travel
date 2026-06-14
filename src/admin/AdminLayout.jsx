import { useState } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import { GridFour, ImageSquare, SignOut } from '@phosphor-icons/react'

const navItems = [
  { path: '/admin', label: '概览', icon: GridFour },
  { path: '/admin/albums', label: '相册管理', icon: ImageSquare },
]

function NavLink({ item, location }) {
  const Icon = item.icon
  const active = location.pathname === item.path

  return (
    <Link
      to={item.path}
      className={`relative flex items-center gap-3 px-4 h-11 rounded-xl text-[14px] transition-all duration-200 ${
        active
          ? 'bg-[#fef3c7] text-[#292524] font-medium'
          : 'text-[#a8a098] hover:text-[#292524] hover:bg-[#f7f5f1]'
      }`}
    >
      {active && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#d97706] rounded-full"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <Icon size={18} weight={active ? 'bold' : 'regular'} className="shrink-0" />
      {item.label}
    </Link>
  )
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [user] = useState(() => {
    try { return JSON.parse(localStorage.getItem('admin_user')) } catch { return null }
  })

  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('admin_user')
    navigate('/admin/login')
  }

  return (
    <div className="h-[100dvh] bg-[#f7f5f1] flex overflow-hidden">
      <aside className="w-64 h-full bg-white/90 backdrop-blur-sm border-r border-[#e7e2d8] flex flex-col shrink-0">
        <div className="px-6 h-16 flex items-center gap-3 border-b border-[#e7e2d8]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#fef3c7] to-[#fde68a] flex items-center justify-center shadow-[0_2px_6px_rgba(217,119,6,0.12)]">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#d97706]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div>
            <h2 className="text-[15px] font-normal text-[#292524]" style={{ fontFamily: "'Instrument Serif', serif" }}>管理后台</h2>
            <p className="text-[11px] text-[#a8a098] leading-none mt-0.5">照片回忆录</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 mt-1">
          {navItems.map((item) => (
            <NavLink key={item.path} item={item} location={location} />
          ))}
        </nav>

        <div className="p-4 border-t border-[#e7e2d8]">
          <div className="rounded-xl bg-[#f7f5f1] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#fef3c7] to-[#fde68a] flex items-center justify-center text-[14px] font-semibold text-[#d97706] shrink-0">
                {(user?.nickname || '管').charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold text-[#292524] truncate">
                  {user?.nickname || '管理员'}
                </div>
                <div className="text-[12px] text-[#a8a098] mt-0.5">管理员</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full h-9 rounded-lg border border-[#e7e2d8] bg-white text-[13px] text-[#787168] font-medium transition-all duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            >
              <SignOut size={15} />
              退出登录
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gradient-to-br from-[#f7f5f1] via-[#f5f0e8]/30 to-[#f7f5f1]">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}
