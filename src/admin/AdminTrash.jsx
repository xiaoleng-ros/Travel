import { useEffect, useMemo, useState } from 'react'
import {
  IconRestore,
  IconTrashX,
  IconLoader2,
  IconSquare,
  IconSquareCheckFilled,
} from '@tabler/icons-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useLocale } from '../context/LocaleContext'
import { formatBytes, formatDateTime, thumbnailFor } from '../lib/format'

export default function AdminTrash() {
  const { push } = useToast()
  const confirm = useConfirm()
  const { t } = useLocale()
  const [items, setItems] = useState(null)
  // busy 存单张照片 id，批量操作时存 'batch'，避免和单张的禁用状态串味
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState(new Set())

  const load = () => {
    api
      .get('/api/admin/trash')
      .then((list) => {
        setItems(list)
        // 列表变了（可能被别处删掉），丢掉已经不存在的选中项
        setSelected((prev) => {
          const alive = new Set(list.map((p) => p.id))
          const next = new Set([...prev].filter((id) => alive.has(id)))
          return next.size === prev.size ? prev : next
        })
      })
      .catch((err) => push(err.message, 'error'))
  }

  useEffect(load, [])

  const allIds = useMemo(() => (items || []).map((p) => p.id), [items])
  const allSelected = allIds.length > 0 && selected.size === allIds.length
  const batchBusy = busy === 'batch'

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(allIds))

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
    const ok = await confirm({
      title: t('admin.confirmTitle'),
      message: t('admin.confirmPurge', { title: photo.title || photo.id }),
      confirmText: t('admin.deleteForever'),
      cancelText: t('admin.cancel'),
    })
    if (!ok) return
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

  const restoreSelected = async () => {
    const ids = [...selected]
    if (!ids.length) return
    setBusy('batch')
    try {
      const res = await api.post('/api/admin/photos/batch-restore', { ids })
      push(t('admin.restoredMany', { count: res?.restored?.length ?? ids.length }))
      setSelected(new Set())
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setBusy('')
    }
  }

  const purgeSelected = async () => {
    const ids = [...selected]
    if (!ids.length) return
    const ok = await confirm({
      title: t('admin.confirmTitle'),
      message: t('admin.confirmPurgeMany', { count: ids.length }),
      confirmText: t('admin.deleteForever'),
      cancelText: t('admin.cancel'),
    })
    if (!ok) return
    setBusy('batch')
    try {
      const res = await api.post('/api/admin/photos/batch-purge', { ids })
      push(t('admin.purgedMany', { count: res?.purged?.length ?? ids.length }))
      if (res?.failed?.length) {
        push(t('admin.purgePartial', { count: res.purged.length, failed: res.failed.length }), 'info')
      }
      setSelected(new Set())
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
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-neutral-400">{t('admin.trashCount', { count: items.length })}</p>
        {items.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={batchBusy}
              className="btn btn-soft"
            >
              {allSelected ? <IconSquareCheckFilled size={15} /> : <IconSquare size={15} />}
              {t('admin.selectAll')}
            </button>
            {selected.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={restoreSelected}
                  disabled={batchBusy}
                  className="btn btn-soft"
                >
                  {batchBusy ? (
                    <IconLoader2 size={15} className="animate-spin" />
                  ) : (
                    <IconRestore size={15} />
                  )}
                  {t('admin.restoreMany', { count: selected.size })}
                </button>
                <button
                  type="button"
                  onClick={purgeSelected}
                  disabled={batchBusy}
                  className="btn btn-danger"
                >
                  <IconTrashX size={15} />
                  {t('admin.purgeMany', { count: selected.size })}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {items.map((photo) => {
          const checked = selected.has(photo.id)
          const rowBusy = busy === photo.id
          return (
            <div
              key={photo.id}
              className={`card flex items-center gap-3 p-3 transition-colors ${
                checked ? 'ring-1 ring-blue-500/60' : ''
              }`}
            >
              <label className="flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelect(photo.id)}
                  disabled={batchBusy}
                  aria-label={t('admin.selectPhoto', { title: photo.title || photo.id })}
                  className="size-4 accent-blue-600"
                />
              </label>
              <img
                src={thumbnailFor(photo)}
                alt=""
                className="size-14 shrink-0 rounded-lg object-cover"
                loading="lazy"
                onClick={() => toggleSelect(photo.id)}
              />
              <div
                className="min-w-0 flex-1 cursor-pointer select-none"
                onClick={() => toggleSelect(photo.id)}
              >
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
                disabled={rowBusy || batchBusy}
                className="btn btn-soft"
              >
                {rowBusy ? (
                  <IconLoader2 size={15} className="animate-spin" />
                ) : (
                  <IconRestore size={15} />
                )}
                {t('admin.restore')}
              </button>
              <button
                type="button"
                onClick={() => purge(photo)}
                disabled={rowBusy || batchBusy}
                className="btn btn-danger"
              >
                <IconTrashX size={15} />
                {t('admin.deleteForever')}
              </button>
            </div>
          )
        })}
      </div>
      {!items.length && (
        <p className="py-16 text-center text-sm text-neutral-400">{t('admin.trashEmpty')}</p>
      )}
    </div>
  )
}
