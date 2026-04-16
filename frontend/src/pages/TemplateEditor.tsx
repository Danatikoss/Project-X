import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	BookImage,
	Check,
	ChevronLeft,
	ChevronRight,
	Film,
	FolderOpen,
	Image,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { libraryApi, mediaApi, projectsApi, searchApi, templatesApi } from "../api/client";
import { FilmStrip } from "../components/assemble/FilmStrip";
import { SlideThumbnail } from "../components/common/SlideCard";
import { Spinner } from "../components/common/Spinner";
import type { MediaAsset, MediaFolder, Project, Slide, SlideOverlay } from "../types";
import { cn } from "../utils/cn";

// ─── Utilities ────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
	const [deb, setDeb] = useState(value);
	const t = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (t.current) clearTimeout(t.current);
		t.current = setTimeout(() => setDeb(value), delay);
		return () => {
			if (t.current) clearTimeout(t.current);
		};
	}, [value, delay]);
	return deb;
}

async function getNaturalAR(asset: MediaAsset): Promise<number | null> {
	return new Promise((resolve) => {
		const tid = setTimeout(() => resolve(null), 1500);
		if (asset.file_type === "video") {
			const v = document.createElement("video");
			v.onloadedmetadata = () => {
				clearTimeout(tid);
				resolve(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null);
			};
			v.onerror = () => {
				clearTimeout(tid);
				resolve(null);
			};
			v.src = asset.url;
		} else {
			const img = new window.Image();
			img.onload = () => {
				clearTimeout(tid);
				resolve(
					img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null
				);
			};
			img.onerror = () => {
				clearTimeout(tid);
				resolve(null);
			};
			img.src = asset.url;
		}
	});
}

// ─── OverlayItem ──────────────────────────────────────────────────────────────

