import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Clapperboard,
	Edit2,
	FileVideo,
	Film,
	Folder,
	FolderOpen,
	FolderPlus,
	Image,
	ImagePlay,
	MoreHorizontal,
	Plus,
	Trash2,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { mediaApi } from "../api/client";
import { Spinner } from "../components/common/Spinner";
import type { MediaAsset, MediaFolder } from "../types";
import { cn } from "../utils/cn";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
	if (!bytes) return "";
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
	return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function TypeBadge({ type }: { type: MediaAsset["file_type"] }) {
	const cfg = {
		gif: { label: "GIF", cls: "bg-pink-100 text-pink-700" },
		video: { label: "MP4", cls: "bg-violet-100 text-violet-700" },
		image: { label: "IMG", cls: "bg-blue-100 text-blue-700" },
	}[type];
	return (
		<span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md", cfg.cls)}>
			{cfg.label}
		</span>
	);
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
	file: File;
	folders: MediaFolder[];
	currentFolderId: number | null;
	onSubmit: (name: string, folderId: number | null) => void;
	onCancel: () => void;
	uploading: boolean;
}

function UploadModal({
	file,
	folders,
	currentFolderId,
	onSubmit,
	onCancel,
	uploading,
}: UploadModalProps) {
	const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ""));
	const [folderId, setFolderId] = useState<number | null>(currentFolderId);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={onCancel}
		>
			<div
				className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm animate-slide-up"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="text-base font-bold text-slate-900 mb-4">Добавить медиа</h2>

				{/* Preview */}
				<div className="w-full h-32 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center mb-4">
					{file.type.startsWith("image") || file.type === "image/gif" ? (
						<img src={URL.createObjectURL(file)} className="h-full w-full object-contain" alt="" />
					) : (
						<FileVideo className="w-10 h-10 text-slate-300" />
					)}
				</div>

				<div className="space-y-3">
					<div>
						<label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
							Название
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") onSubmit(name, folderId);
							}}
							className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
						/>
					</div>

					{folders.length > 0 && (
						<div>
							<label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
								Папка
							</label>
							<select
								value={folderId ?? ""}
								onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}
								className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
							>
								<option value="">Без папки</option>
								{folders.map((f) => (
									<option key={f.id} value={f.id}>
										{f.name}
									</option>
								))}
							</select>
						</div>
					)}
				</div>

				<div className="flex gap-2 mt-5">
					<button
						onClick={onCancel}
						className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
					>
						Отмена
					</button>
					<button
						onClick={() => onSubmit(name.trim() || file.name, folderId)}
						disabled={uploading}
						className="flex-1 py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
					>
						{uploading ? (
							<Spinner size="sm" className="border-white border-t-transparent" />
						) : (
							<Upload className="w-4 h-4" />
						)}
						Загрузить
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Draggable media card ─────────────────────────────────────────────────────

