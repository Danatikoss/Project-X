import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Trash2, ChevronRight, Clock, Upload, FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { assemblyApi, thesesApi } from '../api/client'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'
import type { ThesesSessionListItem } from '../types'

function SessionCard({
  session,
  onDelete,
  onClick,
}: {
  session: ThesesSessionListItem
  onDelete: () => void
  onClick: () => void
}) {
  const date = session.updated_at
    ? new Date(session.updated_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md hover:border-violet-200 transition-all cursor-pointer group"
    >
      {/* Thumbnail strip */}
      <div className="flex gap-1 p-3 pb-0 h-20 overflow-hidden">
        {session.thumbnail_paths.length === 0 && (
          <div className="w-full h-full rounded-xl bg-gray-50 flex items-center justify-center">
            <FileText className="w-6 h-6 text-gray-300" />
          </div>
        )}
        {session.thumbnail_paths.map((tp, i) => (
          <div key={i} className="flex-1 rounded-xl overflow-hidden bg-gray-100">
            <img
              src={`/thumbnails/${tp}`}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>

      <div className="p-3 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-violet-700 transition-colors">
            {session.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-gray-400">{session.slide_count} слайдов</span>
            {session.has_theses && (
              <span className="text-[10px] bg-violet-50 text-violet-600 font-medium px-1.5 py-0.5 rounded-full">
                готово
              </span>
            )}
            {date && (
              <span className="text-[11px] text-gray-300 flex items-center gap-1 ml-auto">
                <Clock className="w-3 h-3" /> {date}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-violet-400 transition-colors" />
        </div>
      </div>
    </div>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

type ModalTab = 'assembly' | 'upload'

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (sessionId: number) => void
}) {
  const [tab, setTab] = useState<ModalTab>('assembly')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: assemblies, isLoading } = useQuery({
    queryKey: ['assemblies'],
    queryFn: assemblyApi.list,
    enabled: tab === 'assembly',
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => thesesApi.uploadFile(file),
    onSuccess: (session) => onCreated(session.id),
    onError: () => {
      toast.error('Не удалось обработать файл')
      setUploading(false)
    },
  })

  const handleFileSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pptx', 'pdf', 'docx'].includes(ext ?? '')) {
      toast.error('Допустимые форматы: PPTX, PDF, DOCX')
      return
    }
    setSelectedFile(file)
  }

  const handleUpload = () => {
    if (!selectedFile) return
    setUploading(true)
    uploadMutation.mutate(selectedFile)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Создать тезисы</h2>
          <p className="text-xs text-gray-500 mt-0.5">Выберите источник для генерации тезисов</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-3 pb-0">
          <button
            onClick={() => setTab('assembly')}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-semibold transition-colors',
              tab === 'assembly'
                ? 'bg-violet-50 text-violet-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
          >
            Из сборки
          </button>
          <button
            onClick={() => setTab('upload')}
            className={cn(
              'flex-1 py-2 rounded-xl text-xs font-semibold transition-colors',
              tab === 'upload'
                ? 'bg-violet-50 text-violet-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
          >
            Загрузить файл
          </button>
        </div>

        {/* Tab: Assembly */}
        {tab === 'assembly' && (
          <div className="p-3 max-h-80 overflow-y-auto">
            {isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
            {assemblies?.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Нет собранных презентаций</p>
            )}
            {assemblies?.map((a) => (
              <AssemblyPickerRow
                key={a.id}
                assembly={a}
                onSelect={() => onCreated(-a.id)} // signal to parent to create from assembly
              />
            ))}
          </div>
        )}

        {/* Tab: Upload */}
        {tab === 'upload' && (
          <div className="p-4 flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx,.pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(f)
                e.target.value = ''
              }}
            />

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFileSelect(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'rounded-2xl border-2 border-dashed p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors',
                dragging ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
              )}
            >
              <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center">
                <Upload className="w-6 h-6 text-violet-500" />
              </div>
              {selectedFile ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800 truncate max-w-[260px]">{selectedFile.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{(selectedFile.size / 1024 / 1024).toFixed(1)} МБ</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">Перетащите файл или нажмите</p>
                  <p className="text-xs text-gray-400 mt-1">PPTX, PDF — для генерации тезисов</p>
                  <p className="text-xs text-gray-400">DOCX — для импорта готовых тезисов</p>
                </div>
              )}
            </div>

            {/* Format hints */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { ext: 'PPTX', label: 'Презентация', color: 'text-orange-500 bg-orange-50' },
                { ext: 'PDF', label: 'Документ', color: 'text-red-500 bg-red-50' },
                { ext: 'DOCX', label: 'Тезисы', color: 'text-blue-500 bg-blue-50' },
              ].map(({ ext, label, color }) => (
                <div key={ext} className={cn('rounded-xl px-3 py-2 text-center', color.split(' ')[1])}>
                  <p className={cn('text-xs font-bold', color.split(' ')[0])}>{ext}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {selectedFile && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60"
              >
                {uploading
                  ? <><Spinner size="sm" className="border-white border-t-transparent" /> Обрабатываем...</>
                  : <><FileUp className="w-4 h-4" /> Создать тезисы</>
                }
              </button>
            )}
          </div>
        )}

        <div className="p-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

function AssemblyPickerRow({ assembly, onSelect }: { assembly: { id: number; title: string; slide_count: number; thumbnail_urls: string[] }; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-violet-50 hover:text-violet-700 transition-colors group"
    >
      {assembly.thumbnail_urls[0] ? (
        <div className="w-16 h-9 rounded-lg overflow-hidden shrink-0 bg-gray-100">
          <img src={assembly.thumbnail_urls[0]} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-16 h-9 rounded-lg shrink-0 bg-gray-100 flex items-center justify-center">
          <FileText className="w-4 h-4 text-gray-300" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 group-hover:text-violet-700 truncate">{assembly.title}</p>
        <p className="text-[11px] text-gray-400">{assembly.slide_count} слайдов</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-violet-400 shrink-0" />
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ThesesList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['theses'],
    queryFn: thesesApi.list,
  })

  const { mutate: createFromAssembly, isPending: creating } = useMutation({
    mutationFn: (assemblyId: number) => thesesApi.create(assemblyId),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ['theses'] })
      navigate(`/theses/${session.id}`)
    },
    onError: () => toast.error('Не удалось создать сессию'),
  })

  const { mutate: deleteSession } = useMutation({
    mutationFn: thesesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['theses'] })
      toast.success('Удалено')
    },
    onError: () => toast.error('Ошибка удаления'),
  })

  const [showModal, setShowModal] = useState(false)

  const handleCreated = (id: number) => {
    setShowModal(false)
    if (id < 0) {
      // negative id signals "create from assembly", abs value is assembly_id
      createFromAssembly(-id)
    } else {
      // uploaded file → session id returned directly
      queryClient.invalidateQueries({ queryKey: ['theses'] })
      navigate(`/theses/${id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-violet-500" />
            Тезисы
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Официально-деловые тезисы к выступлению на KK / RU / EN
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60 shadow-sm"
        >
          {creating ? <Spinner size="sm" className="border-white border-t-transparent" /> : <Plus className="w-4 h-4" />}
          Создать
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : sessions?.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-gray-400">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center">
            <FileText className="w-8 h-8 text-violet-300" />
          </div>
          <div className="text-center">
            <p className="font-medium text-gray-600">Тезисов пока нет</p>
            <p className="text-sm mt-1">Выберите презентацию или загрузите файл</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Создать тезисы
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sessions?.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onClick={() => navigate(`/theses/${session.id}`)}
              onDelete={() => deleteSession(session.id)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
