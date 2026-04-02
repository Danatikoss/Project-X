import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Trash2, ChevronRight, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { assemblyApi, thesesApi } from '../api/client'
import { Spinner } from '../components/common/Spinner'
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

// ─── Create from Assembly Modal ───────────────────────────────────────────────

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (id: number) => void }) {
  const { data: assemblies, isLoading } = useQuery({
    queryKey: ['assemblies'],
    queryFn: assemblyApi.list,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-800">Выберите презентацию</h2>
          <p className="text-xs text-gray-500 mt-0.5">Тезисы будут созданы на основе слайдов выбранной сборки</p>
        </div>
        <div className="p-3 max-h-96 overflow-y-auto">
          {isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
          {assemblies?.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">Нет собранных презентаций</p>
          )}
          {assemblies?.map((a) => (
            <button
              key={a.id}
              onClick={() => onCreate(a.id)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-violet-50 hover:text-violet-700 transition-colors group"
            >
              {/* Thumbnail */}
              {a.thumbnail_urls[0] ? (
                <div className="w-16 h-9 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                  <img src={a.thumbnail_urls[0]} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-16 h-9 rounded-lg shrink-0 bg-gray-100 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 group-hover:text-violet-700 truncate">{a.title}</p>
                <p className="text-[11px] text-gray-400">{a.slide_count} слайдов</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-violet-400 shrink-0" />
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Отмена
          </button>
        </div>
      </div>
    </div>
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

  const { mutate: createSession, isPending: creating } = useMutation({
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
            <p className="text-sm mt-1">Выберите презентацию и создайте первые тезисы</p>
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
          onCreate={(id) => {
            setShowModal(false)
            createSession(id)
          }}
        />
      )}
    </div>
  )
}
