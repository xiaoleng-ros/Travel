import { Link } from 'react-router'
import { IconClock } from '@tabler/icons-react'
import BackPill from '../components/BackPill'
import { useGalleryData } from '../context/GalleryDataContext'
import { useLocale } from '../context/LocaleContext'
import { fromNow, thumbnailFor } from '../lib/format'

function sampleColumns(photos, count = 3) {
  const columns = Array.from({ length: count }, () => [])
  if (!photos.length) return columns
  photos.forEach((photo, index) => {
    columns[index % count].push(photo)
  })
  return columns.map((column) => {
    const result = []
    for (let i = 0; i < 10; i += 1) {
      result.push(column[i % column.length])
    }
    return result
  })
}

function AlbumCard({ album, photos }) {
  const albumPhotos = (album.photoIds || [])
    .map((id) => photos.find((photo) => photo.id === id))
    .filter(Boolean)
  const cover = albumPhotos.find((photo) => photo.id === album.coverPhotoId) || albumPhotos[0]
  if (!cover) return null
  const stack = [albumPhotos[1] || cover, albumPhotos[2] || cover, cover]
  return (
    <Link to={`/albums/${album.id}`} className="group block">
      <div className="relative mb-3 h-48">
        {stack.map((photo, index) => {
          const isFront = index === stack.length - 1
          const rotations = ['rotate-[5deg]', '-rotate-[4deg]', 'rotate-0']
          return (
            <div
              key={`${photo.id}-${index}`}
              className={`absolute inset-0 overflow-hidden rounded-xl bg-black/10 shadow-lg transition-transform duration-500 ${
                rotations[index] || ''
              } ${isFront ? 'z-[3]' : index === 1 ? 'z-[2] opacity-[0.88]' : 'z-[1] opacity-[0.76]'}`}
            >
              <img
                src={thumbnailFor(photo)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                draggable={false}
              />
              <div className="absolute inset-0 bg-black/10" />
            </div>
          )
        })}
      </div>
      <div className="px-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            {album.title}
          </h2>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
            <IconClock size={15} />
            {fromNow(album.createdAt)}
          </span>
        </div>
        {album.description && (
          <p className="mt-1 line-clamp-2-custom text-sm text-neutral-500 dark:text-neutral-400">
            {album.description}
          </p>
        )}
      </div>
    </Link>
  )
}

export default function AlbumsPage() {
  const { albums, photos, loading } = useGalleryData()
  const { t } = useLocale()
  const columns = sampleColumns(photos, 3)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white dark:bg-neutral-950">
      <BackPill to="/" label={t('backHome')} />

      <div className="pointer-events-none relative h-[30vh] w-full overflow-hidden">
        <div className="absolute inset-0 flex">
          {columns.map((column, index) => (
            <div key={index} className="relative h-full w-1/3 overflow-hidden">
              <div
                className={`flex flex-col ${
                  index === 1 ? 'album-waterfall-up' : 'album-waterfall-down'
                }`}
              >
                {[...column, ...column].map((photo, photoIndex) => (
                  <div key={`${photo.id}-${photoIndex}`} className="aspect-[3/4] w-full shrink-0">
                    <img
                      src={thumbnailFor(photo)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="absolute -inset-1 bg-gradient-to-b from-neutral-100/80 to-white dark:from-neutral-900/80 dark:to-neutral-950" />
      </div>

      <div className="relative z-10 -mt-10 pb-24">
        <h1 className="bg-gradient-to-br from-neutral-800 to-neutral-400 bg-clip-text py-4 text-center text-6xl font-black tracking-tight text-transparent drop-shadow-2xl dark:from-neutral-100 dark:to-neutral-500 sm:text-7xl">
          {t('albums.title')}
        </h1>

        <div className="container mx-auto px-10 sm:px-6">
          {loading ? (
            <div className="grid grid-cols-1 gap-x-6 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <div key={index} className="animate-pulse">
                  <div className="mb-3 h-48 rounded-xl bg-neutral-100 dark:bg-neutral-900" />
                  <div className="h-4 w-1/2 rounded bg-neutral-100 dark:bg-neutral-900" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
              {albums.map((album) => (
                <AlbumCard key={album.id} album={album} photos={photos} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
