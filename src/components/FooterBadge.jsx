import { useSettings } from '../context/SettingsContext'

export default function FooterBadge() {
  const { getSetting } = useSettings()
  const text = getSetting('app:footerLinkText')
  const url = getSetting('app:footerLinkUrl')
  if (!text) return null
  return (
    <a
      className="masonry-page-footer"
      href={url || '#'}
      target="_blank"
      rel="noopener noreferrer"
    >
      {text}
    </a>
  )
}
