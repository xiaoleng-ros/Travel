require('dotenv').config()

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const path = require('path')
const fs = require('fs')
const morgan = require('morgan')
const { apiLimiter } = require('./middleware/rateLimit')

const authRoutes = require('./routes/auth')
const albumRoutes = require('./routes/albums')
const photoRoutes = require('./routes/photos')
const storageRoutes = require('./routes/storage')
const publicRoutes = require('./routes/public')

const app = express()
const PORT = process.env.PORT || 3001

// 反向代理信任设置：部署在 Nginx 等反代之后时，限流与日志才能获取真实客户端 IP
// 生产环境可通过 TRUST_PROXY 环境变量调整（默认仅信任本机反代，避免伪造 X-Forwarded-For）
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback')

// 访问日志：生产使用 combined 格式（含来源 IP、状态码、耗时）
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(url => url.trim())

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 放行 Google Fonts 样式表与字体资源
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      // 相册图片可能来自本地或任意云端 CDN（https 图片无法执行脚本，风险可控）
      imgSrc: ["'self'", "data:", "blob:", "https:"],
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

// 生产环境：托管前端构建产物（dist）并支持 SPA 路由回退
// 开发环境仍由 Vite dev server 提供前端页面
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '..', 'dist')
  if (fs.existsSync(distDir)) {
    // 静态资源（Vite 构建产物，文件名带 hash，可长缓存）
    // index.html 不含 hash，必须禁用缓存，否则前端发版后用户仍加载旧的入口
    app.use(express.static(distDir, {
      index: 'index.html',
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache')
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }))
    // 非 /api 与 /uploads 的路径回退到 index.html，由前端路由接管
    app.get(/^\/(?!api|uploads).*/, (req, res) => {
      res.sendFile(path.join(distDir, 'index.html'))
    })
  } else {
    console.warn('[警告] 未找到 dist 构建目录，请先在前端目录执行 npm run build')
  }
}

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
  // 一次上传超过 upload.array 限定的数量时会抛此错误，给出明确提示而非笼统的 500
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ code: 400, message: '一次最多上传20张照片' })
  }
  res.status(500).json({ code: 500, message: '服务器内部错误' })
})

/**
 * 清理上传过程中残留的临时文件。
 * 正常流程由 finally 删除，但进程崩溃、强杀等异常退出会留下 .tmp 垃圾，
 * 这里在启动时兜底回收（只清理超过 1 小时的，避免误删正在上传的文件）。
 */
function cleanupOrphanTempFiles() {
  const uploadDir = path.join(__dirname, 'uploads')
  if (!fs.existsSync(uploadDir)) return
  const MAX_AGE = 60 * 60 * 1000
  let removed = 0
  for (const name of fs.readdirSync(uploadDir)) {
    if (!name.endsWith('.tmp')) continue
    const filePath = path.join(uploadDir, name)
    try {
      if (Date.now() - fs.statSync(filePath).mtimeMs > MAX_AGE) {
        fs.unlinkSync(filePath)
        removed++
      }
    } catch {}
  }
  if (removed > 0) console.log(`已清理 ${removed} 个残留临时文件`)
}

app.listen(PORT, () => {
  cleanupOrphanTempFiles()
  console.log(`服务器运行在 http://localhost:${PORT}`)
  console.log(`上传目录: ${path.join(__dirname, 'uploads')}`)
})
