import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PhotoCard from './PhotoCard'
import { photoAspect } from '../lib/format'

const GAP = 4

function columnCountFor(width) {
  if (typeof window !== 'undefined' && width <= 768) return 2
  return Math.max(2, Math.min(8, Math.floor((width + GAP) / 204)))
}

export default function PhotoWall({ photos, onOpen }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  )

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setWidth(element.getBoundingClientRect().width || window.innerWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const { columns, columnCount } = useMemo(() => {
    const count = columnCountFor(width)
    const columnWidth = (width - GAP * (count - 1)) / count
    const created = Array.from({ length: count }, () => ({ items: [], height: 0 }))
    photos.forEach((photo, index) => {
      let target = created[0]
      for (const column of created) {
        if (column.height < target.height) target = column
      }
      target.items.push({ photo, index })
      target.height += columnWidth / Math.max(photoAspect(photo), 0.1) + GAP
    })
    return { columns: created, columnCount: count }
  }, [photos, width])

  return (
    <div
      ref={ref}
      className={`masonry-wall masonry-columns-${columnCount}`}
      style={{ gap: `${GAP}px` }}
    >
      {columns.map((column, index) => (
        <div
          key={index}
          className="masonry-column"
          style={{ gap: `${GAP}px`, width: `calc((100% - ${GAP * (columnCount - 1)}px) / ${columnCount})` }}
        >
          {column.items.map(({ photo, index: photoIndex }) => (
            <div
              key={photo.id}
              className="masonry-item"
              style={{ animationDelay: `${Math.min(photoIndex, 24) * 18}ms` }}
            >
              <PhotoCard photo={photo} index={photoIndex} onOpen={onOpen} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
