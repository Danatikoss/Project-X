import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Sparkles, Upload, FileText, ChevronRight,
  ArrowLeft, BarChart2, PieChart, Grid, Zap, ArrowRight,
  Quote, LayoutList, Layers, Star, RefreshCw, Wand2,
  AlertCircle, CheckCircle2, ChevronUp, ChevronDown,
  Trash2, GitMerge, Type, TrendingUp, Clock, Columns,
} from 'lucide-react'
import { toast } from 'sonner'
import { presentationsApi, brandApi } from '../api/client'
import type { SlideBlueprint } from '../api/client'
import type { BrandTemplate } from '../types'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'

// ─── Layout meta ──────────────────────────────────────────────────────────────

const LAYOUT_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  icon_grid:       { label: 'Карточки',    icon: <Grid className="w-3.5 h-3.5" />,       color: 'bg-violet-50 text-violet-700 border-violet-200' },
  key_message:     { label: 'Ключевая',    icon: <Zap className="w-3.5 h-3.5" />,        color: 'bg-amber-50 text-amber-700 border-amber-200' },
  process_flow:    { label: 'Процесс',     icon: <ArrowRight className="w-3.5 h-3.5" />, color: 'bg-blue-50 text-blue-700 border-blue-200' },
  chart_bar:       { label: 'Диаграмма',   icon: <BarChart2 className="w-3.5 h-3.5" />,  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  chart_pie:       { label: 'Круговая',    icon: <PieChart className="w-3.5 h-3.5" />,   color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  big_stat:        { label: 'Цифра',       icon: <TrendingUp className="w-3.5 h-3.5" />, color: 'bg-rose-50 text-rose-700 border-rose-200' },
  two_column:      { label: '2 колонки',   icon: <Columns className="w-3.5 h-3.5" />,    color: 'bg-sky-50 text-sky-700 border-sky-200' },
  comparison:      { label: 'Сравнение',   icon: <Layers className="w-3.5 h-3.5" />,     color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  timeline:        { label: 'Таймлайн',    icon: <Clock className="w-3.5 h-3.5" />,      color: 'bg-teal-50 text-teal-700 border-teal-200' },
  quote:           { label: 'Цитата',      icon: <Quote className="w-3.5 h-3.5" />,      color: 'bg-purple-50 text-purple-700 border-purple-200' },
  section_divider: { label: 'Секция',      icon: <Star className="w-3.5 h-3.5" />,       color: 'bg-slate-100 text-slate-600 border-slate-200' },
  title_content:   { label: 'Буллеты',     icon: <Type className="w-3.5 h-3.5" />,       color: 'bg-gray-50 text-gray-600 border-gray-200' },
}

function LayoutBadge({ layout }: { layout: string }) {
  const meta = LAYOUT_META[layout] ?? { label: layout, icon: <LayoutList className="w-3.5 h-3.5" />, color: 'bg-gray-50 text-gray-500 border-gray-200' }
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', meta.color)}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

// ─── Icon indicator (replaces emoji) ─────────────────────────────────────────

function IconDot({ text, colorClass }: { text: string; colorClass: string }) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-bold shrink-0',
      colorClass
    )}>
      {text}
    </span>
  )
}

// ─── Content preview for a blueprint ─────────────────────────────────────────

