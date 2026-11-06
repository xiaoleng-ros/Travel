import { createContext, useContext, useMemo, useState } from 'react'

const GalleryContext = createContext(null)

const EMPTY_FILTERS = {
  tags: [],
  cameras: [],
  lenses: [],
  cities: [],
  ratings: [],
}

export function GalleryProvider({ children }) {
  const [sort, setSort] = useState('dateDesc')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [search, setSearch] = useState('')

  const toggleFilter = (category, value) => {
    setFilters((current) => {
      const list = current[category] || []
      const next = list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value]
      return { ...current, [category]: next }
    })
  }

  const clearFilters = () => setFilters(EMPTY_FILTERS)

  const hasActiveFilters = useMemo(
    () =>
      Object.values(filters).some((list) => list.length > 0) || search.trim().length > 0,
    [filters, search],
  )

  const value = useMemo(
    () => ({
      sort,
      setSort,
      filters,
      setFilters,
      toggleFilter,
      clearFilters,
      hasActiveFilters,
      search,
      setSearch,
    }),
    [sort, filters, search, hasActiveFilters],
  )

  return <GalleryContext.Provider value={value}>{children}</GalleryContext.Provider>
}

export function useGallery() {
  return useContext(GalleryContext)
}

// 纯函数放在 src/lib/gallery.js，这里保持原有导出路径不变。
export { applyFilters, sortPhotos } from '../lib/gallery.js'
