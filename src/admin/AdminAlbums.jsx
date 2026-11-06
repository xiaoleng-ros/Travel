import { useEffect, useState } from 'react'
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconX,
  IconLoader2,
  IconStarFilled,
} from '@tabler/icons-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useConfirm } from '../context/ConfirmContext'
import { useLocale } from '../context/LocaleContext'
import { thumbnailFor } from '../lib/format'

function AlbumDialog({ album, photos, onClose, onSaved }) {
  const { push } = useToast()
  const { t } = useLocale()
  const isNew = !album
  const [title, setTitle] = useState(album?.title || '')
  const [description, setDescription] = useState(album?.description || '')
  const [photoIds, setPhotoIds] = useState(new Set(album?.photoIds || []))
  const [coverId, setCoverId] = useState(album?.coverPhotoId || null)
  const [saving, setSaving] = useState(false)

  // 注意：不要在一个 setState 的 updater 里调用另一个 setState —— React 会把这种
  // 嵌套更新丢掉，封面就永远设不上。这里在 updater 外面算好再分别提交。
  const togglePhoto = (id) => {
    const next = new Set(photoIds)
    if (next.has(id)) {
      next.delete(id)
      if (coverId === id) setCoverId(null)
    } else {
      next.add(id)
      // 第一张选中的照片默认当封面
      if (!coverId) setCoverId(id)
    }
    setPhotoIds(next)
  }

  const coverPhoto = photos.find((photo) => photo.id === coverId)

  const save = async () => {
    if (!title.trim()) return push(t('admin.titleRequired'), 'error')
    setSaving(true)
    try {
      const payload = { photoIds: [...photoIds], coverPhotoId: coverId }
      if (isNew) {
        const res = await api.post('/api/admin/albums', { title, description })
        if (photoIds.size) {
          await api.put(`/api/admin/albums/${res.album.id}/photos`, payload)
        }
        push(t('admin.albumCreated'))
      } else {
        await api.patch(`/api/admin/albums/${album.id}`, { title, description })
        await api.put(`/api/admin/albums/${album.id}/photos`, payload)
        push(t('admin.albumUpdated'))
      }
      onSaved()
      onClose()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {isNew ? t('admin.newAlbum') : t('admin.editAlbum')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('admin.cancel')}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.title')}
            </span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.description')}
            </span>
            <textarea
              className="field min-h-16"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                {t('admin.photosSelected', { count: photoIds.size })}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                {t('admin.coverPhoto')}
                {coverPhoto ? (
                  <img
                    src={thumbnailFor(coverPhoto)}
                    alt=""
                    className="size-6 rounded object-cover ring-1 ring-neutral-200 dark:ring-neutral-700"
                  />
                ) : (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">—</span>
                )}
              </span>
            </div>
            <div className="grid max-h-64 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
              {photos.map((photo) => {
                const active = photoIds.has(photo.id)
                const isCover = coverId === photo.id
                return (
                  <div
                    key={photo.id}
                    className={`relative aspect-square overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800 ${
                      isCover ? 'ring-2 ring-amber-400' : active ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => togglePhoto(photo.id)}
                      className="size-full"
                      aria-pressed={active}
                      aria-label={photo.title || photo.id}
                    >
                      <img
                        src={thumbnailFor(photo)}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </button>
                    {active && (
                      <button
                        type="button"
                        onClick={() => setCoverId(photo.id)}
                        title={t('admin.coverPhoto')}
                        aria-label={t('admin.coverPhoto')}
                        className={`absolute right-0.5 top-0.5 rounded-full p-0.5 transition-colors ${
                          isCover
                            ? 'bg-amber-400 text-amber-950'
                            : 'bg-black/50 text-white hover:bg-black/70'
                        }`}
                      >
                        <IconStarFilled size={10} />
                      </button>
                    )}
                    {isCover && (
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-amber-400/90 py-0.5 text-center text-[9px] font-medium text-amber-950">
                        {t('admin.coverPhoto')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] leading-4 text-neutral-400 dark:text-neutral-500">
                {t('admin.coverPhotoHint')}
              </span>
              {coverId && (
                <button
                  type="button"
                  onClick={() => setCoverId(null)}
                  className="shrink-0 text-[11px] text-neutral-400 underline-offset-2 hover:underline dark:text-neutral-500"
                >
                  {t('admin.cancel')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-soft">
            {t('admin.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn btn-primary justify-center"
          >
            {saving && <IconLoader2 size={16} className="animate-spin" />}
            {t('admin.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminAlbums() {
  const { push } = useToast()
  const confirm = useConfirm()
  const { t } = useLocale()
  const [albums, setAlbums] = useState(null)
  const [photos, setPhotos] = useState([])
  // undefined = 关闭，null = 新建，album 对象 = 编辑
  const [editing, setEditing] = useState(undefined)

  const load = () => {
    Promise.all([api.get('/api/admin/albums'), api.get('/api/photos')])
      .then(([albumList, photoList]) => {
        setAlbums(albumList)
        setPhotos(photoList)
      })
      .catch((err) => push(err.message, 'error'))
  }

  useEffect(load, [])

  const remove = async (album) => {
    const ok = await confirm({
      title: t('admin.confirmTitle'),
      message: t('admin.confirmDeleteAlbum', { title: album.title }),
      confirmText: t('admin.deleteAlbum'),
      cancelText: t('admin.cancel'),
    })
    if (!ok) return
    try {
      await api.delete(`/api/admin/albums/${album.id}`)
      push(t('admin.albumDeleted'))
      load()
    } catch (err) {
      push(err.message, 'error')
    }
  }

  if (!albums) return <p className="text-sm text-neutral-500">{t('admin.loading')}</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing(null)} className="btn btn-primary">
          <IconPlus size={16} />
          {t('admin.newAlbum')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {albums.map((album) => {
          const coverPhoto = photos.find((p) => p.id === album.coverPhotoId || (p.albumIds || []).includes(album.id))
          return (
            <div key={album.id} className="card overflow-hidden p-0">
              <div className="relative h-40 bg-neutral-100 dark:bg-neutral-800">
                {coverPhoto && (
                  <img
                    src={thumbnailFor(coverPhoto)}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                )}
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                  {t('album.photos', { count: album.photoIds?.length || 0 })}
                </span>
              </div>
              <div className="p-4">
                <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {album.title}
                </h3>
                <p className="mt-1 line-clamp-2 min-h-8 text-xs text-neutral-500 dark:text-neutral-400">
                  {album.description || '—'}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(album)}
                    className="btn btn-soft flex-1 justify-center"
                  >
                    <IconPencil size={15} />
                    {t('admin.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(album)}
                    className="btn btn-danger justify-center"
                    aria-label={t('admin.deleteAlbum')}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!albums.length && (
        <p className="py-16 text-center text-sm text-neutral-400">{t('admin.noAlbums')}</p>
      )}

      {editing !== undefined && (
        <AlbumDialog
          album={editing}
          photos={photos}
          onClose={() => setEditing(undefined)}
          onSaved={load}
        />
      )}
    </div>
  )
}
