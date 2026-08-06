const express = require('express')
const path = require('path')
const db = require('../db')
const { resolveSafePath } = require('../utils/security')

const router = express.Router()

// 修复文件名编码：将误读的 Latin-1 字符串还原为正确的 UTF-8
function fixEncoding(str) {
  try {
    const buf = Buffer.from(str, 'latin1')
    const decoded = buf.toString('utf-8')
    if (/[\u4e00-\u9fff]/.test(decoded)) {
      return decoded
    }
  } catch {}
  return str
}

// GET /api/album/public/list
router.get('/album/public/list', (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 100)
  const albums = db.getAlbums().map(a => ({
    ...a,
    photo_count: db.getPhotosByAlbum(a.id).length,
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
router.get('/album/public/:id/photos', (req, res) => {
  const page = Math.max(Number(req.query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100)
  const albumId = Number(req.params.id)

  let photos
  if (albumId === 0) {
    // "全部" album - return all photos
    photos = db.getAllPhotos()
  } else {
    photos = db.getPhotosByAlbum(albumId)
  }

  const start = (page - 1) * limit
  const result = photos.slice(start, start + limit).map(p => ({
    ...p,
    title: fixEncoding(p.title),
    name: fixEncoding(p.name),
    create_time: new Date(p.create_time).toLocaleDateString('zh-CN', {
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
router.get('/uploads/:filename', (req, res) => {
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

module.exports = router
