import axios from 'axios'
import type {
  Slide, SlideListResponse, SlidePatchRequest, SourcePresentation,
  UploadResponse, Assembly, AssemblyListItem, AssembleRequest,
  AssemblyPatchRequest, SearchResponse, UserProfile, UserProfilePatchRequest,
  AuthResponse, Project, BrandTemplate, GenerateSlideRequest, GenerateSlideResponse,
  MediaFolder, MediaAsset, AssemblyTemplate,
  ThesisQuestion, ThesesSession, ThesesSessionListItem,
  ProfileStats,
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

  createFromTemplate: async (templateId: number): Promise<Assembly> => {
    const res = await api.post<Assembly>(`/assemble/from-template/${templateId}`)
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
    const url = window.URL.createObjectURL(res.data as Blob)
    const contentDisposition = res.headers['content-disposition'] || ''
    const match = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'";\n]*)\1/)
    const filename = match?.[2]?.trim() || `presentation_${id}.${format}`
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => window.URL.revokeObjectURL(url), 5000)
  },
}

// ─── Brand & Generation ───────────────────────────────────────────────────────

export const brandApi = {
  listTemplates: async (): Promise<BrandTemplate[]> => {
    const res = await api.get<BrandTemplate[]>('/brand/templates')
    return res.data
  },

  uploadTemplate: async (name: string, file: File): Promise<BrandTemplate> => {
    const form = new FormData()
    form.append('name', name)
    form.append('file', file)
    const res = await api.post<BrandTemplate>('/brand/templates', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  setDefault: async (id: number): Promise<BrandTemplate> => {
    const res = await api.patch<BrandTemplate>(`/brand/templates/${id}/default`)
    return res.data
  },

  deleteTemplate: async (id: number): Promise<void> => {
    await api.delete(`/brand/templates/${id}`)
  },

  generateSlide: async (req: GenerateSlideRequest): Promise<GenerateSlideResponse> => {
    const res = await api.post<GenerateSlideResponse>('/brand/generate', req)
    return res.data
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

  stats: async (): Promise<ProfileStats> => {
    const res = await api.get<ProfileStats>('/profile/stats')
    return res.data
  },
}

// ─── Media Library ────────────────────────────────────────────────────────────

export const mediaApi = {
  listFolders: async (): Promise<MediaFolder[]> => {
    const res = await api.get<MediaFolder[]>('/media/folders')
    return res.data
  },

  createFolder: async (name: string): Promise<MediaFolder> => {
    const res = await api.post<MediaFolder>('/media/folders', { name })
    return res.data
  },

  renameFolder: async (id: number, name: string): Promise<MediaFolder> => {
    const res = await api.patch<MediaFolder>(`/media/folders/${id}`, { name })
    return res.data
  },

  deleteFolder: async (id: number): Promise<void> => {
    await api.delete(`/media/folders/${id}`)
  },

  listAssets: async (params?: { folder_id?: number; unfoldered?: boolean }): Promise<MediaAsset[]> => {
    const res = await api.get<MediaAsset[]>('/media/assets', { params })
    return res.data
  },

  upload: async (file: File, name: string, folder_id?: number): Promise<MediaAsset> => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    if (folder_id != null) form.append('folder_id', String(folder_id))
    const res = await api.post<MediaAsset>('/media/assets/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  updateAsset: async (id: number, data: { name?: string; folder_id?: number; clear_folder?: boolean }): Promise<MediaAsset> => {
    const res = await api.patch<MediaAsset>(`/media/assets/${id}`, data)
    return res.data
  },

  deleteAsset: async (id: number): Promise<void> => {
    await api.delete(`/media/assets/${id}`)
  },
}

// ─── Theses ───────────────────────────────────────────────────────────────────

export const thesesApi = {
  list: async (): Promise<ThesesSessionListItem[]> => {
    const res = await api.get<ThesesSessionListItem[]>('/theses')
    return res.data
  },

  create: async (assemblyId: number): Promise<ThesesSession> => {
    const res = await api.post<ThesesSession>('/theses', { assembly_id: assemblyId })
    return res.data
  },

  uploadFile: async (file: File): Promise<ThesesSession> => {
    const form = new FormData()
    form.append('file', file)
    const res = await api.post<ThesesSession>('/theses/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  get: async (sessionId: number): Promise<ThesesSession> => {
    const res = await api.get<ThesesSession>(`/theses/${sessionId}`)
    return res.data
  },

  delete: async (sessionId: number): Promise<void> => {
    await api.delete(`/theses/${sessionId}`)
  },

  analyze: async (sessionId: number): Promise<{ questions: ThesisQuestion[] }> => {
    const res = await api.post<{ questions: ThesisQuestion[] }>(`/theses/${sessionId}/analyze`)
    return res.data
  },

  generate: async (sessionId: number, context?: Record<string, string>): Promise<{ theses: ThesesSession['theses'] }> => {
    const res = await api.post<{ theses: ThesesSession['theses'] }>(`/theses/${sessionId}/generate`, { context: context ?? {} })
    return res.data
  },
}

// ─── Assembly Templates ───────────────────────────────────────────────────────

export const templatesApi = {
  list: async (): Promise<AssemblyTemplate[]> => {
    const res = await api.get<AssemblyTemplate[]>('/templates')
    return res.data
  },
  get: async (id: number): Promise<AssemblyTemplate> => {
    const res = await api.get<AssemblyTemplate>(`/templates/${id}`)
    return res.data
  },
  create: async (data: { name: string; description?: string; slide_ids?: number[]; overlays?: Record<string, unknown[]> }): Promise<AssemblyTemplate> => {
    const res = await api.post<AssemblyTemplate>('/templates', data)
    return res.data
  },
  update: async (id: number, data: { name?: string; description?: string; slide_ids?: number[]; overlays?: Record<string, unknown[]> }): Promise<AssemblyTemplate> => {
    const res = await api.patch<AssemblyTemplate>(`/templates/${id}`, data)
    return res.data
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/templates/${id}`)
  },
}
