const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const db = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { uploadLimiter } = require('../middleware/rateLimit')
const { deleteSafeFile, sanitizeText, isSafeFilename } = require('../utils/security')
const { processUploadedImageToBuffer } = require('../utils/image')
const { saveFile } = require('../storage')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

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



const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // 临时文件名，真实扩展名在处理后由 processUploadedImage 决定
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.tmp`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    const allowedExt = /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i
    if (!allowedExt.test(ext)) {
      return cb(new Error('不支持的文件格式'), false)
    }
    // 校验原始文件名不含路径遍历等危险字符
    if (!isSafeFilename(file.originalname)) {
      return cb(new Error('文件名包含非法字符'), false)
    }
    cb(null, true)
  },
})

const { param, validationResult } = require('express-validator')
const router = express.Router()

function handleValidation(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 400, message: errors.array()[0].msg })
  }
  next()
}

const albumIdParam = [
  param('albumId').isInt({ min: 1 }).withMessage('相册ID必须是正整数'),
  handleValidation,
]

const photoIdParam = [
  param('id').isInt({ min: 1 }).withMessage('照片ID必须是正整数'),
  handleValidation,
]

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
router.get('/albums/:albumId/photos', authMiddleware, albumIdParam, (req, res) => {
  const photos = db.getPhotosByAlbum(Number(req.params.albumId))
    .map(p => ({ ...p, title: fixEncoding(p.title), name: fixEncoding(p.name) }))
  res.json({ code: 200, data: photos })
})

// POST /api/admin/albums/:albumId/photos - upload photos
router.post(
  '/albums/:albumId/photos',
  authMiddleware,
  uploadLimiter,
  albumIdParam,
  upload.array('photos', 20),
  async (req, res) => {
    const albumId = Number(req.params.albumId)
    const album = db.findAlbum(albumId)
    if (!album) return res.status(404).json({ code: 404, message: '相册不存在' })

    const files = req.files
    if (!files || files.length === 0) {
      return res.status(400).json({ code: 400, message: '请选择图片' })
    }

    const processed = []
    for (const f of files) {
      const tmpPath = f.path
      try {
        const info = await processUploadedImageToBuffer(tmpPath)
        if (!info) {
          // 清理临时文件
          try { fs.unlinkSync(tmpPath) } catch {}
          continue
        }

        // 根据后台配置保存到本地或云端对象存储
        const saved = await saveFile(info.buffer, `processed${info.ext}`)

        // 删除原始临时文件
        try { fs.unlinkSync(tmpPath) } catch {}

        // 对从文件名提取的标题进行消毒，防止特殊字符与 XSS
        const rawName = fixEncoding(path.parse(f.originalname).name)
        const safeName = sanitizeText(rawName, 100) || '未命名'

        processed.push({
          album_id: albumId,
          url: saved.url,
          original_url: saved.url,
          width: info.width,
          height: info.height,
          name: safeName,
          title: safeName,
          description: '',
          create_time: new Date().toISOString(),
          storage_provider: saved.provider,
          storage_key: saved.key || null,
        })
      } catch (err) {
        console.error('处理上传图片失败:', err.message)
        try { fs.unlinkSync(tmpPath) } catch {}
      }
    }

    if (processed.length === 0) {
      return res.status(400).json({ code: 400, message: '没有成功处理任何图片，请检查文件格式' })
    }

    const added = await db.addPhotos(processed)

    // Set album cover if not set
    if (!album.cover) {
      await db.updateAlbum(albumId, { cover: added[0].url })
    }

    res.json({ code: 200, message: '上传成功', data: added })
  }
)

// DELETE /api/admin/photos/:id
router.delete('/photos/:id', authMiddleware, photoIdParam, async (req, res) => {
  const photo = await db.deletePhoto(Number(req.params.id))
  if (!photo) return res.status(404).json({ code: 404, message: '照片不存在' })

  // 仅删除本地存储的物理文件；云端对象由后台配置单独清理
  if (!photo.storage_provider || photo.storage_provider === 'local') {
    deleteSafeFile(UPLOAD_DIR, photo.url)
  }

  res.json({ code: 200, message: '删除成功' })
})

module.exports = router
