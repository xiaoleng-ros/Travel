const rateLimit = require('express-rate-limit')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { code: 429, message: '尝试次数过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
})

// 上传接口由 uploadLimiter 单独限流，此处跳过，避免一次上传被双重计数
function isUploadRequest(req) {
  return req.method === 'POST' && /^\/admin\/albums\/\d+\/photos\/?$/.test(req.path)
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isUploadRequest,
})

// 上传接口独立限流：防止大文件批量上传造成 DoS
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { code: 429, message: '上传过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = { loginLimiter, apiLimiter, uploadLimiter }
