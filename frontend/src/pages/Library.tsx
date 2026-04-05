import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Upload, SlidersHorizontal, Play, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
  const queryClient = useQueryClient()
  const { searchQuery: query, setSearchQuery: setQuery } = useAppStore()
  const [filters, setFilters] = useState<Filters>({})
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [previewSlide, setPreviewSlide] = useState<Slide | null>(null)
  const [slideshowIndex, setSlideshowIndex] = useState<number | null>(null)
  const [slideToDelete, setSlideToDelete] = useState<Slide | null>(null)
  const PAGE_SIZE = 24

  const deleteMutation = useMutation({
    mutationFn: (id: number) => libraryApi.deleteSlide(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slides'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
      setSlideToDelete(null)
      toast.success('Слайд удалён из библиотеки')
    },
    onError: () => toast.error('Не удалось удалить слайд'),
  })

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

  const activeFiltersCount = Object.values(filters).filter(Boolean).length

  return (
    <>
    <div className="flex h-full">
      {/* Filter sidebar */}
      {showFilters && (
        <div className="fixed inset-0 z-40 md:relative md:inset-auto md:z-auto">
          <div
            className="absolute inset-0 bg-black/40 md:hidden"
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
        <div className="border-b border-slate-200 px-5 py-3 flex items-center gap-3 bg-white sticky top-0 z-10 shadow-sm">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              'relative flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all',
              showFilters
                ? 'border-brand-400 bg-brand-50 text-brand-700'
                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Фильтры</span>
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1) }}
              placeholder="Поиск по слайдам..."
              className={cn(
                'w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50',
                'text-slate-800 placeholder-slate-400',
                'focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 focus:bg-white',
                'transition-all'
              )}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-400 hidden sm:block">
              {isFetching ? (
                <span className="flex items-center gap-1.5">
                  <Spinner size="sm" />
                  Загрузка...
                </span>
              ) : `${total} слайдов`}
            </span>
            {slides.length > 0 && (
              <button
                onClick={() => setSlideshowIndex(0)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium',
                  'hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-all'
                )}
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Слайд-шоу</span>
              </button>
            )}
            <button
              onClick={() => navigate('/library/upload')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-semibold',
                'bg-gradient-brand hover:opacity-90 transition-all shadow-sm hover:shadow-md'
              )}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Загрузить</span>
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
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Search className="w-8 h-8 opacity-30" />
              </div>
              <p className="text-sm font-medium text-slate-500">
                {query ? 'Ничего не найдено' : 'Библиотека пуста'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {query ? `По запросу «${query}» слайды не найдены` : 'Загрузите первую презентацию'}
              </p>
              {!query && (
                <button
                  onClick={() => navigate('/library/upload')}
                  className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-brand text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Загрузить PPTX / PDF
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {slides.map((slide) => (
                <SlideCard
                  key={slide.id}
                  slide={slide}
                  showFolderAssign
                  showRemove
                  onRemove={() => setSlideToDelete(slide)}
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
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium disabled:opacity-40 hover:border-brand-300 hover:bg-brand-50 transition-all"
              >
                ← Назад
              </button>
              <span className="px-3 py-2 text-sm text-slate-500 font-medium">
                {page} / {Math.ceil(libraryData.total / PAGE_SIZE)}
              </span>
              <button
                disabled={page >= Math.ceil(libraryData.total / PAGE_SIZE)}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium disabled:opacity-40 hover:border-brand-300 hover:bg-brand-50 transition-all"
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

    {/* Delete confirmation modal */}
    {slideToDelete && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSlideToDelete(null)}>
        <div
          className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Удалить слайд?</p>
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
                {slideToDelete.title || '(без названия)'}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Слайд будет безвозвратно удалён из библиотеки. Это действие нельзя отменить.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setSlideToDelete(null)}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
            >
              Отмена
            </button>
            <button
              onClick={() => deleteMutation.mutate(slideToDelete.id)}
              disabled={deleteMutation.isPending}
              className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            >
              {deleteMutation.isPending ? <Spinner size="sm" /> : <Trash2 className="w-4 h-4" />}
              Удалить
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
