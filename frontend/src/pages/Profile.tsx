import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search, X, Check, LogOut, Layers, FileText,
  Tag, Globe, Sparkles, Briefcase, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { profileApi, searchApi, libraryApi } from '../api/client'
import { SlideCard } from '../components/common/SlideCard'
import { Spinner } from '../components/common/Spinner'
import { useAuthStore } from '../store/auth'
import { cn } from '../utils/cn'
import type { Slide, UserProfile } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: 'ru', label: 'Русский' },
  { value: 'kk', label: 'Қазақша' },
  { value: 'en', label: 'English' },
] as const

const AI_STYLES = [
  { value: 'official', label: 'Официальный', desc: 'Деловой язык, строгий тон' },
  { value: 'neutral',  label: 'Нейтральный', desc: 'Сбалансированный стиль' },
  { value: 'casual',   label: 'Разговорный', desc: 'Живой, простой язык' },
] as const

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: number | undefined
  color: string
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 leading-none">
          {value === undefined ? <span className="text-slate-300">—</span> : value}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Tag Input ─────────────────────────────────────────────────────────────────

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (value: string) => {
    const tag = value.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag])
    }
    setInput('')
  }

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag))

  return (
    <div
      className="min-h-[42px] w-full flex flex-wrap gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white cursor-text focus-within:ring-2 focus-within:ring-brand-300 focus-within:border-brand-400 transition"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium"
        >
          {tag}
          <button onClick={() => removeTag(tag)} className="hover:text-brand-900 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addTag(input)
          } else if (e.key === 'Backspace' && !input && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={tags.length === 0 ? 'Введите тег и нажмите Enter...' : ''}
        className="flex-1 min-w-[120px] text-sm text-slate-700 placeholder-slate-400 bg-transparent outline-none"
      />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Profile() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { clearAuth, user: authUser } = useAuthStore()

  const handleLogout = () => {
    clearAuth()
    queryClient.clear()
    navigate('/login')
  }

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: profileApi.get,
  })

  const { data: stats } = useQuery({
    queryKey: ['profile-stats'],
    queryFn: profileApi.stats,
  })

  // Local form state
  const [name, setName]     = useState('')
  const [company, setCompany] = useState('')
  const [position, setPosition] = useState('')
  const [tags, setTags]     = useState<string[]>([])
  const [lang, setLang]     = useState<'ru' | 'kk' | 'en'>('ru')
  const [style, setStyle]   = useState<'official' | 'neutral' | 'casual'>('official')

  // Contact slide picker
  const [contactSlide, setContactSlide] = useState<Slide | null>(null)
  const [slideSearch, setSlideSearch]   = useState('')
  const [showSlidePicker, setShowSlidePicker] = useState(false)

  // Sync form state from fetched profile
  useEffect(() => {
    if (!profile) return
    setName(profile.name || '')
    setCompany(profile.company || '')
    setPosition(profile.position || '')
    setTags(profile.preferred_tags || [])
    setLang(profile.default_language || 'ru')
    setStyle(profile.ai_style || 'official')
  }, [profile])

  const { data: contactSlideData } = useQuery({
    queryKey: ['slide', profile?.contact_slide_id],
    queryFn: () => libraryApi.getSlide(profile!.contact_slide_id!),
    enabled: !!profile?.contact_slide_id,
  })
  useEffect(() => { if (contactSlideData) setContactSlide(contactSlideData) }, [contactSlideData])

  const { data: slideSearchResults, isFetching: searchFetching } = useQuery({
    queryKey: ['profile-search', slideSearch],
    queryFn: () =>
      slideSearch
        ? searchApi.search(slideSearch, 20)
        : libraryApi.listSlides({ page_size: 20 }).then((r) => ({ items: r.items, total: r.total, query: '' })),
    enabled: showSlidePicker,
  })

  const updateMutation = useMutation({
    mutationFn: profileApi.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Профиль сохранён')
    },
    onError: () => toast.error('Не удалось сохранить'),
  })

  const handleSave = () => {
    updateMutation.mutate({ name, company, position, preferred_tags: tags, default_language: lang, ai_style: style })
  }

  const handleSelectContactSlide = (slide: Slide) => {
    setContactSlide(slide)
    setShowSlidePicker(false)
    updateMutation.mutate({ contact_slide_id: slide.id })
  }

  const handleRemoveContactSlide = () => {
    setContactSlide(null)
    updateMutation.mutate({ contact_slide_id: undefined })
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner /></div>
  }

  const initials = profile?.name
    ? profile.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : authUser?.email?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-5">

      {/* ── Avatar + Name ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-md shrink-0">
          <span className="text-white text-2xl font-bold">{initials}</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            {profile?.name || authUser?.name || 'Профиль'}
          </h1>
          <p className="text-sm text-slate-500">{authUser?.email}</p>
          {profile?.position && (
            <p className="text-xs text-slate-400 mt-0.5">{profile.position}</p>
          )}
        </div>
      </div>

      {/* ── Статистика ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Layers}   label="Презентации"  value={stats?.assemblies_count} color="bg-brand-600" />
        <StatCard icon={FileText} label="Тезисы"        value={stats?.theses_count}     color="bg-violet-500" />
        <StatCard icon={Layers}   label="Слайдов"       value={stats?.slides_count}      color="bg-emerald-500" />
      </div>

      {/* ── Основная информация ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Основная информация</h2>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Имя</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 text-slate-800 placeholder-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Должность</label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Аналитик, Руководитель..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 text-slate-800 placeholder-slate-400"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Организация</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Название организации"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 text-slate-800 placeholder-slate-400"
            />
          </div>
        </div>
      </div>

      {/* ── Предпочтения ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Предпочтения для ИИ</h2>
        <div className="flex flex-col gap-4">

          {/* Preferred tags */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              <Tag className="w-3.5 h-3.5" /> Любимые темы
            </label>
            <TagInput tags={tags} onChange={setTags} />
            <p className="text-[11px] text-slate-400 mt-1">
              ИИ будет учитывать эти темы при подборе слайдов
            </p>
          </div>

          {/* Default language */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              <Globe className="w-3.5 h-3.5" /> Язык по умолчанию
            </label>
            <div className="flex gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLang(l.value)}
                  className={cn(
                    'flex-1 py-2 rounded-xl border text-sm font-medium transition-all',
                    lang === l.value
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Язык по умолчанию при генерации тезисов и контента
            </p>
          </div>

          {/* AI style */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5" /> Стиль ИИ
            </label>
            <div className="flex flex-col gap-2">
              {AI_STYLES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all',
                    style === s.value
                      ? 'bg-brand-50 border-brand-300 text-brand-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded-full border-2 shrink-0 transition-all',
                    style === s.value ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                  )} />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-slate-400">{s.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Save button ────────────────────────────────────────────────── */}
      <button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-brand text-white rounded-2xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all shadow-sm"
      >
        {updateMutation.isPending
          ? <Spinner size="sm" className="border-white border-t-transparent" />
          : <Check className="w-4 h-4" />
        }
        Сохранить изменения
      </button>

      {/* ── Контактный слайд ───────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Контактный слайд</h2>
        <p className="text-xs text-slate-500 mb-4">
          Автоматически добавляется в конец презентации, если запрос содержит «мои контакты».
        </p>

        {contactSlide ? (
          <div className="relative">
            <SlideCard slide={contactSlide} />
            <button
              onClick={handleRemoveContactSlide}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white shadow border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSlidePicker(true)}
            className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50/50 transition-all"
          >
            + Выбрать контактный слайд
          </button>
        )}

        {showSlidePicker && (
          <div className="mt-4">
            <div className="relative mb-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={slideSearch}
                onChange={(e) => setSlideSearch(e.target.value)}
                placeholder="Поиск слайда..."
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-slate-50 text-slate-800 placeholder-slate-400"
              />
            </div>
            {searchFetching ? (
              <div className="flex justify-center py-4"><Spinner /></div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {slideSearchResults?.items.map((slide) => (
                  <SlideCard key={slide.id} slide={slide} onClick={() => handleSelectContactSlide(slide)} />
                ))}
              </div>
            )}
            <button
              onClick={() => setShowSlidePicker(false)}
              className="w-full mt-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Отмена
            </button>
          </div>
        )}
      </div>

      {/* ── Logout ─────────────────────────────────────────────────────── */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 bg-white text-slate-500 rounded-2xl text-sm font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all shadow-sm"
      >
        <LogOut className="w-4 h-4" />
        Выйти из аккаунта
      </button>
    </div>
  )
}
