import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, FolderOpen, Layers, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { libraryApi, projectsApi } from "../../api/client";
import type { Project, Slide } from "../../types";
import { cn } from "../../utils/cn";

interface SlideCardProps {
	slide: Slide;
	onClick?: () => void;
	onRemove?: () => void;
	isSelected?: boolean;
	showRemove?: boolean;
	showFolderAssign?: boolean;
	compact?: boolean;
	className?: string;
}

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

/** Self-contained folder assignment dropdown, shown on card hover */
function FolderAssignButton({ slide }: { slide: Slide }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const queryClient = useQueryClient();

	const { data: projects = [] } = useQuery<Project[]>({
		queryKey: ["projects"],
		queryFn: projectsApi.list,
	});

	const mutation = useMutation({
		mutationFn: (pid: number | null) => libraryApi.updateSlide(slide.id, { project_id: pid }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["slides"] });
			queryClient.invalidateQueries({ queryKey: ["projects"] });
			setOpen(false);
		},
	});

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	if (projects.length === 0) return null;

	return (
		<div ref={ref} className="relative">
			<button
				onClick={(e) => {
					e.stopPropagation();
					setOpen((v) => !v);
				}}
				title="Добавить в папку"
				className={cn(
					"w-6 h-6 rounded-full flex items-center justify-center shadow-md border transition-colors",
					slide.project_id
						? "bg-brand-100 border-brand-300 text-brand-700"
						: "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
				)}
			>
				<FolderOpen className="w-3 h-3" />
			</button>

			{open && (
				<div
					className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-30 min-w-[160px] py-1"
					onClick={(e) => e.stopPropagation()}
				>
					{projects.map((p) => (
						<button
							key={p.id}
							onClick={() => mutation.mutate(p.id)}
							className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-gray-50 transition-colors"
						>
							<FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: p.color }} />
							<span className="flex-1 truncate">{p.name}</span>
							{slide.project_id === p.id && <Check className="w-3 h-3 text-brand-600 shrink-0" />}
						</button>
					))}
					{slide.project_id && (
						<button
							onClick={() => mutation.mutate(null)}
							className="w-full px-3 py-1.5 text-xs text-left text-red-500 hover:bg-red-50 border-t border-gray-100 mt-1 transition-colors"
						>
							Убрать из папки
						</button>
					)}
				</div>
			)}
		</div>
	);
}

/** Renders slide thumbnail with animated GIF overlaid at its correct position */
export function SlideThumbnail({ slide, className }: { slide: Slide; className?: string }) {
	return (
		<div className={cn("relative w-full overflow-hidden", className)} style={{ paddingTop: "56.25%" }}>
			{/* Base: full slide thumbnail */}
			{slide.thumbnail_url ? (
				<img
					src={slide.thumbnail_url}
					alt={slide.title || "Слайд"}
					className="absolute inset-0 w-full h-full object-cover"
					loading="lazy"
				/>
			) : slide.gif_url ? (
				<img
					src={slide.gif_url}
					alt={slide.title || "Слайд"}
					className="absolute inset-0 w-full h-full object-cover"
					loading="lazy"
				/>
			) : (
				<div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
					<span className="text-gray-400 text-sm">Нет изображения</span>
				</div>
			)}

			{/* GIF overlay at exact position within slide */}
			{slide.gif_url && slide.gif_rect && (
				<img
					src={slide.gif_url}
					alt=""
					aria-hidden
					style={{
						position: "absolute",
						left: `${slide.gif_rect.x * 100}%`,
						top: `${slide.gif_rect.y * 100}%`,
						width: `${slide.gif_rect.w * 100}%`,
						height: `${slide.gif_rect.h * 100}%`,
						objectFit: "fill",
						pointerEvents: "none",
					}}
				/>
			)}
		</div>
	);
}

export function SlideCard({
	slide,
	onClick,
	onRemove,
	isSelected,
	showRemove,
	showFolderAssign,
	compact,
	className,
}: SlideCardProps) {
	return (
		<div
			className={cn(
				"group relative bg-white rounded-lg border border-gray-200 overflow-hidden transition-all cursor-pointer",
				"shadow-card hover:shadow-card-hover hover:border-brand-200",
				isSelected && "border-brand-600 ring-2 ring-brand-200",
				className
			)}
			onClick={onClick}
		>
			{/* Thumbnail + GIF overlay */}
			<div className="relative">
				<SlideThumbnail slide={slide} />

				{/* Outdated badge */}
				{slide.is_outdated && (
					<div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full z-10">
						<AlertCircle className="w-3 h-3" />
						Устарел
					</div>
				)}

				{/* Action buttons on hover */}
				<div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
					{showFolderAssign && <FolderAssignButton slide={slide} />}
					{showRemove && (
						<button
							className="w-6 h-6 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
							onClick={(e) => {
								e.stopPropagation();
								onRemove?.();
							}}
						>
							<X className="w-3.5 h-3.5" />
						</button>
					)}
				</div>
			</div>

			{/* Meta */}
			{!compact && (
				<div className="p-2.5">
					<p className="text-sm font-medium text-gray-800 line-clamp-2 leading-tight mb-1.5">
						{slide.title || "(без названия)"}
					</p>

					{slide.labels && slide.labels.length > 0 && (
						<div className="flex flex-wrap gap-1 mb-1">
							{slide.labels.slice(0, 2).map((lbl) => (
								<span
									key={lbl}
									className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded-full border border-teal-200"
								>
									{lbl}
								</span>
							))}
							{slide.labels.length > 2 && (
								<span className="text-[10px] text-gray-400">+{slide.labels.length - 2}</span>
							)}
						</div>
					)}

					{slide.tags.length > 0 && (
						<div className="flex flex-wrap gap-1 mb-1">
							{slide.tags.slice(0, 3).map((tag) => (
								<span
									key={tag}
									className="text-[10px] px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded-full"
								>
									{tag}
								</span>
							))}
							{slide.tags.length > 3 && (
								<span className="text-[10px] text-gray-400">+{slide.tags.length - 3}</span>
							)}
						</div>
					)}

					<div className="flex items-center justify-between mt-1">
						{slide.source_filename && (
							<p className="text-[10px] text-gray-400 truncate max-w-[70%]">
								{slide.source_filename}
							</p>
						)}
						<div className="flex items-center gap-1.5 ml-auto shrink-0">
							{slide.used_in_assemblies > 0 && (
								<span className="flex items-center gap-0.5 text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
									<Layers className="w-2.5 h-2.5" />
									{slide.used_in_assemblies}
								</span>
							)}
							{slide.created_at && (
								<p className="text-[10px] text-gray-300">{formatDate(slide.created_at)}</p>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
