import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowRight,
	BookImage,
	CheckSquare,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	Eye,
	Layers,
	MoreVertical,
	Pencil,
	PenLine,
	Plus,
	Sparkles,
	Square,
	Trash2,
	X,
} from "lucide-react";
import { OnboardingChecklist } from "../components/onboarding/OnboardingChecklist";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { assemblyApi, templatesApi } from "../api/client";
import { Spinner } from "../components/common/Spinner";
import type { AssemblyListItem, AssemblyTemplate, Slide } from "../types";
import { cn } from "../utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserTemplateCard {
	id: string;
	title: string;
	desc: string;
	slidesPreview: AssemblyTemplate["slides_preview"];
	slideCount: number;
	usesCount: number;
	dbId: number;
}

// ─── UserTemplateThumbnail (used in preview modal) ────────────────────────────

function UserTemplateThumbnail({ slides }: { slides: AssemblyTemplate["slides_preview"] }) {
	if (slides.length === 0) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-gray-50">
				<div className="text-center text-gray-300">
					<BookImage className="w-8 h-8 mx-auto mb-1 opacity-50" />
					<p className="text-[10px]">Нет слайдов</p>
				</div>
			</div>
		);
	}
	const count = slides.length;
	return (
		<div
			className="w-full h-full bg-gray-100 grid gap-0.5 p-0.5"
			style={{
				gridTemplateColumns:
					count === 1 ? "1fr" : count === 2 ? "1fr 1fr" : count === 3 ? "1fr 1fr 1fr" : "1fr 1fr",
				gridTemplateRows: count <= 2 ? "1fr" : "1fr 1fr",
			}}
		>
			{slides.map((s) => (
				<img key={s.id} src={s.thumbnail_url} alt={s.title ?? ""} className="w-full h-full object-cover rounded" />
			))}
		</div>
	);
}

// ─── TemplatePreviewModal ─────────────────────────────────────────────────────

