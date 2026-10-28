import { useState } from 'react'
import { Link } from 'react-router'
import {
  IconAdjustmentsHorizontal,
  IconDeviceDesktop,
  IconDotsVertical,
  IconFilter,
  IconLanguage,
  IconLogin,
  IconMapPin2,
  IconMoon,
  IconPhoto,
  IconSun,
} from '@tabler/icons-react'
import { useSettings } from '../context/SettingsContext'
import { useLocale } from '../context/LocaleContext'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/format'
import {
  DisplayMenu,
  FilterMenu,
  LanguageMenu,
  MoreMenu,
  ThemeMenu,
} from './Menus'

export default function TopBar({ photos = [], total = 0, activePhoto = null, scrolled = false }) {
  const { t } = useLocale()
  const { getSetting, loading } = useSettings()
  const { mode } = useTheme()
  const { user } = useAuth()
  const [openMenu, setOpenMenu] = useState(null)

  const title = getSetting('app:title') || (loading ? '' : 'Memora')
  const author = getSetting('app:author')
  const avatar = getSetting('app:avatarUrl') || '/brand/avatar.webp'
  const slogan = getSetting('app:slogan')
  const ThemeIcon = mode === 'dark' ? IconMoon : mode === 'light' ? IconSun : IconDeviceDesktop
  const close = () => setOpenMenu(null)

  return (
    <>
      <header className="masonry-topbar">
        <div className="masonry-topbar__inner">
          <div className="masonry-topbar__identity">
            <Link
              to={user ? '/dashboard' : '/signin'}
              className="relative block shrink-0"
              aria-label={user ? t('dashboard') : t('signIn')}
            >
              <img
                src={avatar}
                alt={t('signIn')}
                className="masonry-topbar__avatar"
                onError={(event) => {
                  event.currentTarget.src = '/brand/avatar.webp'
                }}
              />
              {user && (
                <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white shadow">
                  ★
                </span>
              )}
            </Link>
            <div className="min-w-0">
              <div className="masonry-topbar__title">{title}</div>
              <div className="masonry-topbar__subtitle">
                {t('works', { count: total })}
                {author && <span className="masonry-topbar__author"> · @{author}</span>}
              </div>
            </div>
          </div>

          <div className="masonry-topbar__status">
            {scrolled && activePhoto ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className="masonry-topbar__date">
                  {formatDate(activePhoto.dateTaken, 'MMM D, YYYY')}
                </span>
                {(activePhoto.city || activePhoto.locationName) && (
                  <span className="masonry-topbar__location">
                    {activePhoto.city || activePhoto.locationName}
                  </span>
                )}
              </div>
            ) : (
              slogan && <span className="masonry-topbar__slogan">{slogan}</span>
            )}
          </div>

          <div className="masonry-topbar__actions">
            <div className="masonry-topbar__group masonry-topbar__functional-group">
              <button
                type="button"
                className="masonry-topbar__button"
                title={t('colorTheme')}
                aria-label={t('colorTheme')}
                data-state={openMenu === 'theme' ? 'open' : undefined}
                onClick={() => setOpenMenu(openMenu === 'theme' ? null : 'theme')}
              >
                <ThemeIcon size={16} />
              </button>
              <button
                type="button"
                className="masonry-topbar__button"
                title={t('language')}
                aria-label={t('language')}
                data-state={openMenu === 'language' ? 'open' : undefined}
                onClick={() => setOpenMenu(openMenu === 'language' ? null : 'language')}
              >
                <IconLanguage size={16} />
              </button>
              <button
                type="button"
                className="masonry-topbar__button"
                title={t('displaySettings')}
                aria-label={t('displaySettings')}
                data-state={openMenu === 'display' ? 'open' : undefined}
                onClick={() => setOpenMenu(openMenu === 'display' ? null : 'display')}
              >
                <IconAdjustmentsHorizontal size={16} />
              </button>
              <button
                type="button"
                className="masonry-topbar__button"
                title={t('filterPhotos')}
                aria-label={t('filterPhotos')}
                data-state={openMenu === 'filter' ? 'open' : undefined}
                onClick={() => setOpenMenu(openMenu === 'filter' ? null : 'filter')}
              >
                <IconFilter size={16} />
              </button>
            </div>

            <div className="masonry-topbar__group masonry-topbar__compact-functions">
              <button
                type="button"
                className="masonry-topbar__button"
                title={t('moreActions')}
                aria-label={t('moreActions')}
                data-state={openMenu === 'more' ? 'open' : undefined}
                onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
              >
                <IconDotsVertical size={16} />
              </button>
            </div>

            <div className="masonry-topbar__group">
              <Link
                to="/globe"
                className="masonry-topbar__button"
                title={t('globe')}
                aria-label={t('globe')}
              >
                <IconMapPin2 size={16} />
              </Link>
              <Link
                to="/albums"
                className="masonry-topbar__button"
                title={t('albums')}
                aria-label={t('albums')}
              >
                <IconPhoto size={16} />
              </Link>
            </div>

            {!user && (
              <div className="masonry-topbar__group">
                <Link
                  to="/signin"
                  className="masonry-topbar__button"
                  title={t('signIn')}
                  aria-label={t('signIn')}
                >
                  <IconLogin size={16} />
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <ThemeMenu open={openMenu === 'theme'} onClose={close} />
      <LanguageMenu open={openMenu === 'language'} onClose={close} />
      <DisplayMenu open={openMenu === 'display'} onClose={close} />
      <FilterMenu open={openMenu === 'filter'} onClose={close} photos={photos} />
      <MoreMenu
        open={openMenu === 'more'}
        onClose={close}
        onPick={(key) => setOpenMenu(key)}
      />
    </>
  )
}
