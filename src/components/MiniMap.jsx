import { useEffect, useRef } from 'react'
import { amapStyle, getMapConfig, loadAmap } from '../lib/amap'

// position 是 GCJ-02 的 [经度, 纬度]，由服务端换算好，避免标记点与高德底图错开数百米
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

    loadAmap()
      .then(async (AMap) => {
        if (disposed || !AMap) return
        const config = await getMapConfig()
        if (disposed) return
        map = new AMap.Map(el, {
          viewMode: '2D',
          zooms: [4, 18],
          center: [lng, lat],
          zoom: 12,
          mapStyle: amapStyle(config, dark),
          resizeEnable: true,
          scrollWheel: false,
        })
        const dot = document.createElement('div')
        dot.className = 'relative flex h-5 w-5 items-center justify-center'
        dot.innerHTML = `
          <span style="position:absolute;inset:0;border-radius:9999px;background:rgba(236,72,153,.35);animation:ping 1.6s cubic-bezier(0,0,.2,1) infinite"></span>
          <span style="position:relative;width:10px;height:10px;border-radius:9999px;background:#ec4899;box-shadow:0 0 0 2px rgba(255,255,255,.9)"></span>
        `
        marker = new AMap.Marker({
          position: [lng, lat],
          content: dot,
          offset: new AMap.Pixel(-10, -10),
        })
        marker.setMap(map)
      })
      .catch(() => {})

    return () => {
      disposed = true
      marker?.setMap(null)
      map?.destroy()
    }
  }, [lng, lat, dark])

  return <div ref={ref} className={`h-full w-full ${className}`} />
}
