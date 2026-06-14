const express = require('express')
const db = require('../db')
const { authMiddleware } = require('../middleware/auth')

const router = express.Router()

// GET /api/admin/albums
router.get('/', authMiddleware, (req, res) => {
  const albums = db.getAlbums().map(a => ({
    ...a,
    photo_count: db.getPhotosByAlbum(a.id).length,
  }))
  res.json({ code: 200, data: albums })
})

// GET /api/admin/albums/:id
router.get('/:id', authMiddleware, (req, res) => {
  const album = db.findAlbum(Number(req.params.id))
  if (!album) return res.json({ code: 404, message: '相册不存在' })
  res.json({ code: 200, data: album })
})

// POST /api/admin/albums
router.post('/', authMiddleware, (req, res) => {
  const { name, description } = req.body
  if (!name) return res.json({ code: 400, message: '请输入相册名称' })
  const album = db.addAlbum({
    name,
    description: description || '',
    cover: '',
    create_time: new Date().toISOString(),
  })
  res.json({ code: 200, message: '创建成功', data: album })
})

// PUT /api/admin/albums/:id
router.put('/:id', authMiddleware, (req, res) => {
  const { name, description, cover } = req.body
  const updated = db.updateAlbum(Number(req.params.id), { name, description, cover })
  if (!updated) return res.json({ code: 404, message: '相册不存在' })
  res.json({ code: 200, message: '更新成功', data: updated })
})

// DELETE /api/admin/albums/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const deleted = db.deleteAlbum(Number(req.params.id))
  if (!deleted) return res.json({ code: 404, message: '相册不存在' })
  res.json({ code: 200, message: '删除成功' })
})

module.exports = router
