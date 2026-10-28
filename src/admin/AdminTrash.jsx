import { useEffect, useState } from 'react'
import { IconRestore, IconTrashX, IconLoader2 } from '@tabler/icons-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { formatBytes, formatDateTime, thumbnailFor } from '../lib/format'

export default function AdminTrash() {
  const { push } = useToast()
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
      push('Photo restored')
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const purge = async (photo) => {
    if (!window.confirm(`Permanently delete "${photo.title || photo.id}"? This cannot be undone.`))
      return
    setBusy(photo.id)
    try {
      await api.delete(`/api/admin/photos/${photo.id}/purge`)
      push('Photo permanently deleted')
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  if (!items) return <p className="text-sm text-neutral-500">Loading…</p>

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-400">
        {items.length} item(s) in trash. Permanently deleted files cannot be recovered.
      </p>
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
                {formatBytes(photo.fileSize)} · deleted {formatDateTime(photo.deletedAt)}
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
              Restore
            </button>
            <button
              type="button"
              onClick={() => purge(photo)}
              disabled={busy === photo.id}
              className="btn btn-danger"
            >
              <IconTrashX size={15} />
              Delete forever
            </button>
          </div>
        ))}
      </div>
      {!items.length && (
        <p className="py-16 text-center text-sm text-neutral-400">Trash is empty</p>
      )}
    </div>
  )
}
