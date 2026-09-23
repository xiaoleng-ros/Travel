import { useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Key, Eye, EyeSlash, CheckCircle, LockKey, UserCircle } from '@phosphor-icons/react'
import { changePassword, changeUsername } from '../api/real'
import { checkPassword, PASSWORD_RULE_TEXT } from '../utils/password'

/** 用户名规则（与后端 express-validator 的校验保持一致） */
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/
const USERNAME_RULE_TEXT = '3-20 位，只能包含字母、数字、下划线和连字符'

/** 从本地缓存读当前用户名，作为「当前用户名」的展示值 */
function readCachedUsername() {
  try {
    return JSON.parse(localStorage.getItem('admin_user') || '{}').username || 'admin'
  } catch {
    return 'admin'
  }
}

/**
 * 账号设置页面。
 *
 * 注意文件名仍是 ChangePassword.jsx（历史原因，避免牵动路由引用），
 * 但它现在承载两件事：修改用户名 + 修改密码。
 *
 * 二者都不需要重新登录：
 *  - 改用户名不影响会话（token 按 payload.id 鉴权，不按用户名）
 *  - 改密码会主动作废所有登录态，由后端返回后前端跳回登录页
 */
export default function ChangePassword() {
  const navigate = useNavigate()

  // ---------- 修改用户名 ----------
  const [currentUsername, setCurrentUsername] = useState(readCachedUsername)
  const [newUsername, setNewUsername] = useState('')
  const [usernameMsg, setUsernameMsg] = useState(null)
  const [usernameLoading, setUsernameLoading] = useState(false)

  // ---------- 修改密码 ----------
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleUsernameSubmit = async (e) => {
    e.preventDefault()
    setUsernameMsg(null)

    const name = newUsername.trim()
    if (!name) {
      setUsernameMsg({ type: 'error', text: '请输入新用户名' })
      return
    }
    if (name === currentUsername) {
      setUsernameMsg({ type: 'error', text: '新用户名与当前用户名相同' })
      return
    }
    if (!USERNAME_RE.test(name)) {
      setUsernameMsg({ type: 'error', text: `用户名需为 ${USERNAME_RULE_TEXT}` })
      return
    }

    setUsernameLoading(true)
    try {
      const res = await changeUsername(name)
      if (res.code === 200) {
        // 同步本地缓存的用户信息，免得界面上仍显示旧用户名
        try {
          const cached = JSON.parse(localStorage.getItem('admin_user') || '{}')
          localStorage.setItem('admin_user', JSON.stringify({ ...cached, username: res.data.user.username }))
        } catch {
          localStorage.setItem('admin_user', JSON.stringify(res.data.user))
        }
        setCurrentUsername(res.data.user.username)
        setNewUsername('')
        setUsernameMsg({ type: 'ok', text: '用户名已修改，下次登录请使用新用户名' })
      } else {
        setUsernameMsg({ type: 'error', text: res.message || '修改失败' })
      }
    } catch (err) {
      setUsernameMsg({ type: 'error', text: err?.message || '网络错误，请检查连接' })
    } finally {
      setUsernameLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    // 强度规则只能在这里校验：密码在本函数里就会被哈希，
    // 服务端收到的只是哈希值，无法得知明文，也就无法校验强度。
    if (!oldPassword) {
      setError('请输入原密码')
      return
    }
    const ruleError = checkPassword(newPassword)
    if (ruleError) {
      setError(ruleError)
      return
    }

    // 前端校验：新密码与确认密码必须一致
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    setLoading(true)
    try {
      const res = await changePassword(oldPassword, newPassword)
      if (res.code === 200) {
        // 清除本地登录状态，跳转登录页重新登录
        localStorage.removeItem('admin_user')
        sessionStorage.removeItem('admin_logged_in')
        setSuccess(true)
        setTimeout(() => navigate('/admin/login'), 1200)
      } else {
        setError(res.message || '修改失败')
      }
    } catch (err) {
      setError(err?.message || '网络错误，请检查连接')
    } finally {
      setLoading(false)
    }
  }

  // 密码输入框（带显示/隐藏切换）
  const PasswordInput = ({ value, onChange, placeholder, show, onToggle, id, autoComplete }) => (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full h-10 bg-[#faf8f5]/80 border border-[#e7e2d8] rounded-lg px-3.5 pr-10 text-[14px] text-[#292524] placeholder-[#c4bdb2] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50 focus-visible:bg-white"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 text-[#a8a098] hover:text-[#787168] transition-colors duration-150"
        tabIndex={-1}
        aria-label={show ? '隐藏密码' : '显示密码'}
      >
        {show ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )

  const Feedback = ({ msg }) =>
    msg && (
      <div
        className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 ${
          msg.type === 'ok' ? 'border-emerald-200 bg-emerald-50/80' : 'border-red-200 bg-red-50/80'
        }`}
        role={msg.type === 'ok' ? 'status' : 'alert'}
      >
        {msg.type === 'ok' ? (
          <CheckCircle size={16} className="shrink-0 text-emerald-500" />
        ) : (
          <LockKey size={16} className="shrink-0 text-red-500" />
        )}
        <span className={`text-[13px] ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
          {msg.text}
        </span>
      </div>
    )

  return (
    <div className="p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-[22px] font-normal tracking-tight text-[#292524]" style={{ fontFamily: "'Instrument Serif', serif" }}>
          账号设置
        </h1>
        <p className="text-[13px] text-[#a8a098] mt-1">管理登录用的用户名与密码</p>
      </motion.div>

      {/* ---------- 修改用户名 ---------- */}
      <motion.form
        onSubmit={handleUsernameSubmit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="rounded-2xl bg-white border border-[#e7e2d8] p-8 space-y-5 mb-6"
      >
        <div className="flex items-center gap-2.5">
          <UserCircle size={18} className="text-[#a8a098]" />
          <h2 className="text-[15px] font-medium text-[#292524]">修改用户名</h2>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-[#787168]">当前用户名</label>
          <div className="w-full h-10 flex items-center bg-[#f5f2ec] border border-[#e7e2d8] rounded-lg px-3.5 text-[14px] text-[#a8a098] select-all">
            {currentUsername}
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="newUsername" className="block text-[13px] font-medium text-[#787168]">
            新用户名
          </label>
          <input
            id="newUsername"
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder={currentUsername}
            autoComplete="off"
            spellCheck={false}
            className="w-full h-10 bg-[#faf8f5]/80 border border-[#e7e2d8] rounded-lg px-3.5 text-[14px] text-[#292524] placeholder-[#c4bdb2] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50 focus-visible:bg-white"
          />
          <p className="text-[11px] text-[#c4bdb2]">{USERNAME_RULE_TEXT}</p>
        </div>

        <Feedback msg={usernameMsg} />

        <button
          type="submit"
          disabled={usernameLoading}
          className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-[#292524] text-white text-[14px] font-medium transition-all duration-150 hover:bg-[#44403c] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <UserCircle size={16} weight="bold" />
          {usernameLoading ? '提交中…' : '保存用户名'}
        </button>
      </motion.form>

      {/* ---------- 修改密码 ---------- */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-2xl bg-white border border-[#e7e2d8] p-8 space-y-5"
      >
        <div className="flex items-center gap-2.5">
          <Key size={18} className="text-[#a8a098]" />
          <h2 className="text-[15px] font-medium text-[#292524]">修改密码</h2>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="oldPassword" className="block text-[13px] font-medium text-[#787168]">
            原密码
          </label>
          <PasswordInput
            id="oldPassword"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="请输入当前密码"
            show={showOld}
            onToggle={() => setShowOld(!showOld)}
            autoComplete="current-password"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="newPassword" className="block text-[13px] font-medium text-[#787168]">
            新密码
          </label>
          <PasswordInput
            id="newPassword"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="长度 6-20 位，至少两类字符"
            show={showNew}
            onToggle={() => setShowNew(!showNew)}
            autoComplete="new-password"
          />
          <p className="text-[11px] text-[#c4bdb2]">{PASSWORD_RULE_TEXT}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-[13px] font-medium text-[#787168]">
            确认新密码
          </label>
          <PasswordInput
            id="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
            show={showConfirm}
            onToggle={() => setShowConfirm(!showConfirm)}
            autoComplete="new-password"
          />
        </div>

        {error && <Feedback msg={{ type: 'error', text: error }} />}

        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3.5 py-2.5" role="status">
            <CheckCircle size={16} className="shrink-0 text-emerald-500" />
            <span className="text-[13px] text-emerald-600">密码修改成功，即将跳转登录页…</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-[#292524] text-white text-[14px] font-medium transition-all duration-150 hover:bg-[#44403c] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <Key size={16} weight="bold" />
          {loading ? '提交中…' : '确认修改'}
        </button>
      </motion.form>
    </div>
  )
}
