import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowRight,
	BookImage,
	Check,
	CheckSquare,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Clock,
	Copy,
	Eye,
	Layers,
	Pencil,
	PenLine,
	Plus,
	Sparkles,
	Square,
	Trash2,
	Upload,
	Wand2,
	X,
} from "lucide-react";
import { OnboardingChecklist } from "../components/onboarding/OnboardingChecklist";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { assemblyApi, templatesApi } from "../api/client";
import { Spinner } from "../components/common/Spinner";
import { TemplateCardSkeleton } from "../components/common/Skeleton";
import type { AssemblyListItem, AssemblyTemplate, Slide } from "../types";
import { cn } from "../utils/cn";

// ─── Template card type ───────────────────────────────────────────────────────

interface UserTemplateCard {
	id: string;
	title: string;
	desc: string;
	slidesPreview: AssemblyTemplate["slides_preview"];
	slideCount: number;
	usesCount: number;
	dbId: number;
}

// ─── UserTemplateThumbnail ────────────────────────────────────────────────────

function UserTemplateThumbnail({ slides }: { slides: AssemblyTemplate["slides_preview"] }) {
	if (slides.length === 0) {
		return (
			<div
				className="w-full rounded-t-2xl overflow-hidden bg-gray-50 flex items-center justify-center"
				style={{ height: "140px" }}
			>
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
			className="w-full rounded-t-2xl overflow-hidden bg-gray-100 grid gap-0.5 p-0.5"
			style={{
				height: "140px",
				gridTemplateColumns:
					count === 1 ? "1fr" : count === 2 ? "1fr 1fr" : count === 3 ? "1fr 1fr 1fr" : "1fr 1fr",
				gridTemplateRows: count <= 2 ? "1fr" : "1fr 1fr",
			}}
		>
			{slides.map((s) => (
				<img
					key={s.id}
					src={s.thumbnail_url}
					alt={s.title ?? ""}
					className="w-full h-full object-cover rounded"
				/>
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
				{/* Header */}
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

				{/* Slide viewer */}
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

							{/* Nav arrows */}
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

							{/* Counter */}
							<div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/50 text-white text-[11px] px-2.5 py-1 rounded-full">
								{idx + 1} / {total}
							</div>
						</>
					)}
				</div>

				{/* Filmstrip */}
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

				{/* Footer */}
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

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("ru-RU", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

// ─── WelcomeCard ──────────────────────────────────────────────────────────────

function WelcomeCard() {
	const navigate = useNavigate();

	const steps = [
		{
			num: "1",
			title: "Загрузите слайды",
			desc: "Загрузите PPTX или PDF — AI проиндексирует каждый слайд",
			icon: Upload,
			action: () => navigate("/library/upload"),
			cta: "Загрузить",
		},
		{
			num: "2",
			title: "Создайте шаблон",
			desc: "Отберите лучшие слайды из библиотеки в шаблон",
			icon: BookImage,
			action: () => navigate("/templates/new"),
			cta: "Создать шаблон",
		},
		{
			num: "3",
			title: "Генерируйте с AI",
			desc: "AI подберёт слайды и заполнит их вашим контентом",
			icon: Wand2,
			action: () => navigate("/generate"),
			cta: "Попробовать",
		},
	];

	return (
		<div className="mb-6 rounded-2xl bg-gradient-to-br from-brand-50 to-indigo-50 border border-brand-100 p-5">
			<div className="flex items-center gap-2.5 mb-4">
				<div className="w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center shadow-sm shrink-0">
					<Wand2 className="w-4 h-4 text-white" />
				</div>
				<div>
					<p className="text-sm font-bold text-slate-900">Добро пожаловать в SLIDEX!</p>
					<p className="text-xs text-slate-500">Три шага, чтобы начать</p>
				</div>
			</div>
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
				{steps.map(({ num, title, desc, icon: Icon, action, cta }) => (
					<button
						key={num}
						onClick={action}
						className="text-left p-4 rounded-xl bg-white border border-white/80 hover:border-brand-200 hover:shadow-sm transition-all group"
					>
						<div className="flex items-center gap-2 mb-2.5">
							<div className="w-6 h-6 rounded-lg bg-gradient-brand text-white text-xs font-bold flex items-center justify-center shadow-sm shrink-0">
								{num}
							</div>
							<Icon className="w-3.5 h-3.5 text-brand-500" />
						</div>
						<p className="text-sm font-semibold text-slate-800">{title}</p>
						<p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
						<p className="text-xs font-semibold text-brand-600 mt-2.5 flex items-center gap-1 group-hover:text-brand-700">
							{cta}
							<ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
						</p>
					</button>
				))}
			</div>
		</div>
	);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
	const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
	const [previewTemplate, setPreviewTemplate] = useState<UserTemplateCard | null>(null);
	const [templateSearch, setTemplateSearch] = useState("");
	const [customOpen, setCustomOpen] = useState(false);
	const [customPrompt, setCustomPrompt] = useState("");
	const [manualTitle, setManualTitle] = useState("");
	const [manualOpen, setManualOpen] = useState(false);
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

	// Create assembly from template
	const createFromTemplateMutation = useMutation({
		mutationFn: (templateId: number) => assemblyApi.createFromTemplate(templateId),
		onSuccess: (assembly) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			navigate(`/assemble/${assembly.id}`);
		},
		onError: () => toast.error("Не удалось создать презентацию из шаблона"),
	});

	// Custom prompt assembly
	const customMutation = useMutation({
		mutationFn: () => assemblyApi.create({ prompt: customPrompt, max_slides: 15 }),
		onSuccess: (assembly) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			navigate(`/assemble/${assembly.id}`);
		},
		onError: () => toast.error("Не удалось собрать презентацию"),
	});

	const blankMutation = useMutation({
		mutationFn: () => assemblyApi.createBlank(manualTitle.trim() || "Новая презентация"),
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
			toast.success(`Удалено сборок: ${ids.length}`);
		},
		onError: () => toast.error("Не удалось удалить некоторые сборки"),
	});

	const toggleSelect = (e: React.MouseEvent, id: number) => {
		e.stopPropagation();
		setSelectedIds((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	};

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

	const startRename = (e: React.MouseEvent, a: AssemblyListItem) => {
		e.stopPropagation();
		cancelRenameRef.current = false;
		setEditingId(a.id);
		setEditTitle(a.title);
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
		if (customOpen) promptRef.current?.focus();
	}, [customOpen]);

	const handleTemplateClick = (t: UserTemplateCard) => {
		setPreviewTemplate(t);
	};

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
		<div className="min-h-full bg-surface">
			{/* ── Hero header ─────────────────────────────────────────────────────── */}
			<div className="bg-gradient-hero border-b border-slate-100 px-6 pt-10 pb-8">
				<div className="max-w-3xl mx-auto">
					<p className="text-xs font-semibold text-brand-600 uppercase tracking-widest mb-2">
						Быстрый старт
					</p>
					<h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Мои шаблоны</h1>
					<p className="text-sm text-slate-500">
						Создайте шаблон из слайдов библиотеки — один клик для сборки презентации.
					</p>
				</div>
			</div>

			{/* ── Template grid ────────────────────────────────────────────────────── */}
			<div className="max-w-3xl mx-auto px-6 pt-6 pb-4">
				<OnboardingChecklist />

				{/* Search */}
				{(allTemplates.length > 3 || templateSearch) && (
					<div className="relative mb-4">
						<input
							type="text"
							value={templateSearch}
							onChange={(e) => setTemplateSearch(e.target.value)}
							placeholder="Поиск шаблонов..."
							className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent"
						/>
						<svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
						</svg>
						{templateSearch && (
							<button onClick={() => setTemplateSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
								<X className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
				)}

				<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
					{/* Skeleton while loading */}
					{templatesLoading && Array.from({ length: 3 }).map((_, i) => (
						<TemplateCardSkeleton key={i} />
					))}
					{!templatesLoading && allTemplates
						.filter((t) => !templateSearch || t.title.toLowerCase().includes(templateSearch.toLowerCase()))
						.map((t) => {
						const isThisBuilding = isBuilding && activeTemplateId === t.id;
						return (
							<div
								key={t.id}
								className={cn(
									"group relative text-left rounded-2xl border bg-white shadow-sm overflow-hidden transition-all duration-200",
									"focus:outline-none",
									isThisBuilding
										? "border-brand-400 shadow-glow scale-[0.99]"
										: "border-gray-100 hover:shadow-md hover:-translate-y-0.5",
									isBuilding && !isThisBuilding ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
								)}
								onClick={() => !isBuilding && handleTemplateClick(t)}
							>
								<UserTemplateThumbnail slides={t.slidesPreview} />

								{/* Preview hint on hover */}
								<div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
									<div className="bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 flex items-center gap-1.5 shadow-sm text-xs font-medium text-gray-700">
										<Eye className="w-3.5 h-3.5" /> Предпросмотр
									</div>
								</div>

								<div className="px-4 pt-3 pb-4">
									<div className="flex items-center justify-between mb-1">
										<span className="text-sm font-semibold text-gray-900 truncate">{t.title}</span>
										<span className="text-[11px] text-gray-400 shrink-0 ml-1">
											{t.slideCount} сл.
										</span>
									</div>
									{t.desc && (
										<p className="text-[12px] text-gray-500 mb-1 leading-snug">{t.desc}</p>
									)}
									<div className="flex items-center mt-2">
										{isThisBuilding ? (
											<span className="flex items-center gap-1.5 text-sm font-semibold text-brand-600">
												<Spinner size="sm" className="border-brand-500 border-t-transparent" />
												Создаём...
											</span>
										) : (
											<span className="flex items-center gap-1 text-sm font-semibold text-gray-400 group-hover:text-brand-600 transition-colors">
												Нажмите для просмотра
											</span>
										)}
									</div>
								</div>
							</div>
						);
					})}

					{/* Add template card */}
					<button
						onClick={() => navigate("/templates/new")}
						className="rounded-2xl border-2 border-dashed border-gray-200 hover:border-brand-300 hover:bg-brand-50/30 transition-all flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-brand-600"
						style={{ minHeight: "220px" }}
					>
						<Plus className="w-8 h-8" />
						<span className="text-sm font-medium">Добавить шаблон</span>
					</button>
				</div>

				{/* ── Secondary: custom prompt ─────────────────────────────────────────── */}
				<div className="mt-4 rounded-2xl border border-slate-200 bg-white overflow-hidden">
					<button
						onClick={() => setCustomOpen((v) => !v)}
						className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
					>
						<span className="flex items-center gap-2">
							<Sparkles className="w-4 h-4 text-brand-500" />
							Свой запрос
						</span>
						<ChevronDown
							className={cn(
								"w-4 h-4 text-slate-400 transition-transform duration-200",
								customOpen && "rotate-180"
							)}
						/>
					</button>

					{customOpen && (
						<form
							onSubmit={handleCustomSubmit}
							className="px-4 pb-4 border-t border-slate-100 pt-3 animate-fade-in"
						>
							<textarea
								ref={promptRef}
								value={customPrompt}
								onChange={(e) => setCustomPrompt(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCustomSubmit(e);
								}}
								placeholder="Опишите презентацию, которую нужно собрать..."
								rows={3}
								className={cn(
									"w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3",
									"text-sm text-slate-800 placeholder-slate-400 resize-none",
									"focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 focus:bg-white",
									"transition-all"
								)}
							/>
							<div className="flex items-center justify-between mt-2">
								<p className="text-[11px] text-slate-400">⌘ + Enter для отправки</p>
								<button
									type="submit"
									disabled={!customPrompt.trim() || customMutation.isPending}
									className={cn(
										"flex items-center gap-1.5 px-4 py-2 rounded-xl",
										"bg-gradient-brand text-white text-xs font-semibold transition-all",
										"hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
									)}
								>
									{customMutation.isPending ? (
										<Spinner size="sm" className="border-white border-t-transparent" />
									) : (
										<Sparkles className="w-3.5 h-3.5" />
									)}
									Собрать
								</button>
							</div>
						</form>
					)}
				</div>

				{/* ── Tertiary: manual creation ────────────────────────────────────────── */}
				<div className="mt-2">
					<button
						onClick={() => setManualOpen((v) => !v)}
						className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
					>
						<span className="flex items-center gap-2">
							<Plus className="w-4 h-4" />
							Создать пустую презентацию
						</span>
						<ChevronDown
							className={cn(
								"w-4 h-4 text-slate-400 transition-transform duration-200",
								manualOpen && "rotate-180"
							)}
						/>
					</button>

					{manualOpen && (
						<form
							onSubmit={(e) => {
								e.preventDefault();
								blankMutation.mutate();
							}}
							className="mt-1 px-4 py-3 rounded-2xl border border-slate-200 bg-white animate-fade-in"
						>
							<div className="flex gap-2">
								<input
									type="text"
									value={manualTitle}
									onChange={(e) => setManualTitle(e.target.value)}
									placeholder="Название (необязательно)"
									className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:bg-white transition-all"
								/>
								<button
									type="submit"
									disabled={blankMutation.isPending}
									className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50 transition-all"
								>
									{blankMutation.isPending ? (
										<Spinner size="sm" className="border-white border-t-transparent" />
									) : (
										<PenLine className="w-3.5 h-3.5" />
									)}
									Создать
								</button>
							</div>
							<p className="text-[11px] text-slate-400 mt-1.5">
								Откроется редактор — добавляйте слайды из библиотеки вручную
							</p>
						</form>
					)}
				</div>
			</div>

			{/* ── Recent assemblies ────────────────────────────────────────────────── */}
			<div className="max-w-3xl mx-auto px-6 py-6">
				<div className="flex items-center gap-2 mb-3">
					<Clock className="w-4 h-4 text-slate-400" />
					<h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
						Недавние сборки
					</h2>
					{selectedIds.size > 0 && (
						<div className="ml-auto flex items-center gap-2">
							<span className="text-xs text-slate-500">Выбрано: {selectedIds.size}</span>
							<button
								onClick={() => {
									if (!confirm(`Удалить ${selectedIds.size} сборок?`)) return;
									deleteSelectedMutation.mutate(Array.from(selectedIds));
								}}
								disabled={deleteSelectedMutation.isPending}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
							>
								<Trash2 className="w-3.5 h-3.5" />
								Удалить выбранные
							</button>
							<button
								onClick={() => setSelectedIds(new Set())}
								className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
								title="Снять выделение"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					)}
				</div>

				{isLoading ? (
					<div className="flex justify-center py-10">
						<Spinner />
					</div>
				) : !assemblies?.length ? (
					<div className="rounded-2xl border-2 border-dashed border-slate-200 py-10 flex flex-col items-center gap-3">
						<p className="text-sm text-slate-500 font-medium">Сборок пока нет</p>
						<p className="text-xs text-slate-400 text-center max-w-xs">
							Выберите шаблон выше — AI подберёт слайды из вашей библиотеки
						</p>
						<div className="flex gap-2 mt-1">
							<button
								onClick={() => navigate("/library/upload")}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 transition-all"
							>
								<Upload className="w-3.5 h-3.5" />
								Загрузить слайды
							</button>
							<button
								onClick={() => navigate("/library")}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 transition-all"
							>
								<BookImage className="w-3.5 h-3.5" />
								Библиотека
							</button>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						{assemblies.map((a: AssemblyListItem) => {
							const isManual = a.prompt === "(создано вручную)";
							const isSelected = selectedIds.has(a.id);
							const isAnySelected = selectedIds.size > 0;
							return (
								<div
									key={a.id}
									className={cn(
										"flex items-center gap-4 p-3.5 rounded-2xl border transition-all group cursor-pointer",
										isSelected
											? "border-brand-400 bg-brand-50 shadow-sm"
											: "border-slate-200 bg-white hover:border-brand-300 hover:shadow-card-hover"
									)}
									onClick={() =>
										isAnySelected
											? setSelectedIds((prev) => {
													const next = new Set(prev);
													next.has(a.id) ? next.delete(a.id) : next.add(a.id);
													return next;
												})
											: navigate(`/assemble/${a.id}`)
									}
								>
									{/* Checkbox */}
									<button
										onClick={(e) => toggleSelect(e, a.id)}
										className={cn(
											"shrink-0 transition-all",
											isSelected || isAnySelected
												? "opacity-100"
												: "opacity-0 group-hover:opacity-100"
										)}
									>
										{isSelected ? (
											<CheckSquare className="w-4 h-4 text-brand-500" />
										) : (
											<Square className="w-4 h-4 text-slate-300" />
										)}
									</button>

									{/* Thumbnail */}
									<div
										className="shrink-0 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex"
										style={{ width: 80, height: 45 }}
									>
										{a.thumbnail_urls.length > 0 ? (
											a.thumbnail_urls
												.slice(0, 3)
												.map((url, i) => (
													<img
														key={i}
														src={url}
														className="flex-1 h-full object-cover"
														style={{ minWidth: 0 }}
													/>
												))
										) : (
											<div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
												{isManual ? (
													<PenLine className="w-4 h-4 text-slate-300" />
												) : (
													<Sparkles className="w-4 h-4 text-slate-300" />
												)}
											</div>
										)}
									</div>

									{/* Title + prompt */}
									<div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
										{editingId === a.id ? (
											<div className="flex items-center gap-1">
												<input
													ref={editInputRef}
													value={editTitle}
													onChange={(e) => setEditTitle(e.target.value)}
													onBlur={commitRename}
													onKeyDown={(e) => {
														if (e.key === "Enter") commitRename();
														if (e.key === "Escape") {
															cancelRenameRef.current = true;
															setEditingId(null);
														}
													}}
													className="flex-1 text-sm font-semibold border-b-2 border-brand-400 focus:outline-none bg-transparent py-0.5 min-w-0 text-slate-900"
													onClick={(e) => e.stopPropagation()}
												/>
												<button
													onMouseDown={(e) => {
														e.preventDefault();
														commitRename();
													}}
													className="p-0.5 text-brand-600 hover:text-brand-800 shrink-0"
												>
													<Check className="w-3.5 h-3.5" />
												</button>
											</div>
										) : (
											<div className="flex items-center gap-1.5 group/title">
												<p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
												<button
													onClick={(e) => startRename(e, a)}
													className="opacity-0 group-hover/title:opacity-100 p-0.5 text-slate-300 hover:text-slate-600 transition-all shrink-0"
												>
													<PenLine className="w-3 h-3" />
												</button>
											</div>
										)}
										<p className="text-xs text-slate-400 truncate mt-0.5">
											{isManual ? "Создано вручную" : a.prompt}
										</p>
									</div>

									{/* Meta */}
									<div className="text-right shrink-0">
										<span className="text-xs font-medium text-slate-600">{a.slide_count} сл.</span>
										<p className="text-[11px] text-slate-400">{formatDate(a.created_at)}</p>
									</div>

									{/* Actions */}
									<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
										<button
											onClick={(e) => {
												e.stopPropagation();
												duplicateMutation.mutate(a.id);
											}}
											title="Дублировать"
											className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
										>
											<Copy className="w-3.5 h-3.5 text-slate-400" />
										</button>
										<button
											onClick={(e) => {
												e.stopPropagation();
												if (!confirm(`Удалить сборку "${a.title}"?`)) return;
												deleteMutation.mutate(a.id);
											}}
											title="Удалить"
											className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
										>
											<Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500 transition-colors" />
										</button>
									</div>

									{!isAnySelected && (
										<ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all shrink-0" />
									)}
								</div>
							);
						})}
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