function TemplatePreviewModal({
	template,
	onClose,
	onUse,
	onEdit,
	onDelete,
	isUsing,
	canEdit,
}: {
	template: UserTemplateCard;
	onClose: () => void;
	onUse: () => void;
	onEdit: () => void;
	onDelete: () => void;
	isUsing: boolean;
	canEdit: boolean;
}) {
	const [idx, setIdx] = useState(0);
	const { data: slides = [], isLoading } = useQuery<Slide[]>({
		queryKey: ["template-slides-preview", template.dbId],
		queryFn: () => templatesApi.getSlides(template.dbId),
	});
	const total = slides.length;
	const prev = () => setIdx((i) => Math.max(0, i - 1));
	const next = () => setIdx((i) => Math.min(total - 1, i + 1));
	const currentSlide = slides[idx];

	return (
		<motion.div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			onClick={onClose}
		>
			<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
			<motion.div
				className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col"
				initial={{ scale: 0.95, y: 20 }}
				animate={{ scale: 1, y: 0 }}
				exit={{ scale: 0.95, y: 20 }}
				transition={{ type: "spring", stiffness: 320, damping: 28 }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
					<div className="flex items-center gap-3 min-w-0">
						<div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
							<Layers className="w-4 h-4 text-brand-600" />
						</div>
						<div className="min-w-0">
							<p className="text-sm font-semibold text-gray-900 truncate">{template.title}</p>
							<p className="text-[11px] text-gray-400">{template.slideCount} слайдов</p>
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						{canEdit && (
							<>
								<button
									onClick={onEdit}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
								>
									<Pencil className="w-3.5 h-3.5" /> Редактировать
								</button>
								<button
									onClick={onDelete}
									className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
									title="Удалить"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</button>
							</>
						)}
						<button
							onClick={onClose}
							className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="relative bg-gray-50 flex items-center justify-center" style={{ minHeight: 320 }}>
					{isLoading ? (
						<Spinner size="lg" />
					) : total === 0 ? (
						<div className="flex flex-col items-center gap-2 text-gray-300 py-12">
							<BookImage className="w-10 h-10" />
							<p className="text-sm">Нет слайдов</p>
						</div>
					) : (
						<>
							<img
								src={currentSlide?.thumbnail_url}
								alt={currentSlide?.title ?? ""}
								className="max-h-80 max-w-full object-contain rounded shadow-sm"
							/>
							{idx > 0 && (
								<button
									onClick={prev}
									className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center hover:bg-white transition-colors"
								>
									<ChevronLeft className="w-4 h-4 text-gray-600" />
								</button>
							)}
							{idx < total - 1 && (
								<button
									onClick={next}
									className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full shadow flex items-center justify-center hover:bg-white transition-colors"
								>
									<ChevronRight className="w-4 h-4 text-gray-600" />
								</button>
							)}
							<div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[11px] px-2.5 py-1 rounded-full">
								{idx + 1} / {total}
							</div>
						</>
					)}
				</div>

				{!isLoading && total > 1 && (
					<div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-t border-gray-100 bg-gray-50/50">
						{slides.map((s, i) => (
							<button
								key={s.id}
								onClick={() => setIdx(i)}
								className={cn(
									"shrink-0 w-16 h-10 rounded overflow-hidden border-2 transition-all",
									i === idx ? "border-brand-500 shadow-sm" : "border-transparent hover:border-gray-300"
								)}
							>
								<img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
							</button>
						))}
					</div>
				)}

				<div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
					{template.desc ? (
						<p className="text-xs text-gray-400 max-w-xs truncate">{template.desc}</p>
					) : (
						<span />
					)}
					<button
						onClick={onUse}
						disabled={isUsing}
						className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-semibold hover:opacity-90 shadow-sm disabled:opacity-60 transition-all"
					>
						{isUsing ? (
							<Spinner size="sm" className="border-white/40 border-t-white" />
						) : (
							<ArrowRight className="w-4 h-4" />
						)}
						Использовать
					</button>
				</div>
			</motion.div>
		</motion.div>
	);
}

// ─── AssemblyGridCard ─────────────────────────────────────────────────────────

function AssemblyGridCard({
	assembly,
	isSelected,
	isAnySelected,
	isEditing,
	editTitle,
	editInputRef,
	isManual,
	onOpen,
	onToggleSelect,
	onStartRename,
	onEditTitleChange,
	onCommitRename,
	onCancelRename,
	onDuplicate,
	onDelete,
}: {
	assembly: AssemblyListItem;
	isSelected: boolean;
	isAnySelected: boolean;
	isEditing: boolean;
	editTitle: string;
	editInputRef: React.RefObject<HTMLInputElement>;
	isManual: boolean;
	onOpen: () => void;
	onToggleSelect: () => void;
	onStartRename: () => void;
	onEditTitleChange: (v: string) => void;
	onCommitRename: () => void;
	onCancelRename: () => void;
	onDuplicate: () => void;
	onDelete: () => void;
}) {
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

	const dateStr = new Date(assembly.created_at).toLocaleDateString("ru-RU", {
		day: "2-digit",
		month: "short",
	});

	return (
		<div
			className={cn(
				"group rounded-xl border overflow-hidden cursor-pointer transition-all bg-white",
				isSelected
					? "border-brand-400 shadow-md ring-1 ring-brand-300"
					: "border-gray-200 hover:shadow-lg hover:border-gray-300"
			)}
			onClick={() => (isAnySelected ? onToggleSelect() : onOpen())}
		>
			{/* Thumbnail */}
			<div className="relative overflow-hidden bg-gray-100" style={{ paddingTop: "56.25%" }}>
				<div className="absolute inset-0">
					{assembly.thumbnail_urls.length > 0 ? (
						<img
							src={assembly.thumbnail_urls[0]}
							className="w-full h-full object-cover"
							alt={assembly.title}
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
							{isManual ? (
								<PenLine className="w-10 h-10 text-gray-200" />
							) : (
								<Sparkles className="w-10 h-10 text-gray-200" />
							)}
						</div>
					)}
				</div>

				{/* Checkbox */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						onToggleSelect();
					}}
					className={cn(
						"absolute top-2 left-2 w-5 h-5 rounded bg-white/90 shadow-sm flex items-center justify-center transition-opacity",
						isSelected || isAnySelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
					)}
				>
					{isSelected ? (
						<CheckSquare className="w-4 h-4 text-brand-500" />
					) : (
						<Square className="w-4 h-4 text-gray-400" />
					)}
				</button>
			</div>

			{/* Info bar */}
			<div className="px-3 py-2.5 bg-white">
				{isEditing ? (
					<input
						ref={editInputRef}
						value={editTitle}
						onChange={(e) => onEditTitleChange(e.target.value)}
						onBlur={onCommitRename}
						onKeyDown={(e) => {
							if (e.key === "Enter") onCommitRename();
							if (e.key === "Escape") onCancelRename();
						}}
						className="w-full text-sm font-medium border-b border-brand-400 focus:outline-none bg-transparent py-0.5 text-gray-900"
						onClick={(e) => e.stopPropagation()}
					/>
				) : (
					<p className="text-sm font-medium text-gray-900 truncate leading-snug">{assembly.title}</p>
				)}

				<div className="flex items-center justify-between mt-1.5">
					<div className="flex items-center gap-1.5 text-[11px] text-gray-400">
						<div className="w-3.5 h-3.5 rounded-sm bg-amber-100 flex items-center justify-center shrink-0">
							<Layers className="w-2.5 h-2.5 text-amber-600" />
						</div>
						<span>{dateStr}</span>
						<span className="text-gray-300">·</span>
						<span>{assembly.slide_count} сл.</span>
					</div>

					{/* Three-dot menu */}
					<div className="relative" ref={menuRef}>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setMenuOpen((v) => !v);
							}}
							className={cn(
								"p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all",
								menuOpen ? "opacity-100 bg-gray-100 text-gray-700" : "opacity-0 group-hover:opacity-100"
							)}
						>
							<MoreVertical className="w-3.5 h-3.5" />
						</button>

						<AnimatePresence>
							{menuOpen && (
								<motion.div
									initial={{ opacity: 0, scale: 0.95, y: 4 }}
									animate={{ opacity: 1, scale: 1, y: 0 }}
									exit={{ opacity: 0, scale: 0.95, y: 4 }}
									transition={{ duration: 0.1 }}
									className="absolute right-0 bottom-full mb-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 w-44"
								>
									<button
										onClick={(e) => {
											e.stopPropagation();
											onStartRename();
											setMenuOpen(false);
										}}
										className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
									>
										<PenLine className="w-3.5 h-3.5 text-gray-400" /> Переименовать
									</button>
									<button
										onClick={(e) => {
											e.stopPropagation();
											onDuplicate();
											setMenuOpen(false);
										}}
										className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
									>
										<Copy className="w-3.5 h-3.5 text-gray-400" /> Дублировать
									</button>
									<hr className="my-1 border-gray-100" />
									<button
										onClick={(e) => {
											e.stopPropagation();
											onDelete();
											setMenuOpen(false);
										}}
										className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
									>
										<Trash2 className="w-3.5 h-3.5" /> Удалить
									</button>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
	const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
	const [previewTemplate, setPreviewTemplate] = useState<UserTemplateCard | null>(null);
	const [templateSearch, setTemplateSearch] = useState("");
	const [showAIPrompt, setShowAIPrompt] = useState(false);
	const [customPrompt, setCustomPrompt] = useState("");
	const [showGallery, setShowGallery] = useState(true);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

	const editInputRef = useRef<HTMLInputElement>(null);
	const cancelRenameRef = useRef(false);
	const promptRef = useRef<HTMLTextAreaElement>(null);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const { data: assemblies, isLoading } = useQuery({
		queryKey: ["assemblies"],
		queryFn: assemblyApi.list,
	});

	const { data: userTemplates = [], isLoading: templatesLoading } = useQuery({
		queryKey: ["templates"],
		queryFn: templatesApi.list,
	});

	const allTemplates: UserTemplateCard[] = userTemplates.map((t) => ({
		id: `user-${t.id}`,
		title: t.name,
		desc: t.description,
		slidesPreview: t.slides_preview,
		slideCount: t.slide_ids.length,
		usesCount: t.uses_count ?? 0,
		dbId: t.id,
	}));

	const filteredTemplates = allTemplates.filter(
		(t) => !templateSearch || t.title.toLowerCase().includes(templateSearch.toLowerCase())
	);

	// ── Mutations ──────────────────────────────────────────────────────────────

	const createFromTemplateMutation = useMutation({
		mutationFn: (templateId: number) => assemblyApi.createFromTemplate(templateId),
		onSuccess: (assembly) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			navigate(`/assemble/${assembly.id}`);
		},
		onError: () => toast.error("Не удалось создать презентацию из шаблона"),
	});

	const customMutation = useMutation({
		mutationFn: () => assemblyApi.create({ prompt: customPrompt, max_slides: 15 }),
		onSuccess: (assembly) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			navigate(`/assemble/${assembly.id}`);
		},
		onError: () => toast.error("Не удалось собрать презентацию"),
	});

	const blankMutation = useMutation({
		mutationFn: () => assemblyApi.createBlank("Новая презентация"),
		onSuccess: (assembly) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			navigate(`/assemble/${assembly.id}?tab=library`);
		},
		onError: () => toast.error("Не удалось создать презентацию"),
	});

	const duplicateMutation = useMutation({
		mutationFn: (id: number) => assemblyApi.duplicate(id),
		onSuccess: (assembly) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			navigate(`/assemble/${assembly.id}`);
			toast.success("Сборка скопирована");
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => assemblyApi.delete(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			toast.success("Сборка удалена");
		},
	});

	const deleteSelectedMutation = useMutation({
		mutationFn: (ids: number[]) => Promise.all(ids.map((id) => assemblyApi.delete(id))),
		onSuccess: (_, ids) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			setSelectedIds(new Set());
			toast.success(`Удалено: ${ids.length}`);
		},
		onError: () => toast.error("Не удалось удалить некоторые сборки"),
	});

	const renameMutation = useMutation({
		mutationFn: ({ id, title }: { id: number; title: string }) => assemblyApi.update(id, { title }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["assemblies"] }),
		onError: () => toast.error("Не удалось переименовать"),
	});

	const deleteTemplateMutation = useMutation({
		mutationFn: (id: number) => templatesApi.delete(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["templates"] });
			toast.success("Шаблон удалён");
		},
		onError: () => toast.error("Не удалось удалить шаблон"),
	});

	// ── Handlers ───────────────────────────────────────────────────────────────

	const startRename = (id: number, title: string) => {
		cancelRenameRef.current = false;
		setEditingId(id);
		setEditTitle(title);
	};

	const commitRename = () => {
		if (cancelRenameRef.current) {
			cancelRenameRef.current = false;
			return;
		}
		if (editingId === null) return;
		const trimmed = editTitle.trim();
		if (trimmed) renameMutation.mutate({ id: editingId, title: trimmed });
		setEditingId(null);
	};

	useEffect(() => {
		if (editingId !== null) editInputRef.current?.focus();
	}, [editingId]);

	useEffect(() => {
		if (showAIPrompt) promptRef.current?.focus();
	}, [showAIPrompt]);

	const handleTemplateClick = (t: UserTemplateCard) => setPreviewTemplate(t);

	const handleUseTemplate = (t: UserTemplateCard) => {
		setActiveTemplateId(t.id);
		createFromTemplateMutation.mutate(t.dbId, {
			onSuccess: () => setPreviewTemplate(null),
		});
	};

	const handleCustomSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!customPrompt.trim()) return;
		customMutation.mutate();
	};

	const isBuilding = createFromTemplateMutation.isPending;

	return (
		<div className="min-h-full bg-[#f0f4f9]">
			{/* ── Start new presentation ───────────────────────────────────────── */}
			<div className="bg-white border-b border-gray-200 px-8 pt-6 pb-5">
				<div className="max-w-5xl mx-auto">
					<OnboardingChecklist />

					{/* Section header */}
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-sm font-semibold text-gray-700">Начать новую презентацию</h2>
						<button
							onClick={() => setShowGallery((v) => !v)}
							className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
						>
							Галерея шаблонов
							<ChevronDown
								className={cn("w-4 h-4 transition-transform duration-200", !showGallery && "-rotate-90")}
							/>
						</button>
					</div>

					{showGallery && (
						<>
							{/* Template row */}
							<div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
								{/* Blank card */}
								<button
									onClick={() => blankMutation.mutate()}
									disabled={blankMutation.isPending}
									className="shrink-0 w-44 group text-left disabled:opacity-60"
								>
									<div className="w-full h-28 rounded-lg border-2 border-gray-300 group-hover:border-brand-400 bg-white flex items-center justify-center transition-all group-hover:shadow-md">
										{blankMutation.isPending ? (
											<Spinner />
										) : (
											<PenLine className="w-9 h-9 text-gray-300 group-hover:text-brand-400 transition-colors" />
										)}
									</div>
									<p className="mt-2 text-xs font-medium text-gray-700">Пустая</p>
								</button>

								{/* AI card */}
								<button
									onClick={() => setShowAIPrompt((v) => !v)}
									className="shrink-0 w-44 group text-left"
								>
									<div
										className={cn(
											"w-full h-28 rounded-lg border-2 flex items-center justify-center transition-all group-hover:shadow-md",
											showAIPrompt
												? "border-brand-400 bg-gradient-to-br from-brand-50 to-violet-50"
												: "border-gray-300 group-hover:border-brand-300 bg-gradient-to-br from-gray-50 to-white"
										)}
									>
										<Sparkles
											className={cn(
												"w-9 h-9 transition-colors",
												showAIPrompt
													? "text-brand-500"
													: "text-gray-300 group-hover:text-brand-400"
											)}
										/>
									</div>
									<p className="mt-2 text-xs font-medium text-gray-700">Сгенерировать с AI</p>
								</button>

								{/* Template cards */}
								{templatesLoading
									? Array.from({ length: 3 }).map((_, i) => (
											<div key={i} className="shrink-0 w-44 animate-pulse">
												<div className="w-full h-28 rounded-lg bg-gray-200" />
												<div className="mt-2 h-3 bg-gray-200 rounded w-3/4" />
											</div>
										))
									: filteredTemplates.map((t) => {
											const isThisBuilding = isBuilding && activeTemplateId === t.id;
											return (
												<button
													key={t.id}
													onClick={() => !isBuilding && handleTemplateClick(t)}
													disabled={isBuilding}
													className={cn(
														"shrink-0 w-44 group text-left",
														isBuilding && !isThisBuilding ? "opacity-50 cursor-not-allowed" : ""
													)}
												>
													<div
														className={cn(
															"relative w-full h-28 rounded-lg border-2 overflow-hidden transition-all",
															isThisBuilding
																? "border-brand-400 shadow-glow"
																: "border-gray-200 group-hover:border-brand-400 group-hover:shadow-md"
														)}
													>
														{t.slidesPreview.length > 0 ? (
															<img
																src={t.slidesPreview[0].thumbnail_url}
																alt={t.title}
																className="w-full h-full object-cover"
															/>
														) : (
															<div className="w-full h-full flex items-center justify-center bg-gray-50">
																<BookImage className="w-8 h-8 text-gray-300" />
															</div>
														)}

														{!isThisBuilding && (
															<div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
																<div className="bg-white/90 rounded-full px-2.5 py-1 flex items-center gap-1 text-[10px] font-medium text-gray-700 shadow-sm">
																	<Eye className="w-3 h-3" /> Просмотр
																</div>
															</div>
														)}

														{isThisBuilding && (
															<div className="absolute inset-0 bg-white/70 flex items-center justify-center">
																<Spinner size="sm" />
															</div>
														)}
													</div>
													<p className="mt-2 text-xs font-medium text-gray-700 truncate">{t.title}</p>
													<p className="text-[10px] text-gray-400">{t.slideCount} слайдов</p>
												</button>
											);
										})}

								{/* Add template */}
								<button
									onClick={() => navigate("/templates/new")}
									className="shrink-0 w-44 group text-left"
								>
									<div className="w-full h-28 rounded-lg border-2 border-dashed border-gray-300 group-hover:border-brand-400 group-hover:bg-brand-50/30 flex items-center justify-center transition-all">
										<Plus className="w-7 h-7 text-gray-300 group-hover:text-brand-400 transition-colors" />
									</div>
									<p className="mt-2 text-xs font-medium text-gray-400 group-hover:text-brand-500 transition-colors">
										Добавить шаблон
									</p>
								</button>
							</div>

							{/* Template search */}
							{!templatesLoading && allTemplates.length > 3 && (
								<div className="mt-3 relative max-w-xs">
									<input
										type="text"
										value={templateSearch}
										onChange={(e) => setTemplateSearch(e.target.value)}
										placeholder="Поиск шаблонов..."
										className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent bg-gray-50"
									/>
									<svg
										className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
										/>
									</svg>
									{templateSearch && (
										<button
											onClick={() => setTemplateSearch("")}
											className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
										>
											<X className="w-3 h-3" />
										</button>
									)}
								</div>
							)}

							{/* AI prompt (inline, animated) */}
							<AnimatePresence>
								{showAIPrompt && (
									<motion.form
										initial={{ height: 0, opacity: 0 }}
										animate={{ height: "auto", opacity: 1 }}
										exit={{ height: 0, opacity: 0 }}
										transition={{ duration: 0.18 }}
										onSubmit={handleCustomSubmit}
										className="overflow-hidden"
									>
										<div className="mt-4 flex gap-2 items-end">
											<textarea
												ref={promptRef}
												value={customPrompt}
												onChange={(e) => setCustomPrompt(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
														handleCustomSubmit(e);
												}}
												placeholder="Опишите презентацию... (⌘ + Enter для отправки)"
												rows={2}
												className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 focus:bg-white transition-all"
											/>
											<button
												type="submit"
												disabled={!customPrompt.trim() || customMutation.isPending}
												className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all whitespace-nowrap"
											>
												{customMutation.isPending ? (
													<Spinner size="sm" className="border-white border-t-transparent" />
												) : (
													<Sparkles className="w-4 h-4" />
												)}
												Собрать
											</button>
										</div>
									</motion.form>
								)}
							</AnimatePresence>
						</>
					)}
				</div>
			</div>

			{/* ── Recent presentations ─────────────────────────────────────────── */}
			<div className="max-w-5xl mx-auto px-8 py-6">
				{/* Header */}
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-sm font-semibold text-gray-700">Недавние презентации</h2>
					<div className="flex items-center gap-2">
						{selectedIds.size > 0 && (
							<>
								<span className="text-xs text-gray-500">Выбрано: {selectedIds.size}</span>
								<button
									onClick={() => {
										if (!confirm(`Удалить ${selectedIds.size} презентаций?`)) return;
										deleteSelectedMutation.mutate(Array.from(selectedIds));
									}}
									disabled={deleteSelectedMutation.isPending}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
								>
									<Trash2 className="w-3.5 h-3.5" />
									Удалить
								</button>
								<button
									onClick={() => setSelectedIds(new Set())}
									className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
								>
									<X className="w-3.5 h-3.5" />
								</button>
							</>
						)}
					</div>
				</div>

				{/* Grid */}
				{isLoading ? (
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
						{Array.from({ length: 8 }).map((_, i) => (
							<div key={i} className="rounded-xl border border-gray-200 bg-white overflow-hidden animate-pulse">
								<div className="bg-gray-200" style={{ paddingTop: "56.25%" }} />
								<div className="px-3 py-2.5 space-y-1.5">
									<div className="h-3.5 bg-gray-200 rounded w-3/4" />
									<div className="h-3 bg-gray-200 rounded w-1/2" />
								</div>
							</div>
						))}
					</div>
				) : !assemblies?.length ? (
					<div className="rounded-2xl border-2 border-dashed border-gray-300 py-16 flex flex-col items-center gap-3 text-center">
						<div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
							<Layers className="w-6 h-6 text-gray-400" />
						</div>
						<p className="text-sm font-medium text-gray-600">Нет презентаций</p>
						<p className="text-xs text-gray-400 max-w-xs">
							Выберите шаблон выше или начните с пустой презентации
						</p>
					</div>
				) : (
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
						{assemblies.map((a: AssemblyListItem) => (
							<AssemblyGridCard
								key={a.id}
								assembly={a}
								isSelected={selectedIds.has(a.id)}
								isAnySelected={selectedIds.size > 0}
								isEditing={editingId === a.id}
								editTitle={editTitle}
								editInputRef={editInputRef}
								isManual={a.prompt === "(создано вручную)"}
								onOpen={() => navigate(`/assemble/${a.id}`)}
								onToggleSelect={() =>
									setSelectedIds((prev) => {
										const next = new Set(prev);
										next.has(a.id) ? next.delete(a.id) : next.add(a.id);
										return next;
									})
								}
								onStartRename={() => startRename(a.id, a.title)}
								onEditTitleChange={setEditTitle}
								onCommitRename={commitRename}
								onCancelRename={() => {
									cancelRenameRef.current = true;
									setEditingId(null);
								}}
								onDuplicate={() => duplicateMutation.mutate(a.id)}
								onDelete={() => {
									if (!confirm(`Удалить "${a.title}"?`)) return;
									deleteMutation.mutate(a.id);
								}}
							/>
						))}
					</div>
				)}
			</div>

			{/* Template preview modal */}
			<AnimatePresence>
				{previewTemplate && (
					<TemplatePreviewModal
						template={previewTemplate}
						onClose={() => setPreviewTemplate(null)}
						onUse={() => handleUseTemplate(previewTemplate)}
						onEdit={() => {
							setPreviewTemplate(null);
							navigate(`/templates/${previewTemplate.dbId}/edit`);
						}}
						onDelete={() => {
							if (!confirm(`Удалить шаблон «${previewTemplate.title}»?`)) return;
							deleteTemplateMutation.mutate(previewTemplate.dbId);
							setPreviewTemplate(null);
						}}
						isUsing={createFromTemplateMutation.isPending && activeTemplateId === previewTemplate.id}
						canEdit={!!userTemplates.find((t) => t.id === previewTemplate.dbId)}
					/>
				)}
			</AnimatePresence>
		</div>
	);
}
