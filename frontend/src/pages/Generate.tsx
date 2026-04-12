import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Sparkles, Upload, Trash2, ChevronDown, ChevronUp,
  LayoutTemplate, Plus, FileDown, Tag, Layers
} from 'lucide-react'
import { generateApi, type SlideTemplate } from '../api/client'
import { useAuthStore } from '../store/auth'
import { cn } from '../utils/cn'

// ── Generate form ─────────────────────────────────────────────────────────────

function GenerateForm() {
  const [prompt, setPrompt] = useState('')
  const [numSlides, setNumSlides] = useState(5)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      await generateApi.generatePresentation(prompt.trim(), numSlides)
      toast.success('Презентация готова — файл скачан')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка генерации'
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Создать презентацию</h2>
          <p className="text-xs text-gray-400">AI подберёт шаблоны и заполнит слайды</p>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Опишите тему презентации. Например: презентация про AI-ассистент для госуслуг — 730к пользователей, 88% точность, внедрён в 16 госорганах"
        rows={4}
        className="w-full text-sm rounded-xl border border-gray-200 px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-gray-300"
      />

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Слайдов:</span>
          <div className="flex items-center gap-1">
            {[3, 5, 7, 10].map(n => (
              <button
                key={n}
                onClick={() => setNumSlides(n)}
                className={cn(
                  'w-8 h-8 rounded-lg text-xs font-medium transition-all',
                  numSlides === n
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generating}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
            prompt.trim() && !generating
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          {generating ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Генерация...
            </>
          ) : (
            <>
              <FileDown className="w-3.5 h-3.5" />
              Скачать PPTX
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({ template, isAdmin, onDelete }: {
  template: SlideTemplate
  isAdmin: boolean
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isCustom = template.id.startsWith('custom_')

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-all">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
              isCustom ? 'bg-amber-100' : 'bg-indigo-50'
            )}>
              <LayoutTemplate className={cn('w-4 h-4', isCustom ? 'text-amber-600' : 'text-indigo-500')} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{template.name}</h3>
                {isCustom && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                    свой
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{template.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isAdmin && isCustom && (
              <button
                onClick={() => onDelete(template.id)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-3">
          {template.scenario_tags.slice(0, 4).map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          {template.scenario_tags.length > 4 && (
            <span className="text-[10px] text-gray-400">+{template.scenario_tags.length - 4}</span>
          )}
        </div>
      </div>

      {/* Slots detail */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Слоты ({Object.keys(template.slots).length})
          </p>
          <div className="space-y-1">
            {Object.entries(template.slots).map(([key, hint]) => (
              <div key={key} className="flex gap-2 text-xs">
                <code className="text-indigo-600 font-mono shrink-0">{key}</code>
                <span className="text-gray-400 truncate">{hint}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Upload modal ──────────────────────────────────────────────────────────────

function UploadTemplateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    if (!file || !name.trim()) return
    setUploading(true)
    try {
      await generateApi.uploadTemplate(file, {
        name: name.trim(),
        description: description.trim(),
        scenario_tags: tags,
        slide_index: slideIndex,
      })
      toast.success(`Шаблон "${name}" добавлен`)
      onSuccess()
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка загрузки'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Загрузить шаблон</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* File picker */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">PPTX файл</label>
            <div
              onClick={() => fileRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
                file ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pptx"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm text-indigo-700 font-medium">{file.name}</span>
                </div>
              ) : (
                <div className="text-gray-400 text-xs">
                  <Upload className="w-5 h-5 mx-auto mb-1 text-gray-300" />
                  Нажми для выбора .pptx файла
                  <p className="mt-0.5 text-gray-300">Shapes должны быть названы slot_*</p>
                </div>
              )}
            </div>
          </div>

          {/* Slide index */}
          {file && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Номер слайда <span className="text-gray-400 font-normal">(0 = первый)</span>
              </label>
              <input
                type="number"
                min={0}
                value={slideIndex}
                onChange={e => setSlideIndex(Number(e.target.value))}
                className="w-20 text-sm rounded-lg border border-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Название шаблона</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Продукт + диаграмма"
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Описание</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Когда использовать этот шаблон"
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">
              Теги <span className="text-gray-400 font-normal">(через запятую)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="diagram, chart, comparison"
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
          >
            Отмена
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploading}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
              file && name.trim() && !uploading
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            {uploading ? (
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Загрузить
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Generate() {
  const [showUpload, setShowUpload] = useState(false)
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.is_admin ?? false

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['slide-templates'],
    queryFn: generateApi.listTemplates,
  })

  const deleteMutation = useMutation({
    mutationFn: generateApi.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slide-templates'] })
      toast.success('Шаблон удалён')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка'
      toast.error(msg)
    },
  })

  const builtIn = templates.filter(t => !t.id.startsWith('custom_'))
  const custom = templates.filter(t => t.id.startsWith('custom_'))

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Генерация</h1>
        <p className="text-sm text-gray-400 mt-1">Создавай презентации из шаблонов с помощью AI</p>
      </div>

      {/* Generate form */}
      <GenerateForm />

      {/* Templates section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Библиотека шаблонов</h2>
            <p className="text-xs text-gray-400 mt-0.5">{templates.length} шаблонов</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Добавить шаблон
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Built-in templates */}
            {builtIn.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Базовые</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {builtIn.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      isAdmin={isAdmin}
                      onDelete={id => deleteMutation.mutate(id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Custom templates */}
            {custom.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Свои</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {custom.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      isAdmin={isAdmin}
                      onDelete={id => deleteMutation.mutate(id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {templates.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <LayoutTemplate className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                <p className="text-sm">Шаблоны не найдены</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadTemplateModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['slide-templates'] })}
        />
      )}
    </div>
  )
}
