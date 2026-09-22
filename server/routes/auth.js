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

// 登录仅校验非空；密码强度规则只应用于「设置/修改密码」，
// 避免历史弱密码或随机生成的初始密码因不满足强度要求而无法登录
const loginValidationRules = [
  body('username').trim().notEmpty().withMessage('请输入用户名'),
  body('password').notEmpty().withMessage('请输入密码'),
]

router.post('/login', loginLimiter, loginValidationRules, (req, res) => {
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

// 修改当前登录用户的密码
// 校验：旧密码正确 + 新密码强度达标，修改成功后强制重新登录（黑名单当前 token）
router.post('/change-password', authMiddleware, [
  body('oldPassword')
    .isLength({ min: 1, max: 50 })
    .withMessage('请输入原密码'),
  body('newPassword')
    .isLength({ min: 8, max: 50 })
    .withMessage('新密码长度不能少于8个字符')
    .matches(/[A-Z]/)
    .withMessage('新密码必须包含至少一个大写字母')
    .matches(/[a-z]/)
    .withMessage('新密码必须包含至少一个小写字母')
    .matches(/[0-9]/)
    .withMessage('新密码必须包含至少一个数字')
    .matches(/[^a-zA-Z0-9]/)
    .withMessage('新密码必须包含至少一个特殊字符'),
  (req, res, next) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ code: 400, message: errors.array()[0].msg })
    }
    next()
  },
], async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body

    // 通过 token 中的用户 id 查找当前用户
    const user = db.getUsers().find(u => u.id === req.user.id)
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在，请重新登录' })
    }

    // 校验旧密码是否正确
    const valid = bcrypt.compareSync(oldPassword, user.password)
    if (!valid) {
      return res.status(400).json({ code: 400, message: '原密码不正确' })
    }

    // 新旧密码不能相同
    if (oldPassword === newPassword) {
      return res.status(400).json({ code: 400, message: '新密码不能与原密码相同' })
    }

    // 更新密码。changeUserPassword 会写入 password_changed_at，
    // 使改密码之前签发的所有 token（含其他设备上的会话）立即失效。
    await db.changeUserPassword(user.id, bcrypt.hashSync(newPassword, 10))
    // 再把当前 token 也加入黑名单，覆盖「同一秒内签发」的边界情况
    const currentToken = req.cookies?.admin_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null)
    if (currentToken) await db.blacklistToken(currentToken)

    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    })
    res.json({ code: 200, message: '密码修改成功，请重新登录' })
  } catch (err) {
    console.error('修改密码异常:', err.message)
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
