import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { detectLocale, localeOptions, messages } from '../lib/i18n'

const LocaleContext = createContext(null)

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale)

  useEffect(() => {
    const option = localeOptions.find((item) => item.code === locale)
    document.documentElement.lang = option?.lang || 'en'
  }, [locale])

  const setLocale = (next) => {
    setLocaleState(next)
    localStorage.setItem('memora-locale', next)
  }

  const t = (key, params = {}) => {
    const table = messages[locale] || messages.en
    let text = table[key] ?? messages.en[key] ?? key
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }

  const value = useMemo(() => ({ locale, setLocale, t }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  return useContext(LocaleContext)
}
