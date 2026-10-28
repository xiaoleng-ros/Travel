import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import localizedFormat from 'dayjs/plugin/localizedFormat'

dayjs.extend(relativeTime)
dayjs.extend(localizedFormat)

export { dayjs }

export function formatDate(value, template = 'YYYY-MM-DD') {
  if (!value) return '—'
  const d = dayjs(value)
  return d.isValid() ? d.format(template) : '—'
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : '—'
}

export function fromNow(value) {
  if (!value) return ''
  const d = dayjs(value)
  return d.isValid() ? d.fromNow() : ''
}

export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!n || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatMegapixels(width, height) {
  if (!width || !height) return '—'
  return `${((width * height) / 1_000_000).toFixed(2)} MP`
}

export function formatAperture(value) {
  if (!value && value !== 0) return '—'
  return `f/${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}`
}

export function formatExposure(value) {
  if (!value && value !== 0) return '—'
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n >= 1) return `${n.toFixed(1)}s`
  return `1/${Math.round(1 / n)}`
}

export function formatFocalLength(value) {
  if (!value && value !== 0) return '—'
  return `${Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 1)}mm`
}

export function formatCoordinate(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '—'
  const format = (value, positive, negative) => {
    const dir = value >= 0 ? positive : negative
    const abs = Math.abs(value)
    const degrees = Math.floor(abs)
    const minutesFloat = (abs - degrees) * 60
    const minutes = Math.floor(minutesFloat)
    const seconds = ((minutesFloat - minutes) * 60).toFixed(2)
    return `${degrees}°${String(minutes).padStart(2, '0')}'${seconds}"${dir}`
  }
  return `${format(lat, 'N', 'S')} ${format(lng, 'E', 'W')}`
}

export function basename(storageKey) {
  if (!storageKey) return '—'
  const parts = String(storageKey).split('/')
  return parts[parts.length - 1] || storageKey
}

export function exifValue(photo, key) {
  const exif = photo?.exif || {}
  if (exif[key] !== undefined && exif[key] !== null) return exif[key]
  const aliases = {
    Aperture: ['FNumber', 'ApertureValue'],
    FocalLength35: ['FocalLengthIn35mmFormat', 'FocalLengthIn35mmFilm'],
    ISO: ['ISO', 'ISOSpeedRatings', 'ISOSpeed'],
    Lens: ['LensModel', 'Lens'],
    Model: ['Model', 'CameraModelName'],
    Make: ['Make', 'CameraMake'],
  }
  for (const alias of aliases[key] || []) {
    if (exif[alias] !== undefined && exif[alias] !== null) return exif[alias]
  }
  return undefined
}

const COLOR_SPACES = {
  1: 'sRGB',
  2: 'Adobe RGB',
  65535: 'Uncalibrated',
}

const EXPOSURE_PROGRAMS = {
  0: 'Not defined',
  1: 'Manual',
  2: 'Normal program',
  3: 'Aperture priority',
  4: 'Shutter priority',
  5: 'Creative program',
  6: 'Action program',
  7: 'Portrait mode',
  8: 'Landscape mode',
}

const METERING_MODES = {
  0: 'Unknown',
  1: 'Average',
  2: 'Center-weighted average',
  3: 'Spot',
  4: 'Multi-spot',
  5: 'Pattern',
  6: 'Partial',
  255: 'Other',
}

const FLASH = {
  0: 'No flash',
  1: 'Fired',
  5: 'Fired, return light not detected',
  7: 'Fired, return light detected',
  9: 'Fired, compulsory',
  16: 'Off, did not fire',
  24: 'Off, did not fire, return light not detected',
  25: 'Fired, auto',
  29: 'Fired, auto, return light detected',
  32: 'No flash function',
}

const SENSING = {
  1: 'Not defined',
  2: 'One-chip color area',
  3: 'Two-chip color area',
  4: 'Three-chip color area',
  5: 'Color sequential area',
  7: 'Trilinear',
  8: 'Color sequential linear',
}

export function colorSpaceLabel(value) {
  if (value === undefined) return '—'
  return COLOR_SPACES[value] || String(value)
}

export function exposureProgramLabel(value) {
  if (value === undefined) return '—'
  return EXPOSURE_PROGRAMS[value] || String(value)
}

export function meteringModeLabel(value) {
  if (value === undefined) return '—'
  return METERING_MODES[value] || String(value)
}

export function flashLabel(value) {
  if (value === undefined) return '—'
  return FLASH[value] || String(value)
}

export function sensingMethodLabel(value) {
  if (value === undefined) return '—'
  return SENSING[value] || String(value)
}

export function thumbnailFor(photo) {
  if (!photo) return ''
  return photo.thumbnailUrl || photo.originalUrl || ''
}

export function originalFor(photo) {
  if (!photo) return ''
  return photo.originalUrl || photo.thumbnailUrl || ''
}

export function photoDate(photo) {
  return photo?.dateTaken || photo?.lastModified || null
}

export function photoAspect(photo) {
  if (photo?.aspectRatio && Number.isFinite(photo.aspectRatio)) return photo.aspectRatio
  if (photo?.width && photo?.height) return photo.width / photo.height
  return 1
}

export function downloadName(photo) {
  return basename(photo?.storageKey) || `${photo?.id || 'photo'}.jpg`
}
