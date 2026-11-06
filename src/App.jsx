import { Component, Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './context/AuthContext'
import { useSettings } from './context/SettingsContext'

// 页面按路由拆包：首屏只需要 HomePage，后台/地球页/相册页按需加载。
const HomePage = lazy(() => import('./pages/HomePage'))
const AlbumsPage = lazy(() => import('./pages/AlbumsPage'))
const AlbumDetailPage = lazy(() => import('./pages/AlbumDetailPage'))
const GlobePage = lazy(() => import('./pages/GlobePage'))
const SignInPage = lazy(() => import('./pages/SignInPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const AdminOverview = lazy(() => import('./admin/AdminOverview'))
const AdminPhotos = lazy(() => import('./admin/AdminPhotos'))
const AdminAlbums = lazy(() => import('./admin/AdminAlbums'))
const AdminTrash = lazy(() => import('./admin/AdminTrash'))
const AdminSettings = lazy(() => import('./admin/AdminSettings'))
const AdminAccount = lazy(() => import('./admin/AdminAccount'))

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
      Loading…
    </div>
  )
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-lg font-medium text-neutral-800 dark:text-neutral-200">
            Something went wrong
          </p>
          <p className="max-w-md text-xs text-neutral-500">{String(this.state.error?.message)}</p>
          <a href="/" className="text-sm font-medium text-blue-600 hover:underline">
            Back to home
          </a>
        </div>
      )
    }
    return this.props.children
  }
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading || user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/signin" replace />
  return children
}

function TitleManager() {
  const location = useLocation()
  const { getSetting } = useSettings()
  useEffect(() => {
    const base = getSetting('app:title') || 'Memora'
    document.title = location.pathname === '/' ? base : base
  }, [location.pathname, getSetting])
  return null
}

function ScrollManager() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <TitleManager />
        <ScrollManager />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/albums" element={<AlbumsPage />} />
            <Route path="/albums/:albumId" element={<AlbumDetailPage />} />
            <Route path="/globe" element={<GlobePage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AdminOverview />} />
              <Route path="photos" element={<AdminPhotos />} />
              <Route path="albums" element={<AdminAlbums />} />
              <Route path="trash" element={<AdminTrash />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="account" element={<AdminAccount />} />
            </Route>
            {/* 旧后台地址兼容：/dashboard 及子路径统一跳到 /admin */}
            <Route path="/dashboard/*" element={<Navigate to="/admin" replace />} />
            <Route path="/:photoId" element={<HomePage key="viewer" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
