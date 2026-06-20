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
    const user = verifyToken(token)
    if (db.isTokenBlacklisted(token)) {
      return res.status(401).json({ code: 401, message: '登录已过期' })
    }
    req.user = user
    next()
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期' })
  }
}

module.exports = { generateToken, verifyToken, authMiddleware }
