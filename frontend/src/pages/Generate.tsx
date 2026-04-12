import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Sparkles, Upload, Trash2, ChevronDown, ChevronUp,
  LayoutTemplate, Plus, FileDown, Tag, ArrowLeft,
  FileText, X, Layers, Check, ExternalLink, Presentation,
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

// ─── Step 1: Input (shared) ───────────────────────────────────────────────────

function InputStep({
  mode,
  onPlanReady,
  onSingleSlideReady,
}: {
  mode: GenerationMode
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
        const plan = await generateApi.createPlan(prompt.trim())
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
      await generateApi.uploadTemplate(file, { name: name.trim(), description: description.trim(), scenario_tags: tags, slide_index: slideIndex })
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">PPTX файл</label>
            <div
              onClick={() => fileRef.current?.click()}
              className={cn('border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all',
                file ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-gray-300')}
            >
              <input ref={fileRef} type="file" accept=".pptx" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm text-indigo-700 font-medium">{file.name}</span>
                </div>
              ) : (
                <div className="text-gray-400 text-xs">
                  <Upload className="w-5 h-5 mx-auto mb-1 text-gray-300" />
                  Нажми для выбора .pptx
                  <p className="mt-0.5 text-gray-300">Shapes должны быть названы slot_*</p>
                </div>
              )}
            </div>
          </div>
          {file && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">Номер слайда <span className="text-gray-400 font-normal">(0 = первый)</span></label>
              <input type="number" min={0} value={slideIndex} onChange={e => setSlideIndex(Number(e.target.value))}
                className="w-20 text-sm rounded-lg border border-gray-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Название</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Продукт + диаграмма"
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Описание</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Когда использовать"
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1.5">Теги <span className="text-gray-400 font-normal">(через запятую)</span></label>
            <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="diagram, chart"
              className="w-full text-sm rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">Отмена</button>
          <button onClick={handleUpload} disabled={!file || !name.trim() || uploading}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all',
              file && name.trim() && !uploading ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}>
            {uploading ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Загрузить
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Generate() {
  const [mode, setMode] = useState<GenerationMode>('full')
  const [plan, setPlan] = useState<PresentationPlan | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.is_admin ?? false

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['slide-templates'],
    queryFn: generateApi.listTemplates,
  })

  const deleteMutation = useMutation({
    mutationFn: generateApi.deleteTemplate,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['slide-templates'] }); toast.success('Шаблон удалён') },
    onError: (e: unknown) => { toast.error((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Ошибка') },
  })

  const builtIn = templates.filter(t => !t.id.startsWith('custom_'))
  const custom = templates.filter(t => t.id.startsWith('custom_'))

  const handleModeChange = (m: GenerationMode) => {
    setMode(m)
    setPlan(null)
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
    </div>
  )
}
