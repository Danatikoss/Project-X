import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download, ArrowLeft, Plus, Search, X, Edit2, Check,
  Presentation, ChevronLeft, ChevronRight, Share2,
  BookImage, Info, Sparkles, PenLine, FolderOpen, Play,
  Film, Image, PanelLeftClose, PanelLeftOpen, Trash2, FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import { assemblyApi, libraryApi, searchApi, projectsApi, mediaApi, thesesApi } from '../api/client'
import { FilmStrip } from '../components/assemble/FilmStrip'
import { SlideCard, SlideThumbnail } from '../components/common/SlideCard'
import { Slideshow } from '../components/common/Slideshow'
import { Spinner } from '../components/common/Spinner'
import { GenerateSlideModal } from '../components/common/GenerateSlideModal'
import { SlideEditor, isCollaboraEnabled } from '../components/common/SlideEditor'
import { SlideTextEditor } from '../components/common/SlideTextEditor'
import { cn } from '../utils/cn'
import { useAppStore } from '../store'
import type { Slide, Assembly, Project, SlideOverlay, MediaAsset, MediaFolder } from '../types'

// ─── Utilities ────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setDeb(value), delay)
    return () => { if (t.current) clearTimeout(t.current) }
  }, [value, delay])
  return deb
}

/** Load natural dimensions of an image or video. Returns aspect ratio (w/h) or null on timeout. */
async function getNaturalAR(asset: MediaAsset): Promise<number | null> {
  return new Promise((resolve) => {
    const tid = setTimeout(() => resolve(null), 1500)
    if (asset.file_type === 'video') {
      const v = document.createElement('video')
      v.onloadedmetadata = () => {
        clearTimeout(tid)
        resolve(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null)
      }
      v.onerror = () => { clearTimeout(tid); resolve(null) }
      v.src = asset.url
    } else {
      const img = new window.Image()
      img.onload = () => {
        clearTimeout(tid)
        resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null)
      }
      img.onerror = () => { clearTimeout(tid); resolve(null) }
      img.src = asset.url
    }
  })
}

// ─── Library Panel ───────────────────────────────────────────────────────────

