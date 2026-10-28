import { Link } from 'react-router'
import { useLocale } from '../context/LocaleContext'

export default function NotFoundPage() {
  const { t } = useLocale()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-display text-6xl text-neutral-900 dark:text-neutral-100">404</p>
      <h1 className="text-lg font-medium text-neutral-800 dark:text-neutral-200">
        {t('notFound.title')}
      </h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('notFound.desc')}</p>
      <Link
        to="/"
        className="mt-2 inline-flex h-9 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {t('notFound.back')}
      </Link>
    </div>
  )
}
