import { useState } from 'react'
import {
  IconCamera,
  IconFocusCentered,
  IconAperture,
  IconClock,
  IconSun,
} from '@tabler/icons-react'
import ThumbHash from './ThumbHash'
import { formatDate, photoAspect, originalFor, thumbnailFor } from '../lib/format'

function exifFocal(photo) {
  const value = photo?.exif?.FocalLength
  if (!value) return null
  return Number(value) % 1 === 0 ? String(Number(value)) : Number(value).toFixed(1)
}

function exifAperture(photo) {
  const value = photo?.exif?.Aperture ?? photo?.exif?.FNumber
  if (!value) return null
  return `f/${Number(value) % 1 === 0 ? Number(value) : Number(value).toFixed(1)}`
}

function exifShutter(photo) {
  const value = photo?.exif?.ExposureTime
  if (!value) return null
  const n = Number(value)
  if (n >= 1) return `${n.toFixed(1)}s`
  return `1/${Math.round(1 / n)}`
}

export default function PhotoCard({ photo, index = 0, onOpen }) {
  const [loaded, setLoaded] = useState(false)
  const aspect = photoAspect(photo)
  const camera = photo?.exif?.Model || photo?.exif?.Make
  const focal = exifFocal(photo)
  const aperture = exifAperture(photo)
  const shutter = exifShutter(photo)
  const iso = photo?.exif?.ISO
  const location = photo?.city || photo?.country || ''
  const meta = [formatDate(photo?.dateTaken, 'YYYY-MM-DD'), location].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      className="photo-card group"
      style={{ aspectRatio: String(aspect) }}
      onClick={() => onOpen?.(photo.id)}
      data-photo-id={photo.id}
      data-date={photo?.dateTaken || ''}
      data-city={photo?.city || ''}
      data-location={photo?.locationName || ''}
      aria-label={photo?.title || photo?.id}
    >
      <div className="absolute inset-0 overflow-hidden">
        {photo.thumbnailHash ? (
          <ThumbHash
            hash={photo.thumbnailHash}
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-sm"
          />
        ) : (
          <img
            src={thumbnailFor(photo)}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full scale-110 object-cover blur-sm"
            draggable={false}
          />
        )}
        <img
          src={thumbnailFor(photo)}
          alt={photo?.title || ''}
          loading={index < 12 ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={(event) => {
            if (photo.originalUrl && event.currentTarget.src !== photo.originalUrl) {
              event.currentTarget.src = originalFor(photo)
            }
          }}
          className={`photo-card__media relative transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          draggable={false}
        />
        <div className="photo-card__dim" />
      </div>

      <div className="photo-info">
        {photo?.title && <div className="photo-info-title">{photo.title}</div>}
        {photo?.description && (
          <div className="photo-info-description">{photo.description}</div>
        )}
        {meta && <div className="photo-info-meta">{meta}</div>}
        {photo?.tags?.length > 0 && (
          <div className="photo-info-tags">
            {photo.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="photo-info-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
        {(camera || aperture || shutter || iso) && (
          <div className="photo-info-exif">
            {camera && (
              <div className="photo-info-camera">
                <IconCamera size={13} />
                <span className="truncate">{camera}</span>
              </div>
            )}
            <div className="photo-info-specs">
              {focal && (
                <span className="photo-info-spec">
                  <IconFocusCentered size={12} />
                  {focal}
                </span>
              )}
              {aperture && (
                <span className="photo-info-spec">
                  <IconAperture size={12} />
                  {aperture}
                </span>
              )}
              {shutter && (
                <span className="photo-info-spec">
                  <IconClock size={12} />
                  {shutter}
                </span>
              )}
              {iso && (
                <span className="photo-info-spec">
                  <IconSun size={12} />
                  {iso}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </button>
  )
}
