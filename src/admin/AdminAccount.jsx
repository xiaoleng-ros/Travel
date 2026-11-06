import { useEffect, useRef, useState } from 'react'
import IconCamera from '@tabler/icons-react/dist/esm/icons/IconCamera.mjs'
import IconLoader2 from '@tabler/icons-react/dist/esm/icons/IconLoader2.mjs'
import IconLock from '@tabler/icons-react/dist/esm/icons/IconLock.mjs'
import IconTrash from '@tabler/icons-react/dist/esm/icons/IconTrash.mjs'
import IconUpload from '@tabler/icons-react/dist/esm/icons/IconUpload.mjs'
import IconUser from '@tabler/icons-react/dist/esm/icons/IconUser.mjs'
import { api, removeAvatar, uploadAvatar } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useLocale } from '../context/LocaleContext'
import { useSettings } from '../context/SettingsContext'

const AVATAR_LIMIT = 8 * 1024 * 1024

// 没有头像就是空白：只有一个淡淡的圆环，不放任何图片，也不放首字母。
function AvatarBlank({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-full bg-neutral-100 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-700 ${className}`}
    />
  )
}

function SectionHeading({ icon: Icon, title, hint }) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>}
      </div>
    </div>
  )
}

export default function AdminAccount() {
  const { user, setUser } = useAuth()
  const { push } = useToast()
  const { t } = useLocale()
  const { refresh: refreshSettings } = useSettings()
  const fileRef = useRef(null)
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarProgress, setAvatarProgress] = useState(0)

  // 资料在别处（登录、刷新）变化时同步回输入框
  useEffect(() => {
    setUsername(user?.username || '')
    setEmail(user?.email || '')
  }, [user?.username, user?.email])

  const avatarSrc = user?.avatar || ''

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      const res = await api.post('/api/profile', { username, email })
      setUser(res.user)
      push(t('admin.profileUpdated'))
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
      push(t('admin.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSavingPassword(false)
    }
  }

  const pickAvatar = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    // 有些系统给出的 type 是空串（例如 .heic），这种情况交给后端 sharp 判断
    if (file.type && !file.type.startsWith('image/')) {
      push(t('admin.avatarTypeError'), 'error')
      return
    }
    if (file.size > AVATAR_LIMIT) {
      push(t('admin.avatarTooLarge'), 'error')
      return
    }
    setUploadingAvatar(true)
    setAvatarProgress(0)
    try {
      const next = await uploadAvatar(file, { onProgress: setAvatarProgress })
      if (next) setUser(next)
      refreshSettings?.()
      push(t('admin.avatarUpdated'))
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setUploadingAvatar(false)
      setAvatarProgress(0)
    }
  }

  const clearAvatar = async () => {
    setUploadingAvatar(true)
    try {
      const next = await removeAvatar()
      if (next) setUser(next)
      refreshSettings?.()
      push(t('admin.avatarRemoved'))
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* 身份概览 */}
      <section className="card overflow-hidden p-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="group relative shrink-0">
            <button
              type="button"
              onClick={() => !uploadingAvatar && fileRef.current?.click()}
              className="relative block size-16 overflow-hidden rounded-full"
              title={t('admin.changeAvatar')}
              aria-label={t('admin.changeAvatar')}
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  className="size-16 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <AvatarBlank className="size-16" />
              )}
              <span
                className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white transition-opacity ${
                  uploadingAvatar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                {uploadingAvatar ? (
                  <IconLoader2 size={18} className="animate-spin" />
                ) : (
                  <IconCamera size={18} />
                )}
              </span>
            </button>
            {uploadingAvatar && avatarProgress > 0 && avatarProgress < 100 && (
              <span className="absolute -bottom-1 left-1/2 h-1 w-12 -translate-x-1/2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                <span
                  className="block h-full rounded-full bg-neutral-900 transition-all dark:bg-white"
                  style={{ width: `${avatarProgress}%` }}
                />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">
                {user?.username || t('admin.roleAdmin')}
              </h2>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {t('admin.roleAdmin')}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">
              {user?.email}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="btn btn-soft"
              >
                <IconUpload size={14} />
                {uploadingAvatar
                  ? t('admin.avatarUploading', { percent: avatarProgress })
                  : t('admin.uploadAvatar')}
              </button>
              {avatarSrc && (
                <button
                  type="button"
                  onClick={clearAvatar}
                  disabled={uploadingAvatar}
                  className="btn btn-danger"
                >
                  <IconTrash size={14} />
                  {t('admin.removeAvatar')}
                </button>
              )}
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                {t('admin.avatarHint')}
              </span>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={pickAvatar}
          />
        </div>
      </section>

      {/* 资料 */}
      <section className="card p-5">
        <SectionHeading icon={IconUser} title={t('admin.profile')} hint={t('admin.profileHint')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.username')}
            </span>
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.email')}
            </span>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveProfile}
            disabled={savingProfile}
            className="btn btn-primary"
          >
            {savingProfile && <IconLoader2 size={16} className="animate-spin" />}
            {t('admin.saveProfile')}
          </button>
        </div>
      </section>

      {/* 密码 */}
      <section className="card p-5">
        <SectionHeading
          icon={IconLock}
          title={t('admin.changePassword')}
          hint={t('admin.passwordHint')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.currentPassword')}
            </span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.newPassword')}
            </span>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={savePassword}
            disabled={savingPassword || !currentPassword || !newPassword}
            className="btn btn-primary"
          >
            {savingPassword && <IconLoader2 size={16} className="animate-spin" />}
            {t('admin.changePassword')}
          </button>
        </div>
      </section>
    </div>
  )
}
