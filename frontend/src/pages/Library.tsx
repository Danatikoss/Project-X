import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Upload, SlidersHorizontal, Play } from 'lucide-react'
import { libraryApi, searchApi } from '../api/client'
import { SlideCard } from '../components/common/SlideCard'
import { SlidePreviewModal } from '../components/common/SlidePreviewModal'
import { Slideshow } from '../components/common/Slideshow'
import { FilterPanel, type Filters } from '../components/library/FilterPanel'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { Slide } from '../types'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [value, delay])
  return debounced
}

export default function Library() {
  const navigate = useNavigate()
  const { searchQuery: query, setSearchQuery: setQuery } = useAppStore()
  const [filters, setFilters] = useState<Filters>({})
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [previewSlide, setPreviewSlide] = useState<Slide | null>(null)
  const [slideshowIndex, setSlideshowIndex] = useState<number | null>(null)
  const PAGE_SIZE = 24

  const debouncedQuery = useDebounce(query, 400)

  const { data: sources } = useQuery({
    queryKey: ['sources'],
    queryFn: libraryApi.listSources,
  })

  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery, 50),
    enabled: debouncedQuery.length > 0,
  })

  const { data: libraryData, isFetching: libraryFetching } = useQuery({
    queryKey: ['slides', filters, page],
    queryFn: () => libraryApi.listSlides({
      source_id: filters.source_id,
      layout_type: filters.layout_type,
      language: filters.language,
      is_outdated: filters.is_outdated,
      project_id: filters.project_id,
      label: filters.label,
      page,
      page_size: PAGE_SIZE,
    }),
    enabled: debouncedQuery.length === 0,
  })

  const isSearching = debouncedQuery.length > 0
  const slides: Slide[] = isSearching
    ? (searchResults?.items || [])
    : (libraryData?.items || [])
  const total = isSearching ? (searchResults?.total || 0) : (libraryData?.total || 0)
  const isFetching = isSearching ? searchFetching : libraryFetching

  return (
    <>
    <div className="flex h-full">
      {/* Filter sidebar — hidden on mobile, shown as overlay or inline on desktop */}
      {showFilters && (
        <div className="fixed inset-0 z-40 md:relative md:inset-auto md:z-auto">
          {/* Mobile backdrop */}
          <div
            className="absolute inset-0 bg-black/30 md:hidden"
            onClick={() => setShowFilters(false)}
          />
          <div className="relative z-10 h-full">
            <FilterPanel
              filters={filters}
              onChange={(f) => { setFilters(f); setPage(1) }}
              sources={sources || []}
            />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="border-b border-gray-200 px-5 py-3 flex items-center gap-3 bg-white sticky top-0 z-10">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              'p-2 rounded-lg border transition-colors',
              showFilters ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Поиск по слайдам..."
              className={cn(
                'w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400'
              )}
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {isFetching ? 'Загрузка...' : `${total} слайдов`}
            </span>
            {slides.length > 0 && (
              <button
                onClick={() => setSlideshowIndex(0)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:border-brand-300 hover:text-brand-700 transition-colors"
              >
                <Play className="w-4 h-4" />
                Слайд-шоу
              </button>
            )}
            <button
              onClick={() => navigate('/library/upload')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-900 text-white text-sm font-medium hover:bg-brand-800 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Загрузить
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-5">
          {isFetching && !slides.length ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : slides.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">
                {query ? 'Ничего не найдено по запросу' : 'Библиотека пуста. Загрузите первую презентацию!'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {slides.map((slide, idx) => (
                <SlideCard
                  key={slide.id}
                  slide={slide}
                  showFolderAssign
                  onClick={() => setPreviewSlide(slide)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!isSearching && libraryData && libraryData.total > PAGE_SIZE && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:border-brand-300 transition-colors"
              >
                ← Назад
              </button>
              <span className="text-sm text-gray-500">
                Страница {page} из {Math.ceil(libraryData.total / PAGE_SIZE)}
              </span>
              <button
                disabled={page >= Math.ceil(libraryData.total / PAGE_SIZE)}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:border-brand-300 transition-colors"
              >
                Вперёд →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    {previewSlide && (
      <SlidePreviewModal
        slide={previewSlide}
        slides={slides}
        onClose={() => setPreviewSlide(null)}
        onNavigate={setPreviewSlide}
        onSlideUpdate={setPreviewSlide}
      />
    )}

    {slideshowIndex !== null && (
      <Slideshow
        slides={slides}
        startIndex={slideshowIndex}
        onClose={() => setSlideshowIndex(null)}
      />
    )}
    </>
  )
}
