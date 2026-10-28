import { useEffect, useRef, useState } from 'react'
import {
  IconAdjustmentsHorizontal,
  IconBuildingSkyscraper,
  IconCamera,
  IconDeviceDesktop,
  IconDice3,
  IconFilter,
  IconFocusCentered,
  IconLanguage,
  IconMoon,
  IconSearch,
  IconStar,
  IconSun,
  IconTag,
  IconCheck,
} from '@tabler/icons-react'
import { useLocale } from '../context/LocaleContext'
import { useTheme } from '../context/ThemeContext'
import { useGallery } from '../context/GalleryContext'
import { localeOptions } from '../lib/i18n'

export function Dropdown({ open, onClose, className = '', children, width }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose?.()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      ref={ref}
      className={`glass-menu fixed right-3 top-[3.1rem] z-50 max-h-[75vh] overflow-auto p-2 ${className}`}
      style={{ width }}
    >
      {children}
    </div>
  )
}

export function ThemeMenu({ open, onClose }) {
  const { t } = useLocale()
  const { mode, setMode } = useTheme()
  const options = [
    { value: 'light', label: t('theme.light'), icon: IconSun },
    { value: 'dark', label: t('theme.dark'), icon: IconMoon },
    { value: 'system', label: t('theme.system'), icon: IconDeviceDesktop },
  ]
  return (
    <Dropdown open={open} onClose={onClose} width={160}>
      <div className="px-2 pb-1.5 pt-0.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
        {t('colorTheme')}
      </div>
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className="menu-item"
          data-active={mode === value}
          onClick={() => {
            setMode(value)
            onClose()
          }}
        >
          <Icon size={15} />
          <span className="flex-1">{label}</span>
          {mode === value && <IconCheck size={14} />}
        </button>
      ))}
    </Dropdown>
  )
}

export function LanguageMenu({ open, onClose }) {
  const { t, locale, setLocale } = useLocale()
  return (
    <Dropdown open={open} onClose={onClose} width={176}>
      <div className="px-2 pb-1.5 pt-0.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
        {t('language')}
      </div>
      {localeOptions.map((option) => (
        <button
          key={option.code}
          type="button"
          className="menu-item"
          data-active={locale === option.code}
          onClick={() => {
            setLocale(option.code)
            onClose()
          }}
        >
          <span className="flex-1">{option.label}</span>
          {locale === option.code && <IconCheck size={14} />}
        </button>
      ))}
    </Dropdown>
  )
}

const SORT_KEYS = ['dateDesc', 'dateAsc', 'sizeAsc', 'sizeDesc', 'titleAsc', 'titleDesc']

export function DisplayMenu({ open, onClose }) {
  const { t } = useLocale()
  const { sort, setSort } = useGallery()
  return (
    <Dropdown open={open} onClose={onClose} width={258}>
      <div className="px-2 pb-2 pt-0.5 text-sm font-bold text-neutral-800 dark:text-neutral-100">
        {t('displaySettings')}
      </div>
      <div className="section-label px-2 pb-1">{t('sort')}</div>
      {SORT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className="menu-item"
          data-active={sort === key}
          onClick={() => {
            setSort(key)
            onClose()
          }}
        >
          <span className="flex-1">{t(`sort.${key}`)}</span>
          {sort === key && <IconCheck size={14} />}
        </button>
      ))}
    </Dropdown>
  )
}

const FILTER_TABS = [
  { key: 'tags', label: 'tags', icon: IconTag },
  { key: 'cameras', label: 'cameras', icon: IconCamera },
  { key: 'lenses', label: 'lenses', icon: IconFocusCentered },
  { key: 'cities', label: 'cities', icon: IconBuildingSkyscraper },
  { key: 'ratings', label: 'ratings', icon: IconStar },
]

export function FilterMenu({ open, onClose, photos = [] }) {
  const { t } = useLocale()
  const { filters, toggleFilter, clearFilters, search, setSearch, hasActiveFilters } = useGallery()
  const [tab, setTab] = useState('tags')

  const values = {
    tags: [...new Set(photos.flatMap((photo) => photo.tags || []))].sort((a, b) =>
      String(a).localeCompare(String(b), 'zh-Hans-CN'),
    ),
    cameras: [...new Set(photos.map((photo) => photo.exif?.Model || photo.exif?.Make).filter(Boolean))],
    lenses: [...new Set(photos.map((photo) => photo.exif?.LensModel || photo.exif?.Lens).filter(Boolean))],
    cities: [...new Set(photos.map((photo) => photo.city).filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), 'zh-Hans-CN'),
    ),
    ratings: [3, 4, 5],
  }

  const chips = values[tab] || []
  const selected = filters[tab] || []

  const randomize = () => {
    const pool = chips
    if (!pool.length) return
    const value = pool[Math.floor(Math.random() * pool.length)]
    toggleFilter(tab, value)
  }

  return (
    <Dropdown open={open} onClose={onClose} width="min(92vw, 586px)">
      <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
        <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
          {t('filterPhotos')}
        </span>
        <div className="flex items-center gap-1">
          {hasActiveFilters && (
            <button
              type="button"
              className="rounded-md px-1.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-500/10 dark:text-blue-300"
              onClick={clearFilters}
            >
              {t('clearFilters')}
            </button>
          )}
          <button type="button" className="menu-item !w-7 !p-0" onClick={randomize} title={t('random')}>
            <IconDice3 size={16} />
          </button>
          <div className="flex h-7 items-center gap-1 rounded-md bg-black/5 px-2 dark:bg-white/10">
            <IconSearch size={14} className="text-neutral-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search')}
              className="w-28 bg-transparent text-xs outline-none placeholder:text-neutral-400"
            />
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5">
        {FILTER_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
              tab === key
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            <Icon size={13} />
            {t(label)}
          </button>
        ))}
      </div>

      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-auto px-1 pb-1">
        {chips.length === 0 && (
          <span className="px-1 py-2 text-xs text-neutral-400">—</span>
        )}
        {chips.map((value) => (
          <button
            key={`${tab}-${value}`}
            type="button"
            className="chip"
            data-active={selected.includes(value)}
            onClick={() => toggleFilter(tab, value)}
          >
            {tab === 'ratings' ? (
              <>
                {Array.from({ length: Number(value) }).map((_, index) => (
                  <IconStar key={index} size={11} fill="currentColor" />
                ))}
              </>
            ) : (
              value
            )}
          </button>
        ))}
      </div>
    </Dropdown>
  )
}

export function MoreMenu({ open, onClose, onPick }) {
  const { t } = useLocale()
  const items = [
    ['theme', 'colorTheme', IconDeviceDesktop],
    ['language', 'language', IconLanguage],
    ['display', 'displaySettings', IconAdjustmentsHorizontal],
    ['filter', 'filterPhotos', IconFilter],
  ]
  return (
    <Dropdown open={open} onClose={onClose} width={160}>
      {items.map(([key, label, Icon]) => (
        <button key={key} type="button" className="menu-item" onClick={() => onPick(key)}>
          <Icon size={15} />
          {t(label)}
        </button>
      ))}
    </Dropdown>
  )
}


