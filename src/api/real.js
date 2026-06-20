import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true,
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login'
    }
    return Promise.reject(err.response?.data || { code: 500, message: '网络错误' })
  }
)

// 校验当前会话是否有效
export async function checkAdminSession() {
  return api.get('/admin/me')
}

export async function adminLogin(username, password) {
  return api.post('/admin/login', { username, password })
}

export async function adminLogout() {
  return api.post('/admin/logout')
}

export async function getAdminAlbums() {
  return api.get('/admin/albums')
}

export async function getAdminAlbum(id) {
  return api.get(`/admin/albums/${id}`)
}

export async function createAlbum(name, description) {
  return api.post('/admin/albums', { name, description })
}

export async function updateAlbum(id, data) {
  return api.put(`/admin/albums/${id}`, data)
}

export async function deleteAlbum(id) {
  return api.delete(`/admin/albums/${id}`)
}

export async function getAdminPhotos(albumId) {
  return api.get(`/admin/albums/${albumId}/photos`)
}

export async function uploadPhotos(albumId, files) {
  const form = new FormData()
  for (const f of files) {
    form.append('photos', f)
  }
  return api.post(`/admin/albums/${albumId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export async function deletePhoto(id) {
  return api.delete(`/admin/photos/${id}`)
}

export async function getRecentPhotos(limit = 12) {
  return api.get('/admin/photos/recent', { params: { limit } })
}

// 对象存储配置
export async function getStorageSettings() {
  return api.get('/admin/storage')
}

export async function getStorageProviderSchema() {
  return api.get('/admin/storage/providers')
}

export async function updateStorageSettings(data) {
  return api.put('/admin/storage', data)
}

export async function testStorageProvider(provider, config) {
  return api.post('/admin/storage/test', { provider, config })
}

export async function getAlbumList(params) {
  return api.get('/album/public/list', { params })
}

export async function getAlbumPhotos(albumId, params) {
  return api.get(`/album/public/${albumId}/photos`, { params })
}
