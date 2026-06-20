import { useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { checkAdminSession } from '../api/real'

function RequireAuth({ children }) {
  const location = useLocation()
  const [authState, setAuthState] = useState('loading')

  useEffect(() => {
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
