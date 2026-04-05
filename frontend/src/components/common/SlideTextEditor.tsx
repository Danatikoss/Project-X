import { useState, useEffect, useRef } from 'react'
import { Check, X, Pencil, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../utils/cn'
import { Spinner } from './Spinner'
import { libraryApi } from '../../api/client'
import type { TextElement } from '../../types'

interface SlideTextEditorProps {
  slideId: number
  thumbnailUrl: string
  onClose: () => void
  onSaved?: () => void
}

export function SlideTextEditor({ slideId, thumbnailUrl, onClose, onSaved }: SlideTextEditorProps) {
  const [elements, setElements] = useState<TextElement[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(960)

  useEffect(() => {
    setLoading(true)
    setEdits({})
    libraryApi.getTextElements(slideId)
      .then((data) => setElements(data.elements))
      .catch(() => toast.error('Не удалось загрузить текстовые блоки'))
      .finally(() => setLoading(false))
  }, [slideId])

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(([e]) => setContainerW(e.contentRect.width))
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const hasChanges = Object.keys(edits).length > 0

  const handleSave = async () => {
    if (!hasChanges) { onClose(); return }
    setSaving(true)
    try {
      await libraryApi.saveTextEdits(slideId, edits)
      toast.success('Изменения сохранены')
      onSaved?.()
      onClose()
    } catch {
      toast.error('Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  // Scale font size: PPTX slide width ≈ 960pt, map to container px
  const scale = containerW / 960

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-brand-600" />
          <span className="text-sm font-medium text-gray-700">Редактирование текста</span>
          {hasChanges && (
            <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
              несохранено
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
          >
            {saving
              ? <Spinner size="sm" className="border-white border-t-transparent" />
              : <Check className="w-4 h-4" />}
            Сохранить
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <Spinner size="lg" />
            <p className="text-sm">Загрузка блоков…</p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative w-full max-w-4xl rounded-xl overflow-hidden shadow-xl border border-gray-200"
            style={{ aspectRatio: '16/9' }}
            onClick={() => setActiveId(null)}
          >
            {/* Base thumbnail */}
            <img
              src={thumbnailUrl}
              alt="slide"
              className="w-full h-full object-cover select-none pointer-events-none"
              draggable={false}
            />

            {/* Editable text overlays */}
            {elements.map((el) => {
              const isActive = activeId === el.id
              const isEdited = el.id in edits
              const currentText = isEdited ? edits[el.id] : el.text
              const fontPx = Math.max(8, Math.round(el.font_size * scale))

              return (
                <div
                  key={el.id}
                  className={cn(
                    'absolute transition-all duration-100',
                    isActive
                      ? 'z-20 ring-2 ring-brand-500'
                      : isEdited
                      ? 'z-10 ring-1 ring-green-400 hover:ring-green-500'
                      : 'z-10 hover:ring-1 hover:ring-brand-300 cursor-pointer'
                  )}
                  style={{
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.w}%`,
                    height: `${el.h}%`,
                  }}
                  onClick={(e) => { e.stopPropagation(); setActiveId(el.id) }}
                >
                  <textarea
                    value={currentText}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [el.id]: e.target.value }))}
                    onFocus={() => setActiveId(el.id)}
                    onBlur={() => setActiveId(null)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'w-full h-full resize-none border-0 outline-none p-1 leading-tight',
                      isActive || isEdited
                        ? 'bg-white/90 text-gray-900'
                        : 'bg-transparent text-transparent caret-transparent cursor-pointer'
                    )}
                    style={{
                      fontSize: `${fontPx}px`,
                      fontWeight: el.font_bold ? 'bold' : 'normal',
                      textAlign: el.font_align,
                      lineHeight: 1.25,
                      color: isActive || isEdited ? el.font_color : 'transparent',
                    }}
                    spellCheck={false}
                  />
                </div>
              )
            })}

            {/* Empty state */}
            {elements.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="bg-white/95 rounded-xl px-6 py-5 text-center shadow-lg max-w-xs">
                  <RefreshCw className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700">Нет редактируемых блоков</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Слайд не содержит текста в PPTX-формате или был загружен как PDF
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!loading && elements.length > 0 && (
        <p className="text-center text-xs text-gray-400 pb-3 shrink-0">
          Нажмите на текстовый блок чтобы редактировать · Нажмите вне блока чтобы снять выделение
        </p>
      )}
    </div>
  )
}
