import { useEffect, useRef } from 'react'

function seededRandom(seed) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

function drawHistogram(canvas, channels) {
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth || 272
  const height = canvas.clientHeight || 128
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const colors = [
    [239, 68, 68],
    [34, 197, 94],
    [59, 130, 246],
  ]
  const max = Math.max(1, ...channels.flat())
  channels.forEach((channel, index) => {
    ctx.beginPath()
    ctx.moveTo(0, height)
    const step = width / (channel.length - 1)
    channel.forEach((value, i) => {
      const x = i * step
      const y = height - (value / max) * height * 0.92
      ctx.lineTo(x, y)
    })
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fillStyle = `rgba(${colors[index].join(',')},0.32)`
    ctx.fill()
  })
}

function fallbackChannels(seed) {
  const random = seededRandom(seed)
  return [0, 1, 2].map(() => {
    const values = []
    for (let i = 0; i < 64; i += 1) {
      const center = 40 + random() * 60
      const shape = Math.exp(-Math.pow((i - center) / 22, 2))
      values.push(Math.round(shape * (0.5 + random() * 0.6) * 1000))
    }
    return values
  })
}

export default function Histogram({ src, seed = 1 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false

    const run = () => {
      if (!src) {
        drawHistogram(canvas, fallbackChannels(seed))
        return
      }
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        if (cancelled) return
        try {
          const sample = document.createElement('canvas')
          sample.width = 96
          sample.height = 96
          const ctx = sample.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(image, 0, 0, 96, 96)
          const { data } = ctx.getImageData(0, 0, 96, 96)
          const channels = [new Array(64).fill(0), new Array(64).fill(0), new Array(64).fill(0)]
          for (let i = 0; i < data.length; i += 4) {
            channels[0][Math.min(63, data[i] >> 2)] += 1
            channels[1][Math.min(63, data[i + 1] >> 2)] += 1
            channels[2][Math.min(63, data[i + 2] >> 2)] += 1
          }
          drawHistogram(canvas, channels)
        } catch {
          drawHistogram(canvas, fallbackChannels(seed))
        }
      }
      image.onerror = () => {
        if (!cancelled) drawHistogram(canvas, fallbackChannels(seed))
      }
      image.src = src
    }

    run()
    const onResize = () => run()
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
  }, [src, seed])

  return <canvas ref={canvasRef} className="h-32 w-full" />
}
