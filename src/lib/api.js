async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(options.headers || {}),
    },
  })
  const contentType = response.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await response.json() : null
  if (!response.ok) {
    const error = new Error(data?.message || `请求失败（${response.status}）`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export const api = {
  get: (path) => request(path),
  // 需要读响应头（比如分页用的 X-Total-Count）时用这个，返回 { data, total }。
  getPage: async (path) => {
    const response = await fetch(path, { credentials: 'include' })
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await response.json() : null
    if (!response.ok) {
      const error = new Error(data?.message || `请求失败（${response.status}）`)
      error.status = response.status
      throw error
    }
    const total = Number(response.headers.get('x-total-count'))
    return { data, total: Number.isFinite(total) ? total : null }
  },
  post: (path, body) =>
    request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body || {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

function xhrSend(url, form, { onProgress, method = 'POST', withCredentials = true } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    // 直传七牛时要关掉：七牛的 CORS 响应是 `Access-Control-Allow-Origin: *`，
    // 带凭证的请求会被浏览器直接拦下。
    xhr.withCredentials = withCredentials
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      let data = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data?.message || `上传失败（${xhr.status}）`))
    }
    xhr.onerror = () => reject(new Error('上传失败'))
    xhr.send(form)
  })
}

async function uploadViaQiniu(file, { albumId, onProgress } = {}) {
  const ticket = await api.post('/api/admin/upload/token', {
    filename: file.name,
    mimeType: file.type || 'image/jpeg',
    size: file.size,
  })
  const form = new FormData()
  form.append('token', ticket.token)
  form.append('key', ticket.key)
  form.append('file', file)
  await xhrSend(ticket.uploadUrl, form, { onProgress, withCredentials: false })
  const result = await api.post('/api/admin/upload/complete', {
    id: ticket.id,
    key: ticket.key,
    filename: file.name,
    albumId,
    // 没有 EXIF 时用文件自身的修改时间兜底（手机相册里通常就是拍摄时间）
    lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
  })
  return { photo: result?.photos?.[0] || null, duplicate: result?.duplicate || null }
}

export async function uploadPhotos(files, { albumId, onProgress } = {}) {
  let provider = 'local'
  let maxFileSize = 0
  try {
    const mode = await api.get('/api/admin/upload/mode')
    provider = mode?.provider || 'local'
    maxFileSize = Number(mode?.maxFileSize) || 0
  } catch {}

  // 在浏览器里先按设置页的上限挡一道：七牛是直传，后端拿到体积时文件已经
  // 上去了；本地链路虽然 multer 也会挡，但白白浪费一次上传。
  if (maxFileSize > 0) {
    const tooBig = files.filter((file) => file.size > maxFileSize)
    if (tooBig.length) {
      const limitMb = Math.round((maxFileSize / (1024 * 1024)) * 10) / 10
      const names = tooBig.map((file) => file.name).slice(0, 3).join('、')
      const more = tooBig.length > 3 ? ` 等 ${tooBig.length} 个文件` : ''
      throw new Error(`${names}${more}超过 ${limitMb}MB 上限，请压缩后再上传。`)
    }
  }

  if (provider === 'qiniu') {
    const created = []
    const skipped = []
    for (let i = 0; i < files.length; i += 1) {
      const base = Math.round((i / files.length) * 100)
      const span = 100 / files.length
      const { photo, duplicate } = await uploadViaQiniu(files[i], {
        albumId,
        onProgress: onProgress ? (p) => onProgress(Math.round(base + (p * span) / 100)) : undefined,
      })
      if (photo) created.push(photo)
      if (duplicate === 'skip') skipped.push(files[i].name)
    }
    if (onProgress) onProgress(100)
    return { success: true, photos: created, skipped }
  }

  const form = new FormData()
  for (const file of files) form.append('files', file)
  if (albumId) form.append('albumId', String(albumId))
  // 与 files 顺序一一对应，服务端在没有 EXIF 时拿来当拍摄时间
  form.append(
    'lastModified',
    JSON.stringify(files.map((file) => (file.lastModified ? new Date(file.lastModified).toISOString() : null))),
  )
  const result = await xhrSend('/api/admin/upload', form, { onProgress })
  return { ...result, photos: result?.photos || [], skipped: result?.skipped || [] }
}

// 头像上传：和照片一样先问后端走哪种存储，七牛直传 / 本地 multipart 二选一。
//
// 上传前先在浏览器里裁成 512×512 的 webp：
// - 用户随手拍的原图动辄几 MB，头像最终只显示几十像素，没必要传原图；
// - 方形裁切保证前台圆头像不歪；
// - 七牛那条链路因此也不用再跑一次 pfop，省掉异步等待。
const AVATAR_EDGE = 512

async function prepareAvatar(file) {
  if (typeof document === 'undefined') return file
  try {
    const bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_EDGE
    canvas.height = AVATAR_EDGE
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_EDGE,
      AVATAR_EDGE,
    )
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9))
    if (!blob) return file
    return new File([blob], 'avatar.webp', { type: 'image/webp' })
  } catch {
    // 老浏览器 / 不支持的格式：退回原图，交给后端 sharp 处理
    return file
  }
}

export async function uploadAvatar(file, { onProgress } = {}) {
  const prepared = await prepareAvatar(file)
  let provider = 'local'
  try {
    const mode = await api.get('/api/profile/avatar/mode')
    provider = mode?.provider || 'local'
  } catch {}

  if (provider === 'qiniu') {
    const ticket = await api.post('/api/profile/avatar/token', {
      mimeType: prepared.type || 'image/webp',
      size: prepared.size,
    })
    const form = new FormData()
    form.append('token', ticket.token)
    form.append('key', ticket.key)
    form.append('file', prepared)
    await xhrSend(ticket.uploadUrl, form, { onProgress, withCredentials: false })
    const result = await api.post('/api/profile/avatar/complete', { key: ticket.key })
    return result?.user || null
  }

  const form = new FormData()
  form.append('file', prepared)
  const result = await xhrSend('/api/profile/avatar', form, { onProgress })
  return result?.user || null
}

export async function removeAvatar() {
  const result = await api.delete('/api/profile/avatar')
  return result?.user || null
}
