import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Download, ArrowLeft, Plus, Search, X, Edit2, Check,
  ChevronLeft, ChevronRight, Share2,
  BookImage, Sparkles, FolderOpen, Play,
  Film, Image, Trash2, FileText, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Presentation,
} from 'lucide-react'
import { toast } from 'sonner'
import { assemblyApi, libraryApi, searchApi, projectsApi, mediaApi, thesesApi } from '../api/client'
import { FilmStrip } from '../components/assemble/FilmStrip'
import { SlideCard, SlideThumbnail } from '../components/common/SlideCard'
import { Slideshow } from '../components/common/Slideshow'
import { Spinner } from '../components/common/Spinner'
import { GenerateSlideModal } from '../components/common/GenerateSlideModal'
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

async function getNaturalAR(asset: MediaAsset): Promise<number | null> {
  return new Promise((resolve) => {
    const tid = setTimeout(() => resolve(null), 1500)
    if (asset.file_type === 'video') {
      const v = document.createElement('video')
      v.onloadedmetadata = () => { clearTimeout(tid); resolve(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null) }
      v.onerror = () => { clearTimeout(tid); resolve(null) }
      v.src = asset.url
    } else {
      const img = new window.Image()
      img.onload = () => { clearTimeout(tid); resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null) }
      img.onerror = () => { clearTimeout(tid); resolve(null) }
      img.src = asset.url
    }
  })
}

// ─── Library Panel ────────────────────────────────────────────────────────────

function LibraryPanel({ existingIds, onAdd, onAddMultiple, onGenerate }: {
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

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ['projects'], queryFn: projectsApi.list })
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

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-white/10 space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск слайдов..."
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg border border-white/10 bg-white/5 text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => setSelectMode((v) => !v)}
            className={cn('text-[10px] px-2 py-1.5 rounded-lg border transition-colors whitespace-nowrap shrink-0',
              selectMode ? 'bg-brand-600 text-white border-brand-600' : 'border-white/20 text-white/50 hover:border-brand-500 hover:text-white')}
          >{selectMode ? 'Отмена' : 'Выбрать'}</button>
          <button
            onClick={onGenerate}
            className="p-1.5 rounded-lg border border-white/20 text-white/40 hover:text-brand-400 hover:border-brand-500/50 hover:bg-brand-600/10 transition-colors shrink-0"
            title="AI-генерация слайда"
          ><Sparkles className="w-3.5 h-3.5" /></button>
        </div>

        {projects.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setProjectId(undefined)}
              className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors',
                projectId === undefined ? 'bg-brand-600/30 text-brand-400 border-brand-500/50' : 'border-white/15 text-white/40 hover:border-white/30')}
            >Все</button>
            {projects.map((p) => (
              <button key={p.id} onClick={() => setProjectId(projectId === p.id ? undefined : p.id)}
                className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[100px]',
                  projectId === p.id ? 'bg-brand-600/20 text-brand-400 border-brand-500/40' : 'border-white/15 text-white/40 hover:border-white/30')}
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
          <div className="text-center py-8">
            <Search className="w-8 h-8 mx-auto mb-2 text-white/10" />
            <p className="text-xs text-white/30">Ничего не найдено</p>
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
                    className={cn(added && !selectMode && 'opacity-40 cursor-not-allowed')}
                  />
                  <p className="text-[10px] text-white/40 mt-1 leading-tight line-clamp-1 px-0.5">{slide.title || '(без названия)'}</p>
                  {selectMode && !added && (
                    <div
                      className={cn('absolute inset-0 rounded-lg border-2 transition-all cursor-pointer',
                        isSelected ? 'border-brand-500 bg-brand-600/15' : 'border-transparent hover:border-brand-500/50')}
                      onClick={() => toggleSelect(slide)}
                    >
                      <div className={cn('absolute top-1.5 left-1.5 w-4 h-4 rounded border-2 flex items-center justify-center',
                        isSelected ? 'bg-brand-600 border-brand-600' : 'bg-white/10 border-white/30')}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </div>
                  )}
                  {!selectMode && (added ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                      <div className="flex items-center gap-1 bg-brand-600/90 text-white text-[10px] px-2 py-0.5 rounded-full">
                        <Check className="w-2.5 h-2.5" /> Добавлен
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onAdd(slide)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-600/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-brand-500 transition-all"
                    ><Plus className="w-3 h-3" /></button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectMode && selected.size > 0 && (
        <div className="px-3 py-2 border-t border-white/10 bg-brand-600/10">
          <button
            onClick={() => { onAddMultiple(Array.from(selected.values())); setSelected(new Map()); setSelectMode(false) }}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить {selected.size} {selected.size === 1 ? 'слайд' : selected.size < 5 ? 'слайда' : 'слайдов'}
          </button>
        </div>
      )}

      {!isSearching && totalPages > 1 && (
        <div className="px-3 py-2 border-t border-white/10 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1 rounded hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-4 h-4 text-white/40" /></button>
          <span className="text-[10px] text-white/30">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1 rounded hover:bg-white/10 disabled:opacity-30"><ChevronRight className="w-4 h-4 text-white/40" /></button>
        </div>
      )}
      {!isSearching && (
        <div className="pb-2 text-center">
          <span className="text-[10px] text-white/25">{total} слайдов в библиотеке</span>
        </div>
      )}
    </div>
  )
}

