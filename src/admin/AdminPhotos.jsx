import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconCloudUpload,
  IconPencil,
  IconTrash,
  IconEyeOff,
  IconSearch,
  IconX,
  IconStarFilled,
  IconStar,
  IconLoader2,
} from '@tabler/icons-react'
import { api, uploadPhotos } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { useLocale } from '../context/LocaleContext'
import { formatBytes, formatDateTime, thumbnailFor } from '../lib/format'

function EditDialog({ photo, albums, onClose, onSaved }) {
  const { push } = useToast()
  const { t } = useLocale()
  const [title, setTitle] = useState(photo.title || '')
  const [description, setDescription] = useState(photo.description || '')
  const [tags, setTags] = useState((photo.tags || []).join(', '))
  const [rating, setRating] = useState(Number(photo.rating || 0))
  const [city, setCity] = useState(photo.city || '')
  const [country, setCountry] = useState(photo.country || '')
  const [hidden, setHidden] = useState(Boolean(photo.hidden))
  const [albumIds, setAlbumIds] = useState((photo.albumIds || []).map(Number))
  const [saving, setSaving] = useState(false)

  const toggleAlbum = (id) =>
    setAlbumIds((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const save = async () => {
    setSaving(true)
    try {
      await api.patch(`/api/admin/photos/${photo.id}`, {
        title,
        description,
        tags: tags
          .split(/[,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        rating,
        city,
        country,
        hidden,
        albumIds,
      })
      push(t('admin.photoUpdated'))
      onSaved()
      onClose()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!window.confirm(t('admin.confirmMoveOne', { title: photo.title || photo.id }))) return
    try {
      await api.delete(`/api/admin/photos/${photo.id}`)
      push(t('admin.movedToTrash'))
      onSaved()
      onClose()
    } catch (err) {
      push(err.message, 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('admin.editPhoto')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="mb-4 flex gap-4">
          <img
            src={thumbnailFor(photo)}
            alt=""
            className="h-28 w-28 shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 text-xs text-neutral-500 dark:text-neutral-400">
            <p className="mb-1 truncate font-medium text-neutral-700 dark:text-neutral-200">
              {photo.id}
            </p>
            <p>
              {photo.width} × {photo.height}
            </p>
            <p>{formatBytes(photo.fileSize)}</p>
            <p>{formatDateTime(photo.dateTaken)}</p>
          </div>
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
              className="field min-h-20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.tagsField')}
            </span>
            <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.rating')}
            </span>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(rating === value ? 0 : value)}
                className={value <= rating ? 'text-amber-400' : 'text-neutral-300 dark:text-neutral-600'}
              >
                {value <= rating ? <IconStarFilled size={18} /> : <IconStar size={18} />}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                {t('admin.city')}
              </span>
              <input className="field" value={city} onChange={(e) => setCity(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                {t('admin.country')}
              </span>
              <input className="field" value={country} onChange={(e) => setCountry(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {t('admin.albums')}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {albums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  onClick={() => toggleAlbum(album.id)}
                  className="chip"
                  data-active={albumIds.includes(album.id) || undefined}
                >
                  {album.title}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              className="size-4 accent-neutral-800"
            />
            <span className="flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
              <IconEyeOff size={14} />
              {t('admin.hiddenFromGallery')}
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn btn-primary flex-1 justify-center"
          >
            {saving && <IconLoader2 size={16} className="animate-spin" />}
            {t('admin.save')}
          </button>
          <button
            type="button"
            onClick={remove}
            className="btn btn-danger justify-center"
            aria-label={t('admin.delete')}
          >
            <IconTrash size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPhotos() {
  const { push } = useToast()
  const { t } = useLocale()
  const [photos, setPhotos] = useState(null)
  const [albums, setAlbums] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [editing, setEditing] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef(null)

  const load = () => {
    Promise.all([api.get('/api/photos'), api.get('/api/admin/albums')])
      .then(([photoList, albumList]) => {
        setPhotos(photoList)
        setAlbums(albumList)
      })
      .catch((err) => push(err.message, 'error'))
  }

  useEffect(load, [])

  const filtered = useMemo(() => {
    if (!photos) return []
    const keyword = search.trim().toLowerCase()
    if (!keyword) return photos
    return photos.filter(
      (p) =>
        (p.title || '').toLowerCase().includes(keyword) ||
        (p.id || '').toLowerCase().includes(keyword) ||
        (p.tags || []).some((tag) => tag.toLowerCase().includes(keyword)),
    )
  }, [photos, search])

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setUploading(true)
    setProgress(0)
    try {
      await uploadPhotos(files, { onProgress: setProgress })
      push(t('admin.uploadedCount', { count: files.length }))
      load()
    } catch (err) {
      push(err.message, 'error')
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const batchDelete = async () => {
    if (!selected.size) return
    if (!window.confirm(t('admin.confirmMoveMany', { count: selected.size }))) return
    try {
      await api.post('/api/admin/photos/batch-delete', { ids: [...selected] })
      push(t('admin.movedMany', { count: selected.size }))
      setSelected(new Set())
      load()
    } catch (err) {
      push(err.message, 'error')
    }
  }

  if (!photos) return <p className="text-sm text-neutral-500">{t('admin.loading')}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <IconSearch
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            className="field w-56 pl-8"
            placeholder={t('admin.searchPhotos')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-neutral-400">
          {t('album.photos', { count: filtered.length })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <button type="button" onClick={batchDelete} className="btn btn-danger">
              <IconTrash size={15} />
              {t('admin.delete')} ({selected.size})
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn btn-primary"
          >
            {uploading ? (
              <IconLoader2 size={16} className="animate-spin" />
            ) : (
              <IconCloudUpload size={16} />
            )}
            {uploading
              ? t('admin.uploadingProgress', { percent: progress })
              : t('admin.upload')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleUpload}
          />
        </div>
      </div>

      {uploading && (
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-neutral-800 transition-all dark:bg-white"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {filtered.map((photo) => (
          <div
            key={photo.id}
            className={`group relative aspect-square overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800 ${
              selected.has(photo.id) ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <img
              src={thumbnailFor(photo)}
              alt=""
              loading="lazy"
              className="size-full cursor-pointer object-cover transition group-hover:scale-105"
              onClick={() => setEditing(photo)}
            />
            <label className="absolute left-1.5 top-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(photo.id)}
                onChange={() => toggleSelect(photo.id)}
                className="size-4 accent-blue-600"
              />
            </label>
            {photo.hidden && (
              <span className="absolute right-1.5 top-1.5 rounded bg-black/60 p-1 text-white">
                <IconEyeOff size={12} />
              </span>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 opacity-0 transition group-hover:opacity-100">
              <span className="truncate text-[11px] text-white">{photo.title || photo.id}</span>
              <button
                type="button"
                className="pointer-events-auto text-white"
                onClick={() => setEditing(photo)}
              >
                <IconPencil size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {!filtered.length && (
        <p className="py-16 text-center text-sm text-neutral-400">{t('admin.noPhotos')}</p>
      )}

      {editing && (
        <EditDialog
          photo={photos.find((p) => p.id === editing.id) || editing}
          albums={albums}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
