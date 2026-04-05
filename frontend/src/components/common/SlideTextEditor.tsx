import { useState, useEffect } from 'react'
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
  onSaved?: (thumbVersion: number | null) => void
}

export function SlideTextEditor({ slideId, thumbnailUrl, onClose, onSaved }: SlideTextEditorProps) {
  const [elements, setElements] = useState<TextElement[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setEdits({})
    setActiveId(null)
    libraryApi.getTextElements(slideId)
      .then((data) => setElements(data.elements))
      .catch(() => toast.error('Не удалось загрузить текстовые блоки'))
      .finally(() => setLoading(false))
  }, [slideId])

  const hasChanges = Object.keys(edits).length > 0

  const handleSave = async () => {
    if (!hasChanges) { onClose(); return }
    setSaving(true)
    try {
      const result = await libraryApi.saveTextEdits(slideId, edits)
      toast.success('Изменения сохранены')
      onSaved?.(result.thumb_version)
      onClose()
    } catch {
      toast.error('Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const activeEl = elements.find((e) => e.id === activeId)

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
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
          <Spinner size="lg" />
          <p className="text-sm">Загрузка блоков…</p>
        </div>
      ) : elements.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-xs">
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
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: slide preview with highlight */}
          <div className="flex-1 bg-gray-100 flex items-center justify-center p-6 overflow-hidden">
            <div className="relative w-full max-w-2xl rounded-xl overflow-hidden shadow-xl border border-gray-200"
              style={{ aspectRatio: '16/9' }}>
              <img
                src={thumbnailUrl}
                alt="slide"
                className="w-full h-full object-contain select-none pointer-events-none"
                draggable={false}
              />
              {/* Highlight box for active element */}
              {activeEl && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: `${activeEl.x}%`,
                    top: `${activeEl.y}%`,
                    width: `${activeEl.w}%`,
                    height: `${activeEl.h}%`,
                    border: '2px solid #3b82f6',
                    boxSizing: 'border-box',
                    boxShadow: '0 0 0 1px rgba(59,130,246,0.3)',
                    borderRadius: '2px',
                  }}
                />
              )}
              {/* Subtle outlines for all elements when none is active */}
              {!activeId && elements.map((el) => (
                <div
                  key={el.id}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.w}%`,
                    height: `${el.h}%`,
                    border: '1px dashed rgba(59,130,246,0.35)',
                    boxSizing: 'border-box',
                    borderRadius: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Right: text element list */}
          <div className="w-72 shrink-0 border-l border-gray-200 bg-white overflow-y-auto">
            <div className="p-3 border-b border-gray-100">
              <p className="text-xs text-gray-500">
                Выберите блок и отредактируйте текст. Выделение на слайде обновляется автоматически.
              </p>
            </div>
            <div className="flex flex-col gap-1 p-2">
              {elements.map((el) => {
                const isActive = activeId === el.id
                const isEdited = el.id in edits
                const currentText = isEdited ? edits[el.id] : el.text

                return (
                  <div
                    key={el.id}
                    className={cn(
                      'rounded-lg border transition-all cursor-pointer',
                      isActive
                        ? 'border-brand-400 bg-brand-50 shadow-sm'
                        : isEdited
                        ? 'border-green-300 bg-green-50 hover:border-green-400'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    )}
                    onClick={() => setActiveId(isActive ? null : el.id)}
                  >
                    <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
                      <span className="text-[10px] font-medium text-gray-400 truncate max-w-[80%]">
                        {el.name}
                      </span>
                      {isEdited && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-600 rounded-full shrink-0">
                          изм.
                        </span>
                      )}
                    </div>
                    <div className="px-2.5 pb-2" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        value={currentText}
                        onChange={(e) => {
                          setEdits((prev) => ({ ...prev, [el.id]: e.target.value }))
                          setActiveId(el.id)
                        }}
                        onFocus={() => setActiveId(el.id)}
                        rows={Math.max(2, currentText.split('\n').length)}
                        className={cn(
                          'w-full resize-none border rounded px-2 py-1 text-sm leading-snug outline-none transition-colors',
                          isActive
                            ? 'border-brand-300 bg-white focus:ring-1 focus:ring-brand-400'
                            : 'border-gray-200 bg-gray-50 focus:border-brand-300 focus:bg-white focus:ring-1 focus:ring-brand-400'
                        )}
                        spellCheck={false}
                        placeholder="(пусто)"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
