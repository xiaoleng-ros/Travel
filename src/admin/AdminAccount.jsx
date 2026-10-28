import { useState } from 'react'
import { useNavigate } from 'react-router'
import { IconLoader2, IconLogout } from '@tabler/icons-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

export default function AdminAccount() {
  const { user, setUser, logout } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      const res = await api.post('/api/profile', { username, email })
      setUser(res.user)
      push('Profile updated')
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  const savePassword = async () => {
    setSavingPassword(true)
    try {
      await api.post('/api/change-password', { currentPassword, newPassword })
      push('Password changed')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  const signOut = async () => {
    await logout()
    navigate('/signin', { replace: true })
  }

  return (
    <div className="max-w-xl space-y-6">
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Profile
        </h2>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Username
            </span>
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Email</span>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile}
              className="btn btn-primary"
            >
              {savingProfile && <IconLoader2 size={16} className="animate-spin" />}
              Save profile
            </button>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Change password
        </h2>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Current password
            </span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              New password
            </span>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={savePassword}
              disabled={savingPassword || !currentPassword || !newPassword}
              className="btn btn-primary"
            >
              {savingPassword && <IconLoader2 size={16} className="animate-spin" />}
              Change password
            </button>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Session
        </h2>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Sign out of this device. You will need to log in again.
        </p>
        <button type="button" onClick={signOut} className="btn btn-danger">
          <IconLogout size={15} />
          Sign Out
        </button>
      </section>
    </div>
  )
}
