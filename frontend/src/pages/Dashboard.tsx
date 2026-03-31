import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Clock, Presentation, ChevronRight, Layers, Copy, PenLine, Trash2, Upload, BookImage, Check } from 'lucide-react'
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
    desc: 'Проблема, решение, рынок, команда, метрики',
    prompt: 'Питч-дек для инвестора: проблема на рынке, наше решение, объём рынка, бизнес-модель, команда и текущие метрики роста',
  },
  {
    id: 'quarterly',
    emoji: '📊',
    title: 'Квартальный отчёт',
    desc: 'KPI, достижения, риски, планы на квартал',
    prompt: 'Квартальный отчёт: выполнение KPI, ключевые достижения периода, выявленные риски и проблемы, планы на следующий квартал',
  },
  {
    id: 'project',
    emoji: '📋',
    title: 'Статус проекта',
    desc: 'Прогресс, риски, следующие шаги',
    prompt: 'Статус-отчёт по проекту: цели и задачи, текущий прогресс выполнения, риски и блокеры, следующие шаги и дедлайны',
  },
  {
    id: 'strategy',
    emoji: '🎯',
    title: 'Стратегия',
    desc: 'Анализ, приоритеты, дорожная карта',
    prompt: 'Стратегический план: анализ текущего состояния и рынка, стратегические цели и приоритеты, дорожная карта реализации',
  },
  {
    id: 'review',
    emoji: '🔍',
    title: 'Бизнес-обзор',
    desc: 'Показатели, тренды, выводы',
    prompt: 'Бизнес-обзор: ключевые показатели и их динамика, сравнение с целями и конкурентами, выводы и рекомендации',
  },
  {
    id: 'onboarding',
    emoji: '👋',
    title: 'Онбординг',
    desc: 'Компания, структура, процессы, первые шаги',
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
    <div className="min-h-full bg-white">
      {/* Hero section */}
      <div className="flex flex-col items-center justify-center px-6 pt-16 pb-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-brand-900 rounded-xl flex items-center justify-center">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">SLIDEX</h1>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl mb-8">
          <button
            onClick={() => setMode('ai')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              mode === 'ai' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Sparkles className="w-4 h-4" />
            AI-подбор
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              mode === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <PenLine className="w-4 h-4" />
            Вручную
          </button>
        </div>

        {mode === 'ai' ? (
          <>
            <p className="text-gray-500 text-center mb-6 max-w-md">
              Опишите нужную презентацию — AI подберёт слайды из библиотеки и выстроит их в логичную структуру
            </p>
            <form onSubmit={handleAiSubmit} className="w-full max-w-2xl">
              <div className="relative">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAiSubmit(e) }}
                  placeholder="Опишите презентацию, которую нужно собрать..."
                  rows={3}
                  className={cn(
                    'w-full rounded-2xl border border-gray-200 bg-white px-5 py-4 pr-16',
                    'text-sm text-gray-800 placeholder-gray-400 resize-none',
                    'focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400',
                    'shadow-sm transition-shadow hover:shadow-md'
                  )}
                />
                <button
                  type="submit"
                  disabled={!prompt.trim() || assembleMutation.isPending}
                  className={cn(
                    'absolute right-3 bottom-3 flex items-center gap-1.5 px-4 py-2 rounded-xl',
                    'bg-brand-900 text-white text-sm font-medium transition-all',
                    'hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed',
                    'shadow-sm hover:shadow'
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
                <p className="text-xs text-gray-400 mb-2">Шаблоны</p>
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
                        'text-left p-3 rounded-xl border transition-all',
                        prompt === t.prompt
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
                      )}
                    >
                      <span className="text-base leading-none">{t.emoji}</span>
                      <p className="text-xs font-medium text-gray-800 mt-1.5">{t.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="text-gray-500 text-center mb-6 max-w-md">
              Создайте пустую презентацию и самостоятельно подберите слайды из библиотеки
            </p>
            <form onSubmit={handleManualSubmit} className="w-full max-w-2xl">
              <div className="flex gap-3">
                <input
                  autoFocus
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Название презентации (необязательно)"
                  className={cn(
                    'flex-1 rounded-2xl border border-gray-200 bg-white px-5 py-4',
                    'text-sm text-gray-800 placeholder-gray-400',
                    'focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400',
                    'shadow-sm'
                  )}
                />
                <button
                  type="submit"
                  disabled={blankMutation.isPending}
                  className={cn(
                    'flex items-center gap-2 px-6 py-4 rounded-2xl',
                    'bg-brand-900 text-white text-sm font-medium transition-all',
                    'hover:bg-brand-800 disabled:opacity-50 shadow-sm hover:shadow'
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
              <p className="text-xs text-gray-400 mt-3 text-center">
                После создания откроется редактор с браузером библиотеки — добавляйте слайды одним кликом
              </p>
            </form>
          </>
        )}
      </div>

      {/* Recent assemblies */}
      <div className="max-w-2xl mx-auto px-6 pb-16">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Недавние сборки</h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !assemblies?.length ? (
          <div className="py-8">
            <p className="text-xs text-gray-400 text-center mb-4">Сборок пока нет — начните с одного из шагов:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => navigate('/library/upload')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-800">1. Загрузите слайды</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">PPTX или PDF файлы</p>
                </div>
              </button>
              <button
                onClick={() => navigate('/library')}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <BookImage className="w-4 h-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-800">2. Изучите библиотеку</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Просматривайте слайды</p>
                </div>
              </button>
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-gray-200 bg-brand-50 border-brand-200 text-left">
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-brand-700" />
                </div>
                <div>
                  <p className="text-xs font-medium text-brand-900">3. Соберите презентацию</p>
                  <p className="text-[11px] text-brand-600 mt-0.5">AI подберёт слайды</p>
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
                    'flex items-center gap-4 p-4 rounded-xl border border-gray-100',
                    'hover:border-brand-200 hover:bg-brand-50/50 transition-all group cursor-pointer'
                  )}
                  onClick={() => navigate(`/assemble/${a.id}`)}
                >
                  {/* Thumbnail strip or fallback icon */}
                  <div className="shrink-0 rounded-lg overflow-hidden border border-gray-100 bg-gray-100 flex" style={{ width: 90, height: 50 }}>
                    {a.thumbnail_urls.length > 0 ? (
                      a.thumbnail_urls.slice(0, 3).map((url, i) => (
                        <img key={i} src={url} className="flex-1 h-full object-cover" style={{ minWidth: 0 }} />
                      ))
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        {isManual
                          ? <PenLine className="w-4 h-4 text-gray-300" />
                          : <Sparkles className="w-4 h-4 text-gray-300" />
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
                          className="flex-1 text-sm font-medium border-b border-brand-400 focus:outline-none bg-transparent py-0.5 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          onMouseDown={(e) => { e.preventDefault(); commitRename() }}
                          className="p-0.5 text-brand-700 hover:text-brand-900 shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group/title">
                        <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                        <button
                          onClick={(e) => startRename(e, a)}
                          className="opacity-0 group-hover/title:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 transition-all shrink-0"
                          title="Переименовать"
                        >
                          <PenLine className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {isManual ? 'Создано вручную' : a.prompt}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-400">{a.slide_count} сл.</span>
                    <p className="text-xs text-gray-400">{formatDate(a.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(a.id) }}
                      title="Дублировать"
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-gray-400" />
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
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
