const express = require('express')
const { body, param, validationResult } = require('express-validator')
const db = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { sanitizeText, deleteSafeFile } = require('../utils/security')
const { deleteFile } = require('../storage')

const router = express.Router()

// 通用校验结果处理
function handleValidation(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 400, message: errors.array()[0].msg })
  }
  next()
}

const albumIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('相册ID必须是正整数'),
  handleValidation,
]

const albumBodyValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('相册名称长度为1-100个字符')
    .custom((value) => sanitizeText(value, 100) === value)
    .withMessage('相册名称包含非法字符'),
  body('description')
    .optional()
    .custom((value) => typeof value === 'string' && value.length <= 500)
    .withMessage('相册描述不能超过500个字符'),
  body('cover')
    .optional()
    .custom((value) => value === '' || (typeof value === 'string' && (value.startsWith('/uploads/') || /^https?:\/\/[^\s]+$/.test(value))))
    .withMessage('封面地址格式不正确'),
  handleValidation,
]

// GET /api/admin/albums
router.get('/', authMiddleware, (req, res) => {
  const countMap = db.getPhotoCountMap()
  const albums = db.getAlbums().map(a => ({
    ...a,
    photo_count: countMap.get(a.id) || 0,
  }))
  res.json({ code: 200, data: albums })
})

// GET /api/admin/albums/:id
router.get('/:id', authMiddleware, albumIdValidation, (req, res) => {
  const album = db.findAlbum(Number(req.params.id))
  if (!album) return res.status(404).json({ code: 404, message: '相册不存在' })
  res.json({ code: 200, data: album })
})

// POST /api/admin/albums
router.post('/', authMiddleware, albumBodyValidation, async (req, res) => {
  const { name, description } = req.body
  const album = await db.addAlbum({
    name: sanitizeText(name, 100),
    description: sanitizeText(description || '', 500),
    cover: '',
    create_time: new Date().toISOString(),
  })
  res.json({ code: 200, message: '创建成功', data: album })
})

// PUT /api/admin/albums/:id
router.put('/:id', authMiddleware, albumIdValidation, albumBodyValidation, async (req, res) => {
  const { name, description, cover } = req.body
  const data = {}
  if (name !== undefined) data.name = sanitizeText(name, 100)
  if (description !== undefined) data.description = sanitizeText(description, 500)
  if (cover !== undefined) data.cover = cover
  const updated = await db.updateAlbum(Number(req.params.id), data)
  if (!updated) return res.status(404).json({ code: 404, message: '相册不存在' })
  res.json({ code: 200, message: '更新成功', data: updated })
})

// DELETE /api/admin/albums/:id
router.delete('/:id', authMiddleware, albumIdValidation, async (req, res) => {
  const deletedPhotos = await db.deleteAlbum(Number(req.params.id))
  if (!deletedPhotos) return res.status(404).json({ code: 404, message: '相册不存在' })

  // 同步删除相册下所有照片的物理文件 / 云端对象（含缩略图）
  const UPLOAD_DIR = require('path').join(__dirname, '..', 'uploads')
  for (const photo of deletedPhotos) {
    try {
      if (!photo.storage_provider || photo.storage_provider === 'local') {
        deleteSafeFile(UPLOAD_DIR, photo.url)
        deleteSafeFile(UPLOAD_DIR, photo.original_url)
        if (photo.thumb && photo.thumb !== photo.url) {
          deleteSafeFile(UPLOAD_DIR, photo.thumb)
        }
      } else {
        await Promise.allSettled(
          [photo.storage_key, photo.thumb_key, photo.original_key]
            .filter(Boolean)
            .map(key => deleteFile(photo.storage_provider, key))
        )
      }
    } catch (err) {
      console.error('删除相册物理文件失败:', err.message)
    }
  }

  res.json({ code: 200, message: '删除成功' })
})

module.exports = router
