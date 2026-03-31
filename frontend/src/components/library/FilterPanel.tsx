import { X, Trash2, FolderOpen, Plus, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '../../utils/cn'
import { libraryApi, projectsApi } from '../../api/client'
import type { SourcePresentation, Project } from '../../types'

export interface Filters {
  source_id?: number
  layout_type?: string
  language?: string
  is_outdated?: boolean
  project_id?: number
  label?: string
}

interface FilterPanelProps {
  filters: Filters
  onChange: (f: Filters) => void
  sources: SourcePresentation[]
}

const VISIBLE_COUNT = 4

const LAYOUT_TYPES = [
  { value: 'title', label: 'Заголовок' },
  { value: 'content', label: 'Контент' },
  { value: 'chart', label: 'График' },
  { value: 'image', label: 'Изображение' },
  { value: 'table', label: 'Таблица' },
  { value: 'section', label: 'Секция' },
]

const LANGUAGES = [
  { value: 'ru', label: 'Русский' },
  { value: 'kk', label: 'Қазақша' },
  { value: 'en', label: 'English' },
]

function CollapseToggle({ expanded, total, visible, onToggle }: {
  expanded: boolean
  total: number
  visible: number
  onToggle: () => void
}) {
  if (total <= VISIBLE_COUNT) return null
  return (
    <button
      onClick={onToggle}
      className="mt-1 flex items-center gap-1 text-[10px] text-brand-600 hover:text-brand-800 transition-colors px-2"
    >
      {expanded ? (
        <><ChevronUp className="w-3 h-3" /> Свернуть</>
      ) : (
        <><ChevronDown className="w-3 h-3" /> Ещё {total - visible}</>
      )}
    </button>
  )
}

export function FilterPanel({ filters, onChange, sources }: FilterPanelProps) {
  const queryClient = useQueryClient()
  const hasFilters = Object.values(filters).some((v) => v !== undefined)
  const [newProjectName, setNewProjectName] = useState('')
  const [showNewProject, setShowNewProject] = useState(false)
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [labelsExpanded, setLabelsExpanded] = useState(false)

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  })

  const { data: allLabels = [] } = useQuery<string[]>({
    queryKey: ['labels'],
    queryFn: libraryApi.getLabels,
  })

  const deleteSourceMutation = useMutation({
    mutationFn: libraryApi.deleteSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['slides'] })
      onChange({ ...filters, source_id: undefined })
      toast.success('Источник удалён')
    },
    onError: () => toast.error('Не удалось удалить источник'),
  })

  const [extractingId, setExtractingId] = useState<number | null>(null)
  async function handleExtractMedia(sourceId: number) {
    setExtractingId(sourceId)
    try {
      const result = await libraryApi.extractMedia(sourceId)
      queryClient.invalidateQueries({ queryKey: ['slides'] })
      toast.success(`Медиа извлечено: обновлено ${result.updated} из ${result.total} слайдов`)
    } catch {
      toast.error('Не удалось извлечь медиа')
    } finally {
      setExtractingId(null)
    }
  }

  const createProjectMutation = useMutation({
    mutationFn: (name: string) => projectsApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setNewProjectName('')
      setShowNewProject(false)
      toast.success('Папка создана')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail ?? 'Ошибка'),
  })

  const deleteProjectMutation = useMutation({
    mutationFn: projectsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['slides'] })
      if (filters.project_id) onChange({ ...filters, project_id: undefined })
      toast.success('Папка удалена')
    },
  })

  const visibleProjects = projectsExpanded ? projects : projects.slice(0, VISIBLE_COUNT)
  const visibleSources = sourcesExpanded ? sources : sources.slice(0, VISIBLE_COUNT)
  const visibleLabels = labelsExpanded ? allLabels : allLabels.slice(0, VISIBLE_COUNT)

  return (
    <aside className="w-[220px] shrink-0 border-r border-gray-200 bg-surface p-4 flex flex-col gap-5 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Фильтры</h3>
        {hasFilters && (
          <button
            onClick={() => onChange({})}
            className="text-xs text-brand-700 hover:underline flex items-center gap-0.5"
          >
            <X className="w-3 h-3" /> Сбросить
          </button>
        )}
      </div>

      {/* Projects / Folders */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Папки</p>
          <button
            onClick={() => setShowNewProject((v) => !v)}
            className="text-gray-400 hover:text-brand-700 transition-colors"
            title="Создать папку"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {showNewProject && (
          <div className="flex gap-1 mb-2">
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newProjectName.trim()) createProjectMutation.mutate(newProjectName.trim())
                if (e.key === 'Escape') setShowNewProject(false)
              }}
              placeholder="Название папки"
              className="flex-1 text-xs px-2 py-1 rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-300"
            />
            <button
              disabled={!newProjectName.trim()}
              onClick={() => createProjectMutation.mutate(newProjectName.trim())}
              className="text-xs px-2 py-1 bg-brand-900 text-white rounded disabled:opacity-40"
            >
              ОК
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1">
          {visibleProjects.map((p) => (
            <div key={p.id} className="group flex items-center gap-1">
              <button
                onClick={() => onChange({ ...filters, project_id: filters.project_id === p.id ? undefined : p.id })}
                className={cn(
                  'flex-1 flex items-center gap-1.5 text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate',
                  filters.project_id === p.id
                    ? 'bg-brand-100 text-brand-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: p.color }} />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-gray-400 font-normal">{p.slide_count}</span>
              </button>
              <button
                onClick={() => {
                  if (!confirm(`Удалить папку "${p.name}"?`)) return
                  deleteProjectMutation.mutate(p.id)
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          {projects.length === 0 && (
            <p className="text-xs text-gray-400 italic px-2">Папок нет</p>
          )}
        </div>
        <CollapseToggle
          expanded={projectsExpanded}
          total={projects.length}
          visible={visibleProjects.length}
          onToggle={() => setProjectsExpanded((v) => !v)}
        />
      </div>

      {/* Sources */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Источник</p>
        <div className="flex flex-col gap-1">
          {visibleSources.map((s) => (
            <div key={s.id} className="group flex items-center gap-1">
              <button
                onClick={() => onChange({ ...filters, source_id: filters.source_id === s.id ? undefined : s.id })}
                className={cn(
                  'flex-1 text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate',
                  filters.source_id === s.id
                    ? 'bg-brand-100 text-brand-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {s.filename}
              </button>
              {s.file_type === 'pptx' && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleExtractMedia(s.id) }}
                  disabled={extractingId === s.id}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-brand-600 transition-all disabled:opacity-50"
                  title="Извлечь GIF и видео"
                >
                  <RefreshCw className={cn('w-3 h-3', extractingId === s.id && 'animate-spin')} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (!confirm('Удалить источник и все его слайды?')) return
                  deleteSourceMutation.mutate(s.id)
                }}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                title="Удалить"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <CollapseToggle
          expanded={sourcesExpanded}
          total={sources.length}
          visible={visibleSources.length}
          onToggle={() => setSourcesExpanded((v) => !v)}
        />
      </div>

      {/* Labels */}
      {allLabels.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Метки</p>
          <div className="flex flex-col gap-1">
            {visibleLabels.map((lbl) => (
              <button
                key={lbl}
                onClick={() => onChange({ ...filters, label: filters.label === lbl ? undefined : lbl })}
                className={cn(
                  'text-left text-xs px-2 py-1.5 rounded-md transition-colors truncate',
                  filters.label === lbl
                    ? 'bg-teal-100 text-teal-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
          <CollapseToggle
            expanded={labelsExpanded}
            total={allLabels.length}
            visible={visibleLabels.length}
            onToggle={() => setLabelsExpanded((v) => !v)}
          />
        </div>
      )}

      {/* Layout type */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Тип слайда</p>
        <div className="flex flex-col gap-1">
          {LAYOUT_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onChange({ ...filters, layout_type: filters.layout_type === value ? undefined : value })}
              className={cn(
                'text-left text-xs px-2 py-1.5 rounded-md transition-colors',
                filters.layout_type === value
                  ? 'bg-brand-100 text-brand-800 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Язык</p>
        <div className="flex gap-1 flex-wrap">
          {LANGUAGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onChange({ ...filters, language: filters.language === value ? undefined : value })}
              className={cn(
                'text-xs px-2 py-1 rounded-full border transition-colors',
                filters.language === value
                  ? 'bg-brand-900 text-white border-brand-900'
                  : 'border-gray-300 text-gray-600 hover:border-brand-400'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Outdated toggle */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.is_outdated === true}
            onChange={(e) => onChange({ ...filters, is_outdated: e.target.checked ? true : undefined })}
            className="rounded border-gray-300 text-brand-700 focus:ring-brand-500"
          />
          <span className="text-xs text-gray-600">Только устаревшие</span>
        </label>
      </div>
    </aside>
  )
}
