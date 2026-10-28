import { useEffect, useState } from 'react'
import { IconPlus, IconPencil, IconTrash, IconX, IconLoader2, IconCheck } from '@tabler/icons-react'
import { api } from '../lib/api'
import { useToast } from '../context/ToastContext'
import { thumbnailFor } from '../lib/format'

function AlbumDialog({ album, photos, onClose, onSaved }) {
  const { push } = useToast()
  const isNew = !album
  const [title, setTitle] = useState(album?.title || '')
  const [description, setDescription] = useState(album?.description || '')
  const [photoIds, setPhotoIds] = useState(new Set(album?.photoIds || []))
  const [saving, setSaving] = useState(false)

  const togglePhoto = (id) =>
    setPhotoIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = async () => {
    if (!title.trim()) return push('Title is required', 'error')
    setSaving(true)
    try {
      if (isNew) {
        const res = await api.post('/api/admin/albums', { title, description })
        if (photoIds.size) {
          await api.put(`/api/admin/albums/${res.album.id}/photos`, { photoIds: [...photoIds] })
        }
        push('Album created')
      } else {
        await api.patch(`/api/admin/albums/${album.id}`, { title, description })
        await api.put(`/api/admin/albums/${album.id}/photos`, { photoIds: [...photoIds] })
        push('Album updated')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {isNew ? 'New album' : 'Edit album'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Title</span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Description
            </span>
            <textarea
              className="field min-h-16"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Photos ({photoIds.size} selected · first selected becomes cover)
            </span>
            <div className="grid max-h-64 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-neutral-200 p-2 dark:border-neutral-700">
              {photos.map((photo) => {
                const active = photoIds.has(photo.id)
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => togglePhoto(photo.id)}
                    className={`relative aspect-square overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800 ${
                      active ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <img src={thumbnailFor(photo)} alt="" loading="lazy" className="size-full object-cover" />
                    {active && (
                      <span className="absolute right-1 top-1 rounded-full bg-blue-600 p-0.5 text-white">
                        <IconCheck size={10} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-soft">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn btn-primary justify-center"
          >
            {saving && <IconLoader2 size={16} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminAlbums() {
  const { push } = useToast()
  const [albums, setAlbums] = useState(null)
  const [photos, setPhotos] = useState([])
  const [editing, setEditing] = useState(null)

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
    if (!window.confirm(`Delete album "${album.title}"? Photos will be kept.`)) return
    try {
      await api.delete(`/api/admin/albums/${album.id}`)
      push('Album deleted')
      load()
    } catch (err) {
      push(err.message, 'error')
    }
  }

  if (!albums) return <p className="text-sm text-neutral-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEditing(null)} className="btn btn-primary">
          <IconPlus size={16} />
          New album
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
                  {album.photoIds?.length || 0} photos
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
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(album)}
                    className="btn btn-danger justify-center"
                    aria-label="Delete album"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!albums.length && <p className="py-16 text-center text-sm text-neutral-400">No albums</p>}

      {editing !== null && (
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
