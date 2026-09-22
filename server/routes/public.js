const express = require('express')
const path = require('path')
const db = require('../db')
const { resolveSafePath } = require('../utils/security')
const { fixEncoding } = require('../utils/text')

// 公开接口与静态图片路由拆开导出，原因是两者的限流要求相反：
// - 公开接口（/album/public/*）每次请求都要全表扫描并排序，必须走限流；
// - 图片（/uploads/*）在瀑布流里是高频请求，不能被限流。
// 此前两者共用一个 router 并同时挂在 /api 与根路径上，
// 导致公开接口可以从根路径绕开 apiLimiter 无限调用。
const publicRouter = express.Router()
const uploadRouter = express.Router()

/**
 * 公开接口的缓存策略。
 * 这两个接口无需鉴权、对所有访客返回同一份内容，而每次请求都要全表扫描并排序，
 * 因此允许浏览器与 CDN 短时间缓存，重复访问直接命中缓存、不再回源。
 * 取 30 秒是权衡结果：后台刚上传的照片最多延迟 30 秒出现在前台。
 * （Express 默认已生成弱 ETag，命中时会自动返回 304，这里只补 Cache-Control。）
 */
function publicCache(req, res, next) {
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  next()
}

/**
 * 暴露给未鉴权访客的照片字段白名单。
 *
 * 此前直接展开整条记录，把 storage_key / thumb_key / original_key /
 * storage_provider 等内部字段一并返回 —— 拿到 key 就能绕过应用直接拼出
 * 对象存储地址，在 bucket 公开读的情况下可用于枚举原图。
 * 这里只保留前台展示真正需要的字段。
 */
const PUBLIC_PHOTO_FIELDS = [
  'id', 'album_id', 'url', 'thumb', 'original_url',
  'width', 'height', 'title', 'name', 'description',
  'create_time', 'taken_at',
]

function toPublicPhoto(photo) {
  const result = {}
  for (const field of PUBLIC_PHOTO_FIELDS) {
    if (photo[field] !== undefined) result[field] = photo[field]
  }
  return result
}

// GET /api/album/public/list
publicRouter.get('/album/public/list', publicCache, (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100)
  const countMap = db.getPhotoCountMap()
  const albums = db.getAlbums().map(a => ({
    ...a,
    photo_count: countMap.get(a.id) || 0,
  }))

  const start = (page - 1) * limit
  const result = albums.slice(start, start + limit)

  res.json({
    code: 200,
    message: 'success',
    data: { result, total: albums.length, page, limit },
  })
})

// GET /api/album/public/:id/photos
publicRouter.get('/album/public/:id/photos', publicCache, (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100)
  const albumId = Number(req.params.id)

  let photos
  if (albumId === 0) {
    // "全部"相册：返回未删除的照片
    photos = db.getPhotos()
  } else {
    photos = db.getPhotosByAlbum(albumId)
  }

  // 与管理端一致的展示顺序：手动排过序的按 sort_order，否则新照片在前
  photos = db.sortPhotosForDisplay(photos)

  const start = (page - 1) * limit
  const result = photos.slice(start, start + limit).map(p => ({
    ...toPublicPhoto(p),
    title: fixEncoding(p.title),
    name: fixEncoding(p.name),
    // 展示日期优先用 EXIF 拍摄时间，让时间线反映「什么时候拍的」而不是「什么时候上传的」；
    // 没有拍摄信息的老照片自动回退到上传时间，展示行为不变。
    create_time: new Date(p.taken_at || p.create_time).toLocaleDateString('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
  }))

  res.json({
    code: 200,
    message: 'success',
    data: { result, total: photos.length, page, limit },
  })
})

// GET /uploads/:filename
uploadRouter.get('/uploads/:filename', (req, res) => {
  const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads')
  const filePath = resolveSafePath(UPLOAD_DIR, req.params.filename)

  if (!filePath || !require('fs').existsSync(filePath)) {
    return res.status(404).json({ code: 404, message: '文件不存在' })
  }

  // 为静态资源添加缓存与安全响应头
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(filePath)
})

module.exports = { publicRouter, uploadRouter }
