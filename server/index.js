const express = require('express')
const cors = require('cors')
const path = require('path')

const authRoutes = require('./routes/auth')
const albumRoutes = require('./routes/albums')
const photoRoutes = require('./routes/photos')
const publicRoutes = require('./routes/public')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Static files - uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Public API
app.use('/api', publicRoutes)

// Admin API
app.use('/api/admin', authRoutes)
app.use('/api/admin/albums', albumRoutes)
app.use('/api/admin', photoRoutes)

// 未匹配路由 → 404
app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' })
})

// Error handling
app.use((err, req, res, next) => {
  console.error(err)
  if (err.message === '不支持的文件格式') {
    return res.json({ code: 400, message: err.message })
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.json({ code: 400, message: '文件大小不能超过 20MB' })
  }
  res.status(500).json({ code: 500, message: '服务器内部错误' })
})

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`)
  console.log(`📂 上传目录: ${path.join(__dirname, 'uploads')}`)
  console.log(`🔑 默认账号: admin / admin123`)
})
