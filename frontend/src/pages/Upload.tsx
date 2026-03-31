import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload as UploadIcon, CheckCircle, XCircle, ArrowLeft, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { libraryApi } from '../api/client'
import { useIndexingStore } from '../store/indexing'
import { Spinner } from '../components/common/Spinner'
import { cn } from '../utils/cn'

interface FileEntry {
  file: File
  wsToken: string | null
  status: 'queued' | 'uploading' | 'indexing' | 'done' | 'error'
  error?: string
}

function FileRow({ entry, onRemove, onDone }: { entry: FileEntry; onRemove: () => void; onDone: () => void }) {
  const job = useIndexingStore((s) => s.jobs.find((j) => j.ws_token === entry.wsToken))
  const isDone = job?.status === 'done' || entry.status === 'done'
  const isError = job?.status === 'error' || entry.status === 'error'

  // Notify parent when indexing completes so processQueue can advance
  const prevDone = useRef(false)
  useEffect(() => {
    if ((isDone || isError) && !prevDone.current) {
      prevDone.current = true
      onDone()
    }
  }, [isDone, isError, onDone])

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
      <div className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
        isDone ? 'bg-green-100' : isError ? 'bg-red-100' : 'bg-brand-100'
      )}>
        {isDone ? (
          <CheckCircle className="w-4 h-4 text-green-600" />
        ) : isError ? (
          <XCircle className="w-4 h-4 text-red-500" />
        ) : entry.status === 'queued' ? (
          <FileText className="w-4 h-4 text-gray-400" />
        ) : (
          <Spinner size="sm" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{entry.file.name}</p>
        <p className="text-xs text-gray-400">
          {(entry.file.size / 1024 / 1024).toFixed(1)} МБ
          {entry.status === 'queued' && ' · В очереди'}
          {isDone && ' · Готово'}
          {isError && ` · Ошибка: ${entry.error || job?.message}`}
        </p>
        {entry.status === 'indexing' && job && job.progress > 0 && (
          <div className="mt-1.5">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 bg-brand-700"
                style={{ width: `${Math.round(job.progress * 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{job.message}</p>
          </div>
        )}
      </div>
      {(entry.status === 'queued' || isDone || isError) && (
        <button onClick={onRemove} className="p-1 hover:bg-gray-200 rounded transition-colors shrink-0">
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      )}
    </div>
  )
}

export default function Upload() {
  const navigate = useNavigate()
  const [isDragging, setIsDragging] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addJob = useIndexingStore((s) => s.addJob)

  const processQueue = useCallback(async (queue: FileEntry[]) => {
    setIsProcessing(true)
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i]
      if (entry.status !== 'queued') continue

      setEntries((prev) => prev.map((e) =>
        e.file === entry.file ? { ...e, status: 'uploading' } : e
      ))

      try {
        const res = await libraryApi.upload(entry.file)
        addJob(res.ws_token, entry.file.name, res.source_id)
        setEntries((prev) => prev.map((e) =>
          e.file === entry.file
            ? { ...e, wsToken: res.ws_token, status: 'indexing' }
            : e
        ))
        // Wait for indexing to complete (poll via the wsToken state)
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            setEntries((prev) => {
              const current = prev.find((e) => e.file === entry.file)
              if (current?.status === 'done' || current?.status === 'error') {
                clearInterval(interval)
                resolve()
              }
              return prev
            })
          }, 500)
          // Safety timeout: 10 minutes
          setTimeout(() => { clearInterval(interval); resolve() }, 600_000)
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Неизвестная ошибка'
        setEntries((prev) => prev.map((e) =>
          e.file === entry.file ? { ...e, status: 'error', error: msg } : e
        ))
        toast.error(`Ошибка загрузки ${entry.file.name}: ${msg}`)
      }
    }
    setIsProcessing(false)
  }, [])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return
    const valid: FileEntry[] = []
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!['pptx', 'pdf'].includes(ext || '')) {
        toast.error(`${file.name}: поддерживаются только PPTX и PDF`)
        continue
      }
      if (file.size > 500 * 1024 * 1024) {
        toast.error(`${file.name}: файл превышает 500 МБ`)
        continue
      }
      valid.push({ file, wsToken: null, progress: null, status: 'queued' })
    }
    if (!valid.length) return
    const newEntries = [...entries, ...valid]
    setEntries(newEntries)
    if (!isProcessing) processQueue(valid)
  }, [entries, isProcessing, processQueue])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const removeEntry = (file: File) => {
    setEntries((prev) => prev.filter((e) => e.file !== file))
  }

  const doneCount = entries.filter((e) => e.status === 'done').length
  const allDone = entries.length > 0 && entries.every((e) => e.status === 'done' || e.status === 'error')

  return (
    <div className="min-h-full bg-white">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => navigate('/library')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Вернуться в библиотеку
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Загрузить презентации</h1>
        <p className="text-gray-500 mb-8">
          Загружайте несколько файлов PPTX или PDF. Каждый слайд будет проиндексирован с помощью AI.
        </p>

        {/* Drop zone */}
        <div
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4',
            'cursor-pointer transition-all',
            isDragging
              ? 'border-brand-500 bg-brand-50'
              : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pptx,.pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
            <UploadIcon className="w-7 h-7 text-brand-700" />
          </div>
          <div className="text-center">
            <p className="text-base font-medium text-gray-800">
              Перетащите файлы сюда или нажмите для выбора
            </p>
            <p className="text-sm text-gray-400 mt-1">PPTX, PDF — до 500 МБ каждый · Можно несколько</p>
          </div>
        </div>

        {/* File list */}
        {entries.length > 0 && (
          <div className="mt-6 flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-700">
                Файлы ({doneCount}/{entries.length} готово)
              </p>
              {allDone && (
                <button
                  onClick={() => navigate('/library')}
                  className="text-sm text-brand-700 hover:text-brand-900 font-medium transition-colors"
                >
                  Перейти в библиотеку →
                </button>
              )}
            </div>
            {entries.map((entry) => (
              <FileRow
                key={entry.file.name + entry.file.size}
                entry={entry}
                onRemove={() => removeEntry(entry.file)}
                onDone={() => setEntries((prev) => prev.map((e) =>
                  e.file === entry.file ? { ...e, status: 'done' } : e
                ))}
              />
            ))}
          </div>
        )}

        {/* Instructions */}
        {entries.length === 0 && (
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { step: '1', title: 'Загрузите', desc: 'PPTX или PDF файлы с вашими слайдами' },
              { step: '2', title: 'AI анализирует', desc: 'Каждый слайд получает заголовок, теги и эмбеддинг' },
              { step: '3', title: 'Используйте', desc: 'Слайды доступны для умной сборки презентаций' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-sm font-bold flex items-center justify-center mb-2">
                  {step}
                </div>
                <p className="font-medium text-sm text-gray-800">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
