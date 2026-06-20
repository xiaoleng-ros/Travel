import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import AlbumListPage from './components/AlbumListPage'
import PhotoDetailPage from './components/PhotoDetailPage'
import AdminLogin from './admin/AdminLogin'
import AdminLayout from './admin/AdminLayout'
import AdminDashboard from './admin/AdminDashboard'
import AlbumManage from './admin/AlbumManage'
import PhotoManage from './admin/PhotoManage'
import StorageSettings from './admin/StorageSettings'
import RequireAuth from './admin/RequireAuth'

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AlbumListPage />} />
          <Route path="/photo/:id" element={<PhotoDetailPage />} />

          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
            <Route index element={<AdminDashboard />} />
            <Route path="albums" element={<AlbumManage />} />
            <Route path="albums/:id" element={<PhotoManage />} />
            <Route path="storage" element={<StorageSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
