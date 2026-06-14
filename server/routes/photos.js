const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const db = require('../db')
const { authMiddleware } = require('../middleware/auth')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// 修复文件名编码：将误读的 Latin-1 字符串还原为正确的 UTF-8
function fixEncoding(str) {
  try {
    const buf = Buffer.from(str, 'latin1')
    const decoded = buf.toString('utf-8')
    // 如果解码后包含合理的中文字符，说明修复成功
    if (/[\u4e00-\u9fff]/.test(decoded)) {
      return decoded
    }
  } catch {}
  return str
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i
    if (!allowed.test(path.extname(file.originalname))) {
      return cb(new Error('不支持的文件格式'), false)
    }
    cb(null, true)
  },
})

const router = express.Router()

// GET /api/admin/photos/recent - recent photos across all albums
router.get('/photos/recent', authMiddleware, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 50)
  const photos = db
    .getAllPhotos()
    .sort((a, b) => new Date(b.create_time) - new Date(a.create_time))
    .slice(0, limit)
    .map(p => ({ ...p, title: fixEncoding(p.title), name: fixEncoding(p.name) }))
  res.json({ code: 200, data: photos })
})

// GET /api/admin/albums/:albumId/photos
router.get('/albums/:albumId/photos', authMiddleware, (req, res) => {
  const photos = db.getPhotosByAlbum(Number(req.params.albumId))
    .map(p => ({ ...p, title: fixEncoding(p.title), name: fixEncoding(p.name) }))
  res.json({ code: 200, data: photos })
})

// POST /api/admin/albums/:albumId/photos - upload photos
router.post(
  '/albums/:albumId/photos',
  authMiddleware,
  upload.array('photos', 20),
  async (req, res) => {
    const albumId = Number(req.params.albumId)
    const album = db.findAlbum(albumId)
    if (!album) return res.json({ code: 404, message: '相册不存在' })

    const files = req.files
    if (!files || files.length === 0) {
      return res.json({ code: 400, message: '请选择图片' })
    }

    const photos = files.map((f) => ({
      album_id: albumId,
      url: `/uploads/${f.filename}`,
      original_url: `/uploads/${f.filename}`,
      width: 0,
      height: 0,
      name: fixEncoding(path.parse(f.originalname).name),
      title: fixEncoding(path.parse(f.originalname).name),
      description: '',
      create_time: new Date().toISOString(),
    }))

    const added = db.addPhotos(photos)

    // Try to get image dimensions
    for (const p of added) {
      try {
        const sharp = require('sharp')
        const meta = await sharp(path.join(UPLOAD_DIR, path.basename(p.url))).metadata()
        p.width = meta.width || 4
        p.height = meta.height || 3
        require('../db').save()
      } catch {}
    }

    // Set album cover if not set
    if (!album.cover) {
      db.updateAlbum(albumId, { cover: photos[0].url })
    }

    res.json({ code: 200, message: '上传成功', data: added })
  }
)

// DELETE /api/admin/photos/:id
router.delete('/photos/:id', authMiddleware, (req, res) => {
  const photo = db.deletePhoto(Number(req.params.id))
  if (!photo) return res.json({ code: 404, message: '照片不存在' })

  // delete file
  const filePath = path.join(UPLOAD_DIR, path.basename(photo.url))
  try { fs.unlinkSync(filePath) } catch {}

  res.json({ code: 200, message: '删除成功' })
})

module.exports = router
