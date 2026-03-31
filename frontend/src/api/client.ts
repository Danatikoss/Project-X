import axios from 'axios'
import type {
  Slide, SlideListResponse, SlidePatchRequest, SourcePresentation,
  UploadResponse, Assembly, AssemblyListItem, AssembleRequest,
  AssemblyPatchRequest, SearchResponse, UserProfile, UserProfilePatchRequest,
  AuthResponse, Project,
} from '../types'
import { useAuthStore } from '../store/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Добавляем токен в каждый запрос
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Если 401 — пробуем обновить токен, иначе выходим
let _refreshing = false
let _refreshQueue: Array<(token: string | null) => void> = []

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    const { refreshToken, setAuth, clearAuth } = useAuthStore.getState()
    if (!refreshToken) {
      clearAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (_refreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push((newToken) => {
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`
            resolve(api(original))
          } else {
            reject(error)
          }
        })
      })
    }

    original._retry = true
    _refreshing = true

    try {
      const res = await axios.post(
        (import.meta.env.VITE_API_URL ?? '/api') + '/auth/refresh',
        { refresh_token: refreshToken }
      )
      const { access_token, refresh_token, user } = res.data
      setAuth(user, access_token, refresh_token)
      _refreshQueue.forEach((cb) => cb(access_token))
      _refreshQueue = []
      original.headers.Authorization = `Bearer ${access_token}`
      return api(original)
    } catch {
      _refreshQueue.forEach((cb) => cb(null))
      _refreshQueue = []
      clearAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    } finally {
      _refreshing = false
    }
  }
)

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: async (email: string, password: string, name?: string): Promise<AuthResponse> => {
    const res = await api.post<AuthResponse>('/auth/register', { email, password, name })
    return res.data
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password })
    return res.data
  },

  refresh: async (refresh_token: string): Promise<AuthResponse> => {
    const res = await api.post<AuthResponse>('/auth/refresh', { refresh_token })
    return res.data
  },
}

// ─── Library ─────────────────────────────────────────────────────────────────

export interface ListSlidesParams {
  page?: number
  page_size?: number
  source_id?: number
  layout_type?: string
  language?: string
  tag?: string
  label?: string
  is_outdated?: boolean
  project_id?: number
}

export const libraryApi = {
  upload: async (file: File): Promise<UploadResponse> => {
    const form = new FormData()
    form.append('file', file)
    const res = await api.post<UploadResponse>('/library/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  uploadMany: async (files: File[]): Promise<UploadResponse[]> => {
    const results: UploadResponse[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post<UploadResponse>('/library/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      results.push(res.data)
    }
    return results
  },

  listSlides: async (params: ListSlidesParams = {}): Promise<SlideListResponse> => {
    const res = await api.get<SlideListResponse>('/library/slides', { params })
    return res.data
  },

  getSlide: async (id: number): Promise<Slide> => {
    const res = await api.get<Slide>(`/library/slides/${id}`)
    return res.data
  },

  updateSlide: async (id: number, data: SlidePatchRequest): Promise<Slide> => {
    const res = await api.patch<Slide>(`/library/slides/${id}`, data)
    return res.data
  },

  deleteSlide: async (id: number): Promise<void> => {
    await api.delete(`/library/slides/${id}`)
  },

  getLabels: async (): Promise<string[]> => {
    const res = await api.get<string[]>('/library/labels')
    return res.data
  },

  listSources: async (): Promise<SourcePresentation[]> => {
    const res = await api.get<SourcePresentation[]>('/library/sources')
    return res.data
  },

  deleteSource: async (id: number): Promise<void> => {
    await api.delete(`/library/sources/${id}`)
  },

  extractMedia: async (id: number): Promise<{ updated: number; total: number }> => {
    const res = await api.post<{ updated: number; total: number }>(`/library/sources/${id}/extract-media`)
    return res.data
  },
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projectsApi = {
  list: async (): Promise<Project[]> => {
    const res = await api.get<Project[]>('/projects')
    return res.data
  },

  create: async (name: string, color?: string): Promise<Project> => {
    const res = await api.post<Project>('/projects', { name, color: color ?? '#1E3A8A' })
    return res.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/projects/${id}`)
  },

  assignSlide: async (projectId: number, slideId: number): Promise<void> => {
    await api.post(`/projects/${projectId}/slides/${slideId}`)
  },

  unassignSlide: async (projectId: number, slideId: number): Promise<void> => {
    await api.delete(`/projects/${projectId}/slides/${slideId}`)
  },
}

// ─── Assembly ────────────────────────────────────────────────────────────────

export const assemblyApi = {
  createBlank: async (title = 'Новая презентация'): Promise<Assembly> => {
    const res = await api.post<Assembly>('/assemble/blank', { title })
    return res.data
  },

  create: async (req: AssembleRequest): Promise<Assembly> => {
    const res = await api.post<Assembly>('/assemble', req)
    return res.data
  },

  list: async (): Promise<AssemblyListItem[]> => {
    const res = await api.get<AssemblyListItem[]>('/assemble')
    return res.data
  },

  get: async (id: number): Promise<Assembly> => {
    const res = await api.get<Assembly>(`/assemble/${id}`)
    return res.data
  },

  update: async (id: number, data: AssemblyPatchRequest): Promise<Assembly> => {
    const res = await api.patch<Assembly>(`/assemble/${id}`, data)
    return res.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/assemble/${id}`)
  },

  duplicate: async (id: number): Promise<Assembly> => {
    const res = await api.post<Assembly>(`/assemble/${id}/duplicate`)
    return res.data
  },

  share: async (id: number): Promise<{ share_token: string }> => {
    const res = await api.post<{ share_token: string }>(`/assemble/${id}/share`)
    return res.data
  },

  getPublic: async (shareToken: string): Promise<Assembly> => {
    const res = await api.get<Assembly>(`/assemble/public/${shareToken}`)
    return res.data
  },

  export: async (id: number, format: 'pptx' | 'pdf' = 'pptx'): Promise<void> => {
    const res = await api.post(
      `/assemble/${id}/export`,
      { format },
      { responseType: 'blob' }
    )
    const url = window.URL.createObjectURL(new Blob([res.data]))
    const contentDisposition = res.headers['content-disposition'] || ''
    const match = contentDisposition.match(/filename="?([^"]+)"?/)
    const filename = match ? match[1] : `presentation_${id}.${format}`
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.URL.revokeObjectURL(url)
  },
}

// ─── Search ──────────────────────────────────────────────────────────────────

export const searchApi = {
  search: async (q: string, limit = 20, offset = 0): Promise<SearchResponse> => {
    const res = await api.get<SearchResponse>('/search', { params: { q, limit, offset } })
    return res.data
  },
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export const profileApi = {
  get: async (): Promise<UserProfile> => {
    const res = await api.get<UserProfile>('/profile')
    return res.data
  },

  update: async (data: UserProfilePatchRequest): Promise<UserProfile> => {
    const res = await api.patch<UserProfile>('/profile', data)
    return res.data
  },
}
