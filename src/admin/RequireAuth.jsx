import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router'
import { checkAdminSession } from '../api/real'

function RequireAuth({ children }) {
  const location = useLocation()
  const [authState, setAuthState] = useState('loading')

  useEffect(() => {
    // 优先检查 sessionStorage 标记（登录刚完成时的快速路径，避免 cookie 未就绪时循环跳转）
    if (sessionStorage.getItem('admin_logged_in') === '1') {
      setAuthState('ok')
      return
    }

    let cancelled = false
    checkAdminSession()
      .then((res) => {
        if (!cancelled) setAuthState(res.code === 200 ? 'ok' : 'unauthorized')
      })
      .catch(() => {
        if (!cancelled) setAuthState('unauthorized')
      })
    return () => { cancelled = true }
  }, [])

  if (authState === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f7f5f1]">
        <div className="w-8 h-8 border-2 border-[#1a1a1a]/10 border-t-[#1a1a1a] rounded-full animate-spin" />
      </div>
    )
  }

  if (authState === 'unauthorized') {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return children
}

export default RequireAuth
