import { useEffect, useRef } from 'react'
import { maplibregl, createMapLibreStyle } from '../lib/maplibre'

// position 是 GCJ-02 的 [经度, 纬度]，由服务端换算好，避免标记点与高德底图错开数百米。
// 使用 MapLibre + 高德免费栅格瓦片，无需 Key。
export default function MiniMap({ position, dark = false, className = '' }) {
  const ref = useRef(null)
  const lng = position?.[0]
  const lat = position?.[1]

  useEffect(() => {
    const el = ref.current
    if (!el || typeof lng !== 'number' || typeof lat !== 'number') return
    let disposed = false
    let map = null
    let marker = null

    map = new maplibregl.Map({
      container: el,
      style: createMapLibreStyle(dark),
      center: [lng, lat],
      zoom: 12,
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
      interactive: false,
    })

    map.on('load', () => {
      if (disposed) return
      const dot = document.createElement('div')
      dot.className = 'relative flex h-5 w-5 items-center justify-center'
      dot.innerHTML = `
        <span style="position:absolute;inset:0;border-radius:9999px;background:rgba(236,72,153,.35);animation:ping 1.6s cubic-bezier(0,0,.2,1) infinite"></span>
        <span style="position:relative;width:10px;height:10px;border-radius:9999px;background:#ec4899;box-shadow:0 0 0 2px rgba(255,255,255,.9)"></span>
      `
      marker = new maplibregl.Marker({ element: dot, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(map)
    })

    return () => {
      disposed = true
      marker?.remove()
      map?.remove()
    }
  }, [lng, lat, dark])

  // MapLibre 会给容器加 .maplibregl-map{position:relative}，覆盖 Tailwind 的绝对定位类，
  // 所以高度用内联样式写死，避免容器塌陷成 0。
  return <div ref={ref} className={`w-full ${className}`} style={{ height: '100%' }} />
}
