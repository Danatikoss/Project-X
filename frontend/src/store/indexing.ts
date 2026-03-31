import { create } from 'zustand'
import { toast } from 'sonner'

export interface IndexingJob {
  ws_token: string
  filename: string
  source_id: number
  status: 'indexing' | 'done' | 'error'
  progress: number   // 0–1
  message: string
}

// WebSocket connections live outside Zustand (not serializable)
const _connections = new Map<string, WebSocket>()

interface IndexingState {
  jobs: IndexingJob[]
  addJob: (ws_token: string, filename: string, source_id: number) => void
  _updateJob: (ws_token: string, update: Partial<IndexingJob>) => void
  dismiss: (ws_token: string) => void
  dismissCompleted: () => void
}

export const useIndexingStore = create<IndexingState>((set, get) => ({
  jobs: [],

  addJob: (ws_token, filename, source_id) => {
    // Don't add duplicates
    if (get().jobs.some((j) => j.ws_token === ws_token)) return

    set((s) => ({
      jobs: [
        { ws_token, filename, source_id, status: 'indexing', progress: 0, message: 'Подготовка...' },
        ...s.jobs,
      ],
    }))

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/indexing/${ws_token}`)
    _connections.set(ws_token, ws)

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.stage === 'ping') return

        if (data.stage === 'done') {
          get()._updateJob(ws_token, { status: 'done', progress: 1, message: 'Готово' })
          toast.success(`«${filename}» проиндексирован`, { duration: 4000 })
          ws.close()
        } else if (data.stage === 'error') {
          get()._updateJob(ws_token, { status: 'error', message: data.message || 'Ошибка' })
          toast.error(`Ошибка при индексации «${filename}»`)
          ws.close()
        } else {
          get()._updateJob(ws_token, {
            progress: data.progress || 0,
            message: data.message || '',
          })
        }
      } catch { /* ignore malformed */ }
    }

    ws.onerror = () => {
      get()._updateJob(ws_token, { status: 'error', message: 'Соединение прервано' })
    }

    ws.onclose = () => {
      _connections.delete(ws_token)
    }
  },

  _updateJob: (ws_token, update) => {
    set((s) => ({
      jobs: s.jobs.map((j) => j.ws_token === ws_token ? { ...j, ...update } : j),
    }))
  },

  dismiss: (ws_token) => {
    _connections.get(ws_token)?.close()
    set((s) => ({ jobs: s.jobs.filter((j) => j.ws_token !== ws_token) }))
  },

  dismissCompleted: () => {
    set((s) => ({ jobs: s.jobs.filter((j) => j.status === 'indexing') }))
  },
}))
