const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'photo-memoir-secret-key-2026'

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '未登录' })
  }
  try {
    const user = verifyToken(auth.split(' ')[1])
    req.user = user
    next()
  } catch {
    return res.status(401).json({ code: 401, message: '登录已过期' })
  }
}

module.exports = { generateToken, verifyToken, authMiddleware }
