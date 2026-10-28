import { Component, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import HomePage from './pages/HomePage'
import AlbumsPage from './pages/AlbumsPage'
import AlbumDetailPage from './pages/AlbumDetailPage'
import GlobePage from './pages/GlobePage'
import SignInPage from './pages/SignInPage'
import NotFoundPage from './pages/NotFoundPage'
import AdminLayout from './admin/AdminLayout'
import AdminOverview from './admin/AdminOverview'
import AdminPhotos from './admin/AdminPhotos'
import AdminAlbums from './admin/AdminAlbums'
import AdminTrash from './admin/AdminTrash'
import AdminSettings from './admin/AdminSettings'
import AdminAccount from './admin/AdminAccount'
import { useAuth } from './context/AuthContext'
import { useSettings } from './context/SettingsContext'

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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/albums/:albumId" element={<AlbumDetailPage />} />
          <Route path="/globe" element={<GlobePage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route
            path="/dashboard"
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
          <Route path="/:photoId" element={<HomePage key="viewer" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
