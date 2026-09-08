const express = require('express')
const path = require('path')
const db = require('../db')
const { resolveSafePath } = require('../utils/security')
const { fixEncoding } = require('../utils/text')

const router = express.Router()

// GET /api/album/public/list
router.get('/album/public/list', (req, res) => {
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
router.get('/album/public/:id/photos', (req, res) => {
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
