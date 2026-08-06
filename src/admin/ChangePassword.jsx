import { useState } from 'react'
import { useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Key, Eye, EyeSlash, CheckCircle, LockKey } from '@phosphor-icons/react'
import { changePassword } from '../api/real'

/**
 * 修改密码页面
 * 提交成功后后端会强制当前会话失效，前端清空本地状态并跳转登录页
 */
export default function ChangePassword() {
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

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

  return (
    <div className="p-8 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-[22px] font-normal tracking-tight text-[#292524]" style={{ fontFamily: "'Instrument Serif', serif" }}>
          修改密码
        </h1>
        <p className="text-[13px] text-[#a8a098] mt-1">定期更换密码，保护管理后台安全</p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl bg-white border border-[#e7e2d8] p-8 space-y-5"
      >
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
            placeholder="8-50位，含大小写字母、数字和特殊字符"
            show={showNew}
            onToggle={() => setShowNew(!showNew)}
            autoComplete="new-password"
          />
          <p className="text-[11px] text-[#c4bdb2]">至少 8 位，需包含大写字母、小写字母、数字和特殊字符</p>
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

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-2.5" role="alert">
            <LockKey size={16} className="shrink-0 text-red-500" />
            <span className="text-[13px] text-red-600">{error}</span>
          </div>
        )}

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
