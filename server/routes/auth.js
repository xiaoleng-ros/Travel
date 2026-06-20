const express = require('express')
const bcrypt = require('bcryptjs')
const { body, validationResult } = require('express-validator')
const db = require('../db')
const { generateToken, authMiddleware } = require('../middleware/auth')
const { loginLimiter } = require('../middleware/rateLimit')

const router = express.Router()

// GET /api/admin/me - 获取当前登录用户信息，用于前端校验会话
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    code: 200,
    data: { id: req.user.id, username: req.user.username },
  })
})

const passwordValidationRules = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('用户名长度为3-30个字符')
    .matches(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/)
    .withMessage('用户名只能包含字母、数字、下划线和中文字符'),
  body('password')
    .isLength({ min: 8, max: 50 })
    .withMessage('密码长度不能少于8个字符')
    .matches(/[A-Z]/)
    .withMessage('密码必须包含至少一个大写字母')
    .matches(/[a-z]/)
    .withMessage('密码必须包含至少一个小写字母')
    .matches(/[0-9]/)
    .withMessage('密码必须包含至少一个数字')
    .matches(/[^a-zA-Z0-9]/)
    .withMessage('密码必须包含至少一个特殊字符'),
]

router.post('/login', loginLimiter, passwordValidationRules, (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ code: 400, message: errors.array()[0].msg })
  }

  try {
    const { username, password } = req.body

    const user = db.getUsers().find(u => u.username === username)
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' })
    }

    const valid = bcrypt.compareSync(password, user.password)
    if (!valid) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' })
    }

    const token = generateToken(user)

    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        user: { id: user.id, username: user.username, nickname: user.nickname },
      },
    })
  } catch (err) {
    console.error('登录异常')
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
})

router.post('/logout', async (req, res) => {
  const token = req.cookies?.admin_token
  if (token) {
    await db.blacklistToken(token)
  }

  res.clearCookie('admin_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  })
  res.json({ code: 200, message: '退出成功' })
})

module.exports = router
