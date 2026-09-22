const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const db = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { uploadLimiter } = require('../middleware/rateLimit')
const { deleteSafeFile, sanitizeText, isSafeFilename } = require('../utils/security')
const { processUploadedImageToBuffer, processThumbnail } = require('../utils/image')
const { saveFile, deleteFile } = require('../storage')
const { fixEncoding } = require('../utils/text')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// 是否单独保存未经重编码的原图（默认开启，设为 false 可节省一半存储空间）
const KEEP_ORIGINAL = process.env.KEEP_ORIGINAL !== 'false'
// 批量上传的并发处理数，避免一次性把大量图片读进内存
const UPLOAD_CONCURRENCY = 4

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
    // multer 会把 UTF-8 文件名按 latin1 解码，中文文件名到这里已经变成乱码，
    // 直接拿去校验会把「海边日落.jpg」这类完全正常的名字判为非法字符而拒收。
    // 先还原编码再校验，并把修复后的名字写回，后续提取标题时直接使用。
    file.originalname = fixEncoding(file.originalname)

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

const { param, body, validationResult } = require('express-validator')
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

/** 有限并发地处理数组，返回成功结果 */
async function mapWithConcurrency(items, limit, worker) {
  const results = []
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      const value = await worker(items[index], index)
      if (value) results.push(value)
    }
  })
  await Promise.all(runners)
  return results
}

/** 清理一张照片关联的物理文件 / 云端对象 */
async function removePhotoFiles(photo) {
  if (!photo.storage_provider || photo.storage_provider === 'local') {
    deleteSafeFile(UPLOAD_DIR, photo.url)
    deleteSafeFile(UPLOAD_DIR, photo.original_url)
    if (photo.thumb && photo.thumb !== photo.url) {
      deleteSafeFile(UPLOAD_DIR, photo.thumb)
    }
    return
  }
  const keys = [photo.storage_key, photo.thumb_key, photo.original_key].filter(Boolean)
  await Promise.allSettled(keys.map(k => deleteFile(photo.storage_provider, k)))
}

/**
 * 若被删除的照片正好是相册封面，回退到该相册剩余的第一张照片，避免封面变死链。
 *
 * 注意这里要拿「全部地址」去比对：上传时封面优先取的是缩略图，
 * 而删除时如果只拿主图 URL 比对就永远匹配不上 —— 封面会一直指向已被删除的文件，
 * 前台加载封面得到 404。
 */
async function resetAlbumCoverIfNeeded(albumId, removedPhotos) {
  const album = db.findAlbum(albumId)
  if (!album || !album.cover) return

  const removedUrls = new Set()
  for (const photo of [].concat(removedPhotos)) {
    for (const url of [photo.url, photo.thumb, photo.original_url]) {
      if (url) removedUrls.add(url)
    }
  }
  if (!removedUrls.has(album.cover)) return

  const rest = db.getPhotosByAlbum(albumId)
  await db.updateAlbum(albumId, { cover: rest.length > 0 ? (rest[0].thumb || rest[0].url) : '' })
}

// GET /api/admin/photos/trash - 回收站列表（软删除的照片）
router.get('/photos/trash', authMiddleware, (req, res) => {
  const photos = db.getDeletedPhotos().map(p => ({
    ...p,
    title: fixEncoding(p.title),
    name: fixEncoding(p.name),
  }))
  res.json({ code: 200, data: photos })
})

// GET /api/admin/photos/recent - recent photos across all albums
router.get('/photos/recent', authMiddleware, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 12, 50)
  const photos = db
    .getPhotos()
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

    const processed = await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async (f) => {
      const tmpPath = f.path
      try {
        const info = await processUploadedImageToBuffer(tmpPath)
        if (!info) return null

        // 根据后台配置保存到本地或云端对象存储
        const saved = await saveFile(info.buffer, `processed${info.ext}`)

        // 单独保存未经重编码的原图；动图不重复保存（展示图即原文件）
        let original = { url: saved.url, key: null }
        if (KEEP_ORIGINAL && !info.animated) {
          try {
            original = await saveFile(info.originalBuffer, `raw${info.ext}`)
          } catch (err) {
            console.error('保存原图失败，回退到处理后的图片:', err.message)
          }
        }

        // 生成缩略图（失败不阻断上传，回退到原图）
        // processThumbnail 统一输出 WebP，扩展名以返回值 ext 为准
        let thumb = { url: saved.url, key: null }
        try {
          const thumbResult = await processThumbnail(info.buffer, info.format)
          thumb = await saveFile(thumbResult.buffer, `thumb${thumbResult.ext}`)
        } catch (err) {
          console.error('生成缩略图失败:', err.message)
        }

        // 对从文件名提取的标题进行消毒，防止特殊字符与 XSS
        // （编码已在 fileFilter 阶段还原，这里直接取名字即可）
        const rawName = path.parse(f.originalname).name
        const safeName = sanitizeText(rawName, 100) || '未命名'

        return {
          album_id: albumId,
          url: saved.url,
          thumb: thumb.url,
          original_url: original.url,
          width: info.width,
          height: info.height,
          name: safeName,
          title: safeName,
          description: '',
          create_time: new Date().toISOString(),
          // 拍摄时间（EXIF），无拍摄信息时为 null，回退按上传时间展示
          taken_at: info.takenAt || null,
          storage_provider: saved.provider,
          storage_key: saved.key || null,
          thumb_key: thumb.key || null,
          original_key: original.key || null,
        }
      } catch (err) {
        console.error('处理上传图片失败:', err.message)
        return null
      } finally {
        // 成功、失败、提前 return 都会走到这里，确保临时文件不残留。
        // Windows 上 sharp 可能尚未释放文件句柄，直接 unlink 会抛 EBUSY/EPERM，
        // 因此改用带重试的 rmSync（maxRetries 仅在 Windows 生效），
        // 否则每次上传都会留下一个 .tmp，只能等下次启动时兜底清理。
        try {
          fs.rmSync(tmpPath, { force: true, maxRetries: 5, retryDelay: 100 })
        } catch (err) {
          console.error('清理临时文件失败:', tmpPath, err.message)
        }
      }
    })

    if (processed.length === 0) {
      return res.status(400).json({ code: 400, message: '没有成功处理任何图片，请检查文件格式' })
    }

    const added = await db.addPhotos(processed)

    // Set album cover if not set
    if (!album.cover) {
      await db.updateAlbum(albumId, { cover: added[0].thumb || added[0].url })
    }

    res.json({ code: 200, message: '上传成功', data: added })
  }
)

