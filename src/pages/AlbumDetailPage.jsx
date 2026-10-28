import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { IconClock } from '@tabler/icons-react'
import BackPill from '../components/BackPill'
import PhotoWall from '../components/PhotoWall'
import PhotoViewer from '../components/PhotoViewer'
import { useGalleryData } from '../context/GalleryDataContext'
import { useLocale } from '../context/LocaleContext'
import { fromNow, thumbnailFor } from '../lib/format'

export default function AlbumDetailPage() {
  const { albumId } = useParams()
  const { photos, albums, loading } = useGalleryData()
  const { t } = useLocale()
  const [activePhoto, setActivePhoto] = useState(null)

  const album = albums.find((item) => String(item.id) === String(albumId))
  const albumPhotos = useMemo(() => {
    if (!album) return []
    const idSet = new Set(album.photoIds || [])
    return photos.filter(
      (photo) => idSet.has(photo.id) || (photo.albumIds || []).map(String).includes(String(albumId)),
    )
  }, [album, photos, albumId])

  const cover = albumPhotos[0] || null

  return (
    <div className="relative min-h-screen">
      <BackPill to="/albums" label={t('album.back')} />

      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pb-6 pt-16">
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          {cover && (
            <img
              src={thumbnailFor(cover)}
              alt=""
              className="size-9 rounded-lg object-cover ring-1 ring-black/5 dark:ring-white/10"
            />
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {album?.title || (loading ? '…' : '—')}
        </h1>
        {album?.description && (
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
            {album.description}
          </p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <IconClock size={13} />
          <span>{t('album.photos', { count: albumPhotos.length })}</span>
          {album?.createdAt && <span>· {fromNow(album.createdAt)}</span>}
        </div>
      </header>

      <div className="px-1 pb-16">
        {loading ? (
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-500">
            {t('loading')}
          </div>
        ) : albumPhotos.length === 0 ? (
          <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-500">
            {t('noPhotos')}
          </div>
        ) : (
          <PhotoWall photos={albumPhotos} onOpen={setActivePhoto} />
        )}
      </div>

      {activePhoto && (
        <PhotoViewer
          photoId={activePhoto.id}
          photos={albumPhotos}
          albums={albums}
          onClose={() => setActivePhoto(null)}
        />
      )}
    </div>
  )
}
