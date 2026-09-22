import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import { ThemeProvider } from './context/ThemeContext'
import AlbumListPage from './components/AlbumListPage'
import RequireAuth from './admin/RequireAuth'

const AdminLogin = lazy(() => import('./admin/AdminLogin'))
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./admin/AdminDashboard'))
const AlbumManage = lazy(() => import('./admin/AlbumManage'))
const PhotoManage = lazy(() => import('./admin/PhotoManage'))
const ChangePassword = lazy(() => import('./admin/ChangePassword'))
const RecycleBin = lazy(() => import('./admin/RecycleBin'))
const NotFound = lazy(() => import('./components/NotFound'))

function RouteFallback() {
  return (
    <div className="h-screen flex items-center justify-center bg-[#f7f5f1]">
      <div className="w-8 h-8 border-2 border-[#1a1a1a]/10 border-t-[#1a1a1a] rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<AlbumListPage />} />

            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
              <Route index element={<AdminDashboard />} />
              <Route path="albums" element={<AlbumManage />} />
              <Route path="albums/:id" element={<PhotoManage />} />
              <Route path="trash" element={<RecycleBin />} />
              <Route path="change-password" element={<ChangePassword />} />
            </Route>

            {/* 未匹配的路径（含拼错的链接）统一落到 404，避免白屏 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  )
}
