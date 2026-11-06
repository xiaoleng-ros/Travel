import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router'
import {
  IconChartBar,
  IconPhoto,
  IconFolders,
  IconTrash,
  IconSettings,
  IconUser,
  IconExternalLink,
  IconLogout,
  IconMenu2,
  IconX,
} from '@tabler/icons-react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useLocale } from '../context/LocaleContext'

const NAV = [
  { to: '/admin', labelKey: 'admin.overview', icon: IconChartBar, end: true },
  { to: '/admin/photos', labelKey: 'admin.photos', icon: IconPhoto },
  { to: '/admin/albums', labelKey: 'admin.albums', icon: IconFolders },
  { to: '/admin/trash', labelKey: 'admin.trash', icon: IconTrash },
  { to: '/admin/settings', labelKey: 'admin.settings', icon: IconSettings },
  { to: '/admin/account', labelKey: 'admin.account', icon: IconUser },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { getSetting } = useSettings()
  const { t } = useLocale()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  const current = NAV.find(
    (item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)),
  )

  const handleLogout = async () => {
    await logout()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* 遮罩 */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-neutral-200 bg-white transition-transform dark:border-neutral-800 dark:bg-neutral-900 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4 dark:border-neutral-800">
          <Link to="/admin" className="flex items-center gap-2">
            {getSetting('app:avatarUrl') ? (
              <img
                src={getSetting('app:avatarUrl')}
                alt=""
                className="size-7 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="size-7 rounded-full bg-neutral-100 dark:bg-neutral-800" aria-hidden="true" />
            )}
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              {getSetting('app:title') || 'Memora'}
            </span>
          </Link>
          <button
            type="button"
            className="text-neutral-400 hover:text-neutral-600 md:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <IconX size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`
              }
            >
              <item.icon size={17} />
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt=""
                className="size-8 shrink-0 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                aria-hidden="true"
                className="size-8 shrink-0 rounded-full bg-neutral-100 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-100">
                {user?.username || t('admin.roleAdmin')}
              </p>
              <p className="truncate text-[11px] text-neutral-400">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <IconLogout size={17} />
            {t('signOut')}
          </button>
        </div>
      </aside>

      {/* 主体 */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white/85 px-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/85">
          <button
            type="button"
            className="text-neutral-500 md:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <IconMenu2 size={20} />
          </button>
          <h1 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {current ? t(current.labelKey) : t('dashboard')}
          </h1>
          <Link
            to="/"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <IconExternalLink size={14} />
            {t('admin.visitSite')}
          </Link>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
