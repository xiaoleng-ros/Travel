const express = require('express')
const path = require('path')
const db = require('../db')

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
  const { page = 1, limit = 100, scene = 'cover' } = req.query
  const albums = db.getAlbums().map(a => ({
    ...a,
    photo_count: db.getPhotosByAlbum(a.id).length,
  }))

  const start = (Number(page) - 1) * Number(limit)
  const result = albums.slice(start, start + Number(limit))

  res.json({
    code: 200,
    message: 'success',
    data: { result, total: albums.length, page: Number(page), limit: Number(limit) },
  })
})

// GET /api/album/public/:id/photos
router.get('/album/public/:id/photos', (req, res) => {
  const { page = 1, limit = 40, scene = 'grid' } = req.query
  const albumId = Number(req.params.id)

  let photos
  if (albumId === 0) {
    // "全部" album - return all photos
    photos = db.getAllPhotos()
  } else {
    photos = db.getPhotosByAlbum(albumId)
  }

  const start = (Number(page) - 1) * Number(limit)
  const result = photos.slice(start, start + Number(limit)).map(p => ({
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
    data: { result, total: photos.length, page: Number(page), limit: Number(limit) },
  })
})

// GET /uploads/:filename
router.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(__dirname, '..', 'uploads', req.params.filename)
  res.sendFile(filePath)
})

module.exports = router
