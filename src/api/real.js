import axios from 'axios'
import { getFileMeta } from '../utils/photoMeta'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true,
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      // 必须同时清掉 sessionStorage 标记：RequireAuth 会优先读它并直接放行，
      // 只清 localStorage 的话，会话失效后用户重新进入 /admin 仍会被放进后台，
      // 紧接着每个接口都返回 401、页面反复跳转。
      localStorage.removeItem('admin_user')
      sessionStorage.removeItem('admin_logged_in')
      // 已经是登录页时不能再跳：登录失败（如密码错误）同样返回 401，
      // 无条件跳转会导致整页刷新、用户刚输入的内容全部丢失。
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.replace('/admin/login')
      }
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

/**
 * 批量获取七牛直传凭证。
 *
 * 上传链路的第一步。后端按文件名签发限定 key 的上传凭证，
 * 前端拿到后直接向七牛上传 —— 图片不经过我们自己的服务端，
 * 这是部署在 Serverless（请求体上限 6MB）上仍能传大图的唯一方式。
 */
export async function getUploadTokens(filenames) {
  return api.post('/admin/upload-tokens', { filenames })
}

/**
 * 上传照片：取凭证 → 浏览器直传七牛 → 提交元数据。
 *
 * 保持原有调用签名（albumId, files），所以调用方几乎无需改动。
 * 逐张上传而非并发，便于展示进度、也让失败原因能定位到具体文件。
 *
 * @param {number} albumId
 * @param {File[]} files
 * @param {{onProgress?: (p: {current:number,total:number,name:string}) => void}} options
 * @returns {Promise<{code:number, message?:string, data?:any, failed?:{name:string,message:string}[]}>}
 */
export async function uploadPhotos(albumId, files, { onProgress } = {}) {
  if (!files || files.length === 0) {
    return { code: 400, message: '请选择图片', failed: [] }
  }

  // ---- 1. 一次性批量取凭证（≤20 张，避免逐张请求触发上传限流）----
  let tokens
  try {
    const tokenRes = await getUploadTokens(files.map((f) => f.name))
    if (tokenRes.code !== 200) {
      return { code: tokenRes.code || 500, message: tokenRes.message || '获取上传凭证失败', failed: [] }
    }
    tokens = tokenRes.data?.tokens || []
  } catch (err) {
    return { code: err?.code || 500, message: err?.message || '获取上传凭证失败', failed: [] }
  }

  // ---- 2. 逐张直传七牛 ----
  const uploaded = []
  const failed = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ticket = tokens[i]
    if (!ticket) {
      failed.push({ name: file.name, message: '未取得上传凭证' })
      continue
    }
    try {
      onProgress?.({ current: i + 1, total: files.length, name: file.name })
      const meta = await getFileMeta(file)

      const form = new FormData()
      form.append('key', ticket.key)
      form.append('token', ticket.token)
      form.append('file', file)

      const res = await fetch(ticket.uploadUrl, { method: 'POST', body: form })
      if (!res.ok) {
        let detail = `HTTP ${res.status}`
        try {
          const body = await res.json()
          if (body?.error) detail = body.error
        } catch {}
        throw new Error(`云端上传失败（${detail}）`)
      }

      uploaded.push({
        key: ticket.key,
        width: meta.width,
        height: meta.height,
        taken_at: meta.taken_at,
        name: file.name.replace(/\.[^.]+$/, '') || '未命名',
      })
    } catch (err) {
      failed.push({ name: file.name, message: err?.message || '上传失败' })
    }
  }

  if (uploaded.length === 0) {
    return { code: 400, message: failed[0]?.message || '没有成功上传的照片', failed }
  }

  // ---- 3. 提交元数据入库 ----
  try {
    const res = await api.post(`/admin/albums/${albumId}/photos`, { photos: uploaded })
    return { ...res, failed }
  } catch (err) {
    return {
      code: 500,
      message: `照片已上传到云端，但信息保存失败：${err?.message || '未知错误'}（请勿重复上传，可稍后重试）`,
      failed,
    }
  }
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

export async function getAlbumPhotos(albumId, params) {
  return api.get(`/album/public/${albumId}/photos`, { params })
}

// 公开相册列表
export async function getPublicAlbums(params) {
  return api.get('/album/public/list', { params })
}
