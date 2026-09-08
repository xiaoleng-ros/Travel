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

// 修改当前登录管理员密码
export async function changePassword(oldPassword, newPassword) {
  return api.post('/admin/change-password', { oldPassword, newPassword })
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

// 批量软删除（多张照片移入回收站）
export async function deletePhotos(ids) {
  return api.post(`/admin/photos/batch-delete`, { ids })
}

// 修改照片标题 / 描述
export async function updatePhoto(id, data) {
  return api.patch(`/admin/photos/${id}`, data)
}

// 重排相册内照片顺序，ids 为排好序的照片 id 数组
export async function reorderPhotos(albumId, ids) {
  return api.patch(`/admin/albums/${albumId}/photos/reorder`, { ids })
}

// 回收站
export async function getDeletedPhotos() {
  return api.get('/admin/photos/trash')
}

export async function restorePhoto(id) {
  return api.post(`/admin/photos/${id}/restore`)
}

export async function purgePhoto(id) {
  return api.delete(`/admin/photos/${id}/purge`)
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

export async function getAlbumPhotos(albumId, params) {
  return api.get(`/album/public/${albumId}/photos`, { params })
}

// 公开相册列表
export async function getPublicAlbums(params) {
  return api.get('/album/public/list', { params })
}
