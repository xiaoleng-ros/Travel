import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const response = await api.get('/api/system/settings/all')
      setSettings(response?.data || {})
    } catch (error) {
      console.error('[settings]', error)
      setSettings({})
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const getSetting = (path) => {
    if (!settings) return ''
    const [namespace, ...rest] = String(path).split(':')
    const key = rest.join(':')
    return settings?.[namespace]?.[key] ?? ''
  }

  const updateSettings = async (payload) => {
    const response = await api.post('/api/system/settings/batch', { data: payload })
    if (response?.data) setSettings(response.data)
    return response?.data
  }

  const value = useMemo(
    () => ({ settings, loading, getSetting, updateSettings, refresh: load }),
    [settings, loading],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}