function MediaCard({
	asset,
	onDelete,
	onRename,
}: {
	asset: MediaAsset;
	onDelete: () => void;
	onRename: (name: string) => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [editName, setEditName] = useState(asset.name);

	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: asset.id });

	const commitRename = () => {
		const t = editName.trim();
		if (t && t !== asset.name) onRename(t);
		setRenaming(false);
	};

	return (
		<div
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			className={cn(
				"group relative rounded-2xl border border-slate-200 bg-white overflow-hidden",
				"cursor-grab active:cursor-grabbing transition-all",
				isDragging
					? "opacity-40 scale-95 shadow-lg"
					: "hover:border-brand-300 hover:shadow-card-hover hover:-translate-y-0.5"
			)}
		>
			{/* Preview area */}
			<div className="w-full aspect-video bg-slate-50 flex items-center justify-center overflow-hidden">
				{asset.file_type === "video" ? (
					<video
						src={asset.url}
						className="w-full h-full object-cover"
						muted
						preload="metadata"
						onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
						onMouseLeave={(e) => {
							const v = e.currentTarget as HTMLVideoElement;
							v.pause();
							v.currentTime = 0;
						}}
					/>
				) : (
					<img
						src={asset.url}
						alt={asset.name}
						className="w-full h-full object-contain"
						loading="lazy"
					/>
				)}
			</div>

			{/* Footer */}
			<div className="px-2.5 py-2">
				<div className="flex items-center gap-1.5 min-w-0">
					<TypeBadge type={asset.file_type} />
					{renaming ? (
						<input
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
							onBlur={commitRename}
							onKeyDown={(e) => {
								if (e.key === "Enter") commitRename();
								if (e.key === "Escape") setRenaming(false);
							}}
							onClick={(e) => e.stopPropagation()}
							onPointerDown={(e) => e.stopPropagation()}
							className="flex-1 text-xs font-medium border-b border-brand-400 focus:outline-none bg-transparent min-w-0"
						/>
					) : (
						<span className="flex-1 text-xs font-medium text-slate-700 truncate">{asset.name}</span>
					)}
				</div>
				{asset.file_size && (
					<p className="text-[10px] text-slate-400 mt-0.5">{formatBytes(asset.file_size)}</p>
				)}
			</div>

			{/* Action menu */}
			<div
				className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
				onPointerDown={(e) => e.stopPropagation()}
			>
				<button
					onClick={(e) => {
						e.stopPropagation();
						setMenuOpen((v) => !v);
					}}
					className="w-6 h-6 rounded-lg bg-white/90 border border-slate-200 flex items-center justify-center shadow-sm hover:bg-white transition-colors"
				>
					<MoreHorizontal className="w-3.5 h-3.5 text-slate-500" />
				</button>
				{menuOpen && (
					<div
						className="absolute right-0 top-7 w-36 bg-white rounded-xl border border-slate-200 shadow-card-hover py-1 z-10"
						onPointerDown={(e) => e.stopPropagation()}
					>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setMenuOpen(false);
								setRenaming(true);
							}}
							className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
						>
							<Edit2 className="w-3.5 h-3.5" /> Переименовать
						</button>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setMenuOpen(false);
								onDelete();
							}}
							className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
						>
							<Trash2 className="w-3.5 h-3.5" /> Удалить
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Droppable folder item ────────────────────────────────────────────────────

