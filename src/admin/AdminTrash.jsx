import { useEffect, useState } from 'react'
import { IconRestore, IconTrashX, IconLoader2 } from '@tabler/icons-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useLocale } from '../context/LocaleContext'
import { formatBytes, formatDateTime, thumbnailFor } from '../lib/format'

export default function AdminTrash() {
  const { push } = useToast()
  const { t } = useLocale()
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState('')

  const load = () => {
    api
      .get('/api/admin/trash')
      .then(setItems)
      .catch((err) => push(err.message, 'error'))
  }

  useEffect(load, [])

  const restore = async (photo) => {
    setBusy(photo.id)
    try {
      await api.post(`/api/admin/photos/${photo.id}/restore`)
      push(t('admin.photoRestored'))
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const purge = async (photo) => {
    if (!window.confirm(t('admin.confirmPurge', { title: photo.title || photo.id }))) return
    setBusy(photo.id)
    try {
      await api.delete(`/api/admin/photos/${photo.id}/purge`)
      push(t('admin.photoPurged'))
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  if (!items) return <p className="text-sm text-neutral-500">{t('admin.loading')}</p>

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-400">{t('admin.trashCount', { count: items.length })}</p>
      <div className="space-y-2">
        {items.map((photo) => (
          <div
            key={photo.id}
            className="card flex items-center gap-3 p-3"
          >
            <img
              src={thumbnailFor(photo)}
              alt=""
              className="size-14 rounded-lg object-cover"
              loading="lazy"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                {photo.title || photo.id}
              </p>
              <p className="text-xs text-neutral-400">
                {formatBytes(photo.fileSize)} ·{' '}
                {t('admin.deletedAt', { time: formatDateTime(photo.deletedAt) })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => restore(photo)}
              disabled={busy === photo.id}
              className="btn btn-soft"
            >
              {busy === photo.id ? (
                <IconLoader2 size={15} className="animate-spin" />
              ) : (
                <IconRestore size={15} />
              )}
              {t('admin.restore')}
            </button>
            <button
              type="button"
              onClick={() => purge(photo)}
              disabled={busy === photo.id}
              className="btn btn-danger"
            >
              <IconTrashX size={15} />
              {t('admin.deleteForever')}
            </button>
          </div>
        ))}
      </div>
      {!items.length && (
        <p className="py-16 text-center text-sm text-neutral-400">{t('admin.trashEmpty')}</p>
      )}
    </div>
  )
}
