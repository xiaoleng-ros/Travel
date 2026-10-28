import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const data = await api.get('/api/profile')
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const login = async (email, password) => {
    const data = await api.post('/api/login', { email, password })
    setUser(data.user)
    return data.user
  }

  const logout = async () => {
    await api.post('/api/logout')
    setUser(null)
  }

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, setUser }),
    [user, loading],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
