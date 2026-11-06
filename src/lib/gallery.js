// 纯函数：相册筛选与排序。单独放在 .js 里，方便 Node 原生测试直接 import。

export function applyFilters(photos, { filters, search }) {
  const term = search.trim().toLowerCase()
  return photos.filter((photo) => {
    if (term) {
      const haystack = [
        photo.title,
        photo.description,
        ...(photo.tags || []),
        photo.city,
        photo.locationName,
        photo.exif?.Model,
        photo.exif?.Make,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(term)) return false
    }
    if (filters.tags.length && !filters.tags.some((tag) => (photo.tags || []).includes(tag))) {
      return false
    }
    if (filters.cameras.length) {
      const camera = photo.exif?.Model || photo.exif?.Make
      if (!filters.cameras.includes(camera)) return false
    }
    if (filters.lenses.length) {
      const lens = photo.exif?.LensModel || photo.exif?.Lens
      if (!filters.lenses.includes(lens)) return false
    }
    if (filters.cities.length && !filters.cities.includes(photo.city)) return false
    if (filters.ratings.length && !filters.ratings.includes(photo.rating || 0)) return false
    return true
  })
}

export function sortPhotos(photos, sort) {
  const list = photos.slice()
  switch (sort) {
    case 'dateAsc':
      return list.sort(
        (a, b) => new Date(a.dateTaken || a.lastModified || 0) - new Date(b.dateTaken || b.lastModified || 0),
      )
    case 'sizeAsc':
      return list.sort((a, b) => (a.fileSize || 0) - (b.fileSize || 0))
    case 'sizeDesc':
      return list.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0))
    case 'titleAsc':
      return list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN'))
    case 'titleDesc':
      return list.sort((a, b) => String(b.title || '').localeCompare(String(a.title || ''), 'zh-Hans-CN'))
    case 'dateDesc':
    default:
      return list.sort(
        (a, b) => new Date(b.dateTaken || b.lastModified || 0) - new Date(a.dateTaken || a.lastModified || 0),
      )
  }
}
