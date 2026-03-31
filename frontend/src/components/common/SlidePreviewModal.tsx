import { X, FolderOpen, ChevronLeft, ChevronRight, Tag, Plus, FolderSymlink, Play } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { libraryApi, projectsApi } from '../../api/client'
import { SlideThumbnail } from './SlideCard'
import type { Slide, Project } from '../../types'
import { cn } from '../../utils/cn'

interface SlidePreviewModalProps {
  slide: Slide
  slides?: Slide[]
  onClose: () => void
  onNavigate?: (slide: Slide) => void
  onSlideUpdate?: (updated: Slide) => void
  onStartSlideshow?: (index: number) => void
}

const LABEL_SUGGESTIONS = [
  'Титульный', 'Заключительный', 'Ключевые данные',
  'Устаревшие цифры', 'Контактный', 'Цели', 'Результаты',
]

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function SlidePreviewModal({ slide, slides, onClose, onNavigate, onSlideUpdate, onStartSlideshow }: SlidePreviewModalProps) {
  const queryClient = useQueryClient()
  const currentIdx = slides?.findIndex((s) => s.id === slide.id) ?? -1
  const hasPrev = currentIdx > 0
  const hasNext = slides && currentIdx < slides.length - 1

  const [labelInput, setLabelInput] = useState('')
  const [showLabelInput, setShowLabelInput] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const labelInputRef = useRef<HTMLInputElement>(null)

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof libraryApi.updateSlide>[1]) =>
      libraryApi.updateSlide(slide.id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['slides'] })
      queryClient.invalidateQueries({ queryKey: ['search'] })
      queryClient.invalidateQueries({ queryKey: ['labels'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onSlideUpdate?.(updated)
    },
    onError: () => toast.error('Не удалось сохранить'),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showLabelInput || showFolderPicker) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && hasPrev && slides) onNavigate?.(slides[currentIdx - 1])
      if (e.key === 'ArrowRight' && hasNext && slides) onNavigate?.(slides[currentIdx + 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slide, currentIdx, showLabelInput, showFolderPicker])

  useEffect(() => {
    if (showLabelInput) labelInputRef.current?.focus()
  }, [showLabelInput])

  const currentLabels: string[] = slide.labels || []

  function addLabel(lbl: string) {
    const trimmed = lbl.trim()
    if (!trimmed || currentLabels.includes(trimmed)) return
    updateMutation.mutate({ labels: [...currentLabels, trimmed] })
    setLabelInput('')
    setShowLabelInput(false)
  }

  function removeLabel(lbl: string) {
    updateMutation.mutate({ labels: currentLabels.filter((l) => l !== lbl) })
  }

  function assignFolder(projectId: number | null) {
    updateMutation.mutate({ project_id: projectId })
    setShowFolderPicker(false)
    toast.success(projectId ? 'Добавлено в папку' : 'Убрано из папки')
  }

  const suggestions = LABEL_SUGGESTIONS.filter(
    (s) => !currentLabels.includes(s) &&
      (labelInput === '' || s.toLowerCase().includes(labelInput.toLowerCase()))
  )

  const currentProject = projects.find((p) => p.id === slide.project_id)

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 leading-tight">
              {slide.title || '(без названия)'}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {slide.source_filename && (
                <span className="text-xs text-gray-400">{slide.source_filename}</span>
              )}
              {slide.language && (
                <span className="text-xs text-gray-400 uppercase">{slide.language}</span>
              )}
              {slide.created_at && (
                <span className="text-xs text-gray-400">Добавлен: {formatDate(slide.created_at)}</span>
              )}

              {/* Folder badge / picker */}
              <div className="relative">
                <button
                  onClick={() => setShowFolderPicker((v) => !v)}
                  className={cn(
                    'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors',
                    currentProject
                      ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  )}
                >
                  {currentProject ? (
                    <>
                      <FolderOpen className="w-3 h-3" style={{ color: currentProject.color }} />
                      {currentProject.name}
                    </>
                  ) : (
                    <>
                      <FolderSymlink className="w-3 h-3" />
                      В папку
                    </>
                  )}
                </button>

                {showFolderPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px] py-1">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => assignFolder(p.id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50',
                          slide.project_id === p.id && 'font-medium text-brand-700'
                        )}
                      >
                        <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: p.color }} />
                        {p.name}
                      </button>
                    ))}
                    {slide.project_id && (
                      <button
                        onClick={() => assignFolder(null)}
                        className="w-full px-3 py-1.5 text-xs text-left text-red-500 hover:bg-red-50 border-t border-gray-100 mt-1"
                      >
                        Убрать из папки
                      </button>
                    )}
                    {projects.length === 0 && (
                      <p className="px-3 py-2 text-xs text-gray-400">Папок нет</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Slide preview */}
        <div className="relative bg-gray-50">
          {slide.video_url ? (
            <video
              src={slide.video_url}
              controls
              className="w-full object-contain max-h-[55vh]"
              poster={slide.thumbnail_url || undefined}
            />
          ) : (
            <SlideThumbnail slide={slide} className="max-h-[55vh]" />
          )}

          {/* Slideshow button */}
          {onStartSlideshow && slides && slides.length > 1 && (
            <button
              onClick={() => { onClose(); onStartSlideshow(currentIdx >= 0 ? currentIdx : 0) }}
              className="absolute bottom-3 left-3 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors shadow-md"
            >
              <Play className="w-3 h-3" />
              Слайд-шоу
            </button>
          )}

          {hasPrev && (
            <button
              onClick={() => onNavigate?.(slides![currentIdx - 1])}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => onNavigate?.(slides![currentIdx + 1])}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center hover:bg-white transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 flex flex-col gap-2">
          {/* Summary + AI tags */}
          <div className="flex items-start gap-4">
            {slide.summary && (
              <p className="flex-1 text-sm text-gray-600 leading-relaxed">{slide.summary}</p>
            )}
            {slide.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-end shrink-0">
                {slide.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* User labels */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            {currentLabels.map((lbl) => (
              <span
                key={lbl}
                className="flex items-center gap-1 text-xs px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full border border-teal-200"
              >
                {lbl}
                <button
                  onClick={() => removeLabel(lbl)}
                  className="hover:text-red-500 transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}

            {showLabelInput ? (
              <div className="relative">
                <input
                  ref={labelInputRef}
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && labelInput.trim()) addLabel(labelInput)
                    if (e.key === 'Escape') { setShowLabelInput(false); setLabelInput('') }
                  }}
                  placeholder="Название метки"
                  className="text-xs px-2 py-0.5 rounded border border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-400 w-32"
                />
                {suggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[150px]">
                    {suggestions.slice(0, 5).map((s) => (
                      <button
                        key={s}
                        onMouseDown={(e) => { e.preventDefault(); addLabel(s) }}
                        className="w-full text-left text-xs px-3 py-1 hover:bg-teal-50 hover:text-teal-700"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowLabelInput(true)}
                className="flex items-center gap-0.5 text-xs text-teal-600 hover:text-teal-800 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Метка
              </button>
            )}
          </div>
        </div>

        {/* Counter */}
        {slides && slides.length > 1 && (
          <div className="px-4 pb-3 text-xs text-gray-400 text-center">
            {currentIdx + 1} / {slides.length}
          </div>
        )}
      </div>
    </div>
  )
}
