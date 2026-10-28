import { Link } from 'react-router'
import { IconArrowLeft } from '@tabler/icons-react'

export default function BackPill({ to = '/', label, className = '' }) {
  return (
    <Link
      to={to}
      className={`glass-pill fixed left-4 top-4 z-40 inline-flex h-7 items-center gap-1.5 px-2.5 text-xs font-medium text-neutral-700 transition hover:bg-white/60 dark:text-neutral-200 dark:hover:bg-neutral-800/70 ${className}`}
    >
      <IconArrowLeft size={15} />
      {label}
    </Link>
  )
}
