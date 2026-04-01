import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, Clock, Copy, PenLine, Trash2, Upload, BookImage,
  Check, ArrowRight, ChevronDown, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { assemblyApi } from '../api/client'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { AssemblyListItem } from '../types'

// ─── Template definitions ─────────────────────────────────────────────────────
// Each template has a visual "deck preview" — colored blocks that hint at
// the slide structure. Inspired by Higgsfield's style-card approach:
// give the user a tangible preview of the *result*, not an empty input.

interface Template {
  id: string
  emoji: string
  title: string
  desc: string
  slides: number
  accent: string          // Tailwind bg color for header block
  accentHex: string       // used for inline styles on preview strips
  bodyColor: string       // lighter shade for content blocks
  prompt: string
}

const TEMPLATES: Template[] = [
  {
    id: 'pitch',
    emoji: '🚀',
    title: 'Питч-дек',
    desc: 'Проблема, решение, рынок, команда',
    slides: 8,
    accent: 'bg-orange-500',
    accentHex: '#f97316',
    bodyColor: '#fff7ed',
    prompt: 'Питч-дек для инвестора: проблема на рынке, наше решение, объём рынка, бизнес-модель, команда и текущие метрики роста',
  },
  {
    id: 'quarterly',
    emoji: '📊',
    title: 'Квартальный отчёт',
    desc: 'KPI, достижения, риски, планы',
    slides: 7,
    accent: 'bg-blue-500',
    accentHex: '#3b82f6',
    bodyColor: '#eff6ff',
    prompt: 'Квартальный отчёт: выполнение KPI, ключевые достижения периода, выявленные риски и проблемы, планы на следующий квартал',
  },
  {
    id: 'project',
    emoji: '📋',
    title: 'Статус проекта',
    desc: 'Прогресс, риски, следующие шаги',
    slides: 6,
    accent: 'bg-teal-500',
    accentHex: '#14b8a6',
    bodyColor: '#f0fdf4',
    prompt: 'Статус-отчёт по проекту: цели и задачи, текущий прогресс выполнения, риски и блокеры, следующие шаги и дедлайны',
  },
  {
    id: 'strategy',
    emoji: '🎯',
    title: 'Стратегия',
    desc: 'Анализ, приоритеты, дорожная карта',
    slides: 9,
    accent: 'bg-violet-500',
    accentHex: '#8b5cf6',
    bodyColor: '#f5f3ff',
    prompt: 'Стратегический план: анализ текущего состояния и рынка, стратегические цели и приоритеты, дорожная карта реализации',
  },
  {
    id: 'review',
    emoji: '🔍',
    title: 'Бизнес-обзор',
    desc: 'Показатели, тренды, выводы',
    slides: 7,
    accent: 'bg-amber-500',
    accentHex: '#f59e0b',
    bodyColor: '#fffbeb',
    prompt: 'Бизнес-обзор: ключевые показатели и их динамика, сравнение с целями и конкурентами, выводы и рекомендации',
  },
  {
    id: 'onboarding',
    emoji: '👋',
    title: 'Онбординг',
    desc: 'Компания, структура, процессы',
    slides: 8,
    accent: 'bg-pink-500',
    accentHex: '#ec4899',
    bodyColor: '#fdf2f8',
    prompt: 'Онбординг-презентация: знакомство с компанией и миссией, организационная структура и команда, процессы и инструменты, первые шаги нового сотрудника',
  },
]