function BlueprintPreview({ bp }: { bp: SlideBlueprint }) {
  const c = bp.content as Record<string, unknown>
  switch (bp.layout) {
    case 'icon_grid': {
      const cards = (c.cards as { heading: string }[] | undefined) ?? []
      return (
        <div className="flex gap-1.5 flex-wrap mt-1.5">
          {cards.slice(0, 4).map((card, i) => (
            <span key={i} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-2 py-0.5 flex items-center gap-1.5">
              <IconDot text={String(i + 1)} colorClass="bg-violet-100 text-violet-700" />
              {card.heading}
            </span>
          ))}
        </div>
      )
    }
    case 'key_message': {
      return (
        <p className="text-xs text-gray-500 mt-1.5 italic flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-amber-500 shrink-0" />
          "{(c.message as string) ?? ''}"
        </p>
      )
    }
    case 'process_flow': {
      const steps = (c.steps as { label: string }[] | undefined) ?? []
      return (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {steps.slice(0, 5).map((s, i) => (
            <span key={i} className="flex items-center gap-1 text-xs text-gray-500">
              <IconDot text={String(i + 1)} colorClass="bg-blue-100 text-blue-700" />
              {s.label}
              {i < steps.length - 1 && steps.length > 1 && (
                <ArrowRight className="w-3 h-3 text-gray-300" />
              )}
            </span>
          ))}
        </div>
      )
    }
    case 'chart_bar': {
      const cats = (c.categories as string[] | undefined) ?? []
      const series = (c.series as { name: string; values: number[] }[] | undefined) ?? []
      return (
        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1.5">
          <BarChart2 className="w-3 h-3 text-emerald-500" />
          {series[0]?.name ?? 'Данные'}: {cats.slice(0, 4).join(', ')}
        </p>
      )
    }
    case 'chart_pie': {
      const slices = (c.slices as { label: string; value: number }[] | undefined) ?? []
      return (
        <div className="flex gap-1.5 flex-wrap mt-1.5">
          {slices.slice(0, 4).map((s, i) => (
            <span key={i} className="text-xs text-gray-400 flex items-center gap-1">
              <IconDot text={String(i + 1)} colorClass="bg-emerald-100 text-emerald-700" />
              {s.label} {s.value}%
            </span>
          ))}
        </div>
      )
    }
    case 'big_stat': {
      return (
        <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
          <TrendingUp className="w-3 h-3 text-rose-500" />
          <span className="font-bold text-gray-700">{c.value as string}</span>
          {' '}{c.label as string}
        </p>
      )
    }
    case 'section_divider': {
      return (
        <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1.5">
          <Star className="w-3 h-3 text-slate-400" />
          {c.subtitle as string}
        </p>
      )
    }
    case 'title_content': {
      const items = (c.items as string[] | undefined) ?? []
      return (
        <ul className="mt-1.5 space-y-0.5">
          {items.slice(0, 3).map((item, i) => (
            <li key={i} className="text-xs text-gray-400 flex gap-1.5 items-start">
              <span className="w-1 h-1 rounded-full bg-gray-300 mt-1.5 shrink-0" />
              {item}
            </li>
          ))}
          {items.length > 3 && <li className="text-xs text-gray-300">+{items.length - 3} ещё</li>}
        </ul>
      )
    }
    default:
      return null
  }
}

// ─── Merge helpers ────────────────────────────────────────────────────────────

function extractBullets(bp: SlideBlueprint): string[] {
  const c = bp.content as Record<string, unknown>
  switch (bp.layout) {
    case 'title_content': return (c.items as string[] ?? [])
    case 'icon_grid':     return (c.cards as { heading: string }[] ?? []).map(card => card.heading)
    case 'process_flow':  return (c.steps as { label: string; desc?: string }[] ?? []).map(s => s.desc ? `${s.label}: ${s.desc}` : s.label)
    case 'key_message':   return [c.message as string ?? '']
    case 'big_stat':      return [`${c.value} — ${c.label}`, ...(c.context as string[] ?? [])]
    case 'two_column': {
      const lc = c.left as { items?: string[] } | undefined
      const rc = c.right as { items?: string[] } | undefined
      return [...(lc?.items ?? []), ...(rc?.items ?? [])]
    }
    default:              return [bp.title]
  }
}

function mergeBlueprints(a: SlideBlueprint, b: SlideBlueprint): SlideBlueprint {
  const ac = a.content as Record<string, unknown>
  const bc = b.content as Record<string, unknown>

  if (a.layout === b.layout) {
    switch (a.layout) {
      case 'icon_grid': {
        const cards = [
          ...(ac.cards as unknown[] ?? []),
          ...(bc.cards as unknown[] ?? []),
        ].slice(0, 6)
        return { ...a, content: { cards } }
      }
      case 'title_content': {
        const items = [
          ...(ac.items as string[] ?? []),
          ...(bc.items as string[] ?? []),
        ]
        return { ...a, content: { type: 'bullets', items } }
      }
      case 'process_flow': {
        const steps = [
          ...(ac.steps as unknown[] ?? []),
          ...(bc.steps as unknown[] ?? []),
        ].slice(0, 5)
        return { ...a, content: { steps } }
      }
      case 'timeline': {
        const steps = [
          ...(ac.steps as unknown[] ?? []),
          ...(bc.steps as unknown[] ?? []),
        ]
        return { ...a, content: { steps } }
      }
    }
  }

  // Different layouts → convert to two_column
  const aItems = extractBullets(a).slice(0, 5)
  const bItems = extractBullets(b).slice(0, 5)
  return {
    layout: 'two_column',
    title: a.title,
    content: {
      left:  { heading: a.title, items: aItems },
      right: { heading: b.title, items: bItems },
    },
    speaker_notes: '',
  }
}

