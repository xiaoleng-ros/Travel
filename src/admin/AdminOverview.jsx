import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { IconPhoto, IconFolders, IconDatabase, IconTag } from '@tabler/icons-react'
import { api } from '../lib/api'
import { formatBytes, formatDate, thumbnailFor } from '../lib/format'
import { useLocale } from '../context/LocaleContext'

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className="flex size-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
        <p className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
        {sub && <p className="text-[11px] text-neutral-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function AdminOverview() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const { t } = useLocale()

  useEffect(() => {
    api
      .get('/api/admin/stats')
      .then(setStats)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="text-sm text-red-500">{error}</p>
  if (!stats) return <p className="text-sm text-neutral-500">{t('admin.loading')}</p>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={IconPhoto}
          label={t('admin.photos')}
          value={stats.photos}
          sub={t('admin.hidden', { count: stats.hidden || 0 })}
        />
        <StatCard
          icon={IconFolders}
          label={t('admin.albums')}
          value={stats.albumSummary?.length ?? 0}
        />
        <StatCard
          icon={IconDatabase}
          label={t('admin.storage')}
          value={formatBytes(stats.storageBytes)}
        />
        <StatCard icon={IconTag} label={t('tags')} value={stats.tags?.length ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card p-4 xl:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('admin.recentPhotos')}
          </h2>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
            {stats.recentPhotos?.map((photo) => (
              <Link
                key={photo.id}
                to="/dashboard/photos"
                className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800"
              >
                <img
                  src={thumbnailFor(photo)}
                  alt={photo.title || ''}
                  loading="lazy"
                  className="size-full object-cover transition group-hover:scale-105"
                />
              </Link>
            ))}
            {!stats.recentPhotos?.length && (
              <p className="col-span-4 text-sm text-neutral-400">{t('noPhotos')}</p>
            )}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('admin.albums')}
          </h2>
          <ul className="space-y-2">
            {stats.albumSummary?.map((album) => {
              const cover = stats.recentPhotos?.find((p) => p.id === album.coverPhotoId)
              return (
                <li key={album.id} className="flex items-center gap-3">
                  <span className="size-9 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                    {cover && (
                      <img src={thumbnailFor(cover)} alt="" className="size-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-neutral-700 dark:text-neutral-200">
                    {album.title}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {t('album.photos', { count: album.count })}
                  </span>
                </li>
              )
            })}
            {!stats.albumSummary?.length && (
              <li className="text-sm text-neutral-400">{t('admin.noAlbumsYet')}</li>
            )}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('admin.popularTags')}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {stats.recentTags?.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {tag}
              </span>
            ))}
            {!stats.recentTags?.length && (
              <p className="text-sm text-neutral-400">{t('admin.noTags')}</p>
            )}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t('cameras')}
          </h2>
          <ul className="space-y-1.5">
            {stats.cameras?.slice(0, 8).map((camera) => (
              <li
                key={camera}
                className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200"
              >
                {camera}
              </li>
            ))}
            {!stats.cameras?.length && (
              <li className="text-sm text-neutral-400">{t('admin.unknown')}</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  )
}