// Mini "deck preview" — abstract representation of a presentation structure
function DeckPreview({ t }: { t: Template }) {
  return (
    <div
      className="w-full h-24 rounded-xl overflow-hidden flex gap-1 p-2"
      style={{ background: t.bodyColor }}
    >
      {/* Title slide — wider, colored header */}
      <div
        className="flex-[2] rounded-lg flex flex-col gap-1 p-1.5"
        style={{ background: t.accentHex }}
      >
        <div className="h-2 rounded-full bg-white/80 w-3/4" />
        <div className="h-1.5 rounded-full bg-white/40 w-1/2" />
        <div className="mt-auto h-1 rounded-full bg-white/30 w-5/6" />
      </div>

      {/* Content slides — narrower */}
      {[0.7, 0.5, 0.6].map((opacity, i) => (
        <div
          key={i}
          className="flex-1 rounded-lg flex flex-col gap-1 p-1 border"
          style={{ background: 'white', borderColor: `${t.accentHex}22` }}
        >
          <div className="h-1.5 rounded-full w-4/5" style={{ background: `${t.accentHex}${Math.round(opacity * 255).toString(16).padStart(2, '0')}` }} />
          <div className="h-1 rounded-full bg-slate-200 w-full" />
          <div className="h-1 rounded-full bg-slate-200 w-3/4" />
          <div className="mt-auto h-1 rounded-full bg-slate-100 w-1/2" />
        </div>
      ))}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Dashboard() {
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editInputRef = useRef<HTMLInputElement>(null)
  const cancelRenameRef = useRef(false)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: assemblies, isLoading } = useQuery({
    queryKey: ['assemblies'],
    queryFn: assemblyApi.list,
  })

  // One-click template assembly
  const templateMutation = useMutation({
    mutationFn: (prompt: string) => assemblyApi.create({ prompt, max_slides: 15 }),
    onSuccess: (assembly) => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      navigate(`/assemble/${assembly.id}`)
    },
    onError: () => toast.error('Не удалось собрать презентацию'),
  })

  // Custom prompt assembly
  const customMutation = useMutation({
    mutationFn: () => assemblyApi.create({ prompt: customPrompt, max_slides: 15 }),
    onSuccess: (assembly) => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      navigate(`/assemble/${assembly.id}`)
    },
    onError: () => toast.error('Не удалось собрать презентацию'),
  })

  const blankMutation = useMutation({
    mutationFn: () => assemblyApi.createBlank(manualTitle.trim() || 'Новая презентация'),
    onSuccess: (assembly) => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      navigate(`/assemble/${assembly.id}?tab=library`)
    },
    onError: () => toast.error('Не удалось создать презентацию'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => assemblyApi.duplicate(id),
    onSuccess: (assembly) => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      navigate(`/assemble/${assembly.id}`)
      toast.success('Сборка скопирована')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => assemblyApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      toast.success('Сборка удалена')
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => assemblyApi.update(id, { title }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assemblies'] }),
    onError: () => toast.error('Не удалось переименовать'),
  })

  const startRename = (e: React.MouseEvent, a: AssemblyListItem) => {
    e.stopPropagation()
    cancelRenameRef.current = false
    setEditingId(a.id)
    setEditTitle(a.title)
  }

  const commitRename = () => {
    if (cancelRenameRef.current) { cancelRenameRef.current = false; return }
    if (editingId === null) return
    const trimmed = editTitle.trim()
    if (trimmed) renameMutation.mutate({ id: editingId, title: trimmed })
    setEditingId(null)
  }

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus()
  }, [editingId])

  useEffect(() => {
    if (customOpen) promptRef.current?.focus()
  }, [customOpen])

  const handleTemplateClick = (t: Template) => {
    setActiveTemplate(t)
    templateMutation.mutate(t.prompt)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customPrompt.trim()) return
    customMutation.mutate()
  }

  const isBuilding = templateMutation.isPending
  const buildingFor = activeTemplate

  return (
    <div className="min-h-full bg-surface">

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div className="bg-gradient-hero border-b border-slate-100 px-6 pt-10 pb-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-2">Быстрый старт</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">
            Выбери шаблон — получи готовую сборку
          </h1>
          <p className="text-sm text-slate-500">
            Один клик. AI подберёт слайды из вашей библиотеки и выстроит логичную структуру.
          </p>
        </div>
      </div>

      {/* ── Template grid (primary CTA) ──────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 pt-6 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => {
            const isThisBuilding = isBuilding && buildingFor?.id === t.id
            return (
              <button
                key={t.id}
                onClick={() => handleTemplateClick(t)}
                disabled={isBuilding}
                className={cn(
                  'group text-left rounded-2xl border bg-white overflow-hidden transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                  isThisBuilding
                    ? 'border-brand-400 shadow-glow scale-[0.99]'
                    : 'border-slate-200 hover:border-brand-300 hover:shadow-card-hover hover:-translate-y-0.5',
                  isBuilding && !isThisBuilding ? 'opacity-50 cursor-not-allowed' : ''
                )}
              >
                {/* Deck preview */}
                <DeckPreview t={t} />

                {/* Card body */}
                <div className="px-3 pt-2.5 pb-3">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm leading-none">{t.emoji}</span>
                      <span className="text-sm font-semibold text-slate-900">{t.title}</span>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400 shrink-0 mt-0.5">
                      ~{t.slides} сл.
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight mb-2.5">{t.desc}</p>

                  {/* CTA row */}
                  <div className={cn(
                    'flex items-center justify-between text-xs font-semibold transition-colors',
                    isThisBuilding ? 'text-brand-600' : 'text-brand-600 group-hover:text-brand-700'
                  )}>
                    {isThisBuilding ? (
                      <span className="flex items-center gap-1.5">
                        <Spinner size="sm" className="border-brand-500 border-t-transparent" />
                        Собираем...
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        Собрать
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* ── Secondary: custom prompt ─────────────────────────────────────────── */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <button
            onClick={() => setCustomOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-500" />
              Свой запрос
            </span>
            <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform duration-200', customOpen && 'rotate-180')} />
          </button>

          {customOpen && (
            <form onSubmit={handleCustomSubmit} className="px-4 pb-4 border-t border-slate-100 pt-3 animate-fade-in">
              <textarea
                ref={promptRef}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCustomSubmit(e) }}
                placeholder="Опишите презентацию, которую нужно собрать..."
                rows={3}
                className={cn(
                  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3',
                  'text-sm text-slate-800 placeholder-slate-400 resize-none',
                  'focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 focus:bg-white',
                  'transition-all'
                )}
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] text-slate-400">⌘ + Enter для отправки</p>
                <button
                  type="submit"
                  disabled={!customPrompt.trim() || customMutation.isPending}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 rounded-xl',
                    'bg-gradient-brand text-white text-xs font-semibold transition-all',
                    'hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm'
                  )}
                >
                  {customMutation.isPending ? (
                    <Spinner size="sm" className="border-white border-t-transparent" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Собрать
                </button>
              </div>
            </form>
          )}
        </div>

        {/* ── Tertiary: manual creation ────────────────────────────────────────── */}
        <div className="mt-2">
          <button
            onClick={() => setManualOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Создать пустую презентацию
            </span>
            <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform duration-200', manualOpen && 'rotate-180')} />
          </button>

          {manualOpen && (
            <form
              onSubmit={(e) => { e.preventDefault(); blankMutation.mutate() }}
              className="mt-1 px-4 py-3 rounded-2xl border border-slate-200 bg-white animate-fade-in"
            >
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Название (необязательно)"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-all"
                />
                <button
                  type="submit"
                  disabled={blankMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50 transition-all"
                >
                  {blankMutation.isPending ? <Spinner size="sm" className="border-white border-t-transparent" /> : <PenLine className="w-3.5 h-3.5" />}
                  Создать
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Откроется редактор — добавляйте слайды из библиотеки вручную
              </p>
            </form>
          )}
        </div>
      </div>

      {/* ── Recent assemblies ────────────────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-slate-400" />
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Недавние сборки</h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : !assemblies?.length ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 flex flex-col items-center gap-3">
            <p className="text-sm text-slate-500 font-medium">Сборок пока нет</p>
            <p className="text-xs text-slate-400 text-center max-w-xs">
              Выберите шаблон выше — AI подберёт слайды из вашей библиотеки
            </p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => navigate('/library/upload')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                Загрузить слайды
              </button>
              <button
                onClick={() => navigate('/library')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 transition-all"
              >
                <BookImage className="w-3.5 h-3.5" />
                Библиотека
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {assemblies.map((a: AssemblyListItem) => {
              const isManual = a.prompt === '(создано вручную)'
              return (
                <div
                  key={a.id}
                  className={cn(
                    'flex items-center gap-4 p-3.5 rounded-2xl border border-slate-200 bg-white',
                    'hover:border-brand-300 hover:shadow-card-hover transition-all group cursor-pointer'
                  )}
                  onClick={() => navigate(`/assemble/${a.id}`)}
                >
                  {/* Thumbnail */}
                  <div
                    className="shrink-0 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex"
                    style={{ width: 80, height: 45 }}
                  >
                    {a.thumbnail_urls.length > 0 ? (
                      a.thumbnail_urls.slice(0, 3).map((url, i) => (
                        <img key={i} src={url} className="flex-1 h-full object-cover" style={{ minWidth: 0 }} />
                      ))
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                        {isManual
                          ? <PenLine className="w-4 h-4 text-slate-300" />
                          : <Sparkles className="w-4 h-4 text-slate-300" />
                        }
                      </div>
                    )}
                  </div>

                  {/* Title + prompt */}
                  <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                    {editingId === a.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={editInputRef}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') { cancelRenameRef.current = true; setEditingId(null) }
                          }}
                          className="flex-1 text-sm font-semibold border-b-2 border-brand-400 focus:outline-none bg-transparent py-0.5 min-w-0 text-slate-900"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onMouseDown={(e) => { e.preventDefault(); commitRename() }}
                          className="p-0.5 text-brand-600 hover:text-brand-800 shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group/title">
                        <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                        <button
                          onClick={(e) => startRename(e, a)}
                          className="opacity-0 group-hover/title:opacity-100 p-0.5 text-slate-300 hover:text-slate-600 transition-all shrink-0"
                        >
                          <PenLine className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {isManual ? 'Создано вручную' : a.prompt}
                    </p>
                  </div>

                  {/* Meta */}
                  <div className="text-right shrink-0">
                    <span className="text-xs font-medium text-slate-600">{a.slide_count} сл.</span>
                    <p className="text-[11px] text-slate-400">{formatDate(a.created_at)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(a.id) }}
                      title="Дублировать"
                      className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!confirm(`Удалить сборку "${a.title}"?`)) return
                        deleteMutation.mutate(a.id)
                      }}
                      title="Удалить"
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 transition-colors" />
                    </button>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
