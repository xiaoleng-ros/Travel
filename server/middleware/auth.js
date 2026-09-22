const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const db = require('../db')

const JWT_SECRET = process.env.JWT_SECRET

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET 环境变量未设置或长度不足32位，请在 .env 文件中配置安全的随机密钥')
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, jti: crypto.randomUUID() },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

function authMiddleware(req, res, next) {
  let token = null

  if (req.cookies && req.cookies.admin_token) {
    token = req.cookies.admin_token
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1]
  }

  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录' })
  }

  try {
    const payload = verifyToken(token)
    if (db.isTokenBlacklisted(token)) {
      return res.status(401).json({ code: 401, message: '登录已过期' })
    }

    // 密码一旦被修改，此前签发的所有 token 立即失效。
    // 仅靠黑名单只能作废「当前这一个」token，其他设备上已登录的会话仍会在 7 天有效期内畅通无阻。
    // 这里用签发时间（iat）与密码修改时间比对，实现「改密码 = 全端下线」。
    const record = db.findUser(payload.id)
    if (!record) {
      return res.status(401).json({ code: 401, message: '账号不存在，请重新登录' })
    }
    if (record.password_changed_at && payload.iat < record.password_changed_at) {
      return res.status(401).json({ code: 401, message: '密码已变更，请重新登录' })
    }

    req.user = payload
    next()
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期' })
  }
}

module.exports = { generateToken, verifyToken, authMiddleware }
