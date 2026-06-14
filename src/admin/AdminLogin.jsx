import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { SignIn, Eye, EyeSlash } from '@phosphor-icons/react'
import { adminLogin } from '../api/real'

function BgDecoration() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#f59e0b]/8 blur-[120px]" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#d97706]/6 blur-[120px]" />
      <div className="absolute top-1/3 left-1/4 w-[2px] h-[100px] bg-[#d97706]/10 rotate-45" />
      <div className="absolute top-1/4 right-1/3 w-[2px] h-[150px] bg-[#d97706]/8 -rotate-12" />
      <div className="absolute bottom-1/3 right-1/4 w-2 h-2 rounded-full bg-[#d97706]/10" />
      <div className="absolute top-1/2 left-1/5 w-1.5 h-1.5 rounded-full bg-[#d97706]/8" />
      <div className="absolute bottom-1/2 right-1/5 w-1 h-1 rounded-full bg-[#d97706]/6" />
    </div>
  )
}

export default function AdminLogin() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await adminLogin(username, password)
      if (res.code === 200) {
        localStorage.setItem('admin_token', res.data.token)
        localStorage.setItem('admin_user', JSON.stringify(res.data.user))
        navigate('/admin')
      } else {
        setError(res.message || '登录失败')
      }
    } catch {
      setError('网络错误，请检查连接')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-[#f7f5f1] via-[#f5f0e8] to-[#efe9de]">
      <BgDecoration />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[380px] px-5"
      >
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-white/80 backdrop-blur-xl border border-[#e7e2d8]/60 shadow-[0_8px_32px_rgba(0,0,0,0.06)]"
        >
          <div className="px-7 pt-10 pb-7 space-y-7">
            <div className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-[#fef3c7] to-[#fde68a] flex items-center justify-center shadow-[0_2px_8px_rgba(217,119,6,0.15)]"
              >
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#d97706]" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </motion.div>
              <div className="space-y-1">
                <h1 className="text-[20px] font-semibold tracking-tight text-[#292524]">
                  管理后台
                </h1>
                <p className="text-[13px] text-[#a8a098]">
                  心之所向 · 照片回忆录
                </p>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/80 px-3.5 py-2.5"
                role="alert"
              >
                <svg className="w-4 h-4 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="text-[13px] text-red-600">{error}</span>
              </motion.div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="username" className="block text-[13px] font-medium text-[#787168]">
                  用户名
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  className="w-full h-10 bg-[#faf8f5]/80 border border-[#e7e2d8] rounded-lg px-3.5 text-[14px] text-[#292524] placeholder-[#c4bdb2] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50 focus-visible:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-[13px] font-medium text-[#787168]">
                  密码
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="admin123"
                    autoComplete="current-password"
                    className="w-full h-10 bg-[#faf8f5]/80 border border-[#e7e2d8] rounded-lg px-3.5 pr-10 text-[14px] text-[#292524] placeholder-[#c4bdb2] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d97706]/30 focus-visible:border-[#d97706]/50 focus-visible:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 text-[#a8a098] hover:text-[#787168] transition-colors duration-150"
                    tabIndex={-1}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  >
                    {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-[#292524] text-white text-[14px] font-medium transition-all duration-150 hover:bg-[#44403c] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#292524]/30 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <span>登录中</span>
                </>
              ) : (
                <>
                  <SignIn size={16} weight="bold" />
                  <span>登录</span>
                </>
              )}
            </button>
          </div>

          <div className="px-7 py-3.5 border-t border-[#f0ece4]/60">
            <p className="text-center text-[11px] text-[#c4bdb2] tracking-[0.05em]">
              记录每一次出发 · 珍藏每一段回忆
            </p>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
