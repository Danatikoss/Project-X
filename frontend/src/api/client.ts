import axios from "axios";
import { useAuthStore } from "../store/auth";
import type {
	AdminUser,
	AssembleRequest,
	Assembly,
	AssemblyListItem,
	AssemblyPatchRequest,
	AssemblyTemplate,
	AuthResponse,
	MediaAsset,
	MediaFolder,
	ProfileStats,
	Project,
	SearchResponse,
	Slide,
	SlideEditVersion,
	SlideListResponse,
	SlidePatchRequest,
	SourcePresentation,
	TextElement,
	UploadResponse,
	UserProfile,
	UserProfilePatchRequest,
} from "../types";

const api = axios.create({
	baseURL: import.meta.env.VITE_API_URL ?? "/api",
	headers: { "Content-Type": "application/json" },
});

// Добавляем токен в каждый запрос
api.interceptors.request.use((config) => {
	const token = useAuthStore.getState().accessToken;
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

// Если 401 — пробуем обновить токен, иначе выходим
let _refreshing = false;
let _refreshQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
	(res) => res,
	async (error) => {
		const original = error.config;
		if (error.response?.status !== 401 || original._retry) {
			return Promise.reject(error);
		}

		const { refreshToken, setAuth, clearAuth } = useAuthStore.getState();
		if (!refreshToken) {
			clearAuth();
			window.location.href = "/login";
			return Promise.reject(error);
		}

		if (_refreshing) {
			return new Promise((resolve, reject) => {
				_refreshQueue.push((newToken) => {
					if (newToken) {
						original.headers.Authorization = `Bearer ${newToken}`;
						resolve(api(original));
					} else {
						reject(error);
					}
				});
			});
		}

		original._retry = true;
		_refreshing = true;

		try {
			const res = await axios.post(`${import.meta.env.VITE_API_URL ?? "/api"}/auth/refresh`, {
				refresh_token: refreshToken,
			});
			const { access_token, refresh_token, user } = res.data;
			setAuth(user, access_token, refresh_token);
			_refreshQueue.forEach((cb) => cb(access_token));
			_refreshQueue = [];
			original.headers.Authorization = `Bearer ${access_token}`;
			return api(original);
		} catch {
			_refreshQueue.forEach((cb) => cb(null));
			_refreshQueue = [];
			clearAuth();
			window.location.href = "/login";
			return Promise.reject(error);
		} finally {
			_refreshing = false;
		}
	}
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
	register: async (email: string, password: string, name?: string): Promise<AuthResponse> => {
		const res = await api.post<AuthResponse>("/auth/register", { email, password, name });
		return res.data;
	},

	login: async (email: string, password: string): Promise<AuthResponse> => {
		const res = await api.post<AuthResponse>("/auth/login", { email, password });
		return res.data;
	},

	refresh: async (refresh_token: string): Promise<AuthResponse> => {
		const res = await api.post<AuthResponse>("/auth/refresh", { refresh_token });
		return res.data;
	},

	logout: async (refresh_token: string): Promise<void> => {
		await api.post("/auth/logout", { refresh_token });
	},
};

// ─── Library ─────────────────────────────────────────────────────────────────

export interface ListSlidesParams {
	page?: number;
	page_size?: number;
	source_id?: number;
	source_ids?: number[];
	layout_type?: string;
	language?: string;
	tag?: string;
	label?: string;
	is_outdated?: boolean;
	project_id?: number;
	project_ids?: number[];
}

export const libraryApi = {
	upload: async (file: File): Promise<UploadResponse> => {
		const form = new FormData();
		form.append("file", file);
		const res = await api.post<UploadResponse>("/library/upload", form, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return res.data;
	},

	uploadMany: async (files: File[]): Promise<UploadResponse[]> => {
		const results: UploadResponse[] = [];
		for (const file of files) {
			const form = new FormData();
			form.append("file", file);
			const res = await api.post<UploadResponse>("/library/upload", form, {
				headers: { "Content-Type": "multipart/form-data" },
			});
			results.push(res.data);
		}
		return results;
	},

	listSlides: async (params: ListSlidesParams = {}): Promise<SlideListResponse> => {
		const res = await api.get<SlideListResponse>("/library/slides", {
			params,
			paramsSerializer: (p) => {
				const sp = new URLSearchParams();
				for (const [k, v] of Object.entries(p)) {
					if (v === undefined || v === null) continue;
					if (Array.isArray(v)) {
						v.forEach((item) => sp.append(k, String(item)));
					} else {
						sp.append(k, String(v));
					}
				}
				return sp.toString();
			},
		});
		return res.data;
	},

	getSlide: async (id: number): Promise<Slide> => {
		const res = await api.get<Slide>(`/library/slides/${id}`);
		return res.data;
	},

	updateSlide: async (id: number, data: SlidePatchRequest): Promise<Slide> => {
		const res = await api.patch<Slide>(`/library/slides/${id}`, data);
		return res.data;
	},

	deleteSlide: async (id: number): Promise<void> => {
		await api.delete(`/library/slides/${id}`);
	},

	saveGeneratedSlides: async (slideIds: number[]): Promise<{ saved: number }> => {
		const res = await api.post<{ saved: number }>("/library/slides/save-generated", {
			slide_ids: slideIds,
		});
		return res.data;
	},

	getTextElements: async (
		slideId: number
	): Promise<{ elements: TextElement[]; has_edits: boolean }> => {
		const res = await api.get(`/library/slides/${slideId}/text-elements`);
		return res.data;
	},

	saveTextEdits: async (
		slideId: number,
		edits: Record<string, string>
	): Promise<{
		ok: boolean;
		edited: number;
		thumb_version: number | null;
		version_number?: number;
	}> => {
		const res = await api.post(`/library/slides/${slideId}/text-edits`, { edits });
		return res.data;
	},

	getEditHistory: async (slideId: number): Promise<{ versions: SlideEditVersion[] }> => {
		const res = await api.get(`/library/slides/${slideId}/edit-history`);
		return res.data;
	},

	rollbackEditVersion: async (
		slideId: number,
		versionId: number
	): Promise<{
		ok: boolean;
		rolled_back_to_version: number;
		new_version_number: number;
		thumb_version: number | null;
	}> => {
		const res = await api.post(`/library/slides/${slideId}/edit-history/${versionId}/rollback`);
		return res.data;
	},

	getLabels: async (): Promise<string[]> => {
		const res = await api.get<string[]>("/library/labels");
		return res.data;
	},

	listSources: async (): Promise<SourcePresentation[]> => {
		const res = await api.get<SourcePresentation[]>("/library/sources");
		return res.data;
	},

	deleteSource: async (id: number): Promise<void> => {
		await api.delete(`/library/sources/${id}`);
	},

	deleteAllSlides: async (): Promise<{ deleted: number }> => {
		const res = await api.delete<{ deleted: number }>("/library/slides/all");
		return res.data;
	},

	deleteAllSources: async (): Promise<{ deleted: number }> => {
		const res = await api.delete<{ deleted: number }>("/library/sources/all");
		return res.data;
	},

	extractMedia: async (id: number): Promise<{ updated: number; total: number }> => {
		const res = await api.post<{ updated: number; total: number }>(
			`/library/sources/${id}/extract-media`
		);
		return res.data;
	},
};

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projectsApi = {
	list: async (): Promise<Project[]> => {
		const res = await api.get<Project[]>("/projects");
		return res.data;
	},

	create: async (name: string, color?: string): Promise<Project> => {
		const res = await api.post<Project>("/projects", { name, color: color ?? "#1E3A8A" });
		return res.data;
	},

	delete: async (id: number): Promise<void> => {
		await api.delete(`/projects/${id}`);
	},

	assignSlide: async (projectId: number, slideId: number): Promise<void> => {
		await api.post(`/projects/${projectId}/slides/${slideId}`);
	},

	unassignSlide: async (projectId: number, slideId: number): Promise<void> => {
		await api.delete(`/projects/${projectId}/slides/${slideId}`);
	},
};

// ─── Assembly ────────────────────────────────────────────────────────────────

export const assemblyApi = {
	createBlank: async (title = "Новая презентация"): Promise<Assembly> => {
		const res = await api.post<Assembly>("/assemble/blank", { title });
		return res.data;
	},

	createFromTemplate: async (templateId: number): Promise<Assembly> => {
		const res = await api.post<Assembly>(`/assemble/from-template/${templateId}`);
		return res.data;
	},

	create: async (req: AssembleRequest): Promise<Assembly> => {
		const res = await api.post<Assembly>("/assemble", req);
		return res.data;
	},

	list: async (): Promise<AssemblyListItem[]> => {
		const res = await api.get<AssemblyListItem[]>("/assemble");
		return res.data;
	},

	get: async (id: number): Promise<Assembly> => {
		const res = await api.get<Assembly>(`/assemble/${id}`);
		return res.data;
	},

	update: async (id: number, data: AssemblyPatchRequest): Promise<Assembly> => {
		const res = await api.patch<Assembly>(`/assemble/${id}`, data);
		return res.data;
	},

	delete: async (id: number): Promise<void> => {
		await api.delete(`/assemble/${id}`);
	},

	duplicate: async (id: number): Promise<Assembly> => {
		const res = await api.post<Assembly>(`/assemble/${id}/duplicate`);
		return res.data;
	},

	share: async (id: number): Promise<{ share_token: string }> => {
		const res = await api.post<{ share_token: string }>(`/assemble/${id}/share`);
		return res.data;
	},

	shareEdit: async (id: number): Promise<{ edit_token: string }> => {
		const res = await api.post<{ edit_token: string }>(`/assemble/${id}/share-edit`);
		return res.data;
	},

	getPublic: async (shareToken: string): Promise<Assembly> => {
		const res = await api.get<Assembly>(`/assemble/public/${shareToken}`);
		return res.data;
	},

	getCollab: async (editToken: string): Promise<Assembly> => {
		const res = await api.get<Assembly>(`/assemble/edit/${editToken}`);
		return res.data;
	},

	updateCollab: async (editToken: string, data: AssemblyPatchRequest): Promise<Assembly> => {
		const res = await api.patch<Assembly>(`/assemble/edit/${editToken}`, data);
		return res.data;
	},

	export: async (id: number, format: "pptx" | "pdf" = "pptx"): Promise<void> => {
		const res = await api.post(`/assemble/${id}/export`, { format }, { responseType: "blob" });
		const url = window.URL.createObjectURL(res.data as Blob);
		const contentDisposition = res.headers["content-disposition"] || "";
		const match = contentDisposition.match(/filename[^;=\n]*=(['"]?)([^'";\n]*)\1/);
		const filename = match?.[2]?.trim() || `presentation_${id}.${format}`;
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		setTimeout(() => window.URL.revokeObjectURL(url), 5000);
	},
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
	bootstrap: async (): Promise<AdminUser> => {
		const res = await api.post<AdminUser>("/admin/bootstrap");
		return res.data;
	},

	listUsers: async (): Promise<AdminUser[]> => {
		const res = await api.get<AdminUser[]>("/admin/users");
		return res.data;
	},

	patchUser: async (userId: number, data: { is_admin?: boolean; is_active?: boolean }): Promise<AdminUser> => {
		const res = await api.patch<AdminUser>(`/admin/users/${userId}`, data);
		return res.data;
	},

	resetPassword: async (userId: number): Promise<{ temp_password: string }> => {
		const res = await api.post<{ temp_password: string }>(`/admin/users/${userId}/reset-password`);
		return res.data;
	},

	getStats: async (): Promise<AdminStats> => {
		const res = await api.get<AdminStats>("/admin/stats");
		return res.data;
	},
};

export interface AdminStats {
	users: { total: number; new_7d: number; returning: number; retention_rate: number };
	presentations: { total: number; new_7d: number; avg_slides: number | null };
	templates: { total: number };
	funnel: { plans: number; downloads: number; conversion_rate: number };
	cycle_time: {
		avg_total_seconds: number | null;
		avg_plan_seconds: number | null;
		avg_download_seconds: number | null;
	};
	top_users: { name: string; email: string; presentations: number }[];
	recent_activity: {
		action: string;
		elapsed_seconds: number;
		slide_count: number | null;
		created_at: string | null;
	}[];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export const searchApi = {
	search: async (q: string, limit = 20, offset = 0): Promise<SearchResponse> => {
		const res = await api.get<SearchResponse>("/search", { params: { q, limit, offset } });
		return res.data;
	},
};

// ─── Profile ─────────────────────────────────────────────────────────────────

export const profileApi = {
	get: async (): Promise<UserProfile> => {
		const res = await api.get<UserProfile>("/profile");
		return res.data;
	},

	update: async (data: UserProfilePatchRequest): Promise<UserProfile> => {
		const res = await api.patch<UserProfile>("/profile", data);
		return res.data;
	},

	stats: async (): Promise<ProfileStats> => {
		const res = await api.get<ProfileStats>("/profile/stats");
		return res.data;
	},

	changePassword: async (current_password: string, new_password: string): Promise<void> => {
		await api.post("/profile/change-password", { current_password, new_password });
	},
};

// ─── Media Library ────────────────────────────────────────────────────────────

export const mediaApi = {
	listFolders: async (): Promise<MediaFolder[]> => {
		const res = await api.get<MediaFolder[]>("/media/folders");
		return res.data;
	},

	createFolder: async (name: string): Promise<MediaFolder> => {
		const res = await api.post<MediaFolder>("/media/folders", { name });
		return res.data;
	},

	renameFolder: async (id: number, name: string): Promise<MediaFolder> => {
		const res = await api.patch<MediaFolder>(`/media/folders/${id}`, { name });
		return res.data;
	},

	deleteFolder: async (id: number): Promise<void> => {
		await api.delete(`/media/folders/${id}`);
	},

	listAssets: async (params?: {
		folder_id?: number;
		unfoldered?: boolean;
		file_type?: string;
	}): Promise<MediaAsset[]> => {
		const res = await api.get<MediaAsset[]>("/media/assets", { params });
		return res.data;
	},

	upload: async (file: File, name: string, folder_id?: number): Promise<MediaAsset> => {
		const form = new FormData();
		form.append("file", file);
		form.append("name", name);
		if (folder_id != null) form.append("folder_id", String(folder_id));
		const res = await api.post<MediaAsset>("/media/assets/upload", form, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return res.data;
	},

	updateAsset: async (
		id: number,
		data: { name?: string; folder_id?: number; clear_folder?: boolean }
	): Promise<MediaAsset> => {
		const res = await api.patch<MediaAsset>(`/media/assets/${id}`, data);
		return res.data;
	},

	deleteAsset: async (id: number): Promise<void> => {
		await api.delete(`/media/assets/${id}`);
	},
};

// ─── WOPI / Collabora Online ──────────────────────────────────────────────────

export const wopiApi = {
	getEditorUrl: async (slideId: number): Promise<{ access_token: string; editor_url: string }> => {
		const res = await api.get(`/wopi/token/${slideId}`);
		return res.data;
	},
};

// ─── Generate (template-based) ───────────────────────────────────────────────

export interface SlideTemplate {
	id: string;
	name: string;
	description: string;
	slots: Record<string, string>;
	scenario_tags: string[];
	theme: string;
	layout_role: string;
}

function _downloadBlob(blob: Blob, filename: string) {
	const url = window.URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => window.URL.revokeObjectURL(url), 5000);
}

export interface SlideInPlan {
	template_id: string;
	slots: Record<string, string>;
	has_media?: boolean;
	slide_type?: "template" | "library";
	library_slide_id?: number | null;
	library_thumbnail_url?: string | null;
	library_title?: string | null;
}

export interface PresentationPlan {
	title: string;
	slides: SlideInPlan[];
	theme: string;
	title_template_id: string | null;
}

export const generateApi = {
	listTemplates: async (): Promise<SlideTemplate[]> => {
		const res = await api.get<SlideTemplate[]>("/generate/templates");
		return res.data;
	},

	listThemes: async (): Promise<string[]> => {
		const res = await api.get<string[]>("/generate/themes");
		return res.data;
	},

	listTitleSlides: async (theme: string): Promise<SlideTemplate[]> => {
		const res = await api.get<SlideTemplate[]>("/generate/title-slides", { params: { theme } });
		return res.data;
	},

	createPlan: async (
		prompt: string,
		theme: string,
		titleTemplateId: string | null,
		hasMedia?: boolean
	): Promise<PresentationPlan> => {
		const res = await api.post<PresentationPlan>("/generate/plan", {
			prompt,
			theme,
			title_template_id: titleTemplateId,
			has_media: hasMedia ?? false,
		});
		return res.data;
	},

	downloadPresentation: async (plan: PresentationPlan): Promise<void> => {
		const res = await api.post("/generate/download", plan, { responseType: "blob" });
		const cd = res.headers["content-disposition"] || "";
		const utf8Match = cd.match(/filename\*=UTF-8''([^;\n]*)/);
		const asciiMatch = cd.match(/filename="?([^";\n]*)"?/);
		const raw = utf8Match?.[1]
			? decodeURIComponent(utf8Match[1])
			: asciiMatch?.[1] || "presentation.pptx";
		_downloadBlob(res.data as Blob, raw);
	},

	extractFile: async (file: File): Promise<{ summary: string; filename: string }> => {
		const form = new FormData();
		form.append("file", file);
		const res = await api.post<{ summary: string; filename: string }>(
			"/generate/extract-file",
			form,
			{
				headers: { "Content-Type": "multipart/form-data" },
			}
		);
		return res.data;
	},

	generateSlide: async (description: string, templateId?: string): Promise<void> => {
		const res = await api.post(
			"/generate/slide",
			{ description, template_id: templateId ?? null },
			{ responseType: "blob" }
		);
		_downloadBlob(res.data as Blob, "slide.pptx");
	},

	uploadTemplate: async (
		file: File,
		meta: {
			name: string;
			description: string;
			scenario_tags: string;
			slide_index: number;
			theme?: string;
			layout_role?: string;
		}
	): Promise<SlideTemplate> => {
		const form = new FormData();
		form.append("file", file);
		form.append("name", meta.name);
		form.append("description", meta.description);
		form.append("scenario_tags", meta.scenario_tags);
		form.append("slide_index", String(meta.slide_index));
		form.append("theme", meta.theme ?? "default");
		form.append("layout_role", meta.layout_role ?? "content");
		const res = await api.post<SlideTemplate>("/generate/templates/upload", form, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return res.data;
	},

	uploadTemplatesBatch: async (
		file: File,
		layoutRole: "content" | "title" = "content"
	): Promise<{ created: number; templates: SlideTemplate[] }> => {
		const form = new FormData();
		form.append("file", file);
		form.append("layout_role", layoutRole);
		const res = await api.post<{ created: number; templates: SlideTemplate[] }>(
			"/generate/templates/upload-batch",
			form,
			{ headers: { "Content-Type": "multipart/form-data" } }
		);
		return res.data;
	},

	deleteTemplate: async (id: string): Promise<void> => {
		await api.delete(`/generate/templates/${id}`);
	},

	deleteAllCustomTemplates: async (): Promise<{ deleted: number }> => {
		const res = await api.delete<{ deleted: number }>("/generate/templates");
		return res.data;
	},

	reindexTemplates: async (): Promise<{ updated: number; total: number }> => {
		const res = await api.post<{ updated: number; total: number }>("/generate/templates/reindex");
		return res.data;
	},

	createAssembly: async (plan: PresentationPlan): Promise<{ assembly_id: number }> => {
		const res = await api.post<{ assembly_id: number }>("/generate/create-assembly", plan);
		return res.data;
	},

	createAssemblySingle: async (
		description: string,
		templateId?: string,
		hasMedia?: boolean
	): Promise<{ assembly_id: number }> => {
		const res = await api.post<{ assembly_id: number }>("/generate/create-assembly-single", {
			description,
			template_id: templateId ?? null,
			has_media: hasMedia ?? false,
		});
		return res.data;
	},
};

// ─── Assembly Templates ───────────────────────────────────────────────────────

export const templatesApi = {
	list: async (): Promise<AssemblyTemplate[]> => {
		const res = await api.get<AssemblyTemplate[]>("/templates");
		return res.data;
	},
	get: async (id: number): Promise<AssemblyTemplate> => {
		const res = await api.get<AssemblyTemplate>(`/templates/${id}`);
		return res.data;
	},
	create: async (data: {
		name: string;
		description?: string;
		slide_ids?: number[];
		overlays?: Record<string, unknown[]>;
	}): Promise<AssemblyTemplate> => {
		const res = await api.post<AssemblyTemplate>("/templates", data);
		return res.data;
	},
	update: async (
		id: number,
		data: {
			name?: string;
			description?: string;
			slide_ids?: number[];
			overlays?: Record<string, unknown[]>;
		}
	): Promise<AssemblyTemplate> => {
		const res = await api.patch<AssemblyTemplate>(`/templates/${id}`, data);
		return res.data;
	},
	delete: async (id: number): Promise<void> => {
		await api.delete(`/templates/${id}`);
	},
};