// PATCH /api/admin/photos/:id - 修改照片标题与描述
router.patch('/photos/:id', authMiddleware, photoIdParam, [
  body('title').optional().isLength({ min: 1, max: 100 }).withMessage('标题长度为1-100个字符'),
  body('description').optional().isLength({ max: 500 }).withMessage('描述不能超过500个字符'),
  handleValidation,
], async (req, res) => {
  const data = {}
  if (req.body.title !== undefined) data.title = sanitizeText(fixEncoding(req.body.title), 100)
  if (req.body.description !== undefined) data.description = sanitizeText(fixEncoding(req.body.description), 500)
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ code: 400, message: '没有需要更新的内容' })
  }
  const updated = await db.updatePhoto(Number(req.params.id), data)
  if (!updated) return res.status(404).json({ code: 404, message: '照片不存在' })
  res.json({ code: 200, message: '保存成功', data: updated })
})

// PATCH /api/admin/albums/:albumId/photos/reorder - 重排相册内照片顺序
router.patch('/albums/:albumId/photos/reorder', authMiddleware, albumIdParam, [
  body('ids').isArray({ min: 1 }).withMessage('排序数据格式不正确'),
  body('ids.*').isInt({ min: 1 }).withMessage('排序数据格式不正确'),
  handleValidation,
], async (req, res) => {
  const albumId = Number(req.params.albumId)
  if (!db.findAlbum(albumId)) {
    return res.status(404).json({ code: 404, message: '相册不存在' })
  }
  const photos = await db.reorderPhotos(albumId, req.body.ids)
  res.json({
    code: 200,
    message: '顺序已保存',
    data: photos.map(p => ({ ...p, title: fixEncoding(p.title), name: fixEncoding(p.name) })),
  })
})

// DELETE /api/admin/photos/:id - 软删除（进入回收站，保留物理文件）
router.delete('/photos/:id', authMiddleware, photoIdParam, async (req, res) => {
  const photo = await db.deletePhoto(Number(req.params.id))
  if (!photo) return res.status(404).json({ code: 404, message: '照片不存在' })
  await resetAlbumCoverIfNeeded(photo.album_id, photo)
  res.json({ code: 200, message: '已移入回收站' })
})

// POST /api/admin/photos/batch-delete - 批量软删除（多张照片移入回收站）
router.post('/photos/batch-delete', authMiddleware, async (req, res) => {
  const { ids } = req.body
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请选择要删除的照片' })
  }
  if (ids.length > 200) {
    return res.status(400).json({ code: 400, message: '单次最多删除 200 张照片' })
  }
  const numIds = ids.map(Number).filter(Number.isInteger)
  const deleted = await db.deletePhotos(numIds)
  if (deleted.length === 0) {
    return res.status(400).json({ code: 400, message: '所选照片不存在或已在回收站' })
  }
  // 若被删照片恰是所属相册封面，回退封面，避免死链
  for (const albumId of new Set(deleted.map(p => p.album_id))) {
    await resetAlbumCoverIfNeeded(albumId, deleted.filter(p => p.album_id === albumId))
  }
  res.json({ code: 200, message: `已将 ${deleted.length} 张照片移入回收站`, data: { count: deleted.length } })
})

// POST /api/admin/photos/:id/restore - 从回收站恢复
router.post('/photos/:id/restore', authMiddleware, photoIdParam, async (req, res) => {
  const id = Number(req.params.id)
  const existing = db.findPhoto(id)
  if (!existing || !existing.deleted_at) {
    return res.status(404).json({ code: 404, message: '回收站中没有这张照片' })
  }
  if (!db.findAlbum(existing.album_id)) {
    return res.status(400).json({ code: 400, message: '所属相册已被删除，无法恢复' })
  }
  await db.restorePhoto(id)
  res.json({ code: 200, message: '已恢复' })
})

// DELETE /api/admin/photos/:id/purge - 彻底删除（连同物理文件）
router.delete('/photos/:id/purge', authMiddleware, photoIdParam, async (req, res) => {
  const id = Number(req.params.id)
  const existing = db.findPhoto(id)
  if (!existing) return res.status(404).json({ code: 404, message: '照片不存在' })
  if (!existing.deleted_at) {
    return res.status(400).json({ code: 400, message: '请先移入回收站，再彻底删除' })
  }
  const photo = await db.purgePhoto(id)
  // 兜底：这里是物理文件真正被删除的环节，万一封面在软删除阶段没能正确重置
  // （例如改动前遗留的历史数据），封面就会永久指向一个已不存在的文件。
  await resetAlbumCoverIfNeeded(photo.album_id, photo)
  try {
    await removePhotoFiles(photo)
  } catch (err) {
    console.error('删除照片物理文件失败:', err.message)
  }
  res.json({ code: 200, message: '已彻底删除' })
})

module.exports = router
