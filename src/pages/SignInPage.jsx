import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { useLocale } from '../context/LocaleContext'
import { useSettings } from '../context/SettingsContext'
import BackPill from '../components/BackPill'

export default function SignInPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { t } = useLocale()
  const { getSetting } = useSettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    if (!email || !password || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError(t('login.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <BackPill label={t('login.back')} className="!left-4 !top-4" />
      <form onSubmit={submit} className="flex w-full max-w-sm flex-col items-center gap-6 py-10">
        <img
          src={getSetting('app:avatarUrl') || '/brand/avatar.webp'}
          alt=""
          className="size-24 rounded-full object-cover shadow-sm"
        />
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-2xl font-medium text-neutral-900 dark:text-neutral-100">
            {t('signIn')}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('login.title')}</p>
        </div>

        <div className="flex w-full flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('login.email')}
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="field"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t('login.password')}
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field"
            />
          </label>
        </div>

        {error && (
          <p className="w-full rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {submitting ? t('loading') + '…' : t('login.continue')}
        </button>
      </form>
    </div>
  )
}
