import { useMemo } from 'react'
import { thumbHashToDataURL } from 'thumbhash'

function hexToBytes(hex) {
  if (!hex || typeof hex !== 'string' || hex.length % 2 !== 0) return null
  try {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return bytes
  } catch {
    return null
  }
}

export default function ThumbHash({ hash, className = '' }) {
  const src = useMemo(() => {
    if (!hash) return null
    try {
      const bytes = typeof hash === 'string' ? hexToBytes(hash) : new Uint8Array(hash)
      if (!bytes) return null
      return thumbHashToDataURL(bytes)
    } catch {
      return null
    }
  }, [hash])

  if (!src) return null
  return <img src={src} alt="" aria-hidden="true" className={className} draggable={false} />
}
