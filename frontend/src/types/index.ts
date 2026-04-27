// ─── Slide Library ───────────────────────────────────────────────────────────

export interface Slide {
	id: number;
	source_id: number;
	slide_index: number;
	thumbnail_url: string;
	title: string | null;
	summary: string | null;
	tags: string[];
	labels: string[];
	layout_type: string | null;
	language: string;
	is_outdated: boolean;
	access_level: string;
	created_at: string;
	source_filename: string | null;
	project_id: number | null;
	project_name: string | null;
	used_in_assemblies: number;
	gif_url: string | null;
	gif_rect: { x: number; y: number; w: number; h: number } | null;
	video_url: string | null;
}

export interface Project {
	id: number;
	name: string;
	color: string;
	slide_count: number;
	created_at: string;
}

export interface SourcePresentation {
	id: number;
	filename: string;
	file_type: string;
	slide_count: number;
	status: "pending" | "indexing" | "done" | "error";
	error_message: string | null;
	uploaded_at: string;
	indexed_at: string | null;
}

export interface SlideListResponse {
	items: Slide[];
	total: number;
	page: number;
	page_size: number;
}

export interface SlidePatchRequest {
	title?: string;
	summary?: string;
	tags?: string[];
	labels?: string[];
	layout_type?: string;
	is_outdated?: boolean;
	access_level?: string;
	project_id?: number | null;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export interface UploadResponse {
	source_id: number;
	ws_token: string;
	message: string;
}

export interface IndexProgress {
	stage:
		| "extracting"
		| "thumbnailing"
		| "metadata"
		| "embedding"
		| "saving"
		| "done"
		| "error"
		| "ping";
	progress: number;
	message: string;
	processed: number;
	total: number;
	source_id?: number;
}

// ─── Assembly ────────────────────────────────────────────────────────────────

export interface SlideOverlay {
	id: string;
	asset_id: number;
	url: string;
	file_type: "gif" | "video" | "image";
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Assembly {
	id: number;
	title: string;
	prompt: string;
	slides: Slide[];
	overlays: Record<string, SlideOverlay[]>;
	status: "draft" | "exported";
	share_token: string | null;
	edit_token: string | null;
	created_at: string;
	updated_at: string;
}

export interface AssemblyListItem {
	id: number;
	title: string;
	prompt: string;
	slide_count: number;
	status: string;
	created_at: string;
	thumbnail_urls: string[];
}

export interface AssembleRequest {
	prompt: string;
	max_slides?: number;
}

export interface AssemblyPatchRequest {
	slide_ids?: number[];
	title?: string;
	overlays?: Record<string, SlideOverlay[]>;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchResponse {
	items: Slide[];
	total: number;
	query: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
	id: number;
	email: string;
	name: string | null;
	is_admin?: boolean;
}

export interface AuthResponse {
	access_token: string;
	refresh_token: string;
	token_type: string;
	user: AuthUser;
}

export interface AdminUser {
	id: number;
	email: string;
	name: string | null;
	is_admin: boolean;
	is_active: boolean;
}

// ─── User Profile ────────────────────────────────────────────────────────────

export interface UserProfile {
	id: number;
	name: string | null;
	company: string | null;
	position: string | null;
	contact_slide_id: number | null;
	preferred_tags: string[];
	default_language: "ru" | "kk" | "en";
	ai_style: "official" | "neutral" | "casual";
}

export interface UserProfilePatchRequest {
	name?: string;
	company?: string;
	position?: string;
	contact_slide_id?: number | null;
	preferred_tags?: string[];
	default_language?: "ru" | "kk" | "en";
	ai_style?: "official" | "neutral" | "casual";
}

export interface ProfileStats {
	assemblies_count: number;
	slides_count: number;
	sources_count: number;
}

// ─── Media Library ───────────────────────────────────────────────────────────

export interface MediaFolder {
	id: number;
	name: string;
	asset_count: number;
}

export interface MediaAsset {
	id: number;
	folder_id: number | null;
	name: string;
	file_type: "gif" | "video" | "image";
	mime_type: string | null;
	file_size: number | null;
	url: string;
}

// ─── Text Editing ─────────────────────────────────────────────────────────────

export interface SlideEditVersion {
	id: number;
	version_number: number;
	created_at: string;
	created_by_name: string | null;
	edit_count: number;
}

export interface TextElement {
	id: string;
	name: string;
	text: string;
	x: number;
	y: number;
	w: number;
	h: number;
	font_size: number;
	font_bold: boolean;
	font_color: string;
	font_align: "left" | "center" | "right";
}

// ─── Assembly Templates ───────────────────────────────────────────────────────

export interface AssemblyTemplate {
	id: number;
	name: string;
	description: string;
	slide_ids: number[];
	overlays: Record<string, SlideOverlay[]>;
	slides_preview: { id: number; thumbnail_url: string; title: string | null }[];
	created_at: string;
}
