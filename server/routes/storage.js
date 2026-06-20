const express = require('express')
const { body, validationResult } = require('express-validator')
const db = require('../db')
const { authMiddleware } = require('../middleware/auth')
const { createAdapter } = require('../storage/providers')

const router = express.Router()

// 各提供者的表单字段定义（用于前端渲染与校验）
const PROVIDER_SCHEMA = {
  oss: {
    name: '阿里云 OSS',
    fields: [
      { key: 'region', label: 'Region', placeholder: 'oss-cn-hangzhou', required: true },
      { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
      { key: 'accessKeyId', label: 'AccessKey ID', type: 'password', required: true },
      { key: 'accessKeySecret', label: 'AccessKey Secret', type: 'password', required: true },
      { key: 'cdnDomain', label: 'CDN 域名（可选）', placeholder: 'https://cdn.example.com', required: false },
    ],
  },
  cos: {
    name: '腾讯云 COS',
    fields: [
      { key: 'region', label: 'Region', placeholder: 'ap-guangzhou', required: true },
      { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket-1250000000', required: true },
      { key: 'secretId', label: 'SecretId', type: 'password', required: true },
      { key: 'secretKey', label: 'SecretKey', type: 'password', required: true },
      { key: 'cdnDomain', label: 'CDN 域名（可选）', placeholder: 'https://cdn.example.com', required: false },
    ],
  },
  kodo: {
    name: '七牛云 Kodo',
    fields: [
      { key: 'bucket', label: 'Bucket', placeholder: 'my-bucket', required: true },
      { key: 'region', label: 'Region（可选）', placeholder: 'cn-east-1', required: false },
      { key: 'accessKey', label: 'AccessKey', type: 'password', required: true },
      { key: 'secretKey', label: 'SecretKey', type: 'password', required: true },
      { key: 'cdnDomain', label: 'CDN 域名（可选）', placeholder: 'https://cdn.example.com', required: false },
    ],
  },
}

// 敏感字段列表
const SECRET_FIELDS = {
  oss: ['accessKeyId', 'accessKeySecret'],
  cos: ['secretId', 'secretKey'],
  kodo: ['accessKey', 'secretKey'],
}

function handleValidation(req, res, next) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 400, message: errors.array()[0].msg })
  }
  next()
}

/**
 * 将数据库中的加密配置转换为前端可安全展示的对象
 * 敏感字段若已设置则返回空字符串（前端填写即覆盖，不填保留原值）
 */
function maskStorageSettings(settings) {
  const providers = {}
  for (const [provider, config] of Object.entries(settings.providers || {})) {
    const masked = { ...config }
    const secretFields = SECRET_FIELDS[provider] || []
    for (const field of secretFields) {
      if (masked[field]) {
        masked[field] = ''
      }
    }
    providers[provider] = masked
  }
  return {
    activeProvider: settings.activeProvider || 'local',
    providers,
  }
}

// GET /api/admin/storage - 获取当前存储配置（敏感字段已脱敏）
router.get('/', authMiddleware, (req, res) => {
  const settings = db.getStorageSettings()
  res.json({ code: 200, data: maskStorageSettings(settings) })
})

// GET /api/admin/storage/providers - 获取支持的提供者字段定义
router.get('/providers', authMiddleware, (req, res) => {
  res.json({ code: 200, data: PROVIDER_SCHEMA })
})

// PUT /api/admin/storage - 保存存储配置
const saveValidation = [
  body('activeProvider')
    .isIn(['local', 'oss', 'cos', 'kodo'])
    .withMessage('activeProvider 必须是 local、oss、cos 或 kodo'),
  body('providers').optional().isObject().withMessage('providers 必须是对象'),
  handleValidation,
]

router.put('/', authMiddleware, saveValidation, async (req, res) => {
  try {
    const { activeProvider, providers = {} } = req.body
    const currentSettings = db.getStorageSettings()
    const mergedProviders = {}

    // 合并配置：敏感字段前端传空则保留原加密值
    for (const [provider, config] of Object.entries(providers)) {
      if (!PROVIDER_SCHEMA[provider]) continue
      const secretFields = SECRET_FIELDS[provider] || []
      const currentConfig = db.decryptStorageConfig(provider, currentSettings.providers?.[provider]) || {}
      const merged = { ...config }
      for (const field of secretFields) {
        if (!merged[field] && currentConfig[field]) {
          merged[field] = currentConfig[field]
        }
      }
      mergedProviders[provider] = merged
    }

    // 保留当前数据库中其他未提交的提供者配置
    for (const provider of Object.keys(currentSettings.providers || {})) {
      if (!mergedProviders[provider]) {
        mergedProviders[provider] = currentSettings.providers[provider]
      }
    }

    const settings = await db.updateStorageSettings({
      activeProvider,
      providers: mergedProviders,
    })

    res.json({ code: 200, message: '保存成功', data: maskStorageSettings(settings) })
  } catch (err) {
    console.error('保存存储配置失败:', err.message)
    res.status(500).json({ code: 500, message: '保存失败：' + err.message })
  }
})

// POST /api/admin/storage/test - 测试指定提供者连通性
const testValidation = [
  body('provider')
    .isIn(['oss', 'cos', 'kodo'])
    .withMessage('provider 必须是 oss、cos 或 kodo'),
  body('config').isObject().withMessage('config 必须是对象'),
  handleValidation,
]

router.post('/test', authMiddleware, testValidation, async (req, res) => {
  try {
    const { provider, config } = req.body
    const adapter = createAdapter(provider, config)
    const ok = await adapter.test()
    if (ok) {
      res.json({ code: 200, message: '连通性测试通过' })
    } else {
      res.status(400).json({ code: 400, message: '连通性测试失败，请检查配置' })
    }
  } catch (err) {
    console.error('存储连通性测试异常:', err.message)
    res.status(400).json({ code: 400, message: '测试失败：' + err.message })
  }
})

module.exports = router
module.exports.PROVIDER_SCHEMA = PROVIDER_SCHEMA
