import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Clock, Presentation, ChevronRight, Layers, Copy, PenLine, Trash2, Upload, BookImage, Check, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { assemblyApi } from '../api/client'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { AssemblyListItem } from '../types'

const TEMPLATES = [
  {
    id: 'pitch',
    emoji: '🚀',
    title: 'Питч-дек',
    desc: 'Проблема, решение, рынок, команда',
    color: 'from-orange-500/10 to-red-500/10 border-orange-200 hover:border-orange-300',
    dot: 'bg-orange-400',
    prompt: 'Питч-дек для инвестора: проблема на рынке, наше решение, объём рынка, бизнес-модель, команда и текущие метрики роста',
  },
  {
    id: 'quarterly',
    emoji: '📊',
    title: 'Квартальный отчёт',
    desc: 'KPI, достижения, риски, планы',
    color: 'from-blue-500/10 to-indigo-500/10 border-blue-200 hover:border-blue-300',
    dot: 'bg-blue-400',
    prompt: 'Квартальный отчёт: выполнение KPI, ключевые достижения периода, выявленные риски и проблемы, планы на следующий квартал',
  },
  {
    id: 'project',
    emoji: '📋',
    title: 'Статус проекта',
    desc: 'Прогресс, риски, следующие шаги',
    color: 'from-teal-500/10 to-emerald-500/10 border-teal-200 hover:border-teal-300',
    dot: 'bg-teal-400',
    prompt: 'Статус-отчёт по проекту: цели и задачи, текущий прогресс выполнения, риски и блокеры, следующие шаги и дедлайны',
  },
  {
    id: 'strategy',
    emoji: '🎯',
    title: 'Стратегия',
    desc: 'Анализ, приоритеты, дорожная карта',
    color: 'from-violet-500/10 to-purple-500/10 border-violet-200 hover:border-violet-300',
    dot: 'bg-violet-400',
    prompt: 'Стратегический план: анализ текущего состояния и рынка, стратегические цели и приоритеты, дорожная карта реализации',
  },
  {
    id: 'review',
    emoji: '🔍',
    title: 'Бизнес-обзор',
    desc: 'Показатели, тренды, выводы',
    color: 'from-amber-500/10 to-yellow-500/10 border-amber-200 hover:border-amber-300',
    dot: 'bg-amber-400',
    prompt: 'Бизнес-обзор: ключевые показатели и их динамика, сравнение с целями и конкурентами, выводы и рекомендации',
  },
  {
    id: 'onboarding',
    emoji: '👋',
    title: 'Онбординг',
    desc: 'Компания, структура, процессы',
    color: 'from-pink-500/10 to-rose-500/10 border-pink-200 hover:border-pink-300',
    dot: 'bg-pink-400',
    prompt: 'Онбординг-презентация: знакомство с компанией и миссией, организационная структура и команда, процессы и инструменты, первые шаги нового сотрудника',
  },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Dashboard() {
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'ai' | 'manual'>('ai')
  const [manualTitle, setManualTitle] = useState('')
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

  const assembleMutation = useMutation({
    mutationFn: () => assemblyApi.create({ prompt, max_slides: 15 }),
    onSuccess: (assembly) => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      navigate(`/assemble/${assembly.id}`)
    },
    onError: () => toast.error('Не удалось собрать презентацию. Проверьте подключение к API.'),
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
    onError: () => toast.error('Не удалось скопировать сборку'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => assemblyApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
      toast.success('Сборка удалена')
    },
    onError: () => toast.error('Не удалось удалить сборку'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      assemblyApi.update(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblies'] })
    },
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

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim()) return
    assembleMutation.mutate()
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    blankMutation.mutate()
  }

  return (
    <div className="min-h-full bg-surface">
      {/* Hero */}
      <div className="bg-gradient-hero border-b border-slate-100 px-6 pt-12 pb-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight mb-1">
            <span className="text-gradient">Собери презентацию</span>
          </h1>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight mb-6">за минуты</h1>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-white/80 rounded-xl border border-slate-200 shadow-sm w-fit mb-6">
            <button
              onClick={() => setMode('ai')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                mode === 'ai'
                  ? 'bg-gradient-brand text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Sparkles className="w-4 h-4" />
              AI-подбор
            </button>
            <button
              onClick={() => setMode('manual')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                mode === 'manual'
                  ? 'bg-gradient-brand text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <PenLine className="w-4 h-4" />
              Вручную
            </button>
          </div>

          {mode === 'ai' ? (
            <form onSubmit={handleAiSubmit} className="animate-fade-in">
              <div className="relative">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAiSubmit(e) }}
                  placeholder="Опишите презентацию, которую нужно собрать..."
                  rows={3}
                  className={cn(
                    'w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 pr-32',
                    'text-sm text-slate-800 placeholder-slate-400 resize-none',
                    'focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400',
                    'shadow-card transition-shadow hover:shadow-card-hover'
                  )}
                />
                <button
                  type="submit"
                  disabled={!prompt.trim() || assembleMutation.isPending}
                  className={cn(
                    'absolute right-3 bottom-3 flex items-center gap-1.5 px-4 py-2 rounded-xl',
                    'bg-gradient-brand text-white text-sm font-semibold transition-all',
                    'hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
                    'shadow-sm hover:shadow-md'
                  )}
                >
                  {assembleMutation.isPending ? (
                    <Spinner size="sm" className="border-white border-t-transparent" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Собрать
                </button>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Шаблоны</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPrompt(t.prompt)
                        promptRef.current?.focus()
                      }}
                      className={cn(
                        'text-left p-3 rounded-xl border bg-gradient-to-br transition-all',
                        t.color,
                        prompt === t.prompt ? 'ring-2 ring-brand-400 ring-offset-1' : ''
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base leading-none">{t.emoji}</span>
                        <div className={cn('w-1.5 h-1.5 rounded-full ml-auto', t.dot)} />
                      </div>
                      <p className="text-xs font-semibold text-slate-800">{t.title}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleManualSubmit} className="animate-fade-in">
              <p className="text-sm text-slate-500 mb-4">
                Создайте пустую презентацию и подберите слайды из библиотеки вручную
              </p>
              <div className="flex gap-3">
                <input
                  autoFocus
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Название презентации (необязательно)"
                  className={cn(
                    'flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-4',
                    'text-sm text-slate-800 placeholder-slate-400',
                    'focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400',
                    'shadow-card'
                  )}
                />
                <button
                  type="submit"
                  disabled={blankMutation.isPending}
                  className={cn(
                    'flex items-center gap-2 px-6 py-4 rounded-2xl',
                    'bg-gradient-brand text-white text-sm font-semibold transition-all',
                    'hover:opacity-90 disabled:opacity-40 shadow-sm hover:shadow-md'
                  )}
                >
                  {blankMutation.isPending ? (
                    <Spinner size="sm" className="border-white border-t-transparent" />
                  ) : (
                    <PenLine className="w-4 h-4" />
                  )}
                  Создать
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Recent */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Недавние сборки</h2>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !assemblies?.length ? (
          <div className="py-4">
            <p className="text-xs text-slate-400 text-center mb-4">Сборок пока нет — начните с одного из шагов:</p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/library/upload')}
                className="flex-1 flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center transition-colors">
                  <Upload className="w-5 h-5 text-slate-500 group-hover:text-brand-600 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">1. Загрузите</p>
                  <p className="text-xs text-slate-400 mt-0.5">PPTX или PDF</p>
                </div>
              </button>
              <button
                onClick={() => navigate('/library')}
                className="flex-1 flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-brand-100 flex items-center justify-center transition-colors">
                  <BookImage className="w-5 h-5 text-slate-500 group-hover:text-brand-600 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">2. Библиотека</p>
                  <p className="text-xs text-slate-400 mt-0.5">Просмотр слайдов</p>
                </div>
              </button>
              <div className="flex-1 flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 border-brand-200 bg-brand-50/60">
                <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-brand-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-brand-800">3. Соберите</p>
                  <p className="text-xs text-brand-500 mt-0.5">AI подберёт слайды</p>
                </div>
              </div>
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
                    'flex items-center gap-4 p-4 rounded-2xl border border-slate-200 bg-white',
                    'hover:border-brand-300 hover:shadow-card-hover transition-all group cursor-pointer'
                  )}
                  onClick={() => navigate(`/assemble/${a.id}`)}
                >
                  {/* Thumbnail */}
                  <div
                    className="shrink-0 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex"
                    style={{ width: 96, height: 54 }}
                  >
                    {a.thumbnail_urls.length > 0 ? (
                      a.thumbnail_urls.slice(0, 3).map((url, i) => (
                        <img key={i} src={url} className="flex-1 h-full object-cover" style={{ minWidth: 0 }} />
                      ))
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
                        {isManual
                          ? <PenLine className="w-5 h-5 text-slate-300" />
                          : <Sparkles className="w-5 h-5 text-slate-300" />
                        }
                      </div>
                    )}
                  </div>

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
                          title="Переименовать"
                        >
                          <PenLine className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {isManual ? 'Создано вручную' : a.prompt}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-medium text-slate-600">{a.slide_count} сл.</span>
                    <p className="text-xs text-slate-400">{formatDate(a.created_at)}</p>
                  </div>

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
