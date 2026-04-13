import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Sparkles, Upload, Trash2, ChevronDown, ChevronUp,
  LayoutTemplate, Plus, FileDown, Tag, ArrowLeft,
  FileText, X, Layers, Check, ExternalLink, Presentation,
  Palette, ImageIcon, RefreshCw,
} from 'lucide-react'
import { generateApi, type SlideTemplate, type PresentationPlan } from '../api/client'
import { useAuthStore } from '../store/auth'
import { cn } from '../utils/cn'

type GenerationMode = '1slide' | 'full'

// ─── Mode toggle ──────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: GenerationMode; onChange: (m: GenerationMode) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
      <button
        onClick={() => onChange('1slide')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
          mode === '1slide'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        )}
      >
        <LayoutTemplate className="w-3.5 h-3.5" />
        1 слайд
      </button>
      <button
        onClick={() => onChange('full')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
          mode === 'full'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        )}
      >
        <Presentation className="w-3.5 h-3.5" />
        Презентация
      </button>
    </div>
  )
}

// ─── Theme + title slide picker ───────────────────────────────────────────────

function StylePicker({
  themes,
  selectedTheme,
  onThemeChange,
  titleSlides,
  selectedTitleId,
  onTitleChange,
}: {
  themes: string[]
  selectedTheme: string
  onThemeChange: (t: string) => void
  titleSlides: SlideTemplate[]
  selectedTitleId: string | null
  onTitleChange: (id: string | null) => void
}) {
  const hasMultipleThemes = themes.length > 1
  const hasTitleSlides = titleSlides.length > 0

  if (!hasMultipleThemes && !hasTitleSlides) return null

  return (
    <div className="space-y-3">
      {hasMultipleThemes && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Palette className="w-3 h-3" /> Тема оформления
          </p>
          <div className="flex flex-wrap gap-1.5">
            {themes.map(t => (
              <button
                key={t}
                onClick={() => { onThemeChange(t); onTitleChange(null) }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  selectedTheme === t
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                )}
              >
                {t === 'default' ? 'Стандартная' : t}
              </button>
            ))}
          </div>
        </div>
      )}
      {hasTitleSlides && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <ImageIcon className="w-3 h-3" /> Титульный слайд
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onTitleChange(null)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                selectedTitleId === null
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400'
              )}
            >
              Без титульного
            </button>
            {titleSlides.map(t => (
              <button
                key={t.id}
                onClick={() => onTitleChange(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  selectedTitleId === t.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step 1: Input (shared) ───────────────────────────────────────────────────

function InputStep({
  mode,
  theme,
  titleTemplateId,
  onPlanReady,
  onSingleSlideReady,
}: {
  mode: GenerationMode
  theme: string
  titleTemplateId: string | null
  onPlanReady: (plan: PresentationPlan) => void
  onSingleSlideReady: (assemblyId: number) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (f: File) => {
    setFile(f)
    setExtracting(true)
    try {
      const { summary } = await generateApi.extractFile(f)
      setPrompt(summary)
      toast.success('Файл обработан — ключевые факты извлечены')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка обработки файла'
      toast.error(msg)
    } finally {
      setExtracting(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFileChange(f)
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    try {
      if (mode === '1slide') {
        const { assembly_id } = await generateApi.createAssemblySingle(prompt.trim())
        onSingleSlideReady(assembly_id)
      } else {
        const plan = await generateApi.createPlan(prompt.trim(), theme, titleTemplateId)
        onPlanReady(plan)
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка генерации'
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  const buttonLabel = mode === '1slide' ? 'Создать слайд' : 'Создать план'
  const placeholderText = mode === '1slide'
    ? 'Опишите слайд: тема, ключевые данные, стиль...'
    : 'Опишите тему: что за продукт, ключевые цифры, цели, для кого презентация...'

  return (
    <div className="space-y-4">
      {/* File drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all',
          file ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.doc"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f) }}
        />
        {extracting ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
            <span className="text-sm text-indigo-600">Извлекаю ключевые факты из файла...</span>
          </div>
        ) : file ? (
          <div className="flex items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <FileText className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-indigo-700">{file.name}</p>
              <p className="text-xs text-indigo-400">Текст извлечён — отредактируй промпт ниже если нужно</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); setFile(null); setPrompt('') }}
              className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white transition-all"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="py-2">
            <Upload className="w-6 h-6 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-400">Загрузи PDF или DOCX — AI извлечёт ключевые факты</p>
            <p className="text-xs text-gray-300 mt-0.5">или просто напиши промпт ниже</p>
          </div>
        )}
      </div>

      {/* Prompt */}
      <div className="relative">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={placeholderText}
          rows={5}
          className="w-full text-sm rounded-2xl border border-gray-200 px-4 py-3.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-gray-300"
        />
        {prompt && (
          <button
            onClick={() => setPrompt('')}
            className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || generating || extracting}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all',
          prompt.trim() && !generating && !extracting
            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        )}
      >
        {generating ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {mode === '1slide' ? 'Создаю слайд...' : 'AI создаёт план...'}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {buttonLabel}
          </>
        )}
      </button>
    </div>
  )
}

// ─── Step 2: Plan review ──────────────────────────────────────────────────────

function PlanStep({
  plan,
  templates,
  onBack,
  onOpenInEditor,
}: {
  plan: PresentationPlan
  templates: SlideTemplate[]
  onBack: () => void
  onOpenInEditor: (assemblyId: number) => void
}) {
  const [downloading, setDownloading] = useState(false)
  const [openingEditor, setOpeningEditor] = useState(false)
  const templateMap = Object.fromEntries(templates.map(t => [t.id, t]))

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await generateApi.downloadPresentation(plan)
      toast.success('Презентация скачана')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка'
      toast.error(msg)
    } finally {
      setDownloading(false)
    }
  }

  const handleOpenInEditor = async () => {
    setOpeningEditor(true)
    try {
      const { assembly_id } = await generateApi.createAssembly(plan)
      onOpenInEditor(assembly_id)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка'
      toast.error(msg)
    } finally {
      setOpeningEditor(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Изменить промпт
        </button>
        <div className="flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-gray-900">{plan.title}</span>
        </div>
      </div>

      {/* Slide list */}
      <div className="space-y-2">
        {plan.slides.map((slide, i) => {
          const tmpl = templateMap[slide.template_id]
          const mainSlot = slide.slots['slot_product_name'] || slide.slots['slot_main_card'] || ''
          const previewText = mainSlot.split('\n')[0] || slide.template_id

          return (
            <div key={i} className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-3.5 hover:border-gray-300 transition-all">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-indigo-500">{i + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 truncate">{previewText}</span>
                  <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full shrink-0">
                    {tmpl?.name || slide.template_id}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {Object.keys(slide.slots).length} слотов заполнено
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={downloading || openingEditor}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all border',
            !downloading && !openingEditor
              ? 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              : 'border-gray-100 text-gray-300 cursor-not-allowed'
          )}
        >
          {downloading ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
              Собираю...
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4" />
              Скачать PPTX
            </>
          )}
        </button>

        <button
          onClick={handleOpenInEditor}
          disabled={openingEditor || downloading}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all',
            !openingEditor && !downloading
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          {openingEditor ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Рендер слайдов...
            </>
          ) : (
            <>
              <ExternalLink className="w-4 h-4" />
              Открыть в редакторе
            </>
          )}
        </button>
      </div>

      <p className="text-center text-[11px] text-gray-400">
        «Открыть в редакторе» сохранит {plan.slides.length} слайдов в библиотеку и откроет полный редактор
      </p>
    </div>
  )
}

// ─── Template card ────────────────────────────────────────────────────────────

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
              'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
              isCustom ? 'bg-amber-100' : 'bg-indigo-50'
            )}>
              <LayoutTemplate className={cn('w-3.5 h-3.5', isCustom ? 'text-amber-600' : 'text-indigo-500')} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
                {isCustom && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">свой</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{template.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isAdmin && isCustom && (
              <button
                onClick={() => onDelete(template.id)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2.5">
          {template.scenario_tags.slice(0, 3).map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
              <Tag className="w-2.5 h-2.5" />{tag}
            </span>
          ))}
          {template.scenario_tags.length > 3 && (
            <span className="text-[10px] text-gray-400">+{template.scenario_tags.length - 3}</span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Слоты ({Object.keys(template.slots).length})</p>
          <div className="space-y-1">
            {Object.entries(template.slots).map(([key]) => (
              <code key={key} className="block text-[11px] text-indigo-600 font-mono">{key}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadTemplateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [layoutRole, setLayoutRole] = useState<'content' | 'title'>('content')
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ created: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    try {
      const res = await generateApi.uploadTemplatesBatch(file, layoutRole)
      setResult({ created: res.created })
      onSuccess()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка загрузки'
      toast.error(msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Загрузить шаблоны</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {result ? (
          <div className="px-6 py-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {result.created === 1 ? '1 шаблон добавлен' : `${result.created} шаблона добавлено`}
            </p>
            <p className="text-xs text-gray-400">AI автоматически сгенерировал названия, описания и теги</p>
            <button onClick={onClose} className="mt-2 w-full py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-all">
              Готово
            </button>
          </div>
        ) : (
          <>
            <div className="px-6 py-5 space-y-4">
              <div
                onClick={() => !uploading && fileRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-6 text-center transition-all',
                  uploading ? 'border-indigo-200 bg-indigo-50/50 cursor-default' :
                  file ? 'border-indigo-300 bg-indigo-50 cursor-pointer' :
                  'border-gray-200 hover:border-indigo-300 cursor-pointer'
                )}
              >
                <input ref={fileRef} type="file" accept=".pptx" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
                {uploading ? (
                  <div className="space-y-2">
                    <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-indigo-600 font-medium">AI анализирует слайды...</p>
                    <p className="text-[11px] text-gray-400">Генерирую названия и теги для каждого шаблона</p>
                  </div>
                ) : file ? (
                  <div className="space-y-1">
                    <Layers className="w-5 h-5 text-indigo-500 mx-auto" />
                    <p className="text-sm text-indigo-700 font-medium">{file.name}</p>
                    <p className="text-[11px] text-gray-400">Нажми чтобы выбрать другой файл</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Upload className="w-6 h-6 mx-auto text-gray-300" />
                    <p className="text-sm text-gray-600 font-medium">Выбери .pptx файл</p>
                    <p className="text-[11px] text-gray-400">Все слайды со слотами станут отдельными шаблонами</p>
                    <p className="text-[11px] text-gray-300">AI сам сгенерирует название, описание и теги</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Тип слайдов</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLayoutRole('content')}
                    disabled={uploading}
                    className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                      layoutRole === 'content' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300')}
                  >
                    Контентные
                  </button>
                  <button
                    onClick={() => setLayoutRole('title')}
                    disabled={uploading}
                    className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                      layoutRole === 'title' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-300')}
                  >
                    Титульные
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-6 pb-5">
              <button onClick={onClose} disabled={uploading}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50">
                Отмена
              </button>
              <button onClick={handleUpload} disabled={!file || uploading}
                className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
                  file && !uploading ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
                {uploading
                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Sparkles className="w-3.5 h-3.5" />}
                {uploading ? 'Обрабатываю...' : 'Загрузить'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Generate() {
  const [mode, setMode] = useState<GenerationMode>('full')
  const [plan, setPlan] = useState<PresentationPlan | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState('default')
  const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.is_admin ?? false

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['slide-templates'],
    queryFn: generateApi.listTemplates,
  })

  const { data: themes = [] } = useQuery({
    queryKey: ['slide-themes'],
    queryFn: generateApi.listThemes,
  })

  const { data: titleSlides = [] } = useQuery({
    queryKey: ['title-slides', selectedTheme],
    queryFn: () => generateApi.listTitleSlides(selectedTheme),
  })

  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: generateApi.deleteTemplate,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['slide-templates'] }); toast.success('Шаблон удалён') },
    onError: (e: unknown) => { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка') },
  })

  const deleteAllMutation = useMutation({
    mutationFn: generateApi.deleteAllCustomTemplates,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['slide-templates'] })
      setShowDeleteAllConfirm(false)
      toast.success(`Удалено ${data.deleted} шаблонов`)
    },
    onError: (e: unknown) => { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка') },
  })

  const [reindexDone, setReindexDone] = useState(false)
  const reindexMutation = useMutation({
    mutationFn: generateApi.reindexTemplates,
    onSuccess: (data) => {
      setReindexDone(true)
      setTimeout(() => setReindexDone(false), 4000)
      toast.success(data.updated === 0
        ? 'Все шаблоны уже проиндексированы'
        : `Проиндексировано ${data.updated} из ${data.total} шаблонов`)
    },
    onError: (e: unknown) => { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка') },
  })

  const builtIn = templates.filter(t => !t.id.startsWith('custom_') && t.layout_role === 'content')
  const custom = templates.filter(t => t.id.startsWith('custom_') && t.layout_role === 'content')

  const handleModeChange = (m: GenerationMode) => {
    setMode(m)
    setPlan(null)
  }

  const handleThemeChange = (t: string) => {
    setSelectedTheme(t)
    setSelectedTitleId(null)
  }

  const handleOpenInEditor = (assemblyId: number) => {
    toast.success('Презентация создана — открываю редактор')
    navigate(`/assemble/${assemblyId}`)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
      {/* ── Generate section ── */}
      <div>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900">Генерация презентации</h1>
            <p className="text-xs text-gray-400">AI подберёт шаблоны и заполнит слайды</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          {/* Mode toggle — only show before plan is ready */}
          {!plan && (
            <ModeToggle mode={mode} onChange={handleModeChange} />
          )}

          {/* Theme + title slide picker — only for full presentation, before plan */}
          {!plan && mode === 'full' && (
            <StylePicker
              themes={themes}
              selectedTheme={selectedTheme}
              onThemeChange={handleThemeChange}
              titleSlides={titleSlides}
              selectedTitleId={selectedTitleId}
              onTitleChange={setSelectedTitleId}
            />
          )}

          {plan ? (
            <PlanStep
              plan={plan}
              templates={templates}
              onBack={() => setPlan(null)}
              onOpenInEditor={handleOpenInEditor}
            />
          ) : (
            <InputStep
              mode={mode}
              theme={selectedTheme}
              titleTemplateId={selectedTitleId}
              onPlanReady={setPlan}
              onSingleSlideReady={handleOpenInEditor}
            />
          )}
        </div>
      </div>

      {/* ── Template library ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Библиотека шаблонов</h2>
            <p className="text-xs text-gray-400 mt-0.5">{templates.length} шаблонов · AI выбирает автоматически</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <button
                  onClick={() => setShowDeleteAllConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Удалить все
                </button>
              )}
              <button
                onClick={() => { setReindexDone(false); reindexMutation.mutate() }}
                disabled={reindexMutation.isPending}
                title="Сгенерировать эмбеддинги для шаблонов без индекса"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  reindexDone
                    ? 'text-green-700 bg-green-50'
                    : 'text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-50'
                )}
              >
                {reindexMutation.isPending
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : reindexDone
                    ? <Check className="w-3.5 h-3.5" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                {reindexMutation.isPending ? 'Индексирую...' : reindexDone ? 'Готово' : 'Reindex'}
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить шаблон
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-5">
            {builtIn.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Базовые</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {builtIn.map(t => <TemplateCard key={t.id} template={t} isAdmin={isAdmin} onDelete={id => deleteMutation.mutate(id)} />)}
                </div>
              </div>
            )}
            {custom.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Свои</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {custom.map(t => <TemplateCard key={t.id} template={t} isAdmin={isAdmin} onDelete={id => deleteMutation.mutate(id)} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showUpload && (
        <UploadTemplateModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['slide-templates'] })}
        />
      )}

      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Удалить все свои шаблоны?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Это удалит все {templates.length} шаблон{templates.length === 1 ? '' : templates.length < 5 ? 'а' : 'ов'} из каталога. Действие необратимо.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
                disabled={deleteAllMutation.isPending}
              >
                Отмена
              </button>
              <button
                onClick={() => deleteAllMutation.mutate()}
                disabled={deleteAllMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {deleteAllMutation.isPending ? 'Удаляю...' : 'Да, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