function OverlayItem({
	overlay,
	isSelected,
	onMouseDown,
	onDelete,
}: {
	overlay: SlideOverlay;
	isSelected: boolean;
	onMouseDown: (e: React.MouseEvent, mode: "move" | "resize") => void;
	onDelete: () => void;
}) {
	return (
		<div
			className={cn(
				"absolute select-none",
				isSelected
					? "outline outline-2 outline-brand-500 outline-offset-0 cursor-move z-10"
					: "cursor-pointer hover:outline hover:outline-1 hover:outline-brand-300 z-[5]"
			)}
			style={{
				left: `${overlay.x}%`,
				top: `${overlay.y}%`,
				width: `${overlay.w}%`,
				height: `${overlay.h}%`,
			}}
			onMouseDown={(e) => onMouseDown(e, "move")}
			onClick={(e) => e.stopPropagation()}
		>
			{overlay.file_type === "video" ? (
				<video
					src={overlay.url}
					autoPlay
					loop
					muted
					playsInline
					className="w-full h-full object-contain pointer-events-none"
				/>
			) : (
				<img
					src={overlay.url}
					alt=""
					className="w-full h-full object-contain pointer-events-none"
					draggable={false}
				/>
			)}
			{isSelected && (
				<>
					<button
						className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow-md hover:bg-red-600 z-20 cursor-pointer"
						onMouseDown={(e) => e.stopPropagation()}
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
					>
						<X className="w-3 h-3" />
					</button>
					<div
						className="absolute bottom-0 right-0 w-5 h-5 bg-brand-500 hover:bg-brand-400 cursor-se-resize rounded-tl z-20 flex items-center justify-center"
						onMouseDown={(e) => {
							e.stopPropagation();
							onMouseDown(e, "resize");
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<svg width="8" height="8" viewBox="0 0 8 8" className="text-white opacity-80">
							<path
								d="M7 1L1 7M7 4L4 7M7 7"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
							/>
						</svg>
					</div>
				</>
			)}
		</div>
	);
}

// ─── LibraryPanel ─────────────────────────────────────────────────────────────

function LibraryPanel({
	existingIds,
	onAdd,
}: {
	existingIds: Set<number>;
	onAdd: (slide: Slide) => void;
}) {
	const [query, setQuery] = useState("");
	const [projectId, setProjectId] = useState<number | undefined>();
	const [page, setPage] = useState(1);
	const debouncedQuery = useDebounce(query, 350);
	const PAGE_SIZE = 20;

	const { data: projects = [] } = useQuery<Project[]>({
		queryKey: ["projects"],
		queryFn: projectsApi.list,
	});

	const isSearching = debouncedQuery.trim().length > 0;

	const { data: searchResult, isLoading: searchLoading } = useQuery({
		queryKey: ["template-slide-search", debouncedQuery],
		queryFn: () => searchApi.search(debouncedQuery, 40),
		enabled: isSearching,
	});

	const { data: libraryData, isLoading: libraryLoading } = useQuery({
		queryKey: ["template-slide-library", projectId, page],
		queryFn: () => libraryApi.listSlides({ page, page_size: PAGE_SIZE, project_id: projectId }),
		enabled: !isSearching,
	});

	const isLoading = isSearching ? searchLoading : libraryLoading;
	const slides: Slide[] = isSearching ? (searchResult?.items ?? []) : (libraryData?.items ?? []);
	const total = isSearching ? (searchResult?.total ?? 0) : (libraryData?.total ?? 0);
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	useEffect(() => {
		setPage(1);
	}, []);

	return (
		<div className="flex flex-col h-full">
			<div className="p-3 border-b border-gray-100 space-y-2">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Поиск слайдов..."
						className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-brand-300 focus:bg-white transition-all"
					/>
				</div>
				{projects.length > 0 && !isSearching && (
					<select
						value={projectId ?? ""}
						onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
						className="w-full text-xs rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-300"
					>
						<option value="">Все проекты</option>
						{projects.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
				)}
			</div>
			<div className="flex-1 overflow-y-auto p-2">
				{isLoading ? (
					<div className="flex justify-center py-6">
						<Spinner />
					</div>
				) : slides.length === 0 ? (
					<div className="text-center py-8 text-gray-400">
						<FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
						<p className="text-xs">{query ? "Ничего не найдено" : "Нет слайдов в библиотеке"}</p>
					</div>
				) : (
					<div className="grid grid-cols-2 gap-2">
						{slides.map((slide) => {
							const already = existingIds.has(slide.id);
							return (
								<button
									key={slide.id}
									onClick={() => !already && onAdd(slide)}
									className={cn(
										"relative group rounded-lg overflow-hidden border text-left transition-all",
										already
											? "border-brand-400 opacity-60 cursor-default"
											: "border-gray-200 hover:border-brand-400 cursor-pointer hover:shadow-sm"
									)}
								>
									<img
										src={slide.thumbnail_url}
										alt={slide.title ?? ""}
										className="w-full object-cover"
										style={{ aspectRatio: "16/9" }}
									/>
									{already && (
										<div className="absolute inset-0 flex items-center justify-center bg-brand-500/20">
											<Check className="w-5 h-5 text-brand-600" />
										</div>
									)}
									{slide.title && (
										<p className="text-[10px] text-gray-600 truncate px-1.5 py-1">{slide.title}</p>
									)}
								</button>
							);
						})}
					</div>
				)}
			</div>
			{!isSearching && totalPages > 1 && (
				<div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 shrink-0">
					<button
						onClick={() => setPage((p) => Math.max(1, p - 1))}
						disabled={page === 1}
						className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
					>
						<ChevronLeft className="w-3.5 h-3.5" />
					</button>
					<span className="text-[10px] text-gray-400">
						{page} / {totalPages}
					</span>
					<button
						onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
						disabled={page === totalPages}
						className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors"
					>
						<ChevronRight className="w-3.5 h-3.5" />
					</button>
				</div>
			)}
		</div>
	);
}

// ─── MediaPanel ───────────────────────────────────────────────────────────────

function MediaPanel({ onAdd }: { onAdd: (asset: MediaAsset) => void }) {
	const [selectedFolder, setSelectedFolder] = useState<"all" | "unfoldered" | number>("all");
	const { data: folders = [] } = useQuery<MediaFolder[]>({
		queryKey: ["media-folders"],
		queryFn: mediaApi.listFolders,
	});
	const { data: assets = [], isLoading } = useQuery({
		queryKey: ["media-assets", selectedFolder],
		queryFn: () => {
			if (selectedFolder === "all") return mediaApi.listAssets();
			if (selectedFolder === "unfoldered") return mediaApi.listAssets({ unfoldered: true });
			return mediaApi.listAssets({ folder_id: selectedFolder as number });
		},
	});

	const folderOptions: { key: "all" | "unfoldered" | number; label: string }[] = [
		{ key: "all", label: "Все" },
		{ key: "unfoldered", label: "Без папки" },
		...folders.map((f) => ({ key: f.id as number, label: f.name })),
	];

	return (
		<div className="flex flex-col h-full">
			{/* Folder tabs */}
			<div className="flex gap-1 p-2 border-b border-gray-100 overflow-x-auto shrink-0">
				{folderOptions.map(({ key, label }) => (
					<button
						key={String(key)}
						onClick={() => setSelectedFolder(key)}
						className={cn(
							"shrink-0 text-[10px] px-2 py-1 rounded-lg transition-colors",
							selectedFolder === key
								? "bg-brand-100 text-brand-700 font-medium"
								: "text-gray-500 hover:bg-gray-100"
						)}
					>
						{label}
					</button>
				))}
			</div>
			<div className="flex-1 overflow-y-auto p-2">
				{isLoading ? (
					<div className="flex justify-center py-6">
						<Spinner />
					</div>
				) : assets.length === 0 ? (
					<div className="text-center py-8 text-gray-400">
						<Image className="w-8 h-8 mx-auto mb-2 opacity-40" />
						<p className="text-xs">Нет медиафайлов</p>
					</div>
				) : (
					<div className="grid grid-cols-2 gap-2">
						{assets.map((asset) => (
							<button
								key={asset.id}
								onClick={() => onAdd(asset)}
								className="relative group rounded-lg overflow-hidden border border-gray-200 hover:border-brand-400 transition-all hover:shadow-sm cursor-pointer"
							>
								{asset.file_type === "video" ? (
									<video
										src={asset.url}
										muted
										className="w-full object-cover"
										style={{ aspectRatio: "16/9" }}
									/>
								) : (
									<img
										src={asset.url}
										alt={asset.name}
										className="w-full object-cover"
										style={{ aspectRatio: "16/9" }}
									/>
								)}
								<div className="absolute inset-0 bg-brand-500/0 group-hover:bg-brand-500/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
									<Plus className="w-5 h-5 text-brand-600" />
								</div>
								<p className="text-[10px] text-gray-500 truncate px-1.5 py-1">{asset.name}</p>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TemplateEditor() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const isNew = !id || id === "new";
	const templateId = isNew ? null : parseInt(id || "0", 10);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [localSlides, setLocalSlides] = useState<Slide[]>([]);
	const [overlays, setOverlays] = useState<Record<string, SlideOverlay[]>>({});
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
	const [rightTab, setRightTab] = useState<"library" | "media">("library");
	const [saving, setSaving] = useState(false);
	const [createdId, setCreatedId] = useState<number | null>(null);
	const [initialized, setInitialized] = useState(false);

	const containerRef = useRef<HTMLDivElement>(null);
	const overlaysRef = useRef<Record<string, SlideOverlay[]>>({});
	const dragRef = useRef<{
		overlayId: string;
		slideId: string;
		mode: "move" | "resize";
		startX: number;
		startY: number;
		startOverlay: SlideOverlay;
	} | null>(null);

	const currentTemplateId = createdId ?? templateId;

	const { data: template, isLoading } = useQuery({
		queryKey: ["template", templateId],
		queryFn: () => templatesApi.get(templateId!),
		enabled: !isNew && !!templateId,
	});

	// Load all slides for the template (up to 500)
	const { data: allLibrarySlides } = useQuery({
		queryKey: ["library-all-for-template"],
		queryFn: () => libraryApi.listSlides({ page: 1, page_size: 500 }),
		enabled: !isNew && !!template,
	});

	useEffect(() => {
		if (template && !initialized) {
			setName(template.name);
			setDescription(template.description);
			setOverlays(template.overlays || {});
		}
	}, [template, initialized]);

	useEffect(() => {
		if (template && allLibrarySlides && !initialized) {
			const slideMap = new Map(allLibrarySlides.items.map((s) => [s.id, s]));
			const ordered = template.slide_ids
				.map((sid) => slideMap.get(sid))
				.filter((s): s is Slide => !!s);
			setLocalSlides(ordered);
			setInitialized(true);
		}
	}, [template, allLibrarySlides, initialized]);

	useEffect(() => {
		overlaysRef.current = overlays;
	}, [overlays]);

	// Document-level drag/resize
	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const drag = dragRef.current;
			if (!drag || !containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const dx = ((e.clientX - drag.startX) / rect.width) * 100;
			const dy = ((e.clientY - drag.startY) / rect.height) * 100;
			const { overlayId, slideId, mode, startOverlay } = drag;
			setOverlays((prev) => {
				const list = [...(prev[slideId] || [])];
				const i = list.findIndex((o) => o.id === overlayId);
				if (i < 0) return prev;
				const o = { ...list[i] };
				if (mode === "move") {
					o.x = Math.max(0, Math.min(100 - o.w, startOverlay.x + dx));
					o.y = Math.max(0, Math.min(100 - o.h, startOverlay.y + dy));
				} else {
					o.w = Math.max(10, Math.min(100 - startOverlay.x, startOverlay.w + dx));
					o.h = Math.max(5, Math.min(100 - startOverlay.y, startOverlay.h + dy));
				}
				list[i] = o;
				return { ...prev, [slideId]: list };
			});
		};
		const onUp = () => {
			if (!dragRef.current) return;
			dragRef.current = null;
			// Auto-save overlays on drag end
			if (currentTemplateId) {
				templatesApi
					.update(currentTemplateId, { overlays: overlaysRef.current })
					.then(() => queryClient.invalidateQueries({ queryKey: ["templates"] }))
					.catch(() => {});
			}
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, [currentTemplateId, queryClient]);

	const handleOverlayMouseDown = useCallback(
		(e: React.MouseEvent, overlayId: string, slideId: string, mode: "move" | "resize") => {
			e.preventDefault();
			e.stopPropagation();
			setSelectedOverlayId(overlayId);
			const overlay = overlaysRef.current[slideId]?.find((o) => o.id === overlayId);
			if (!overlay) return;
			dragRef.current = {
				overlayId,
				slideId,
				mode,
				startX: e.clientX,
				startY: e.clientY,
				startOverlay: { ...overlay },
			};
		},
		[]
	);

	const handleAddOverlay = useCallback(
		async (asset: MediaAsset) => {
			const slide = localSlides[selectedIndex];
			if (!slide) {
				toast.error("Выберите слайд");
				return;
			}
			const slideId = String(slide.id);
			const naturalAR = await getNaturalAR(asset);
			const w = 35;
			const h = naturalAR ? Math.max(5, Math.min(80, Math.round((w * (16 / 9)) / naturalAR))) : 22;
			const newOverlay: SlideOverlay = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				asset_id: asset.id,
				url: asset.url,
				file_type: asset.file_type,
				x: 5,
				y: Math.max(5, Math.min(95 - h, 10)),
				w,
				h,
			};
			const newOverlays = {
				...overlaysRef.current,
				[slideId]: [...(overlaysRef.current[slideId] || []), newOverlay],
			};
			setOverlays(newOverlays);
			setSelectedOverlayId(newOverlay.id);
			if (currentTemplateId) {
				templatesApi
					.update(currentTemplateId, { overlays: newOverlays })
					.then(() => queryClient.invalidateQueries({ queryKey: ["templates"] }))
					.catch(() => {});
			}
			toast.success("Медиа добавлено на слайд", { duration: 1500 });
		},
		[localSlides, selectedIndex, currentTemplateId, queryClient]
	);

	const deleteOverlay = useCallback(
		(slideId: string, overlayId: string) => {
			const newOverlays = {
				...overlaysRef.current,
				[slideId]: (overlaysRef.current[slideId] || []).filter((o) => o.id !== overlayId),
			};
			setOverlays(newOverlays);
			setSelectedOverlayId(null);
			if (currentTemplateId) {
				templatesApi
					.update(currentTemplateId, { overlays: newOverlays })
					.then(() => queryClient.invalidateQueries({ queryKey: ["templates"] }))
					.catch(() => {});
			}
		},
		[currentTemplateId, queryClient]
	);

	const handleAddSlide = (slide: Slide) => {
		if (localSlides.some((s) => s.id === slide.id)) return;
		const newSlides = [...localSlides, slide];
		setLocalSlides(newSlides);
		setSelectedIndex(newSlides.length - 1);
		if (currentTemplateId) {
			templatesApi
				.update(currentTemplateId, { slide_ids: newSlides.map((s) => s.id) })
				.then(() => queryClient.invalidateQueries({ queryKey: ["templates"] }))
				.catch(() => {});
		}
	};

	const handleReorder = (newSlides: Slide[]) => {
		setLocalSlides(newSlides);
		if (currentTemplateId) {
			templatesApi
				.update(currentTemplateId, { slide_ids: newSlides.map((s) => s.id) })
				.then(() => queryClient.invalidateQueries({ queryKey: ["templates"] }))
				.catch(() => {});
		}
	};

	const handleRemove = (slideId: number) => {
		const newSlides = localSlides.filter((s) => s.id !== slideId);
		setLocalSlides(newSlides);
		setSelectedIndex(Math.min(selectedIndex, Math.max(0, newSlides.length - 1)));
		if (currentTemplateId) {
			templatesApi
				.update(currentTemplateId, { slide_ids: newSlides.map((s) => s.id) })
				.then(() => queryClient.invalidateQueries({ queryKey: ["templates"] }))
				.catch(() => {});
		}
	};

	const handleSave = async () => {
		if (!name.trim()) {
			toast.error("Введите название шаблона");
			return;
		}
		setSaving(true);
		try {
			const payload = {
				name: name.trim(),
				description: description.trim(),
				slide_ids: localSlides.map((s) => s.id),
				overlays,
			};
			if (isNew && !createdId) {
				const created = await templatesApi.create(payload);
				setCreatedId(created.id);
				queryClient.invalidateQueries({ queryKey: ["templates"] });
				toast.success("Шаблон создан");
				navigate(`/templates/${created.id}/edit`, { replace: true });
			} else if (currentTemplateId) {
				await templatesApi.update(currentTemplateId, payload);
				queryClient.invalidateQueries({ queryKey: ["templates"] });
				queryClient.invalidateQueries({ queryKey: ["template", currentTemplateId] });
				toast.success("Шаблон сохранён");
			}
		} catch {
			toast.error("Не удалось сохранить шаблон");
		} finally {
			setSaving(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Spinner size="lg" />
			</div>
		);
	}

	const selectedSlide = localSlides[selectedIndex];
	const existingIds = new Set(localSlides.map((s) => s.id));
	const currentSlideId = selectedSlide ? String(selectedSlide.id) : null;
	const currentOverlays = currentSlideId ? overlays[currentSlideId] || [] : [];

	return (
		<div className="flex flex-col h-full overflow-hidden bg-white">
			{/* Top bar */}
			<div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
				<button
					onClick={() => navigate("/dashboard")}
					className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors shrink-0"
				>
					<ArrowLeft className="w-3.5 h-3.5" /> Назад
				</button>
				<div className="flex-1 flex items-center gap-2 min-w-0">
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Название шаблона"
						className="flex-1 min-w-0 px-3 py-1.5 text-sm font-semibold border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-all"
					/>
					<input
						type="text"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Краткое описание (необязательно)"
						className="w-64 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-all"
					/>
				</div>
				<button
					onClick={handleSave}
					disabled={saving}
					className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
				>
					{saving ? (
						<Spinner size="sm" className="border-white border-t-transparent" />
					) : (
						<Check className="w-3.5 h-3.5" />
					)}
					Сохранить
				</button>
			</div>

			<div className="flex flex-1 overflow-hidden">
				{/* Left: filmstrip */}
				<div className="w-[180px] shrink-0 border-r border-gray-200 flex flex-col bg-surface">
					<div className="px-3 py-2 border-b border-gray-200 shrink-0 flex items-center justify-between">
						<span className="text-xs font-medium text-gray-600">Слайды</span>
						<span className="text-xs text-gray-400">{localSlides.length}</span>
					</div>
					<div className="flex-1 overflow-y-auto">
						{localSlides.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-gray-400 p-4 text-center">
								<p className="text-xs">Добавьте слайды из библиотеки →</p>
							</div>
						) : (
							<FilmStrip
								slides={localSlides}
								selectedIndex={selectedIndex}
								onSelect={setSelectedIndex}
								onReorder={handleReorder}
								onRemove={handleRemove}
							/>
						)}
					</div>
					<div className="p-2 border-t border-gray-200 shrink-0">
						<button
							onClick={() => setRightTab("library")}
							className={cn(
								"w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs transition-colors",
								rightTab === "library"
									? "border-brand-400 text-brand-700 bg-brand-50"
									: "border-dashed border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-700"
							)}
						>
							<Plus className="w-3.5 h-3.5" /> Добавить слайды
						</button>
					</div>
				</div>

				{/* Center: slide preview */}
				<div className="flex-1 flex flex-col min-w-0">
					<div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 shrink-0">
						<button
							disabled={selectedIndex === 0}
							onClick={() => setSelectedIndex(selectedIndex - 1)}
							className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
						>
							<ChevronLeft className="w-4 h-4 text-gray-600" />
						</button>
						<span className="text-sm text-gray-500 min-w-[60px] text-center">
							{localSlides.length > 0 ? `${selectedIndex + 1} / ${localSlides.length}` : "—"}
						</span>
						<button
							disabled={selectedIndex >= localSlides.length - 1}
							onClick={() => setSelectedIndex(selectedIndex + 1)}
							className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
						>
							<ChevronRight className="w-4 h-4 text-gray-600" />
						</button>
						{selectedSlide && (
							<p className="text-sm text-gray-600 truncate flex-1 ml-2">
								{selectedSlide.title || "(без названия)"}
							</p>
						)}
						{currentOverlays.length > 0 && (
							<span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 shrink-0">
								{currentOverlays.length} медиа
							</span>
						)}
						{selectedOverlayId && (
							<button
								onClick={() => setSelectedOverlayId(null)}
								className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
							>
								Снять выделение
							</button>
						)}
					</div>

					<div
						className="flex-1 flex items-center justify-center p-8 bg-gray-50"
						onClick={() => setSelectedOverlayId(null)}
					>
						{selectedSlide ? (
							<div className="w-full max-w-4xl">
								<div
									ref={containerRef}
									className="relative w-full rounded-xl overflow-hidden shadow-xl border border-gray-200"
								>
									<SlideThumbnail slide={selectedSlide} />
									{currentOverlays.map((overlay) => (
										<OverlayItem
											key={overlay.id}
											overlay={overlay}
											isSelected={selectedOverlayId === overlay.id}
											onMouseDown={(e, mode) =>
												handleOverlayMouseDown(e, overlay.id, currentSlideId!, mode)
											}
											onDelete={() => deleteOverlay(currentSlideId!, overlay.id)}
										/>
									))}
								</div>
								{currentOverlays.length > 0 && !selectedOverlayId && (
									<p className="text-center text-[10px] text-gray-400 mt-2">
										Нажмите на медиаэлемент → перетащите или измените размер (угол ▟)
									</p>
								)}
							</div>
						) : (
							<div className="flex flex-col items-center justify-center text-gray-400 gap-4">
								<div className="w-24 h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
									<Plus className="w-6 h-6 opacity-40" />
								</div>
								<div className="text-center">
									<p className="text-sm font-medium text-gray-500 mb-1">Слайды не добавлены</p>
									<p className="text-xs text-gray-400">
										Нажмите{" "}
										<button
											onClick={() => setRightTab("library")}
											className="text-brand-600 hover:underline"
										>
											«Добавить слайды»
										</button>{" "}
										чтобы начать
									</p>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Right panel */}
				<div className="w-[300px] shrink-0 border-l border-gray-200 flex flex-col bg-white">
					<div className="flex items-center border-b border-gray-200 shrink-0">
						<button
							onClick={() => setRightTab("library")}
							className={cn(
								"flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium transition-colors border-b-2",
								rightTab === "library"
									? "text-brand-700 border-brand-700"
									: "text-gray-400 border-transparent hover:text-gray-600"
							)}
						>
							<BookImage className="w-3.5 h-3.5" /> Библиотека
						</button>
						<button
							onClick={() => setRightTab("media")}
							className={cn(
								"flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium transition-colors border-b-2 relative",
								rightTab === "media"
									? "text-brand-700 border-brand-700"
									: "text-gray-400 border-transparent hover:text-gray-600"
							)}
						>
							<Film className="w-3.5 h-3.5" /> Медиа
							{currentOverlays.length > 0 && (
								<span className="absolute top-2 right-1 w-3.5 h-3.5 rounded-full bg-brand-500 text-white text-[8px] flex items-center justify-center font-bold">
									{currentOverlays.length}
								</span>
							)}
						</button>
					</div>
					<div className="flex-1 overflow-hidden">
						{rightTab === "library" ? (
							<LibraryPanel existingIds={existingIds} onAdd={handleAddSlide} />
						) : (
							<MediaPanel onAdd={handleAddOverlay} />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
