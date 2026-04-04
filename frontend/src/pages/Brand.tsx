import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Star, StarOff, Palette, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { brandApi } from '../api/client'
import { useAuthStore } from '../store/auth'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { BrandTemplate } from '../types'

const LAYOUT_LABELS: Record<string, string> = {
  title_content:   'Заголовок + контент',
  two_column:      'Два столбца',
  big_stat:        'Большая метрика',
  section_divider: 'Разделитель секции',
  quote:           'Цитата',
  comparison:      'Сравнение',
  timeline:        'Таймлайн',
}

function ColorDot({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border border-white/30 shadow-sm"
      style={{ background: `#${hex}` }}
    />
  )
}

function TemplateCard({ tmpl, onDelete, onSetDefault }: {
  tmpl: BrandTemplate
  onDelete: () => void
  onSetDefault: () => void
}) {
  const primary   = tmpl.colors.primary   || '1E3A8A'
  const secondary = tmpl.colors.secondary || '3B82F6'
  const bg        = tmpl.colors.background || 'FFFFFF'

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-card hover:shadow-card-hover transition-shadow">
      {/* Preview strip */}
      <div
        className="h-20 flex items-center justify-between px-5"
        style={{ background: `#${primary}` }}
      >
        <div className="flex flex-col gap-1.5">
          <div className="h-3 rounded-full bg-white/80 w-28" />
          <div className="h-2 rounded-full bg-white/40 w-20" />
          <div className="h-2 rounded-full bg-white/40 w-16" />
        </div>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: `#${secondary}` }}
        >
          <Palette className="w-4 h-4 text-white" />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{tmpl.name}</p>
            {tmpl.is_default && (
              <span className="text-[10px] px-2 py-0.5 bg-brand-100 text-brand-700 rounded-full font-semibold">
                По умолчанию
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {!tmpl.is_default && (
              <button
                onClick={onSetDefault}
                className="p-1.5 rounded-xl text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 transition-colors"
                title="Сделать основным"
              >
                <StarOff className="w-4 h-4" />
              </button>
            )}
            {tmpl.is_default && (
              <span className="p-1.5 text-yellow-500">
                <Star className="w-4 h-4 fill-yellow-400" />
              </span>
            )}
            <button
              onClick={onDelete}
              className="p-1.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Удалить"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Color palette */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1">Цвета:</span>
          {[primary, secondary, bg, tmpl.colors.text || '0F172A'].map((hex, i) => (
            <ColorDot key={i} hex={hex} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Brand() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const { data: templates = [], isLoading } = useQuery<BrandTemplate[]>({
    queryKey: ['brand-templates'],
    queryFn: brandApi.listTemplates,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) =>
      brandApi.uploadTemplate(name, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-templates'] })
      setName('')
      toast.success('Шаблон загружен')
    },
    onError: () => toast.error('Не удалось загрузить шаблон'),
  })

  const deleteMutation = useMutation({
    mutationFn: brandApi.deleteTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-templates'] })
      toast.success('Шаблон удалён')
    },
  })

  const defaultMutation = useMutation({
    mutationFn: brandApi.setDefault,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-templates'] }),
  })

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      toast.error('Только .pptx файлы')
      return
    }
    const templateName = name.trim() || file.name.replace(/\.pptx$/i, '')
    uploadMutation.mutate({ name: templateName, file })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-md">
          <Palette className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">Бренд-шаблоны</h1>
          <p className="text-sm text-slate-500">
            Загружайте PPTX-шаблоны — сгенерированные слайды будут точно следовать вашему бренду
          </p>
        </div>
        {user?.is_admin && (
          <button
            onClick={() => navigate('/brand/guidelines')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <ShieldCheck className="w-4 h-4" />
            Brand Guidelines
          </button>
        )}
      </div>

      {/* Upload card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8 shadow-card">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Загрузить шаблон</h2>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Название шаблона</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Корпоративный 2025"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 text-slate-800 placeholder-slate-400"
          />
        </div>

        <div
          onDragEnter={() => setDragOver(true)}
          onDragLeave={() => setDragOver(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all',
            dragOver
              ? 'border-brand-500 bg-brand-50 scale-[1.01]'
              : 'border-slate-200 hover:border-brand-400 hover:bg-brand-50/50'
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pptx"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {uploadMutation.isPending ? (
            <Spinner />
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                <Upload className="w-6 h-6 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">
                  Перетащите .pptx или нажмите для выбора
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Цвета бренда будут извлечены автоматически
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Templates list */}
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-slate-700">Ваши шаблоны</h2>
        {templates.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">{templates.length}</span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white border border-slate-200 rounded-2xl">
          <Palette className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-slate-500">Шаблонов пока нет</p>
          <p className="text-xs mt-1 text-slate-400">Загрузите свой корпоративный PPTX выше</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              tmpl={t}
              onDelete={() => deleteMutation.mutate(t.id)}
              onSetDefault={() => defaultMutation.mutate(t.id)}
            />
          ))}
        </div>
      )}

      {/* Layouts reference */}
      <div className="mt-10 bg-white border border-slate-200 rounded-2xl p-6 shadow-card">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Доступные макеты слайдов</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(LAYOUT_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 py-2 px-3 bg-surface rounded-xl border border-slate-100">
              <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
              <span className="text-xs text-slate-700 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