// ─── Media Panel ──────────────────────────────────────────────────────────────

function MediaPanel({ onAdd }: { onAdd: (asset: MediaAsset) => void }) {
  const [selectedFolder, setSelectedFolder] = useState<number | 'all' | 'unfoldered'>('all')
  const { data: folders = [] } = useQuery<MediaFolder[]>({ queryKey: ['media-folders'], queryFn: mediaApi.listFolders })
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['media-assets', selectedFolder],
    queryFn: () => {
      if (selectedFolder === 'all') return mediaApi.listAssets()
      if (selectedFolder === 'unfoldered') return mediaApi.listAssets({ unfoldered: true })
      return mediaApi.listAssets({ folder_id: selectedFolder })
    },
  })

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>
  if (!isLoading && assets.length === 0 && folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-white/30 p-6">
        <Film className="w-10 h-10 opacity-20" />
        <div className="text-center">
          <p className="text-xs font-medium text-white/40">Нет медиафайлов</p>
          <p className="text-[10px] mt-1 text-white/25">Загрузите GIF, видео или фото в разделе «Медиа»</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {folders.length > 0 && (
        <div className="p-2 border-b border-white/10 flex flex-wrap gap-1">
          {(['all', 'unfoldered'] as const).map((v) => (
            <button key={v} onClick={() => setSelectedFolder(v)}
              className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors', selectedFolder === v ? 'bg-brand-600/30 text-brand-400 border-brand-500/40' : 'border-white/20 text-white/50 hover:border-brand-400/50')}
            >{v === 'all' ? 'Все' : 'Без папки'}</button>
          ))}
          {folders.map((f) => (
            <button key={f.id} onClick={() => setSelectedFolder(f.id)}
              className={cn('flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors truncate max-w-[90px]', selectedFolder === f.id ? 'bg-brand-600/30 text-brand-400 border-brand-500/40' : 'border-white/20 text-white/50 hover:border-brand-400/50')}
            >
              <span className="truncate">{f.name}</span>
              {f.asset_count > 0 && <span className="shrink-0 text-white/30">{f.asset_count}</span>}
            </button>
          ))}
        </div>
      )}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-white/30 p-4">
          <Film className="w-8 h-8 opacity-20" />
          <p className="text-xs">Нет файлов в папке</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          <p className="text-[10px] text-white/30 px-1 pb-2">Нажмите — добавить на слайд</p>
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button key={asset.id} onClick={() => onAdd(asset)}
                className="relative group rounded-lg overflow-hidden border border-white/10 hover:border-brand-400/60 transition-all bg-white/5 hover:shadow-md"
                style={{ aspectRatio: '16/9' }} title={asset.name}
              >
                {asset.file_type === 'video'
                  ? <video src={asset.url} className="w-full h-full object-cover" muted preload="metadata" />
                  : <img src={asset.url} alt={asset.name} className="w-full h-full object-cover" />
                }
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <Plus className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-lg" />
                </div>
                <span className="absolute top-1 left-1 text-[8px] bg-black/60 text-white px-1 py-0.5 rounded font-medium uppercase">
                  {asset.file_type}
                </span>
                <p className="absolute bottom-0 left-0 right-0 text-[9px] text-white bg-black/50 px-1.5 py-0.5 truncate">{asset.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Overlay Item ─────────────────────────────────────────────────────────────

function OverlayItem({ overlay, isSelected, onMouseDown, onDelete }: {
  overlay: SlideOverlay
  isSelected: boolean
  onMouseDown: (e: React.MouseEvent, mode: 'move' | 'resize') => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'absolute select-none',
        isSelected ? 'outline outline-2 outline-brand-500 outline-offset-0 cursor-move z-10' : 'cursor-pointer hover:outline hover:outline-1 hover:outline-brand-300 z-[5]'
      )}
      style={{ left: `${overlay.x}%`, top: `${overlay.y}%`, width: `${overlay.w}%`, height: `${overlay.h}%` }}
      onMouseDown={(e) => onMouseDown(e, 'move')}
      onClick={(e) => e.stopPropagation()}
    >
      {overlay.file_type === 'video'
        ? <video src={overlay.url} autoPlay loop muted playsInline className="w-full h-full object-contain pointer-events-none" />
        : <img src={overlay.url} alt="" className="w-full h-full object-contain pointer-events-none" draggable={false} />
      }
      {isSelected && (
        <>
          <button
            className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 z-20 cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          ><X className="w-3 h-3" /></button>
          <div
            className="absolute bottom-0 right-0 w-5 h-5 bg-brand-500 hover:bg-brand-400 cursor-se-resize rounded-tl z-20 flex items-center justify-center"
            onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, 'resize') }}
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

// ─── Export Dropdown ──────────────────────────────────────────────────────────

function ExportMenu({ onExport, isExporting, disabled }: {
  onExport: (fmt: 'pptx' | 'pdf') => void
  isExporting: boolean
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        disabled={disabled || isExporting}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-900 text-white text-sm font-medium hover:bg-brand-800 disabled:opacity-50 transition-colors"
      >
        {isExporting ? <Spinner size="sm" className="border-white border-t-transparent" /> : <Download className="w-4 h-4" />}
        Экспорт
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 min-w-[140px]">
          <button
            onClick={() => { onExport('pptx'); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          ><Download className="w-4 h-4 text-gray-400" /> PPTX</button>
          <button
            onClick={() => { onExport('pdf'); setOpen(false) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          ><Download className="w-4 h-4 text-gray-400" /> PDF</button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
  const [filmstripCollapsed, setFilmstripCollapsed] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [isCreatingTheses, setIsCreatingTheses] = useState(false)
  const [showSlideshow, setShowSlideshow] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [editingSlideId, setEditingSlideId] = useState<number | null>(null)
  const [rightTab, setRightTab] = useState<'library' | 'media'>(
    searchParams.get('tab') === 'library' ? 'library' : 'library'
  )
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const overlaysRef = useRef<Record<string, SlideOverlay[]>>({})
  const dragRef = useRef<{
    overlayId: string; slideId: string; mode: 'move' | 'resize'
    startX: number; startY: number; startOverlay: SlideOverlay
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
    onSuccess: (updated: Assembly) => { queryClient.setQueryData(['assembly', assemblyId], updated) },
    onError: () => toast.error('Не удалось сохранить изменения'),
  })

  saveOverlaysRef.current = () => { updateMutation.mutate({ overlays: overlaysRef.current }) }

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
    const onUp = () => { if (!dragRef.current) return; dragRef.current = null; saveOverlaysRef.current() }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent, overlayId: string, slideId: string, mode: 'move' | 'resize') => {
    e.preventDefault(); e.stopPropagation()
    setSelectedOverlayId(overlayId)
    const overlay = overlaysRef.current[slideId]?.find((o) => o.id === overlayId)
    if (!overlay) return
    dragRef.current = { overlayId, slideId, mode, startX: e.clientX, startY: e.clientY, startOverlay: { ...overlay } }
  }, [])

  const handleAddOverlay = useCallback(async (asset: MediaAsset) => {
    const slideId = String(localSlides[selectedIndex]?.id)
    if (!slideId || slideId === 'undefined') { toast.error('Выберите слайд'); return }
    const naturalAR = await getNaturalAR(asset)
    const w = 35
    const h = naturalAR ? Math.max(5, Math.min(80, Math.round(w * (16 / 9) / naturalAR))) : 22
    const newOverlay: SlideOverlay = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      asset_id: asset.id, url: asset.url, file_type: asset.file_type,
      x: 5, y: Math.max(5, Math.min(95 - h, 10)), w, h,
    }
    const newOverlays = { ...overlaysRef.current, [slideId]: [...(overlaysRef.current[slideId] || []), newOverlay] }
    setOverlays(newOverlays)
    setSelectedOverlayId(newOverlay.id)
    updateMutation.mutate({ overlays: newOverlays })
    toast.success('Медиа добавлено', { duration: 1500 })
  }, [localSlides, selectedIndex, updateMutation])

  const deleteOverlay = useCallback((slideId: string, overlayId: string) => {
    const newOverlays = { ...overlaysRef.current, [slideId]: (overlaysRef.current[slideId] || []).filter((o) => o.id !== overlayId) }
    setOverlays(newOverlays); setSelectedOverlayId(null)
    updateMutation.mutate({ overlays: newOverlays })
  }, [updateMutation])

  const handleReorder = (newSlides: Slide[]) => { setLocalSlides(newSlides); updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) }) }
  const handleRemove = (slideId: number) => {
    const newSlides = localSlides.filter((s) => s.id !== slideId)
    setLocalSlides(newSlides)
    setSelectedIndex(Math.min(selectedIndex, newSlides.length - 1))
    updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) })
  }
  const handleAddSlide = (slide: Slide) => {
    if (localSlides.some((s) => s.id === slide.id)) return
    const newSlides = [...localSlides, slide]
    setLocalSlides(newSlides); setSelectedIndex(newSlides.length - 1)
    updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) })
    toast.success('Слайд добавлен', { duration: 1500 })
  }
  const handleAddMultiple = (slides: Slide[]) => {
    const toAdd = slides.filter((s) => !localSlides.some((e) => e.id === s.id))
    if (!toAdd.length) return
    const newSlides = [...localSlides, ...toAdd]
    setLocalSlides(newSlides); setSelectedIndex(newSlides.length - 1)
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
      await navigator.clipboard.writeText(`${window.location.origin}/share/${share_token}`)
      toast.success('Ссылка скопирована')
    } catch { toast.error('Не удалось создать ссылку') }
    finally { setIsSharing(false) }
  }
  const handleExport = async (format: 'pptx' | 'pdf') => {
    setIsExporting(true)
    try { await assemblyApi.export(assemblyId, format); toast.success(`${format.toUpperCase()} экспортирован`) }
    catch { toast.error('Ошибка экспорта') }
    finally { setIsExporting(false) }
  }

  if (isLoading) return <div className="flex items-center justify-center h-full"><Spinner size="lg" /></div>
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
  const isSaving = updateMutation.isPending

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-950">

      {/* ── Top toolbar ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-3 px-4 h-[52px] bg-gray-900 border-b border-white/10">
        {/* Back */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Назад</span>
        </button>

        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* Title */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-2 max-w-sm">
              <input
                autoFocus
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') { setEditingTitle(false); setTitleValue(assembly?.title || '') } }}
                className="flex-1 bg-white/10 text-white text-sm font-medium rounded-lg px-2.5 py-1 border border-white/20 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/50"
              />
              <button onClick={handleTitleSave} className="p-1 rounded text-brand-400 hover:text-brand-300">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingTitle(true)}
              className="group flex items-center gap-1.5 max-w-sm text-left"
            >
              <span className="text-sm font-semibold text-white truncate group-hover:text-gray-200 transition-colors">
                {titleValue || 'Без названия'}
              </span>
              <Edit2 className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
            </button>
          )}
        </div>

        {/* Save status */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSaving ? (
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Spinner size="sm" className="border-gray-500 border-t-transparent w-3 h-3" />
              Сохранение…
            </span>
          ) : (
            <span className="text-[11px] text-gray-600">
              {localSlides.length} {localSlides.length === 1 ? 'слайд' : localSlides.length < 5 ? 'слайда' : 'слайдов'}
            </span>
          )}
        </div>

        <div className="w-px h-5 bg-white/10 shrink-0" />

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Slideshow */}
          {localSlides.length > 0 && (
            <button
              onClick={() => setShowSlideshow(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 text-sm transition-colors"
            >
              <Play className="w-4 h-4" />
              <span className="hidden md:inline">Слайд-шоу</span>
            </button>
          )}

          {/* Theses */}
          <button
            onClick={async () => {
              setIsCreatingTheses(true)
              try { const s = await thesesApi.create(assemblyId); navigate(`/theses/${s.id}`) }
              catch { toast.error('Не удалось создать тезисы') }
              finally { setIsCreatingTheses(false) }
            }}
            disabled={isCreatingTheses || localSlides.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 text-sm transition-colors disabled:opacity-40"
            title="Тезисы к выступлению"
          >
            {isCreatingTheses ? <Spinner size="sm" className="border-gray-400 border-t-transparent" /> : <FileText className="w-4 h-4" />}
            <span className="hidden md:inline">Тезисы</span>
          </button>

          {/* Share */}
          <button
            onClick={handleShare}
            disabled={isSharing || localSlides.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-gray-300 hover:text-white hover:border-white/40 text-sm transition-colors disabled:opacity-40"
          >
            {isSharing ? <Spinner size="sm" className="border-gray-400 border-t-transparent" /> : <Share2 className="w-4 h-4" />}
            <span className="hidden md:inline">Поделиться</span>
          </button>

          {/* Export */}
          <ExportMenu onExport={handleExport} isExporting={isExporting} disabled={localSlides.length === 0} />
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: filmstrip (dark) ─────────────────────────────────────── */}
        <aside className={cn(
          'shrink-0 flex flex-col bg-gray-900 border-r border-white/10 transition-all duration-200',
          filmstripCollapsed ? 'w-[48px]' : 'w-[200px]'
        )}>
          {/* Filmstrip header */}
          <div className={cn(
            'flex items-center gap-2 px-2 py-2.5 border-b border-white/10 shrink-0',
            filmstripCollapsed && 'justify-center'
          )}>
            {!filmstripCollapsed && (
              <button
                onClick={() => { setRightTab('library') }}
                className="flex-1 flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-white transition-colors px-1"
              >
                <Plus className="w-3 h-3" />
                Добавить
              </button>
            )}
            <button
              onClick={() => setFilmstripCollapsed((v) => !v)}
              className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300 transition-colors shrink-0"
              title={filmstripCollapsed ? 'Развернуть' : 'Свернуть'}
            >
              {filmstripCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          {/* Slide count when collapsed */}
          {filmstripCollapsed && (
            <div className="flex flex-col items-center pt-3 gap-2">
              <span className="text-[10px] text-gray-600 font-mono">{localSlides.length}</span>
              <button
                onClick={() => { setFilmstripCollapsed(false); setRightTab('library') }}
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
                title="Добавить слайды"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Filmstrip list */}
          {!filmstripCollapsed && (
            <>
              <div className="flex-1 overflow-y-auto">
                {localSlides.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
                    <div className="w-16 h-10 rounded border-2 border-dashed border-white/10 flex items-center justify-center">
                      <Plus className="w-4 h-4 text-white/20" />
                    </div>
                    <button
                      onClick={() => setRightTab('library')}
                      className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors text-center"
                    >
                      Добавить слайды из библиотеки
                    </button>
                  </div>
                ) : (
                  <FilmStrip
                    slides={localSlides}
                    selectedIndex={selectedIndex}
                    onSelect={setSelectedIndex}
                    onReorder={handleReorder}
                    onRemove={handleRemove}
                    dark
                  />
                )}
              </div>
            </>
          )}
        </aside>

        {/* ── Center: canvas ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-950">

          {/* Slide navigation bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-1">
              <button
                disabled={selectedIndex === 0}
                onClick={() => setSelectedIndex(selectedIndex - 1)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-white/10 disabled:opacity-30 transition-colors"
              ><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs text-gray-500 min-w-[52px] text-center font-mono">
                {localSlides.length > 0 ? `${selectedIndex + 1} / ${localSlides.length}` : '—'}
              </span>
              <button
                disabled={selectedIndex >= localSlides.length - 1}
                onClick={() => setSelectedIndex(selectedIndex + 1)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-white/10 disabled:opacity-30 transition-colors"
              ><ChevronRight className="w-4 h-4" /></button>
            </div>

            {selectedSlide && (
              <p className="text-xs text-gray-500 truncate flex-1 mx-3 text-center hidden sm:block">
                {selectedSlide.title || ''}
              </p>
            )}

            {/* Edit button */}
            {selectedSlide && !editingSlideId && (
              <button
                onClick={() => setEditingSlideId(selectedSlide.id)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" /> Редактировать текст
              </button>
            )}
          </div>

          {/* Main canvas area */}
          {editingSlideId !== null && selectedSlide ? (
            <div className="flex-1 overflow-hidden bg-gray-900">
              <SlideTextEditor
                slideId={editingSlideId}
                thumbnailUrl={selectedSlide.thumbnail_url}
                onClose={() => setEditingSlideId(null)}
                onSaved={(thumbVersion) => {
                  setEditingSlideId(null)
                  if (thumbVersion && editingSlideId !== null) {
                    setLocalSlides((prev) =>
                      prev.map((s) =>
                        s.id === editingSlideId
                          ? { ...s, thumbnail_url: `${s.thumbnail_url.split('?')[0]}?t=${thumbVersion}` }
                          : s
                      )
                    )
                  }
                }}
              />
            </div>
          ) : (
            <div
              className="flex-1 flex items-center justify-center p-8 overflow-auto"
              onClick={() => setSelectedOverlayId(null)}
            >
              {selectedSlide ? (
                <div className="w-full max-w-4xl flex flex-col items-center gap-4">
                  {/* Slide frame */}
                  <div
                    ref={containerRef}
                    className="relative w-full rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
                  >
                    {selectedSlide.video_url ? (
                      <video
                        src={selectedSlide.video_url}
                        controls
                        className="w-full object-contain bg-black"
                        style={{ aspectRatio: '16/9' }}
                        poster={selectedSlide.thumbnail_url || undefined}
                      />
                    ) : (
                      <SlideThumbnail slide={selectedSlide} />
                    )}

                    {currentOverlays.map((overlay) => (
                      <OverlayItem
                        key={overlay.id}
                        overlay={overlay}
                        isSelected={selectedOverlayId === overlay.id}
                        onMouseDown={(e, mode) => handleOverlayMouseDown(e, overlay.id, currentSlideId!, mode)}
                        onDelete={() => deleteOverlay(currentSlideId!, overlay.id)}
                      />
                    ))}
                  </div>

                  {/* Below slide: hints */}
                  {currentOverlays.length > 0 && !selectedOverlayId && (
                    <p className="text-[11px] text-gray-600">
                      Нажмите на медиаэлемент → перетащите или измените размер (угол ▟)
                    </p>
                  )}
                  {selectedOverlayId && (
                    <button
                      onClick={() => setSelectedOverlayId(null)}
                      className="text-[11px] text-gray-500 hover:text-gray-300 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      Снять выделение
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-5">
                  <div className="w-32 h-20 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center">
                    <Plus className="w-8 h-8 text-white/10" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-500 mb-1">Нет слайдов</p>
                    <button onClick={() => setRightTab('library')} className="text-sm text-brand-400 hover:text-brand-300 transition-colors">
                      Добавить слайды из библиотеки →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel ──────────────────────────────────────────────────── */}
        <aside className={cn(
          'shrink-0 flex bg-sidebar border-l border-white/10 transition-all duration-200',
          rightCollapsed ? 'w-[48px] flex-col' : cn('flex-col', rightTab === 'library' ? 'w-[340px]' : 'w-[300px]')
        )}>
          {/* Header: tabs + collapse toggle */}
          <div className={cn(
            'border-b border-white/10 shrink-0',
            rightCollapsed ? 'flex flex-col items-center gap-1 py-2 px-1' : 'flex items-center'
          )}>
            {rightCollapsed ? (
              <>
                <button
                  onClick={() => setRightCollapsed(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
                  title="Развернуть панель"
                >
                  <PanelLeftOpen className="w-4 h-4 rotate-180" />
                </button>
                <div className="w-full h-px bg-white/10 my-1" />
                {([
                  { key: 'library' as const, icon: BookImage, label: 'Библиотека' },
                  { key: 'media' as const, icon: Film, label: 'Медиа' },
                ]).map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => { setRightTab(key); setRightCollapsed(false) }}
                    title={label}
                    className={cn(
                      'relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                      rightTab === key ? 'bg-brand-600/30 text-brand-400' : 'text-white/30 hover:bg-white/10 hover:text-white/70'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {key === 'media' && currentOverlays.length > 0 && (
                      <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-brand-500" />
                    )}
                  </button>
                ))}
              </>
            ) : (
              <>
                {([
                  { key: 'library' as const, label: 'Библиотека', icon: BookImage },
                  { key: 'media' as const, label: 'Медиа', icon: Film },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setRightTab(key)}
                    className={cn(
                      'relative flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors border-b-2',
                      rightTab === key
                        ? 'text-brand-400 border-brand-500'
                        : 'text-white/40 hover:text-white/70 border-transparent'
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {key === 'media' && currentOverlays.length > 0 && (
                      <span className="absolute top-2 right-1 w-3.5 h-3.5 rounded-full bg-brand-500 text-white text-[8px] flex items-center justify-center font-bold">
                        {currentOverlays.length}
                      </span>
                    )}
                  </button>
                ))}
                <button
                  onClick={() => setRightCollapsed(true)}
                  className="shrink-0 w-8 h-8 mx-1 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
                  title="Свернуть панель"
                >
                  <PanelLeftClose className="w-4 h-4 rotate-180" />
                </button>
              </>
            )}
          </div>

          {/* Tab content */}
          {!rightCollapsed && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {rightTab === 'library' && (
                <LibraryPanel
                  existingIds={existingIds}
                  onAdd={handleAddSlide}
                  onAddMultiple={handleAddMultiple}
                  onGenerate={() => setShowGenerateModal(true)}
                />
              )}

              {rightTab === 'media' && (
                <div className="flex flex-col h-full overflow-hidden">
                  {!selectedSlide ? (
                    <div className="flex flex-col items-center justify-center flex-1 gap-2 p-6">
                      <Image className="w-8 h-8 text-white/10" />
                      <p className="text-xs text-center text-white/30">Выберите слайд, чтобы добавить медиа</p>
                    </div>
                  ) : (
                    <>
                      {currentOverlays.length > 0 && (
                        <div className="p-3 border-b border-white/10 shrink-0">
                          <p className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2">
                            На слайде ({currentOverlays.length})
                          </p>
                          <div className="flex flex-col gap-1">
                            {currentOverlays.map((overlay) => (
                              <div
                                key={overlay.id}
                                className={cn(
                                  'flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors',
                                  selectedOverlayId === overlay.id
                                    ? 'bg-brand-600/20 border border-brand-500/40'
                                    : 'border border-transparent hover:bg-white/5'
                                )}
                                onClick={() => setSelectedOverlayId(selectedOverlayId === overlay.id ? null : overlay.id)}
                              >
                                <div className="w-8 h-5 rounded overflow-hidden shrink-0 bg-white/10">
                                  {overlay.file_type === 'video'
                                    ? <video src={overlay.url} className="w-full h-full object-cover" muted />
                                    : <img src={overlay.url} alt="" className="w-full h-full object-cover" />
                                  }
                                </div>
                                <span className="text-[10px] text-white/50 flex-1 uppercase font-medium">{overlay.file_type}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteOverlay(currentSlideId!, overlay.id) }}
                                  className="p-1 rounded text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                ><Trash2 className="w-3 h-3" /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <MediaPanel onAdd={handleAddOverlay} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}
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
          onSlideGenerated={(slide) => { handleAddSlide(slide); setShowGenerateModal(false) }}
        />
      )}
    </div>
  )
}
