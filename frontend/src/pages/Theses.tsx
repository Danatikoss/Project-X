import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ArrowLeft, FileText, ChevronRight, Sparkles,
  Copy, CheckCheck, Globe, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { assemblyApi, thesesApi } from '../api/client'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { ThesisQuestion, SlideTheses } from '../types'

type Lang = 'ru' | 'kk' | 'en'
type Step = 'analyze' | 'questions' | 'result'

const LANG_LABELS: Record<Lang, string> = { ru: 'Рус', kk: 'Каз', en: 'Eng' }
const LANG_FULL: Record<Lang, string> = { ru: 'Русский', kk: 'Қазақша', en: 'English' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      onClick={handle}
      title="Копировать"
      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
    >
      {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ─── Slide Theses Card ────────────────────────────────────────────────────────

function SlideThesesCard({
  slideId,
  title,
  thumbnailUrl,
  theses,
  activeLang,
  index,
}: {
  slideId: number
  title: string | null
  thumbnailUrl: string
  theses: SlideTheses
  activeLang: Lang
  index: number
}) {
  const bullets = theses[activeLang] ?? []
  const allText = bullets.map((b, i) => `${i + 1}. ${b}`).join('\n')

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <div className="shrink-0 w-36 aspect-video rounded-xl overflow-hidden bg-gray-100 shadow-sm">
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Слайд {index + 1}
              </span>
              {title && (
                <p className="text-sm font-semibold text-gray-800 mt-0.5 line-clamp-1">{title}</p>
              )}
            </div>
            <CopyButton text={allText} />
          </div>

          {bullets.length === 0 ? (
            <p className="text-xs text-gray-400 italic">Нет тезисов для этого слайда</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {bullets.map((bullet, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-violet-50 text-violet-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Theses() {
  const { id } = useParams<{ id: string }>()
  const assemblyId = Number(id)
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('analyze')
  const [questions, setQuestions] = useState<ThesisQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [theses, setTheses] = useState<Record<string, SlideTheses> | null>(null)
  const [activeLang, setActiveLang] = useState<Lang>('ru')

  // Load assembly info
  const { data: assembly, isLoading: loadingAssembly } = useQuery({
    queryKey: ['assembly', assemblyId],
    queryFn: () => assemblyApi.get(assemblyId),
    enabled: !isNaN(assemblyId),
  })

  // Try loading previously saved theses
  const { data: initialTheses } = useQuery({
    queryKey: ['theses', assemblyId],
    queryFn: () => thesesApi.get(assemblyId).catch(() => null),
    enabled: !isNaN(assemblyId),
  })

  useEffect(() => {
    if (initialTheses?.theses && Object.keys(initialTheses.theses).length > 0) {
      setTheses(initialTheses.theses)
      setStep('result')
    }
  }, [initialTheses])

  // Step 1: Analyze
  const analyzeMutation = useMutation({
    mutationFn: () => thesesApi.analyze(assemblyId),
    onSuccess: (data) => {
      setQuestions(data.questions ?? [])
      setStep('questions')
    },
    onError: () => toast.error('Не удалось проанализировать презентацию'),
  })

  // Step 2/3: Generate
  const generateMutation = useMutation({
    mutationFn: () => thesesApi.generate(assemblyId, answers),
    onSuccess: (data) => {
      setTheses(data.theses)
      setStep('result')
      toast.success('Тезисы готовы')
    },
    onError: () => toast.error('Ошибка генерации тезисов'),
  })

  // Copy all theses for active lang
  const copyAll = async () => {
    if (!theses || !assembly) return
    const lines: string[] = [`${assembly.title}\n`]
    assembly.slides.forEach((slide, i) => {
      const st = theses[String(slide.id)]
      if (!st) return
      lines.push(`Слайд ${i + 1}. ${slide.title || ''}`)
      st[activeLang].forEach((b, j) => lines.push(`  ${j + 1}. ${b}`))
      lines.push('')
    })
    await navigator.clipboard.writeText(lines.join('\n'))
    toast.success('Скопировано в буфер обмена')
  }

  if (loadingAssembly) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    )
  }

  if (!assembly) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-gray-400">
        <AlertCircle className="w-8 h-8" />
        <p>Презентация не найдена</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/assemble/${assemblyId}`)}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FileText className="w-5 h-5 text-violet-500" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400">Тезисы к выступлению</p>
          <h1 className="text-sm font-semibold text-gray-800 truncate">{assembly.title}</h1>
        </div>
        {step === 'result' && theses && (
          <div className="flex items-center gap-2">
            {/* Lang switcher */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {(['ru', 'kk', 'en'] as Lang[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-all',
                    activeLang === lang
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  )}
                >
                  {LANG_LABELS[lang]}
                </button>
              ))}
            </div>
            <button
              onClick={copyAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" /> Скопировать всё
            </button>
            <button
              onClick={() => { setStep('analyze'); setTheses(null) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Сгенерировать заново
            </button>
          </div>
        )}
      </div>

      {/* Steps progress */}
      {step !== 'result' && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
          {[
            { key: 'analyze', label: 'Анализ' },
            { key: 'questions', label: 'Контекст' },
            { key: 'result', label: 'Тезисы' },
          ].map((s, i, arr) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold',
                step === s.key
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-200 text-gray-400'
              )}>
                {i + 1}
              </div>
              <span className={step === s.key ? 'text-gray-700 font-medium' : ''}>{s.label}</span>
              {i < arr.length - 1 && <ChevronRight className="w-3.5 h-3.5" />}
            </div>
          ))}
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* ── Step 1: Analyze ─────────────────────────────────────────────── */}
        {step === 'analyze' && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center">
              <FileText className="w-8 h-8 text-violet-500" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-lg font-bold text-gray-800 mb-2">Составим тезисы к выступлению</h2>
              <p className="text-sm text-gray-500">
                ИИ проанализирует презентацию и составит тезисы по каждому слайду на казахском, русском и английском языках.
                Стиль — официально-деловой, простые слова.
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 w-full max-w-sm text-sm text-gray-500">
              <p className="font-medium text-gray-700 mb-2">{assembly.title}</p>
              <p>{assembly.slides.length} слайдов</p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-60"
              >
                {analyzeMutation.isPending
                  ? <><Spinner size="sm" className="border-white border-t-transparent" /> Анализируем...</>
                  : <><Sparkles className="w-4 h-4" /> Начать</>
                }
              </button>
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {generateMutation.isPending
                  ? <><Spinner size="sm" /> Генерируем...</>
                  : 'Пропустить и сразу генерировать'
                }
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Clarifying questions ────────────────────────────────── */}
        {step === 'questions' && (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h2 className="text-lg font-bold text-gray-800 mb-1">Уточните контекст</h2>
              <p className="text-sm text-gray-500">Ответьте на вопросы — это поможет составить точные тезисы. Можно пропустить.</p>
            </div>

            <div className="flex flex-col gap-4">
              {questions.map((q) => (
                <div key={q.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{q.text}</label>
                  <input
                    type="text"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Введите ответ (необязательно)"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('analyze')}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Назад
              </button>
              <button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors disabled:opacity-60"
              >
                {generateMutation.isPending
                  ? <><Spinner size="sm" className="border-white border-t-transparent" /> Генерируем тезисы...</>
                  : <><Sparkles className="w-4 h-4" /> Сгенерировать тезисы</>
                }
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Result ──────────────────────────────────────────────── */}
        {step === 'result' && theses && (
          <div className="flex flex-col gap-4">
            {/* Language info bar */}
            <div className="flex items-center gap-2 bg-violet-50 rounded-xl px-4 py-2.5 text-sm text-violet-700">
              <Globe className="w-4 h-4 shrink-0" />
              <span className="font-medium">{LANG_FULL[activeLang]}</span>
              <span className="text-violet-400 text-xs ml-1">— переключайте язык в шапке</span>
            </div>

            {assembly.slides.map((slide, i) => {
              const st = theses[String(slide.id)]
              if (!st) return null
              return (
                <SlideThesesCard
                  key={slide.id}
                  slideId={slide.id}
                  title={slide.title}
                  thumbnailUrl={slide.thumbnail_url}
                  theses={st}
                  activeLang={activeLang}
                  index={i}
                />
              )
            })}

            {assembly.slides.length === 0 && (
              <div className="text-center text-gray-400 py-12">Слайдов нет</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