function FolderItem({
	folder,
	isActive,
	isDragOver,
	onClick,
	onRename,
	onDelete,
}: {
	folder: MediaFolder;
	isActive: boolean;
	isDragOver: boolean;
	onClick: () => void;
	onRename: (name: string) => void;
	onDelete: () => void;
}) {
	const [editing, setEditing] = useState(false);
	const [editName, setEditName] = useState(folder.name);
	const { setNodeRef } = useDroppable({ id: `folder-${folder.id}` });

	const commit = () => {
		const t = editName.trim();
		if (t && t !== folder.name) onRename(t);
		setEditing(false);
	};

	return (
		<div
			ref={setNodeRef}
			className={cn(
				"flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all group",
				isDragOver
					? "bg-brand-100 border-2 border-brand-400 border-dashed scale-[1.01]"
					: isActive
						? "bg-brand-50 text-brand-800"
						: "text-slate-600 hover:bg-slate-100"
			)}
			onClick={onClick}
		>
			{isActive ? (
				<FolderOpen className="w-4 h-4 text-brand-600 shrink-0" />
			) : (
				<Folder
					className={cn("w-4 h-4 shrink-0", isDragOver ? "text-brand-600" : "text-slate-400")}
				/>
			)}

			{editing ? (
				<input
					value={editName}
					onChange={(e) => setEditName(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") commit();
						if (e.key === "Escape") setEditing(false);
					}}
					onClick={(e) => e.stopPropagation()}
					className="flex-1 text-sm font-medium border-b border-brand-400 focus:outline-none bg-transparent min-w-0"
				/>
			) : (
				<span className="flex-1 text-sm font-medium truncate">{folder.name}</span>
			)}

			<span
				className={cn(
					"text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0",
					isActive ? "bg-brand-200 text-brand-800" : "bg-slate-200 text-slate-500"
				)}
			>
				{folder.asset_count}
			</span>

			<div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity shrink-0">
				<button
					onClick={(e) => {
						e.stopPropagation();
						setEditing(true);
					}}
					className="p-0.5 hover:text-slate-900 transition-colors"
				>
					<Edit2 className="w-3 h-3" />
				</button>
				<button
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					className="p-0.5 hover:text-red-600 transition-colors"
				>
					<Trash2 className="w-3 h-3" />
				</button>
			</div>
		</div>
	);
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FolderFilter = "all" | "unfiled" | number;
type TypeFilter = "all" | "gif" | "video" | "image";

const TYPE_TABS: { value: TypeFilter; label: string; icon: React.ReactNode; color: string }[] = [
	{ value: "all", label: "Все", icon: <Image className="w-3.5 h-3.5" />, color: "" },
	{
		value: "gif",
		label: "GIF",
		icon: <ImagePlay className="w-3.5 h-3.5" />,
		color: "text-pink-600",
	},
	{
		value: "video",
		label: "Видео",
		icon: <Clapperboard className="w-3.5 h-3.5" />,
		color: "text-violet-600",
	},
	{
		value: "image",
		label: "Фото",
		icon: <Image className="w-3.5 h-3.5" />,
		color: "text-blue-600",
	},
];

export default function Media() {
	const qc = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [activeFolder, setActiveFolder] = useState<FolderFilter>("all");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [draggingAsset, setDraggingAsset] = useState<MediaAsset | null>(null);
	const [newFolderMode, setNewFolderMode] = useState(false);
	const [newFolderName, setNewFolderName] = useState("");
	const [dragOverFolder, setDragOverFolder] = useState<number | null>(null);

	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

	const { data: folders = [], isLoading: foldersLoading } = useQuery({
		queryKey: ["media-folders"],
		queryFn: mediaApi.listFolders,
	});

	const assetsParams = {
		...(activeFolder === "all"
			? {}
			: activeFolder === "unfiled"
				? { unfoldered: true }
				: { folder_id: activeFolder as number }),
		...(typeFilter !== "all" ? { file_type: typeFilter } : {}),
	};

	const { data: assets = [], isLoading: assetsLoading } = useQuery({
		queryKey: ["media-assets", activeFolder, typeFilter],
		queryFn: () => mediaApi.listAssets(assetsParams),
	});

	const totalAssets = assets.length;

	const uploadMutation = useMutation({
		mutationFn: ({ file, name, folderId }: { file: File; name: string; folderId: number | null }) =>
			mediaApi.upload(file, name, folderId ?? undefined),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["media-assets"] });
			qc.invalidateQueries({ queryKey: ["media-folders"] });
			setPendingFile(null);
			toast.success("Медиа загружено");
		},
		onError: () => toast.error("Не удалось загрузить файл"),
	});

	const createFolderMutation = useMutation({
		mutationFn: (name: string) => mediaApi.createFolder(name),
		onSuccess: (folder) => {
			qc.invalidateQueries({ queryKey: ["media-folders"] });
			setNewFolderMode(false);
			setNewFolderName("");
			setActiveFolder(folder.id);
		},
		onError: () => toast.error("Не удалось создать папку"),
	});

	const renameFolderMutation = useMutation({
		mutationFn: ({ id, name }: { id: number; name: string }) => mediaApi.renameFolder(id, name),
		onSuccess: () => qc.invalidateQueries({ queryKey: ["media-folders"] }),
	});

	const deleteFolderMutation = useMutation({
		mutationFn: (id: number) => mediaApi.deleteFolder(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["media-folders"] });
			qc.invalidateQueries({ queryKey: ["media-assets"] });
			if (typeof activeFolder === "number") setActiveFolder("all");
		},
	});

	const updateAssetMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: Parameters<typeof mediaApi.updateAsset>[1] }) =>
			mediaApi.updateAsset(id, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["media-assets"] });
			qc.invalidateQueries({ queryKey: ["media-folders"] });
		},
	});

	const deleteAssetMutation = useMutation({
		mutationFn: (id: number) => mediaApi.deleteAsset(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["media-assets"] });
			qc.invalidateQueries({ queryKey: ["media-folders"] });
			toast.success("Удалено");
		},
		onError: () => toast.error("Не удалось удалить"),
	});

	const handleFileSelect = useCallback((files: FileList | null) => {
		if (!files?.length) return;
		const file = files[0];
		const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
		const allowed = ["gif", "jpg", "jpeg", "png", "webp", "svg", "mp4", "mov", "webm"];
		if (!allowed.includes(ext)) {
			toast.error(`Формат .${ext} не поддерживается`);
			return;
		}
		setPendingFile(file);
	}, []);

	const handleDragEnd = (event: DragEndEvent) => {
		setDraggingAsset(null);
		setDragOverFolder(null);

		const { active, over } = event;
		if (!over) return;

		const assetId = active.id as number;
		const overId = over.id as string;

		if (overId === "droppable-unfiled") {
			updateAssetMutation.mutate({ id: assetId, data: { clear_folder: true } });
			return;
		}
		if (overId.startsWith("folder-")) {
			const folderId = Number(overId.replace("folder-", ""));
			const asset = assets.find((a) => a.id === assetId);
			if (asset?.folder_id === folderId) return;
			updateAssetMutation.mutate({ id: assetId, data: { folder_id: folderId } });
		}
	};

	const handleDragStart = (event: DragStartEvent) => {
		const asset = assets.find((a) => a.id === event.active.id);
		if (asset) setDraggingAsset(asset);
	};

	const handleDragOver = (event: any) => {
		const overId = event.over?.id as string | undefined;
		if (overId?.startsWith("folder-")) {
			setDragOverFolder(Number(overId.replace("folder-", "")));
		} else {
			setDragOverFolder(null);
		}
	};

	const { setNodeRef: unfiledRef } = useDroppable({ id: "droppable-unfiled" });

	const currentFolderForUpload = typeof activeFolder === "number" ? activeFolder : null;

	// Current section title
	const sectionTitle =
		activeFolder === "all"
			? typeFilter === "all"
				? "Все медиа"
				: (TYPE_TABS.find((t) => t.value === typeFilter)?.label ?? "Медиа")
			: activeFolder === "unfiled"
				? "Без папки"
				: (folders.find((f) => f.id === activeFolder)?.name ?? "Медиа");

	return (
		<DndContext
			sensors={sensors}
			onDragStart={handleDragStart}
			onDragOver={handleDragOver}
			onDragEnd={handleDragEnd}
		>
			<div className="flex h-full">
				{/* ── Sidebar ──────────────────────────────────────────────────────── */}
				<aside className="w-52 shrink-0 border-r border-slate-200 bg-white flex flex-col py-4 px-2 gap-0.5">
					<p className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
						Тип
					</p>

					{/* Type filters */}
					{TYPE_TABS.map(({ value, label, icon, color }) => {
						const isActive = activeFolder === "all" && typeFilter === value;
						return (
							<button
								key={value}
								onClick={() => {
									setActiveFolder("all");
									setTypeFilter(value);
								}}
								className={cn(
									"flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
									isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100"
								)}
							>
								<span
									className={cn(
										"shrink-0",
										isActive ? "text-brand-600" : color || "text-slate-400"
									)}
								>
									{icon}
								</span>
								{label}
							</button>
						);
					})}

					{/* Divider */}
					<div className="my-2 border-t border-slate-100" />

					<p className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
						Папки
					</p>

					{/* Unfiled */}
					<div ref={unfiledRef}>
						<button
							onClick={() => {
								setActiveFolder("unfiled");
								setTypeFilter("all");
							}}
							className={cn(
								"w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all",
								activeFolder === "unfiled"
									? "bg-brand-50 text-brand-800"
									: "text-slate-600 hover:bg-slate-100",
								dragOverFolder === null && draggingAsset
									? "bg-brand-100 border-2 border-dashed border-brand-400"
									: ""
							)}
						>
							<Folder
								className={cn(
									"w-4 h-4 shrink-0",
									activeFolder === "unfiled" ? "text-brand-600" : "text-slate-400"
								)}
							/>
							Без папки
						</button>
					</div>

					{/* Folders */}
					{!foldersLoading && folders.length > 0 && (
						<div className="flex flex-col gap-0.5">
							{folders.map((f) => (
								<FolderItem
									key={f.id}
									folder={f}
									isActive={activeFolder === f.id}
									isDragOver={dragOverFolder === f.id}
									onClick={() => {
										setActiveFolder(f.id);
										setTypeFilter("all");
									}}
									onRename={(name) => renameFolderMutation.mutate({ id: f.id, name })}
									onDelete={() => {
										if (!confirm(`Удалить папку «${f.name}»? Медиафайлы останутся.`)) return;
										deleteFolderMutation.mutate(f.id);
									}}
								/>
							))}
						</div>
					)}

					{/* New folder */}
					<div className="mt-1 px-1">
						{newFolderMode ? (
							<div className="flex items-center gap-1">
								<input
									value={newFolderName}
									onChange={(e) => setNewFolderName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && newFolderName.trim())
											createFolderMutation.mutate(newFolderName.trim());
										if (e.key === "Escape") {
											setNewFolderMode(false);
											setNewFolderName("");
										}
									}}
									placeholder="Название папки"
									className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-brand-400 focus:outline-none bg-white min-w-0"
								/>
								<button
									onClick={() => {
										if (newFolderName.trim()) createFolderMutation.mutate(newFolderName.trim());
									}}
									className="p-1 text-brand-600 hover:text-brand-800"
								>
									<Check className="w-3.5 h-3.5" />
								</button>
								<button
									onClick={() => {
										setNewFolderMode(false);
										setNewFolderName("");
									}}
									className="p-1 text-slate-400 hover:text-slate-600"
								>
									<X className="w-3.5 h-3.5" />
								</button>
							</div>
						) : (
							<button
								onClick={() => setNewFolderMode(true)}
								className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-brand-700 hover:bg-brand-50 rounded-xl transition-colors w-full"
							>
								<FolderPlus className="w-3.5 h-3.5" />
								Новая папка
							</button>
						)}
					</div>
				</aside>

				{/* ── Main content ─────────────────────────────────────────────────── */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Top bar */}
					<div className="border-b border-slate-200 px-5 py-3 flex items-center gap-3 bg-white sticky top-0 z-10 shadow-sm">
						<div>
							<h1 className="text-sm font-bold text-slate-900">{sectionTitle}</h1>
							{!assetsLoading && <p className="text-xs text-slate-400">{totalAssets} файлов</p>}
						</div>

						{/* Type pill tabs (only when in a folder or unfiled) */}
						{activeFolder !== "all" && (
							<div className="flex items-center gap-1 ml-4">
								{TYPE_TABS.map(({ value, label }) => (
									<button
										key={value}
										onClick={() => setTypeFilter(value)}
										className={cn(
											"text-xs px-2.5 py-1 rounded-full border transition-colors",
											typeFilter === value
												? "bg-brand-600 text-white border-brand-600"
												: "border-slate-200 text-slate-500 hover:border-brand-400 hover:text-brand-600"
										)}
									>
										{label}
									</button>
								))}
							</div>
						)}

						<div className="ml-auto">
							<input
								ref={fileInputRef}
								type="file"
								accept=".gif,.jpg,.jpeg,.png,.webp,.svg,.mp4,.mov,.webm"
								className="hidden"
								onChange={(e) => handleFileSelect(e.target.files)}
							/>
							<button
								onClick={() => fileInputRef.current?.click()}
								className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-brand text-white text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
							>
								<Plus className="w-4 h-4" />
								Загрузить медиа
							</button>
						</div>
					</div>

					{/* Grid */}
					<div className="flex-1 overflow-auto p-5">
						{assetsLoading ? (
							<div className="flex justify-center py-16">
								<Spinner />
							</div>
						) : assets.length === 0 ? (
							<div
								className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-brand-300 hover:bg-brand-50/30 transition-all"
								onClick={() => fileInputRef.current?.click()}
							>
								<div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-4">
									<Upload className="w-7 h-7 text-slate-300" />
								</div>
								<p className="text-sm font-semibold text-slate-600">
									{typeFilter === "gif"
										? "Нет GIF-анимаций"
										: typeFilter === "video"
											? "Нет видеофайлов"
											: typeFilter === "image"
												? "Нет фотографий"
												: "Нет медиафайлов"}
								</p>
								<p className="text-xs text-slate-400 mt-1">Нажмите, чтобы загрузить</p>
							</div>
						) : (
							<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
								{assets.map((asset) => (
									<MediaCard
										key={asset.id}
										asset={asset}
										onDelete={() => {
											if (!confirm(`Удалить «${asset.name}»?`)) return;
											deleteAssetMutation.mutate(asset.id);
										}}
										onRename={(name) =>
											updateAssetMutation.mutate({ id: asset.id, data: { name } })
										}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Drag overlay */}
			<DragOverlay>
				{draggingAsset && (
					<div className="w-28 rounded-xl border-2 border-brand-400 bg-white shadow-xl overflow-hidden opacity-90">
						<div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
							{draggingAsset.file_type === "video" ? (
								<Film className="w-6 h-6 text-slate-400" />
							) : (
								<img src={draggingAsset.url} className="w-full h-full object-contain" alt="" />
							)}
						</div>
						<div className="px-2 py-1.5">
							<p className="text-[10px] font-semibold text-slate-700 truncate">
								{draggingAsset.name}
							</p>
						</div>
					</div>
				)}
			</DragOverlay>

			{/* Upload modal */}
			{pendingFile && (
				<UploadModal
					file={pendingFile}
					folders={folders}
					currentFolderId={currentFolderForUpload}
					uploading={uploadMutation.isPending}
					onSubmit={(name, folderId) =>
						uploadMutation.mutate({ file: pendingFile, name, folderId })
					}
					onCancel={() => setPendingFile(null)}
				/>
			)}
		</DndContext>
	);
}