// ─── Slide plan card ──────────────────────────────────────────────────────────

function SlidePlanCard({
  bp, index, total,
  onMoveUp, onMoveDown, onDelete, onMergeWithNext,
}: {
  bp: SlideBlueprint; index: number; total: number;
  onMoveUp: () => void; onMoveDown: () => void;
  onDelete: () => void; onMergeWithNext: () => void;
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:border-violet-200 hover:shadow-md transition-all group">
      <div className="flex items-start gap-3">
        {/* Number */}
        <div className="w-7 h-7 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-xs font-bold text-gray-400">{index + 1}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-800 truncate">{bp.title || '(без заголовка)'}</p>
            <LayoutBadge layout={bp.layout} />
          </div>
          <BlueprintPreview bp={bp} />
        </div>

        {/* Action buttons — visible on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            title="Переместить вверх"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Переместить вниз"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {index < total - 1 && (
            <button
              onClick={onMergeWithNext}
              title="Объединить со следующим"
              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-all"
            >
              <GitMerge className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onDelete}
            title="Удалить слайд"
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className={cn(
      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all',
      done   ? 'bg-violet-600 border-violet-600 text-white' :
      active ? 'bg-white border-violet-600 text-violet-700' :
               'bg-white border-gray-200 text-gray-400'
    )}>
      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Step = 'input' | 'plan'

const LANG_OPTIONS = [
  { value: '',        label: 'Авто' },
  { value: 'Russian', label: 'Русский' },
  { value: 'Kazakh',  label: 'Қазақша' },
  { value: 'English', label: 'English' },
]

export default function PresentationGenerator() {
  const navigate  = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Input state
  const [file, setFile]             = useState<File | null>(null)
  const [textPrompt, setTextPrompt] = useState('')
  const [title, setTitle]           = useState('Презентация')
  const [language, setLanguage]     = useState('')
  const [brandId, setBrandId]       = useState<number | null>(null)

  // Plan state
  const [plan, setPlan]           = useState<SlideBlueprint[]>([])
  const [planTitle, setPlanTitle] = useState('')
  const [step, setStep]           = useState<Step>('input')

  // Fetch brand templates
  const { data: templates = [] } = useQuery<BrandTemplate[]>({
    queryKey: ['brand-templates'],
    queryFn:  () => brandApi.listTemplates(),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiError = (e: any): string =>
    e?.response?.data?.detail ?? e?.message ?? 'Неизвестная ошибка'

  // Plan mutation
  const planMutation = useMutation({
    mutationFn: () => presentationsApi.plan({
      file: file ?? undefined,
      textPrompt: textPrompt || undefined,
      title,
      language,
    }),
    onSuccess: (data) => {
      setPlan(data.plan)
      setPlanTitle(data.title)
      setStep('plan')
    },
    onError: (e: unknown) => toast.error(apiError(e)),
  })

  // Render mutation
  const renderMutation = useMutation({
    mutationFn: () => presentationsApi.render({
      title: planTitle,
      plan,
      brandTemplateId: brandId ?? undefined,
    }),
    onSuccess: (data) => {
      navigate(`/assemble/${data.assembly_id}`)
    },
    onError: (e: unknown) => toast.error(apiError(e)),
  })

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  // ── Plan editing handlers ──────────────────────────────────────────────────

  const moveUp = (i: number) => {
    if (i === 0) return
    const next = [...plan]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    setPlan(next)
  }

  const moveDown = (i: number) => {
    if (i === plan.length - 1) return
    const next = [...plan]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    setPlan(next)
  }

  const deleteSlide = (i: number) => {
    setPlan(plan.filter((_, idx) => idx !== i))
  }

  const mergeWithNext = (i: number) => {
    if (i >= plan.length - 1) return
    const merged = mergeBlueprints(plan[i], plan[i + 1])
    const next = [...plan]
    next.splice(i, 2, merged)
    setPlan(next)
  }

  // ── Derived stats ──────────────────────────────────────────────────────────

  const canPlan = (file !== null || textPrompt.trim().length > 20) && !planMutation.isPending

  const layoutCounts = plan.reduce<Record<string, number>>((acc, bp) => {
    acc[bp.layout] = (acc[bp.layout] ?? 0) + 1
    return acc
  }, {})
  const textWalls = (layoutCounts['title_content'] ?? 0)

  return (
    <div className="min-h-full bg-gray-50/50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-100 transition-all text-gray-400 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-violet-600" />
              Генератор презентаций
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">AI создаёт слайды по вашему документу или ТЗ</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {(['input', 'plan'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <StepDot n={i + 1} active={step === s} done={step === 'plan' && s === 'input'} />
                <span className={cn('text-xs font-medium', step === s ? 'text-violet-700' : 'text-gray-400')}>
                  {s === 'input' ? 'Источник' : 'План слайдов'}
                </span>
              </div>
              {i < 1 && <div className="w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Input ── */}
        {step === 'input' && (
          <div className="space-y-4">

            {/* File upload */}
            <div
              className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-violet-300 hover:bg-violet-50/30 transition-all"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.pptx,.docx,.txt"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f) }}
              />
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-violet-600" />
                  </div>
                  <p className="font-semibold text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} МБ</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null) }}
                    className="text-xs text-red-400 hover:text-red-600 underline mt-1"
                  >
                    Удалить
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">Загрузите документ</p>
                    <p className="text-sm text-gray-400 mt-0.5">PDF, PPTX, DOCX или TXT · до 50 МБ</p>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">или введите ТЗ</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Text prompt */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
              <textarea
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                placeholder="Опишите тему и структуру презентации… Например: «Отчёт о продажах за Q1 2024: выручка 12 млн, рост 23%, топ-5 продуктов, план на Q2»"
                className="w-full text-sm text-gray-700 placeholder-gray-300 resize-none focus:outline-none min-h-[100px]"
              />
            </div>

            {/* Settings row */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Настройки</p>

              {/* Title */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Название презентации</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 transition-colors"
                  placeholder="Название презентации"
                />
              </div>

              {/* Language + Brand */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Язык слайдов</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white"
                  >
                    {LANG_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Бренд-шаблон</label>
                  <select
                    value={brandId ?? ''}
                    onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 bg-white"
                  >
                    <option value="">По умолчанию</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={() => planMutation.mutate()}
              disabled={!canPlan}
              className={cn(
                'w-full py-3.5 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all',
                canPlan
                  ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            >
              {planMutation.isPending ? (
                <><Spinner size="sm" /><span>Анализирую контент…</span></>
              ) : (
                <><Sparkles className="w-4 h-4" /><span>Создать план слайдов</span></>
              )}
            </button>
          </div>
        )}

        {/* ── Step 2: Plan review ── */}
        {step === 'plan' && (
          <div className="space-y-4">

            {/* Stats banner */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{plan.length} слайдов</p>
                  <p className="text-xs text-gray-400">сгенерировано</p>
                </div>
              </div>
              <div className="flex-1" />
              {textWalls > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {textWalls} слайд{textWalls > 1 ? 'а' : ''} с буллетами
                </div>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {Object.entries(layoutCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([layout, count]) => (
                    <span key={layout} className="text-xs bg-gray-50 border border-gray-100 rounded-lg px-2 py-0.5 text-gray-500">
                      {LAYOUT_META[layout]?.label ?? layout} ×{count}
                    </span>
                  ))}
              </div>
            </div>

            {/* Hint */}
            <p className="text-xs text-gray-400 px-1 flex items-center gap-1.5">
              <ChevronUp className="w-3 h-3" />
              Наведите на слайд чтобы переместить, объединить или удалить
            </p>

            {/* Slide plan list */}
            <div className="space-y-2">
              {plan.map((bp, i) => (
                <SlidePlanCard
                  key={i}
                  bp={bp}
                  index={i}
                  total={plan.length}
                  onMoveUp={() => moveUp(i)}
                  onMoveDown={() => moveDown(i)}
                  onDelete={() => deleteSlide(i)}
                  onMergeWithNext={() => mergeWithNext(i)}
                />
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setStep('input'); setPlan([]) }}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Перегенерировать
              </button>
              <button
                onClick={() => renderMutation.mutate()}
                disabled={renderMutation.isPending}
                className="flex-1 py-3 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-200 disabled:opacity-60"
              >
                {renderMutation.isPending ? (
                  <><Spinner size="sm" /><span>Рендеринг…</span></>
                ) : (
                  <><Wand2 className="w-4 h-4" /><span>Создать презентацию</span><ChevronRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
