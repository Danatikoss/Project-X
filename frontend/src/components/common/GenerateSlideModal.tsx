import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Sparkles, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { brandApi } from '../../api/client'
import { Spinner } from './Spinner'
import { cn } from '../../utils/cn'
import type { Slide, BrandTemplate } from '../../types'

const LAYOUT_HINTS = [
  { label: 'Заголовок + список', example: 'Ключевые преимущества продукта' },
  { label: 'Большая метрика', example: 'Рост выручки на 47% за квартал' },
  { label: 'Сравнение', example: 'До и после внедрения системы' },
  { label: 'Таймлайн', example: 'Дорожная карта на 2025 год' },
  { label: 'Цитата клиента', example: 'Отзыв ключевого клиента' },
  { label: 'Разделитель', example: 'Глава 2: Финансовые результаты' },
]

interface Props {
  onClose: () => void
  onSlideGenerated: (slide: Slide) => void
  assemblyContext?: string
}

export function GenerateSlideModal({ onClose, onSlideGenerated, assemblyContext }: Props) {
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState(assemblyContext || '')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>()
  const [showTemplates, setShowTemplates] = useState(false)

  const { data: templates = [] } = useQuery<BrandTemplate[]>({
    queryKey: ['brand-templates'],
    queryFn: brandApi.listTemplates,
  })

  const defaultTemplate = templates.find((t) => t.is_default)
  const activeTemplateId = selectedTemplateId ?? defaultTemplate?.id
  const activeTemplate = templates.find((t) => t.id === activeTemplateId)

  const generateMutation = useMutation({
    mutationFn: () => brandApi.generateSlide({
      prompt,
      template_id: activeTemplateId,
      context: context.trim() || undefined,
    }),
    onSuccess: (res) => {
      onSlideGenerated(res.slide)
      toast.success('Слайд создан и добавлен в библиотеку')
      onClose()
    },
    onError: (e: Error) => {
      toast.error(`Ошибка генерации: ${e.message}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    generateMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-brand-700" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Создать слайд с AI</p>
              <p className="text-xs text-gray-400">Фаза 3 — структурная генерация</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Что должно быть на слайде?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Например: Рост выручки в Q3 — +47%, за счёт новых рынков"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-200"
              rows={3}
              autoFocus
            />
            {/* Quick hints */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {LAYOUT_HINTS.map((h) => (
                <button
                  key={h.label}
                  type="button"
                  onClick={() => setPrompt(h.example)}
                  className="text-[11px] px-2 py-0.5 bg-gray-100 hover:bg-brand-50 hover:text-brand-700 text-gray-500 rounded-full transition-colors"
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {/* Context */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Контекст презентации
              <span className="text-gray-400 font-normal ml-1">(необязательно)</span>
            </label>
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Например: Квартальный отчёт для совета директоров"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          {/* Template selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Бренд-шаблон
            </label>
            {templates.length === 0 ? (
              <div className="px-3 py-2.5 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
                Шаблонов нет — слайд будет создан в стандартном стиле.{' '}
                <a href="/brand" className="text-brand-600 hover:underline">Загрузить шаблон →</a>
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowTemplates((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 text-sm hover:border-brand-300 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {activeTemplate && (
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white shadow-sm shrink-0"
                        style={{ background: `#${activeTemplate.colors.primary || '1E3A8A'}` }}
                      />
                    )}
                    <span className="text-gray-700">
                      {activeTemplate?.name ?? 'Выбрать шаблон'}
                    </span>
                    {activeTemplate?.is_default && (
                      <span className="text-[10px] text-brand-600">(по умолчанию)</span>
                    )}
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', showTemplates && 'rotate-180')} />
                </button>

                {showTemplates && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => { setSelectedTemplateId(t.id); setShowTemplates(false) }}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors text-left',
                          activeTemplateId === t.id && 'bg-brand-50 text-brand-900'
                        )}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white shadow-sm shrink-0"
                          style={{ background: `#${t.colors.primary || '1E3A8A'}` }}
                        />
                        <span className="flex-1">{t.name}</span>
                        {t.is_default && <span className="text-[10px] text-gray-400">по умолчанию</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!prompt.trim() || generateMutation.isPending}
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all',
              'bg-brand-900 text-white hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {generateMutation.isPending ? (
              <>
                <Spinner size="sm" className="border-white border-t-transparent" />
                Генерирую слайд...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Создать слайд
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
