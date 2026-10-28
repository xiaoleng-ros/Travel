import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

function styleFor(dark) {
  return {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          dark
            ? 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
            : 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
  }
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export default function MiniMap({ latitude, longitude, dark = false, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || typeof latitude !== 'number' || typeof longitude !== 'number') return
    if (!webglAvailable()) return
    let map
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: styleFor(dark),
        center: [longitude, latitude],
        zoom: 12,
        attributionControl: false,
        interactive: true,
      })
    } catch (error) {
      console.warn('[minimap] WebGL unavailable:', error?.message)
      return
    }
    map.scrollZoom.disable()
    map.dragPan.enable()
    map.on('error', () => {})

    const marker = document.createElement('div')
    marker.className = 'relative flex h-5 w-5 items-center justify-center'
    marker.innerHTML = `
      <span style="position:absolute;inset:0;border-radius:9999px;background:rgba(236,72,153,.35);animation:ping 1.6s cubic-bezier(0,0,.2,1) infinite"></span>
      <span style="position:relative;width:10px;height:10px;border-radius:9999px;background:#ec4899;box-shadow:0 0 0 2px rgba(255,255,255,.9)"></span>
    `
    new maplibregl.Marker({ element: marker }).setLngLat([longitude, latitude]).addTo(map)

    return () => {
      map.remove()
    }
  }, [latitude, longitude, dark])

  return <div ref={ref} className={`h-full w-full ${className}`} />
}
