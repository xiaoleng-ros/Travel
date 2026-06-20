require('dotenv').config()

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const path = require('path')
const { apiLimiter } = require('./middleware/rateLimit')

const authRoutes = require('./routes/auth')
const albumRoutes = require('./routes/albums')
const photoRoutes = require('./routes/photos')
const storageRoutes = require('./routes/storage')
const publicRoutes = require('./routes/public')

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(url => url.trim())

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}))

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}))

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(cookieParser())

// uploads 访问统一通过 publicRoutes 中的安全路由处理，避免双重暴露

app.use('/api', apiLimiter)
app.use('/api', publicRoutes)
// 上传文件同时通过 /uploads/:filename 暴露，兼容前端已有 URL
app.use(publicRoutes)

app.use('/api/admin', authRoutes)
app.use('/api/admin/albums', albumRoutes)
app.use('/api/admin', photoRoutes)
app.use('/api/admin/storage', storageRoutes)

app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' })
})

app.use((err, req, res, next) => {
  console.error('服务器异常:', err.message)
  if (err.message === '不支持的文件格式' || err.message === '文件名包含非法字符') {
    return res.status(400).json({ code: 400, message: err.message })
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 400, message: '文件大小不能超过20MB' })
  }
  res.status(500).json({ code: 500, message: '服务器内部错误' })
})

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
  console.log(`上传目录: ${path.join(__dirname, 'uploads')}`)
})