function LibraryPanel({
  existingIds,
  onAdd,
  onAddMultiple,
  onGenerate,
}: {
  existingIds: Set<number>
  onAdd: (slide: Slide) => void
  onAddMultiple: (slides: Slide[]) => void
  onGenerate: () => void
}) {
  const [query, setQuery] = useState('')
  const [projectId, setProjectId] = useState<number | undefined>()
  const [page, setPage] = useState(1)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Map<number, Slide>>(new Map())
  const debouncedQuery = useDebounce(query, 350)
  const PAGE_SIZE = 20

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const { data: searchResults, isFetching: searchFetching } = useQuery({
    queryKey: ['assemble-search', debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery, 40),
    enabled: debouncedQuery.length > 0,
  })

  const { data: libraryData, isFetching: libraryFetching } = useQuery({
    queryKey: ['assemble-library', projectId, page],
    queryFn: () => libraryApi.listSlides({ project_id: projectId, page, page_size: PAGE_SIZE }),
    enabled: debouncedQuery.length === 0,
  })

  const isSearching = debouncedQuery.length > 0
  const slides: Slide[] = isSearching ? (searchResults?.items || []) : (libraryData?.items || [])
  const total = isSearching ? (searchResults?.total || 0) : (libraryData?.total || 0)
  const isFetching = isSearching ? searchFetching : libraryFetching
  const totalPages = Math.ceil(total / PAGE_SIZE)

  useEffect(() => { setPage(1) }, [debouncedQuery, projectId])
  useEffect(() => { if (!selectMode) setSelected(new Map()) }, [selectMode])

  const toggleSelect = (slide: Slide) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(slide.id)) next.delete(slide.id)
      else if (!existingIds.has(slide.id)) next.set(slide.id, slide)
      return next
    })
  }

  const handleAddSelected = () => {
    onAddMultiple(Array.from(selected.values()))
    setSelected(new Map())
    setSelectMode(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск слайдов..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-300"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setSelectMode((v) => !v)}
            className={cn(
              'text-[10px] px-2 py-1.5 rounded-lg border transition-colors whitespace-nowrap shrink-0',
              selectMode ? 'bg-brand-900 text-white border-brand-900' : 'border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-700'
            )}
          >
            {selectMode ? 'Отмена' : 'Выбрать'}
          </button>
          <button
            onClick={onGenerate}
            className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-brand-700 hover:border-brand-300 hover:bg-brand-50 transition-colors shrink-0"
            title="Создать слайд с AI"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>

        {projects.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => setProjectId(undefined)}
              className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors', projectId === undefined ? 'bg-brand-900 text-white border-brand-900' : 'border-gray-200 text-gray-500 hover:border-brand-300')}
            >Все</button>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setProjectId(projectId === p.id ? undefined : p.id)}
                className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[100px]', projectId === p.id ? 'bg-brand-100 text-brand-800 border-brand-300' : 'border-gray-200 text-gray-500 hover:border-brand-300')}
              >
                <FolderOpen className="w-2.5 h-2.5 shrink-0" style={{ color: p.color }} />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isFetching && !slides.length ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : slides.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Ничего не найдено</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {slides.map((slide) => {
              const added = existingIds.has(slide.id)
              const isSelected = selected.has(slide.id)
              return (
                <div key={slide.id} className="relative group">
                  <SlideCard
                    slide={slide}
                    compact
                    onClick={() => {
                      if (selectMode) { if (!added) toggleSelect(slide) }
                      else if (!added) onAdd(slide)
                    }}
                    className={cn(added && !selectMode && 'opacity-50 cursor-not-allowed')}
                  />
                  <p className="text-[10px] text-gray-500 mt-1 leading-tight line-clamp-2 px-0.5">
                    {slide.title || '(без названия)'}
                  </p>
                  {selectMode && !added && (
                    <div
                      className={cn('absolute inset-0 rounded-lg border-2 transition-all cursor-pointer', isSelected ? 'border-brand-600 bg-brand-900/10' : 'border-transparent hover:border-brand-300')}
                      onClick={() => toggleSelect(slide)}
                    >
                      <div className={cn('absolute top-1.5 left-1.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-all', isSelected ? 'bg-brand-900 border-brand-900' : 'bg-white border-gray-300')}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </div>
                  )}
                  {!selectMode && (
                    added ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                        <div className="flex items-center gap-1 bg-brand-900/90 text-white text-[10px] px-2 py-0.5 rounded-full">
                          <Check className="w-2.5 h-2.5" /> Добавлен
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => onAdd(slide)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-brand-900 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectMode && selected.size > 0 && (
        <div className="px-3 py-2 border-t border-brand-100 bg-brand-50">
          <button
            onClick={handleAddSelected}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-900 text-white text-xs font-medium hover:bg-brand-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить {selected.size} {selected.size === 1 ? 'слайд' : selected.size < 5 ? 'слайда' : 'слайдов'}
          </button>
        </div>
      )}

      {!isSearching && totalPages > 1 && (
        <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <span className="text-[10px] text-gray-400">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      )}
      {!isSearching && (
        <div className="px-3 pb-2 text-center">
          <span className="text-[10px] text-gray-400">{total} слайдов в библиотеке</span>
        </div>
      )}
    </div>
  )
}

// ─── Media Panel ─────────────────────────────────────────────────────────────

function MediaPanel({ onAdd }: { onAdd: (asset: MediaAsset) => void }) {
  const [selectedFolder, setSelectedFolder] = useState<number | 'all' | 'unfoldered'>('all')

  const { data: folders = [] } = useQuery<MediaFolder[]>({
    queryKey: ['media-folders'],
    queryFn: mediaApi.listFolders,
  })

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['media-assets', selectedFolder],
    queryFn: () => {
      if (selectedFolder === 'all') return mediaApi.listAssets()
      if (selectedFolder === 'unfoldered') return mediaApi.listAssets({ unfoldered: true })
      return mediaApi.listAssets({ folder_id: selectedFolder })
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-8"><Spinner /></div>
  }

  if (!isLoading && assets.length === 0 && folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 p-6">
        <Film className="w-10 h-10 opacity-20" />
        <div className="text-center">
          <p className="text-xs font-medium text-gray-500">Нет медиафайлов</p>
          <p className="text-[10px] mt-1 text-gray-400">Загрузите GIF, видео или фото в разделе «Медиа»</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Folder tabs */}
      {folders.length > 0 && (
        <div className="p-2 border-b border-gray-100 flex flex-wrap gap-1">
          <button
            onClick={() => setSelectedFolder('all')}
            className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors', selectedFolder === 'all' ? 'bg-brand-900 text-white border-brand-900' : 'border-gray-200 text-gray-500 hover:border-brand-300')}
          >Все</button>
          <button
            onClick={() => setSelectedFolder('unfoldered')}
            className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors', selectedFolder === 'unfoldered' ? 'bg-brand-900 text-white border-brand-900' : 'border-gray-200 text-gray-500 hover:border-brand-300')}
          >Без папки</button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedFolder(f.id)}
              className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[90px]', selectedFolder === f.id ? 'bg-brand-100 text-brand-800 border-brand-300' : 'border-gray-200 text-gray-500 hover:border-brand-300')}
            >
              <span className="truncate">{f.name}</span>
              {f.asset_count > 0 && <span className="shrink-0 text-gray-400">{f.asset_count}</span>}
            </button>
          ))}
        </div>
      )}

      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-gray-400 p-4">
          <Film className="w-8 h-8 opacity-20" />
          <p className="text-xs text-gray-400">Нет файлов в этой папке</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-[10px] text-gray-400 px-1 pb-2">Нажмите, чтобы добавить на слайд</p>
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onAdd(asset)}
                className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-brand-400 transition-all bg-gray-50 hover:shadow-md"
                style={{ aspectRatio: '16/9' }}
                title={asset.name}
              >
                {asset.file_type === 'video' ? (
                  <video src={asset.url} className="w-full h-full object-cover" muted preload="metadata" />
                ) : (
                  <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
                <div className="absolute top-1 left-1">
                  {asset.file_type === 'video'
                    ? <span className="text-[8px] bg-black/60 text-white px-1 py-0.5 rounded font-medium">VID</span>
                    : asset.file_type === 'gif'
                    ? <span className="text-[8px] bg-black/60 text-white px-1 py-0.5 rounded font-medium">GIF</span>
                    : <span className="text-[8px] bg-black/60 text-white px-1 py-0.5 rounded font-medium">IMG</span>
                  }
                </div>
                <p className="absolute bottom-0 left-0 right-0 text-[9px] text-white bg-black/50 px-1.5 py-0.5 truncate">
                  {asset.name}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Overlay Item ─────────────────────────────────────────────────────────────

function OverlayItem({
  overlay,
  isSelected,
  onMouseDown,
  onDelete,
}: {
  overlay: SlideOverlay
  isSelected: boolean
  onMouseDown: (e: React.MouseEvent, mode: 'move' | 'resize') => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'absolute select-none',
        isSelected
          ? 'outline outline-2 outline-brand-500 outline-offset-0 cursor-move z-10'
          : 'cursor-pointer hover:outline hover:outline-1 hover:outline-brand-300 z-[5]'
      )}
      style={{
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.w}%`,
        height: `${overlay.h}%`,
      }}
      onMouseDown={(e) => onMouseDown(e, 'move')}
      onClick={(e) => e.stopPropagation()}  // prevent parent deselect on click
    >
      {overlay.file_type === 'video' ? (
        <video
          src={overlay.url}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-contain pointer-events-none"
        />
      ) : (
        <img
          src={overlay.url}
          alt=""
          className="w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
      )}

      {isSelected && (
        <>
          {/* Delete button */}
          <button
            className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 z-20 cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >
            <X className="w-3 h-3" />
          </button>
          {/* Resize handle */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 bg-brand-500 hover:bg-brand-400 cursor-se-resize rounded-tl z-20 flex items-center justify-center"
            title="Изменить размер"
            onMouseDown={(e) => {
              e.stopPropagation()
              onMouseDown(e, 'resize')
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" className="text-white opacity-80">
              <path d="M7 1L1 7M7 4L4 7M7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Assemble() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const assemblyId = parseInt(id || '0')

  const { selectedSlideIndex: selectedIndex, setSelectedSlideIndex: setSelectedIndex } = useAppStore()
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [localSlides, setLocalSlides] = useState<Slide[]>([])
  const [overlays, setOverlays] = useState<Record<string, SlideOverlay[]>>({})
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isCreatingTheses, setIsCreatingTheses] = useState(false)
  const [showSlideshow, setShowSlideshow] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [editingSlideId, setEditingSlideId] = useState<number | null>(null)
  const [rightTab, setRightTab] = useState<'info' | 'library' | 'media'>(
    searchParams.get('tab') === 'library' ? 'library' : 'info'
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const overlaysRef = useRef<Record<string, SlideOverlay[]>>({})
  const dragRef = useRef<{
    overlayId: string
    slideId: string
    mode: 'move' | 'resize'
    startX: number
    startY: number
    startOverlay: SlideOverlay
  } | null>(null)
  const saveOverlaysRef = useRef<() => void>(() => {})

  const { data: assembly, isLoading } = useQuery({
    queryKey: ['assembly', assemblyId],
    queryFn: () => assemblyApi.get(assemblyId),
    enabled: !!assemblyId,
  })

  useEffect(() => {
    if (assembly) {
      setLocalSlides(assembly.slides)
      setTitleValue(assembly.title)
      setOverlays(assembly.overlays || {})
    }
  }, [assembly])

  useEffect(() => { overlaysRef.current = overlays }, [overlays])

  const updateMutation = useMutation({
    mutationFn: (data: { slide_ids?: number[]; title?: string; overlays?: Record<string, SlideOverlay[]> }) =>
      assemblyApi.update(assemblyId, data),
    onSuccess: (updated: Assembly) => {
      queryClient.setQueryData(['assembly', assemblyId], updated)
    },
    onError: () => toast.error('Не удалось сохранить изменения'),
  })

  saveOverlaysRef.current = () => {
    updateMutation.mutate({ overlays: overlaysRef.current })
  }

  // Document-level drag/resize — stable, all access via refs
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dx = ((e.clientX - drag.startX) / rect.width) * 100
      const dy = ((e.clientY - drag.startY) / rect.height) * 100
      const { overlayId, slideId, mode, startOverlay } = drag
      setOverlays((prev) => {
        const list = [...(prev[slideId] || [])]
        const i = list.findIndex((o) => o.id === overlayId)
        if (i < 0) return prev
        const o = { ...list[i] }
        if (mode === 'move') {
          o.x = Math.max(0, Math.min(100 - o.w, startOverlay.x + dx))
          o.y = Math.max(0, Math.min(100 - o.h, startOverlay.y + dy))
        } else {
          o.w = Math.max(10, Math.min(100 - startOverlay.x, startOverlay.w + dx))
          o.h = Math.max(5, Math.min(100 - startOverlay.y, startOverlay.h + dy))
        }
        list[i] = o
        return { ...prev, [slideId]: list }
      })
    }
    const onUp = () => {
      if (!dragRef.current) return
      dragRef.current = null
      saveOverlaysRef.current()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleOverlayMouseDown = useCallback((
    e: React.MouseEvent,
    overlayId: string,
    slideId: string,
    mode: 'move' | 'resize'
  ) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedOverlayId(overlayId)
    const overlay = overlaysRef.current[slideId]?.find((o) => o.id === overlayId)
    if (!overlay) return
    dragRef.current = { overlayId, slideId, mode, startX: e.clientX, startY: e.clientY, startOverlay: { ...overlay } }
  }, [])

  const handleAddOverlay = useCallback(async (asset: MediaAsset) => {
    const slideId = String(localSlides[selectedIndex]?.id)
    if (!slideId || slideId === 'undefined') {
      toast.error('Выберите слайд')
      return
    }

    // Detect natural aspect ratio to set correct initial size
    const naturalAR = await getNaturalAR(asset)
    const w = 35
    // h in slide % coordinates: w/W = (h * 9/16)/W => h = w * 16/9 / naturalAR
    const h = naturalAR
      ? Math.max(5, Math.min(80, Math.round(w * (16 / 9) / naturalAR)))
      : 22

    const newOverlay: SlideOverlay = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      asset_id: asset.id,
      url: asset.url,
      file_type: asset.file_type,
      x: 5,
      y: Math.max(5, Math.min(95 - h, 10)),
      w,
      h,
    }
    const newOverlays = {
      ...overlaysRef.current,
      [slideId]: [...(overlaysRef.current[slideId] || []), newOverlay],
    }
    setOverlays(newOverlays)
    setSelectedOverlayId(newOverlay.id)
    updateMutation.mutate({ overlays: newOverlays })
    toast.success('Медиа добавлено на слайд', { duration: 1500 })
  }, [localSlides, selectedIndex, updateMutation])

  const deleteOverlay = useCallback((slideId: string, overlayId: string) => {
    const newOverlays = {
      ...overlaysRef.current,
      [slideId]: (overlaysRef.current[slideId] || []).filter((o) => o.id !== overlayId),
    }
    setOverlays(newOverlays)
    setSelectedOverlayId(null)
    updateMutation.mutate({ overlays: newOverlays })
  }, [updateMutation])

  const handleReorder = (newSlides: Slide[]) => {
    setLocalSlides(newSlides)
    updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) })
  }

  const handleRemove = (slideId: number) => {
    const newSlides = localSlides.filter((s) => s.id !== slideId)
    setLocalSlides(newSlides)
    setSelectedIndex(Math.min(selectedIndex, newSlides.length - 1))
    updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) })
  }

  const handleAddSlide = (slide: Slide) => {
    if (localSlides.some((s) => s.id === slide.id)) return
    const newSlides = [...localSlides, slide]
    setLocalSlides(newSlides)
    setSelectedIndex(newSlides.length - 1)
    updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) })
    toast.success(`Слайд добавлен`, { duration: 1500 })
  }

  const handleAddMultiple = (slides: Slide[]) => {
    const toAdd = slides.filter((s) => !localSlides.some((e) => e.id === s.id))
    if (!toAdd.length) return
    const newSlides = [...localSlides, ...toAdd]
    setLocalSlides(newSlides)
    setSelectedIndex(newSlides.length - 1)
    updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) })
    toast.success(`Добавлено ${toAdd.length} ${toAdd.length === 1 ? 'слайд' : toAdd.length < 5 ? 'слайда' : 'слайдов'}`, { duration: 2000 })
  }

  const handleTitleSave = () => {
    setEditingTitle(false)
    if (titleValue !== assembly?.title) updateMutation.mutate({ title: titleValue })
  }

  const handleShare = async () => {
    setIsSharing(true)
    try {
      const { share_token } = await assemblyApi.share(assemblyId)
      const url = `${window.location.origin}/share/${share_token}`
      await navigator.clipboard.writeText(url)
      toast.success('Ссылка скопирована в буфер обмена')
    } catch {
      toast.error('Не удалось создать ссылку')
    } finally {
      setIsSharing(false)
    }
  }

  const handleExport = async (format: 'pptx' | 'pdf') => {
    setIsExporting(true)
    try {
      await assemblyApi.export(assemblyId, format)
      toast.success(`${format.toUpperCase()} экспортирован`)
    } catch {
      toast.error('Ошибка экспорта')
    } finally {
      setIsExporting(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
  }

  if (!assembly && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400">
        <Presentation className="w-12 h-12 opacity-30" />
        <p>Сборка не найдена</p>
        <button onClick={() => navigate('/dashboard')} className="text-brand-700 text-sm underline">На главную</button>
      </div>
    )
  }

  const selectedSlide = localSlides[selectedIndex]
  const existingIds = new Set(localSlides.map((s) => s.id))
  const isManual = assembly?.prompt === '(создано вручную)'
  const currentSlideId = selectedSlide ? String(selectedSlide.id) : null
  const currentOverlays = currentSlideId ? (overlays[currentSlideId] || []) : []
  const rightPanelWidth = rightTab === 'library' ? 'w-[340px]' : rightTab === 'media' ? 'w-[300px]' : 'w-[260px]'

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Left: filmstrip (collapsible) */}
      <div className={cn(
        'shrink-0 border-r border-gray-200 flex flex-col bg-surface transition-all duration-200 overflow-hidden',
        sidebarCollapsed ? 'w-[40px]' : 'w-[200px]'
      )}>
        <div className="p-2 border-b border-gray-200 flex items-center justify-between shrink-0">
          {!sidebarCollapsed && (
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Назад
            </button>
          )}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={cn('p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0', sidebarCollapsed && 'mx-auto')}
            title={sidebarCollapsed ? 'Развернуть панель' : 'Свернуть панель'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
          {!sidebarCollapsed && <span className="text-xs text-gray-400">{localSlides.length} сл.</span>}
        </div>

        {!sidebarCollapsed && (
          <>
            <div className="flex-1 overflow-y-auto">
              <FilmStrip slides={localSlides} selectedIndex={selectedIndex} onSelect={setSelectedIndex} onReorder={handleReorder} onRemove={handleRemove} />
            </div>
            <div className="p-2 border-t border-gray-200">
              <button
                onClick={() => setRightTab('library')}
                className={cn('w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs transition-colors', rightTab === 'library' ? 'border-brand-400 text-brand-700 bg-brand-50' : 'border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-700')}
              >
                <Plus className="w-3.5 h-3.5" /> Добавить слайды
              </button>
            </div>
          </>
        )}

        {sidebarCollapsed && (
          <div className="flex-1 flex flex-col items-center pt-2">
            <span className="text-[10px] text-gray-400">{localSlides.length}</span>
          </div>
        )}
      </div>

      {/* Center: large preview */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200">
          {sidebarCollapsed && (
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors mr-1">
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <button disabled={selectedIndex === 0} onClick={() => setSelectedIndex(selectedIndex - 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm text-gray-500 min-w-[60px] text-center">
            {localSlides.length > 0 ? `${selectedIndex + 1} / ${localSlides.length}` : '—'}
          </span>
          <button disabled={selectedIndex >= localSlides.length - 1} onClick={() => setSelectedIndex(selectedIndex + 1)} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>

          {selectedSlide && (
            <p className="text-sm text-gray-600 truncate flex-1 ml-2">{selectedSlide.title || '(без названия)'}</p>
          )}

          {currentOverlays.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 shrink-0">
              {currentOverlays.length} медиа
            </span>
          )}
          {selectedOverlayId && (
            <button
              onClick={() => setSelectedOverlayId(null)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
            >
              Снять выделение
            </button>
          )}
        </div>

        {/* Slide preview / text editor */}
        {editingSlideId !== null && selectedSlide ? (
          <div className="flex-1 overflow-hidden">
            <SlideTextEditor
              slideId={editingSlideId}
              thumbnailUrl={selectedSlide.thumbnail_url}
              onClose={() => setEditingSlideId(null)}
              onSaved={() => setEditingSlideId(null)}
            />
          </div>
        ) : (
          <div
            className="flex-1 flex items-center justify-center p-8 bg-gray-50"
            onClick={() => setSelectedOverlayId(null)}
          >
            {selectedSlide ? (
              <div className="w-full max-w-4xl">
                <div
                  ref={containerRef}
                  className="relative w-full rounded-xl overflow-hidden shadow-xl border border-gray-200"
                >
                  {selectedSlide.video_url ? (
                    <video
                      src={selectedSlide.video_url}
                      controls
                      className="w-full object-contain bg-white"
                      style={{ aspectRatio: '16/9' }}
                      poster={selectedSlide.thumbnail_url || undefined}
                    />
                  ) : (
                    <SlideThumbnail slide={selectedSlide} />
                  )}

                  {/* Overlay items */}
                  {currentOverlays.map((overlay) => (
                    <OverlayItem
                      key={overlay.id}
                      overlay={overlay}
                      isSelected={selectedOverlayId === overlay.id}
                      onMouseDown={(e, mode) => handleOverlayMouseDown(e, overlay.id, currentSlideId!, mode)}
                      onDelete={() => deleteOverlay(currentSlideId!, overlay.id)}
                    />
                  ))}

                  {/* Slideshow button */}
                  {localSlides.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowSlideshow(true) }}
                      className="absolute bottom-3 right-3 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors shadow-md z-[5]"
                    >
                      <Play className="w-3 h-3" /> Слайд-шоу
                    </button>
                  )}

                  {/* Native text edit button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingSlideId(selectedSlide.id) }}
                    className="absolute bottom-3 left-3 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors shadow-md z-[5]"
                  >
                    <Edit2 className="w-3 h-3" /> Редактировать
                  </button>

                  {/* Collabora edit button (only if feature is separately enabled) */}
                  {isCollaboraEnabled() && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingSlideId(-(selectedSlide.id)) }}
                      className="absolute top-3 right-3 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors shadow-md z-[5]"
                    >
                      <Edit2 className="w-3 h-3" /> Collabora
                    </button>
                  )}
                </div>

                {currentOverlays.length > 0 && !selectedOverlayId && (
                  <p className="text-center text-[10px] text-gray-400 mt-2">
                    Нажмите на медиаэлемент → перетащите или измените размер (угол ▟)
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-400 gap-4">
                <div className="w-24 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
                  <Plus className="w-6 h-6 opacity-40" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500 mb-1">Презентация пустая</p>
                  <p className="text-xs text-gray-400">
                    Нажмите{' '}
                    <button onClick={() => setRightTab('library')} className="text-brand-600 hover:underline">«Добавить слайды»</button>
                    {' '}чтобы начать
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className={cn('shrink-0 border-l border-gray-200 flex flex-col bg-white transition-all duration-200', rightPanelWidth)}>
        {/* Tabs */}
        <div className="flex items-center border-b border-gray-200 shrink-0">
          <button
            onClick={() => setRightTab('info')}
            className={cn('flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium transition-colors border-b-2', rightTab === 'info' ? 'text-brand-700 border-brand-700' : 'text-gray-400 border-transparent hover:text-gray-600')}
          >
            <Info className="w-3.5 h-3.5" /> Слайд
          </button>
          <button
            onClick={() => setRightTab('library')}
            className={cn('flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium transition-colors border-b-2', rightTab === 'library' ? 'text-brand-700 border-brand-700' : 'text-gray-400 border-transparent hover:text-gray-600')}
          >
            <BookImage className="w-3.5 h-3.5" /> Слайды
          </button>
          <button
            onClick={() => setRightTab('media')}
            className={cn('flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium transition-colors border-b-2 relative', rightTab === 'media' ? 'text-brand-700 border-brand-700' : 'text-gray-400 border-transparent hover:text-gray-600')}
          >
            <Film className="w-3.5 h-3.5" /> Медиа
            {currentOverlays.length > 0 && (
              <span className="absolute top-2 right-1 w-3.5 h-3.5 rounded-full bg-brand-500 text-white text-[8px] flex items-center justify-center font-bold">
                {currentOverlays.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        {rightTab === 'info' && (
          <div className="flex flex-col flex-1 overflow-auto">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-1 mb-2">
                {isManual ? <PenLine className="w-3.5 h-3.5 text-teal-600" /> : <Sparkles className="w-3.5 h-3.5 text-brand-600" />}
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">{isManual ? 'Вручную' : 'AI-сборка'}</span>
              </div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave() }}
                    className="flex-1 text-sm font-medium border-b border-brand-400 focus:outline-none py-0.5"
                  />
                  <button onClick={handleTitleSave}><Check className="w-4 h-4 text-brand-700" /></button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <h2 className="flex-1 text-sm font-semibold text-gray-900 leading-snug">{titleValue || 'Без названия'}</h2>
                  <button onClick={() => setEditingTitle(true)} className="mt-0.5 opacity-50 hover:opacity-100 transition-opacity">
                    <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </div>
              )}
              {!isManual && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{assembly?.prompt}</p>}
            </div>

            {selectedSlide ? (
              <div className="p-4 border-b border-gray-200">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Слайд {selectedIndex + 1}</p>
                <p className="text-sm font-medium text-gray-800 mb-1">{selectedSlide.title || '(без названия)'}</p>
                {selectedSlide.summary && <p className="text-xs text-gray-500 mb-2 line-clamp-3">{selectedSlide.summary}</p>}
                {selectedSlide.labels && selectedSlide.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedSlide.labels.map((lbl) => (
                      <span key={lbl} className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded-full border border-teal-200">{lbl}</span>
                    ))}
                  </div>
                )}
                {selectedSlide.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {selectedSlide.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded-full">{tag}</span>
                    ))}
                  </div>
                )}
                {selectedSlide.source_filename && (
                  <p className="text-[10px] text-gray-400 mt-1 truncate">Источник: {selectedSlide.source_filename}</p>
                )}
                <button
                  onClick={() => handleRemove(selectedSlide.id)}
                  className="mt-3 flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  <X className="w-3 h-3" /> Убрать из презентации
                </button>
              </div>
            ) : (
              <div className="p-4 text-center text-gray-400">
                <p className="text-xs">Выберите слайд в левой панели</p>
              </div>
            )}

            <div className="p-4 mt-auto">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Экспорт</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleShare}
                  disabled={isSharing || localSlides.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4" /> Поделиться ссылкой
                </button>
                <button
                  onClick={() => handleExport('pptx')}
                  disabled={isExporting || localSlides.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-900 text-white text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50"
                >
                  {isExporting ? <Spinner size="sm" className="border-white border-t-transparent" /> : <Download className="w-4 h-4" />}
                  Скачать PPTX
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={isExporting || localSlides.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" /> Скачать PDF
                </button>
                <button
                  onClick={async () => {
                    setIsCreatingTheses(true)
                    try {
                      const session = await thesesApi.create(assemblyId)
                      navigate(`/theses/${session.id}`)
                    } catch {
                      toast.error('Не удалось создать тезисы')
                    } finally {
                      setIsCreatingTheses(false)
                    }
                  }}
                  disabled={isCreatingTheses || localSlides.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-violet-200 text-violet-700 text-sm font-medium hover:border-violet-300 hover:bg-violet-50 transition-colors disabled:opacity-50"
                >
                  {isCreatingTheses
                    ? <Spinner size="sm" className="border-violet-400 border-t-transparent" />
                    : <FileText className="w-4 h-4" />
                  }
                  Тезисы к выступлению
                </button>
              </div>
            </div>
          </div>
        )}

        {rightTab === 'library' && (
          <LibraryPanel
            existingIds={existingIds}
            onAdd={handleAddSlide}
            onAddMultiple={handleAddMultiple}
            onGenerate={() => setShowGenerateModal(true)}
          />
        )}

        {rightTab === 'media' && (
          <div className="flex flex-col h-full">
            {!selectedSlide ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400 p-6">
                <Image className="w-8 h-8 opacity-20" />
                <p className="text-xs text-center text-gray-400">Выберите слайд, чтобы добавить медиа</p>
              </div>
            ) : (
              <>
                {currentOverlays.length > 0 && (
                  <div className="p-3 border-b border-gray-100 shrink-0">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2 font-medium">
                      На этом слайде ({currentOverlays.length})
                    </p>
                    <div className="flex flex-col gap-1">
                      {currentOverlays.map((overlay) => (
                        <div
                          key={overlay.id}
                          className={cn(
                            'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors',
                            selectedOverlayId === overlay.id ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50 border border-transparent'
                          )}
                          onClick={() => setSelectedOverlayId(selectedOverlayId === overlay.id ? null : overlay.id)}
                        >
                          <div className="w-8 h-5 rounded overflow-hidden shrink-0 bg-gray-100">
                            {overlay.file_type === 'video'
                              ? <video src={overlay.url} className="w-full h-full object-cover" muted />
                              : <img src={overlay.url} alt="" className="w-full h-full object-cover" />
                            }
                          </div>
                          <span className="text-[10px] text-gray-600 flex-1 uppercase">{overlay.file_type}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteOverlay(currentSlideId!, overlay.id) }}
                            className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <MediaPanel onAdd={handleAddOverlay} />
              </>
            )}
          </div>
        )}
      </div>

      {showSlideshow && localSlides.length > 0 && (
        <Slideshow
          slides={localSlides}
          startIndex={selectedIndex}
          onClose={() => setShowSlideshow(false)}
          overlays={overlays}
        />
      )}

      {showGenerateModal && (
        <GenerateSlideModal
          onClose={() => setShowGenerateModal(false)}
          assemblyContext={assembly?.title}
          onSlideGenerated={(slide) => {
            handleAddSlide(slide)
            setShowGenerateModal(false)
          }}
        />
      )}

      {editingSlideId !== null && editingSlideId < 0 && (
        <SlideEditor
          slideId={-editingSlideId}
          onClose={() => setEditingSlideId(null)}
        />
      )}
    </div>
  )
}
