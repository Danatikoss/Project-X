/**
 * CollabAssemble — collaborative editing page, accessible via /edit/:editToken
 * No auth required. The edit token IS the credential.
 *
 * Features available to collaborators:
 *  - View slides in filmstrip + preview
 *  - Reorder and remove slides
 *  - Edit presentation title
 *  - See and move/resize existing media overlays
 *  - Real-time sync via WebSocket (changes from owner are reflected live)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertCircle,
	Check,
	ChevronLeft,
	ChevronRight,
	Edit2,
	Layers,
	Trash2,
	Users,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { assemblyApi } from "../api/client";
import { useAssemblyRoom } from "../hooks/useAssemblyRoom";
import { Spinner } from "../components/common/Spinner";
import { SlideThumbnail } from "../components/common/SlideCard";
import type { Assembly, Slide, SlideOverlay } from "../types";
import { cn } from "../utils/cn";

// ─── Overlay Item (same logic as in Assemble.tsx) ────────────────────────────

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

// ─── Filmstrip ────────────────────────────────────────────────────────────────

function CollabFilmstrip({
	slides,
	selectedIndex,
	onSelect,
	onRemove,
}: {
	slides: Slide[];
	selectedIndex: number;
	onSelect: (i: number) => void;
	onRemove: (id: number) => void;
}) {
	return (
		<div className="flex flex-col gap-1 p-2 overflow-y-auto flex-1">
			{slides.map((slide, i) => (
				<div key={slide.id} className="relative group">
					<button
						onClick={() => onSelect(i)}
						className={cn(
							"w-full rounded-lg overflow-hidden border-2 transition-all",
							i === selectedIndex ? "border-brand-500" : "border-transparent opacity-60 hover:opacity-90"
						)}
					>
						<img
							src={slide.thumbnail_url}
							alt={slide.title || `Слайд ${i + 1}`}
							className="w-full aspect-video object-cover"
						/>
					</button>
					<span className="absolute top-1 left-1 w-4 h-4 bg-black/50 rounded text-white text-[9px] flex items-center justify-center font-medium pointer-events-none">
						{i + 1}
					</span>
					<button
						onClick={() => onRemove(slide.id)}
						className="absolute top-1 right-1 w-5 h-5 rounded bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
						title="Удалить слайд"
					>
						<Trash2 className="w-2.5 h-2.5" />
					</button>
				</div>
			))}
		</div>
	);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CollabAssemble() {
	const { editToken } = useParams<{ editToken: string }>();
	const queryClient = useQueryClient();

	const [selectedIndex, setSelectedIndex] = useState(0);
	const [localSlides, setLocalSlides] = useState<Slide[]>([]);
	const [overlays, setOverlays] = useState<Record<string, SlideOverlay[]>>({});
	const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleValue, setTitleValue] = useState("");
	const [assemblyId, setAssemblyId] = useState<number | null>(null);

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
	const saveOverlaysRef = useRef<() => void>(() => {});

	const { data: assembly, isLoading, isError } = useQuery({
		queryKey: ["collab-assembly", editToken],
		queryFn: () => assemblyApi.getCollab(editToken!),
		enabled: !!editToken,
		retry: false,
	});

	useEffect(() => {
		if (assembly) {
			setLocalSlides(assembly.slides);
			setTitleValue(assembly.title);
			setOverlays(assembly.overlays || {});
			setAssemblyId(assembly.id);
		}
	}, [assembly]);

	useEffect(() => {
		overlaysRef.current = overlays;
	}, [overlays]);

	// Real-time sync from WS room
	useAssemblyRoom(assemblyId, (updated: Assembly) => {
		setLocalSlides(updated.slides);
		setOverlays(updated.overlays || {});
		setTitleValue(updated.title);
		queryClient.setQueryData(["collab-assembly", editToken], updated);
	});

	const updateMutation = useMutation({
		mutationFn: (data: {
			slide_ids?: number[];
			title?: string;
			overlays?: Record<string, SlideOverlay[]>;
		}) => assemblyApi.updateCollab(editToken!, data),
		onSuccess: (updated) => {
			queryClient.setQueryData(["collab-assembly", editToken], updated);
		},
		onError: () => toast.error("Не удалось сохранить изменения"),
	});

	saveOverlaysRef.current = () => {
		updateMutation.mutate({ overlays: overlaysRef.current });
	};

	// Overlay drag/resize
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
					o.x = startOverlay.x + dx;
					o.y = startOverlay.y + dy;
				} else {
					const ratio = startOverlay.h / startOverlay.w;
					const newW = Math.max(10, startOverlay.w + dx);
					o.w = newW;
					o.h = Math.max(5, newW * ratio);
				}
				list[i] = o;
				return { ...prev, [slideId]: list };
			});
		};
		const onUp = () => {
			if (!dragRef.current) return;
			dragRef.current = null;
			saveOverlaysRef.current();
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

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

	const deleteOverlay = useCallback(
		(slideId: string, overlayId: string) => {
			const newOverlays = {
				...overlaysRef.current,
				[slideId]: (overlaysRef.current[slideId] || []).filter((o) => o.id !== overlayId),
			};
			setOverlays(newOverlays);
			setSelectedOverlayId(null);
			updateMutation.mutate({ overlays: newOverlays });
		},
		[updateMutation]
	);

	const handleRemove = (slideId: number) => {
		const newSlides = localSlides.filter((s) => s.id !== slideId);
		setLocalSlides(newSlides);
		setSelectedIndex(Math.min(selectedIndex, Math.max(0, newSlides.length - 1)));
		updateMutation.mutate({ slide_ids: newSlides.map((s) => s.id) });
	};

	const handleTitleSave = () => {
		setEditingTitle(false);
		if (titleValue !== assembly?.title) {
			updateMutation.mutate({ title: titleValue });
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-screen bg-gray-50">
				<Spinner size="lg" />
			</div>
		);
	}

	if (isError || !assembly) {
		return (
			<div className="flex flex-col items-center justify-center h-screen gap-4 text-gray-400">
				<AlertCircle className="w-10 h-10" />
				<p className="text-lg font-medium text-gray-900">Ссылка недействительна</p>
				<p className="text-sm text-gray-500">Ссылка устарела или была отозвана владельцем</p>
			</div>
		);
	}

	const selectedSlide = localSlides[selectedIndex];
	const currentSlideId = selectedSlide ? String(selectedSlide.id) : null;
	const currentOverlays = currentSlideId ? overlays[currentSlideId] || [] : [];
	const isSaving = updateMutation.isPending;

	return (
		<div className="flex flex-col h-screen overflow-hidden bg-gray-50">
			{/* Header */}
			<header className="shrink-0 flex items-center gap-3 px-4 h-[52px] bg-white border-b border-gray-200">
				{/* Logo */}
				<div className="flex items-center gap-2 shrink-0">
					<div className="w-7 h-7 bg-brand-900 rounded-lg flex items-center justify-center">
						<Layers className="w-3.5 h-3.5 text-white" />
					</div>
					<span className="text-sm font-semibold text-gray-900 hidden sm:block">SLIDEX</span>
				</div>

				<div className="w-px h-5 bg-gray-100 shrink-0" />

				{/* Collab badge */}
				<div className="flex items-center gap-1.5 text-xs text-brand-600 bg-brand-50 border border-brand-200 px-2 py-1 rounded-full shrink-0">
					<Users className="w-3 h-3" />
					<span className="hidden sm:inline">Совместное редактирование</span>
				</div>

				{/* Title */}
				<div className="flex-1 min-w-0">
					{editingTitle ? (
						<div className="flex items-center gap-2 max-w-sm">
							<input
								value={titleValue}
								onChange={(e) => setTitleValue(e.target.value)}
								onBlur={handleTitleSave}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleTitleSave();
									if (e.key === "Escape") {
										setEditingTitle(false);
										setTitleValue(assembly.title);
									}
								}}
								autoFocus
								className="flex-1 bg-white text-gray-900 text-sm font-medium rounded-lg px-2.5 py-1 border border-gray-200 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30"
							/>
							<button
								onClick={handleTitleSave}
								className="p-1 rounded text-brand-600 hover:text-brand-500"
							>
								<Check className="w-4 h-4" />
							</button>
						</div>
					) : (
						<button
							onClick={() => setEditingTitle(true)}
							className="group flex items-center gap-1.5 max-w-sm text-left"
						>
							<span className="text-sm font-semibold text-gray-900 truncate group-hover:text-gray-700 transition-colors">
								{titleValue || "Без названия"}
							</span>
							<Edit2 className="w-3 h-3 text-gray-400 group-hover:text-gray-600 shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
						</button>
					)}
				</div>

				{/* Save status */}
				<div className="shrink-0 flex items-center gap-1.5">
					{isSaving ? (
						<span className="flex items-center gap-1 text-[11px] text-gray-500">
							<Spinner size="sm" className="border-gray-500 border-t-transparent w-3 h-3" />
							Сохранение…
						</span>
					) : (
						<span className="text-[11px] text-gray-400">
							{localSlides.length}{" "}
							{localSlides.length === 1 ? "слайд" : localSlides.length < 5 ? "слайда" : "слайдов"}
						</span>
					)}
				</div>
			</header>

			{/* Body */}
			<div className="flex-1 flex overflow-hidden">
				{/* Filmstrip */}
				<aside className="w-[160px] shrink-0 flex flex-col bg-white border-r border-gray-200">
					<div className="px-3 py-2 border-b border-gray-200 shrink-0">
						<p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Слайды</p>
					</div>
					{localSlides.length === 0 ? (
						<div className="flex items-center justify-center flex-1 p-4">
							<p className="text-xs text-gray-400 text-center">Нет слайдов</p>
						</div>
					) : (
						<CollabFilmstrip
							slides={localSlides}
							selectedIndex={selectedIndex}
							onSelect={setSelectedIndex}
							onRemove={handleRemove}
						/>
					)}
				</aside>

				{/* Canvas */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Nav bar */}
					<div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0 bg-white">
						<div className="flex items-center gap-1">
							<button
								disabled={selectedIndex === 0}
								onClick={() => setSelectedIndex(selectedIndex - 1)}
								className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
							>
								<ChevronLeft className="w-4 h-4" />
							</button>
							<span className="text-xs text-gray-500 min-w-[52px] text-center font-mono">
								{localSlides.length > 0 ? `${selectedIndex + 1} / ${localSlides.length}` : "—"}
							</span>
							<button
								disabled={selectedIndex >= localSlides.length - 1}
								onClick={() => setSelectedIndex(selectedIndex + 1)}
								className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
							>
								<ChevronRight className="w-4 h-4" />
							</button>
						</div>
						{selectedSlide && (
							<p className="text-xs text-gray-500 truncate flex-1 mx-3 text-center hidden sm:block">
								{selectedSlide.title || ""}
							</p>
						)}
					</div>

					{/* Slide canvas */}
					<div
						className="flex-1 flex items-center justify-center p-8 overflow-auto bg-gray-50"
						onClick={() => setSelectedOverlayId(null)}
					>
						{selectedSlide ? (
							<div className="w-full max-w-4xl flex flex-col items-center gap-4">
								<div className="relative w-full" style={{ padding: "8% 12%" }}>
									<div
										ref={containerRef}
										className="relative w-full rounded-2xl shadow-[0_4px_32px_rgba(0,0,0,0.12)] ring-1 ring-gray-200"
									>
										{selectedSlide.video_url ? (
											<video
												src={selectedSlide.video_url}
												controls
												className="w-full object-contain bg-black rounded-2xl"
												style={{ aspectRatio: "16/9" }}
												poster={selectedSlide.thumbnail_url || undefined}
											/>
										) : (
											<SlideThumbnail slide={selectedSlide} />
										)}

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
								</div>
								{selectedOverlayId && (
									<button
										onClick={() => setSelectedOverlayId(null)}
										className="text-[11px] text-gray-500 hover:text-gray-700 px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
									>
										Снять выделение
									</button>
								)}
							</div>
						) : (
							<div className="text-center text-gray-400">
								<p className="text-sm">Нет слайдов</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
