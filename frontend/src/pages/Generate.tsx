import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	Check,
	CheckSquare,
	ChevronDown,
	ChevronUp,
	ExternalLink,
	FileDown,
	FileText,
	HelpCircle,
	ImageIcon,
	Layers,
	LayoutTemplate,
	Palette,
	Plus,
	Presentation,
	RefreshCw,
	SkipForward,
	Sparkles,
	Square,
	Tag,
	Trash2,
	Upload,
	Video,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { adminApi, assemblyApi, generateApi, libraryApi, type PresentationPlan, type SlideInPlan, type SlideTemplate } from "../api/client";
import { GenerationCelebration, markGenerationCelebrated, shouldShowCelebration } from "../components/onboarding/GenerationCelebration";
import { useAuthStore } from "../store/auth";
import type { Slide } from "../types";
import { cn } from "../utils/cn";

type GenerationMode = "1slide" | "full";

const DEMO_PRESETS = [
	{
		label: "ИИ в регионах РК",
		prompt: `Концепция: «Smart City» в Казахстане.
Цели: Повышение эффективности управления, безопасности и качества услуг через внедрение технологий ИИ.

Ключевые направления:

1. Общественная безопасность:
   - Технологии: Анализ видеопотоков, распознавание лиц, выявление правонарушений, агрессии и пожаров.
   - Проекты:
     - Presight AI (Астана) — 35 видов видеоаналитики.
     - ЕСВМ / Target AI (Алматы) — более 65 тыс. умных камер.
     - Protector AI (Астана, Шымкент, СКО) — выявление насилия в школах и больницах.
     - Vision Guard AI (Павлодарская обл.).

2. Дорожная инфраструктура и транспорт:
   - Технологии: Нейросети для выявления дефектов дорожного полотна с точностью до 95%.
   - Результаты: Сокращение времени диагностики 100 км дорог с 4 дней до 4 часов.
   - Проекты:
     - Smart Road Diagnostic Systems (Минтранспорта РК).
     - Jol Qala AI (Алматы, Астана, Костанайская обл.).
     - Jol Sapa (Карагандинская и СКО).

3. Здравоохранение:
   - Технологии: ИИ-системы для постановки диагнозов и снижения бюрократической нагрузки.
   - Проекты:
     - Cerebra AI (выявление инсультов в Астане, Шымкенте и ряде областей).
     - WD Soft (диагностика онкологии в 7 регионах).
     - Терапевт AI (Акмолинская обл.) — ИИ-ассистент для заполнения медкарты.
     - PULS AI (Шымкент).

4. Городское управление и прочие сферы:
   - Технологии: Платформы для предиктивной аналитики и управления городскими ресурсами.
   - Проекты:
     - Qonaev AI (Алматинская обл.) — объединение данных акиматов в единую платформу.
     - Alaqan AI (образование).
     - Beeline АІ (сфера ЧС).`,
	},
	{
		label: "е-Маслихат",
		prompt: `Тема: Реализация поручения по внедрению ИС «е-Maslikhat»

1. Цель анализа: Реализация поручения по внедрению ИС «е-Maslikhat».

2. Количество маслихатов:
   - Всего: 228
   - Областные, городов республиканского значения, столицы: 20
   - Районные: 170
   - Городов областного значения: 38

3. Деятельность маслихатов:
   - Сессии маслихата проводятся не реже 4 раз в год.
   - В 2025 году в Акмолинской, Костанайской областях и области Жетісу проведено 8-12 заседаний сессий.
   - Постоянные комиссии: до 7, проводят около 30 заседаний в год.

4. Процесс принятия НПА:
   - Требующие регистрацию: Проект формируется, согласовывается, направляется в Министерство юстиции, выносится на сессию, затем на госрегистрацию.
   - Не требующие регистрацию: Проект формируется, рассматривается комиссией, выносится на сессию, затем на официальное опубликование.

5. Информационные системы и сервисы:
   - Основные: Documentolog, ИПГО, ЕПИР ГО, Е-otinish, E-qyzmet.
   - Сопутствующие: База данных «Закон», 1С, «Парус-КАЗ», «ЕССО», «Казначейство-Клиент», «Кабинет налогоплательщика», «Omarket.kz», «Открытые бюджеты», «Информационная система электронных счетов-фактур», «Е-Минфин», ЕЭАД, Портал открытые НПА.

6. Финансирование:
   - Затраты на Documentolog и ИПГО варьируются по регионам, например, в Алматы – 8,2 млн. тенге, в Жамбылской области – 2,3 млн. тенге.

7. Выявленные проблемы:
   - Отсутствие механизма электронного голосования.
   - Отсутствие единого цифрового канала для материалов депутатам.
   - Ограничения дистанционного участия депутатов.

8. Цели ИС «е-Maslikhat»:
   - Решение выявленных проблем.
   - Включение базы документов и протоколов заседаний.
   - Электронный документооборот.
   - Хранение истории решений и формирование базы знаний.
   - Учет депутатской деятельности и отчетности.
   - Централизованная информационная система.
   - Разграничение ролей пользователей и ведение единой базы данных депутатов.`,
	},
];

// ─── Save slides modal ────────────────────────────────────────────────────────

function SaveSlidesModal({
	assemblyId,
	onConfirm,
	onSkip,
}: {
	assemblyId: number;
	onConfirm: (selectedIds: number[]) => void;
	onSkip: () => void;
}) {
	const { data: assembly, isLoading } = useQuery({
		queryKey: ["assembly-for-save", assemblyId],
		queryFn: () => assemblyApi.get(assemblyId),
	});

	const slides: Slide[] = assembly?.slides ?? [];
	const [selected, setSelected] = useState<Set<number>>(new Set());

	// Select all once slides are loaded
	useEffect(() => {
		if (slides.length > 0) {
			setSelected(new Set(slides.map((s) => s.id)));
		}
	}, [slides.length]);

	const toggleSlide = (id: number) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const selectAll = () => setSelected(new Set(slides.map((s) => s.id)));
	const clearAll = () => setSelected(new Set());

	return (
		<div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
				{/* Header */}
				<div className="p-5 border-b border-gray-100">
					<h2 className="text-base font-semibold text-gray-900">Сохранить слайды в библиотеку?</h2>
					<p className="text-xs text-gray-400 mt-1">
						Выбранные слайды появятся во вкладке «Мои генерации». Снимите отметку с ненужных.
					</p>
				</div>

				{/* Slides grid */}
				<div className="flex-1 overflow-y-auto p-5">
					{isLoading ? (
						<div className="flex justify-center py-12 text-gray-400 text-sm">Загрузка слайдов...</div>
					) : slides.length === 0 ? (
						<div className="text-center py-12 text-gray-400 text-sm">Нет слайдов</div>
					) : (
						<>
							<div className="flex items-center gap-3 mb-4">
								<button
									onClick={selectAll}
									className="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-800 font-medium"
								>
									<CheckSquare className="w-3.5 h-3.5" />
									Выбрать все
								</button>
								<button
									onClick={clearAll}
									className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
								>
									<Square className="w-3.5 h-3.5" />
									Снять все
								</button>
								<span className="ml-auto text-xs text-gray-400">
									{selected.size} из {slides.length} выбрано
								</span>
							</div>
							<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
								{slides.map((slide) => {
									const isChecked = selected.has(slide.id);
									return (
										<div
											key={slide.id}
											onClick={() => toggleSlide(slide.id)}
											className={cn(
												"relative rounded-xl border-2 cursor-pointer overflow-hidden transition-all",
												isChecked
													? "border-brand-500 shadow-md"
													: "border-gray-200 opacity-60 hover:opacity-80"
											)}
										>
											{/* Thumbnail */}
											<div className="relative" style={{ paddingTop: "56.25%" }}>
												{slide.thumbnail_url ? (
													<img
														src={slide.thumbnail_url}
														alt={slide.title || "Слайд"}
														className="absolute inset-0 w-full h-full object-cover"
													/>
												) : (
													<div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
														<Presentation className="w-6 h-6 text-gray-300" />
													</div>
												)}
												{/* Checkbox overlay */}
												<div className={cn(
													"absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
													isChecked
														? "bg-brand-600 border-brand-600"
														: "bg-white/80 border-gray-300"
												)}>
													{isChecked && <Check className="w-3 h-3 text-white" />}
												</div>
											</div>
											{/* Title */}
											<div className="p-2">
												<p className="text-xs font-medium text-gray-700 line-clamp-2 leading-tight">
													{slide.title || `Слайд ${slide.slide_index + 1}`}
												</p>
											</div>
										</div>
									);
								})}
							</div>
						</>
					)}
				</div>

				{/* Footer */}
				<div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3">
					<button
						onClick={onSkip}
						className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
					>
						<SkipForward className="w-3.5 h-3.5" />
						Не сохранять
					</button>
					<button
						onClick={() => onConfirm([...selected])}
						disabled={selected.size === 0}
						className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-all disabled:opacity-40"
					>
						<Check className="w-4 h-4" />
						Сохранить {selected.size > 0 ? `${selected.size} слайд${selected.size === 1 ? "" : selected.size < 5 ? "а" : "ов"}` : ""}
					</button>
				</div>
			</div>
		</div>
	);
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────

function ModeToggle({
	mode,
	onChange,
}: {
	mode: GenerationMode;
	onChange: (m: GenerationMode) => void;
}) {
	return (
		<div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
			<button
				onClick={() => onChange("1slide")}
				className={cn(
					"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
					mode === "1slide"
						? "bg-white text-gray-900 shadow-sm"
						: "text-gray-500 hover:text-gray-700"
				)}
			>
				<LayoutTemplate className="w-3.5 h-3.5" />1 слайд
			</button>
			<button
				onClick={() => onChange("full")}
				className={cn(
					"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
					mode === "full" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
				)}
			>
				<Presentation className="w-3.5 h-3.5" />
				Презентация
			</button>
		</div>
	);
}

// ─── Theme + title slide picker ───────────────────────────────────────────────

function StylePicker({
	themes,
	selectedTheme,
	onThemeChange,
	titleSlides,
	selectedTitleId,
	onTitleChange,
}: {
	themes: string[];
	selectedTheme: string;
	onThemeChange: (t: string) => void;
	titleSlides: SlideTemplate[];
	selectedTitleId: string | null;
	onTitleChange: (id: string | null) => void;
}) {
	const hasMultipleThemes = themes.length > 1;
	const hasTitleSlides = titleSlides.length > 0;

	if (!hasMultipleThemes && !hasTitleSlides) return null;

	return (
		<div className="space-y-3">
			{hasMultipleThemes && (
				<div>
					<p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
						<Palette className="w-3 h-3" /> Тема оформления
					</p>
					<div className="flex flex-wrap gap-1.5">
						{themes.map((t) => (
							<button
								key={t}
								onClick={() => {
									onThemeChange(t);
									onTitleChange(null);
								}}
								className={cn(
									"px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
									selectedTheme === t
										? "bg-indigo-600 text-white border-indigo-600"
										: "border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
								)}
							>
								{t === "default" ? "Стандартная" : t}
							</button>
						))}
					</div>
				</div>
			)}
			{hasTitleSlides && (
				<div>
					<p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
						<ImageIcon className="w-3 h-3" /> Титульный слайд
					</p>
					<div className="flex flex-wrap gap-1.5">
						<button
							onClick={() => onTitleChange(null)}
							className={cn(
								"px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
								selectedTitleId === null
									? "bg-gray-800 text-white border-gray-800"
									: "border-gray-200 text-gray-500 hover:border-gray-400"
							)}
						>
							Без титульного
						</button>
						{titleSlides.map((t) => (
							<button
								key={t.id}
								onClick={() => onTitleChange(t.id)}
								className={cn(
									"px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
									selectedTitleId === t.id
										? "bg-indigo-600 text-white border-indigo-600"
										: "border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
								)}
							>
								{t.name}
							</button>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Step 1: Input (shared) ───────────────────────────────────────────────────

function InputStep({
	mode,
	theme,
	titleTemplateId,
	onPlanReady,
	onSingleSlideReady,
}: {
	mode: GenerationMode;
	theme: string;
	titleTemplateId: string | null;
	onPlanReady: (plan: PresentationPlan) => void;
	onSingleSlideReady: (assemblyId: number) => void;
}) {
	const [prompt, setPrompt] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [extracting, setExtracting] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [hasMedia, setHasMedia] = useState(false);
	const [slowHint, setSlowHint] = useState(false);
	const [showTips, setShowTips] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!generating) {
			setSlowHint(false);
			return;
		}
		const timer = setTimeout(() => setSlowHint(true), 12000);
		return () => clearTimeout(timer);
	}, [generating]);

	const handleFileChange = async (f: File) => {
		setFile(f);
		setExtracting(true);
		try {
			const { summary } = await generateApi.extractFile(f);
			setPrompt(summary);
			toast.success("Файл обработан — ключевые факты извлечены");
		} catch (e: unknown) {
			const msg =
				(e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
				"Ошибка обработки файла";
			toast.error(msg);
		} finally {
			setExtracting(false);
		}
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const f = e.dataTransfer.files[0];
		if (f) handleFileChange(f);
	};

	const handleGenerate = async () => {
		if (!prompt.trim()) return;
		setGenerating(true);
		try {
			if (mode === "1slide") {
				const { assembly_id } = await generateApi.createAssemblySingle(prompt.trim(), undefined, hasMedia);
				onSingleSlideReady(assembly_id);
			} else {
				const plan = await generateApi.createPlan(prompt.trim(), theme, titleTemplateId, hasMedia);
				onPlanReady(plan);
			}
		} catch (e: unknown) {
			const raw = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
			const msg = typeof raw === "string" ? raw : "Ошибка генерации. Опишите тему подробнее.";
			toast.error(msg);
		} finally {
			setGenerating(false);
		}
	};

	const buttonLabel = mode === "1slide" ? "Создать слайд" : "Создать план";
	const placeholderText =
		mode === "1slide"
			? "Опишите слайд: тема, ключевые данные, стиль..."
			: "Опишите тему: что за продукт, ключевые цифры, цели, для кого презентация...";

	return (
		<div className="space-y-4">
			{/* File drop zone */}
			<div
				onDrop={handleDrop}
				onDragOver={(e) => e.preventDefault()}
				onClick={() => fileRef.current?.click()}
				className={cn(
					"relative border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all",
					file
						? "border-indigo-300 bg-indigo-50/50"
						: "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
				)}
			>
				<input
					ref={fileRef}
					type="file"
					accept=".pdf,.docx,.doc"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) handleFileChange(f);
					}}
				/>
				{extracting ? (
					<div className="flex items-center justify-center gap-2 py-2">
						<div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
						<span className="text-sm text-indigo-600">Извлекаю ключевые факты из файла...</span>
					</div>
				) : file ? (
					<div className="flex items-center justify-center gap-3">
						<div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
							<FileText className="w-4 h-4 text-indigo-600" />
						</div>
						<div className="text-left">
							<p className="text-sm font-medium text-indigo-700">{file.name}</p>
							<p className="text-xs text-indigo-400">
								Текст извлечён — отредактируй промпт ниже если нужно
							</p>
						</div>
						<button
							onClick={(e) => {
								e.stopPropagation();
								setFile(null);
								setPrompt("");
							}}
							className="ml-auto w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white transition-all"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					</div>
				) : (
					<div className="py-2">
						<Upload className="w-6 h-6 mx-auto mb-2 text-gray-300" />
						<p className="text-sm text-gray-400">
							Загрузи PDF или DOCX — AI извлечёт ключевые факты
						</p>
						<p className="text-xs text-gray-300 mt-0.5">или просто напиши промпт ниже</p>
					</div>
				)}
			</div>

			{/* Demo presets */}
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-[11px] text-gray-400 font-medium shrink-0">Демо:</span>
				{DEMO_PRESETS.map((preset) => (
					<button
						key={preset.label}
						type="button"
						onClick={() => {
							setPrompt(preset.prompt);
							setFile(null);
						}}
						className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 transition-all font-medium"
					>
						<Sparkles className="w-2.5 h-2.5" />
						{preset.label}
					</button>
				))}
			</div>

			{/* Prompt */}
			<div className="relative">
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder={placeholderText}
					rows={5}
					className="w-full text-sm rounded-2xl border border-gray-200 px-4 py-3.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all placeholder:text-gray-300"
				/>
				{prompt && (
					<button
						onClick={() => setPrompt("")}
						className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-all"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>

			{/* Tips toggle */}
			<button
				type="button"
				onClick={() => setShowTips((v) => !v)}
				className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 transition-colors self-start"
			>
				<HelpCircle className="w-3.5 h-3.5" />
				Как писать эффективные запросы?
			</button>

			{showTips && (
				<div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 text-xs text-gray-700 space-y-3">
					<p className="font-semibold text-gray-800 text-sm">Как писать запросы для лучшего результата</p>
					<div className="space-y-2">
						<p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">Что включить в запрос</p>
						<ul className="space-y-1 list-disc list-inside text-gray-600">
							<li><span className="font-medium">Тема</span> — о чём презентация</li>
							<li><span className="font-medium">Цель</span> — убедить, отчитаться, представить, обучить</li>
							<li><span className="font-medium">Аудитория</span> — руководство, инвесторы, партнёры, сотрудники</li>
							<li><span className="font-medium">Ключевые цифры</span> — AI вставит их в слайды вместо заглушек</li>
							{mode === "full" && <li><span className="font-medium">Объём</span> — если важно ("5 слайдов", "не более 7")</li>}
						</ul>
					</div>
					<div className="space-y-1.5">
						<p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">Примеры: плохой → хороший</p>
						<div className="space-y-1.5">
							{(mode === "full" ? [
								{
									bad: "о компании",
									good: "Корпоративная презентация для новых партнёров — история, продукты, рынки и ключевые показатели 2024",
								},
								{
									bad: "итоги года",
									good: "Итоги 2024 года для заседания правления: выручка 2.3 млрд, рост +34%, топ-3 продукта, планы на 2025",
								},
								{
									bad: "стратегия",
									good: "Стратегия цифровой трансформации на 2025–2027 для инвесторов: проблема, решение, дорожная карта, бюджет",
								},
							] : [
								{
									bad: "метрики",
									good: "Слайд с ключевыми KPI за Q1 2024: 1.2 млн пользователей, NPS 72, конверсия 4.8%",
								},
								{
									bad: "команда",
									good: "Слайд о команде проекта: 3 направления, 12 человек, опыт в fintech и govtech",
								},
								{
									bad: "проблема",
									good: "Слайд-проблема: 70% госуслуг до сих пор требуют личного визита — потеря 18 часов/год на гражданина",
								},
							]).map(({ bad, good }) => (
								<div key={bad} className="flex gap-2 items-start">
									<span className="shrink-0 text-red-400 mt-0.5">✗</span>
									<span className="text-gray-400 line-through">{bad}</span>
									<span className="text-gray-300 shrink-0">→</span>
									<button
										type="button"
										onClick={() => { setPrompt(good); setShowTips(false); }}
										className="text-left text-indigo-700 hover:text-indigo-500 hover:underline"
									>
										{good}
									</button>
								</div>
							))}
						</div>
					</div>
					<p className="pt-1 border-t border-indigo-100 text-[11px] text-gray-400">
						Чем конкретнее запрос — тем точнее AI подберёт шаблоны и заполнит слайды реальными данными.
					</p>
				</div>
			)}

			{/* Media checkbox — only for single slide mode */}
			{mode === "1slide" && (
				<label className="flex items-center gap-2.5 cursor-pointer select-none group">
					<div
						onClick={() => setHasMedia((v) => !v)}
						className={cn(
							"w-4 h-4 rounded flex items-center justify-center border transition-all shrink-0",
							hasMedia
								? "bg-indigo-600 border-indigo-600"
								: "border-gray-300 group-hover:border-indigo-400"
						)}
					>
						{hasMedia && <Check className="w-2.5 h-2.5 text-white" />}
					</div>
					<span className="text-xs text-gray-600">
						Слайд должен содержать место для видео&nbsp;/ GIF
					</span>
				</label>
			)}

			<button
				onClick={handleGenerate}
				disabled={prompt.trim().length < 5 || generating || extracting}
				className={cn(
					"w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all",
					prompt.trim().length >= 5 && !generating && !extracting
						? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md"
						: "bg-gray-100 text-gray-400 cursor-not-allowed"
				)}
			>
				{generating ? (
					<>
						<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
						{mode === "1slide" ? "Создаю слайд..." : "AI создаёт план..."}
					</>
				) : (
					<>
						<Sparkles className="w-4 h-4" />
						{buttonLabel}
					</>
				)}
			</button>

			{slowHint && generating && (
				<p className="text-center text-xs text-indigo-400 animate-pulse">
					AI подбирает шаблоны и заполняет слоты — ещё немного...
				</p>
			)}
		</div>
	);
}

// ─── Step 2: Plan review ──────────────────────────────────────────────────────

function PlanStep({
	plan,
	templates,
	onBack,
	onOpenInEditor,
}: {
	plan: PresentationPlan;
	templates: SlideTemplate[];
	onBack: () => void;
	onOpenInEditor: (assemblyId: number) => void;
}) {
	const [downloading, setDownloading] = useState(false);
	const [openingEditor, setOpeningEditor] = useState(false);
	const [slides, setSlides] = useState<SlideInPlan[]>(plan.slides);
	const templateMap = Object.fromEntries(templates.map((t) => [t.id, t]));

	const toggleMedia = (i: number) => {
		setSlides((prev) =>
			prev.map((s, idx) => (idx === i ? { ...s, has_media: !s.has_media } : s))
		);
	};

	const currentPlan = { ...plan, slides };

	const handleDownload = async () => {
		setDownloading(true);
		try {
			await generateApi.downloadPresentation(currentPlan);
			localStorage.setItem("slidex_pptx_downloaded", "1");
			toast.success("Презентация скачана");
		} catch (e: unknown) {
			const msg =
				((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as string | undefined) || "Ошибка";
			toast.error(msg);
		} finally {
			setDownloading(false);
		}
	};

	const handleOpenInEditor = async () => {
		setOpeningEditor(true);
		try {
			const { assembly_id } = await generateApi.createAssembly(currentPlan);
			onOpenInEditor(assembly_id);
		} catch (e: unknown) {
			const msg =
				((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as string | undefined) || "Ошибка";
			toast.error(msg);
		} finally {
			setOpeningEditor(false);
		}
	};

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<button
					onClick={onBack}
					className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
				>
					<ArrowLeft className="w-3.5 h-3.5" />
					Изменить промпт
				</button>
				<div className="flex items-center gap-2">
					<Check className="w-4 h-4 text-emerald-500" />
					<span className="text-sm font-semibold text-gray-900">{plan.title}</span>
				</div>
			</div>

			{/* Slide list */}
			<div className="space-y-2">
				{slides.map((slide, i) => {
					const isLibrary = slide.slide_type === "library";
					const tmpl = templateMap[slide.template_id];
					const mainSlot = slide.slots.slot_product_name || slide.slots.slot_main_card || "";
					const previewText = slide.library_title || mainSlot.split("\n")[0] || slide.template_id;

					if (isLibrary) {
						return (
							<div
								key={i}
								className="flex items-start gap-3 bg-white border border-emerald-200 bg-emerald-50/30 rounded-xl p-3.5"
							>
								<div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
									<span className="text-xs font-bold text-emerald-600">{i + 1}</span>
								</div>
								{slide.library_thumbnail_url && (
									<img
										src={slide.library_thumbnail_url}
										alt={previewText}
										className="w-16 h-10 object-cover rounded-lg shrink-0 border border-emerald-100"
									/>
								)}
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="text-sm font-medium text-gray-900 truncate">{previewText}</span>
										<span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full shrink-0 font-medium">
											из библиотеки
										</span>
									</div>
									<p className="text-xs text-gray-400 mt-0.5">готовый слайд, без изменений</p>
								</div>
							</div>
						);
					}

					return (
						<div
							key={i}
							className={cn(
								"flex items-start gap-3 bg-white border rounded-xl p-3.5 transition-all",
								slide.has_media
									? "border-indigo-300 bg-indigo-50/40"
									: "border-gray-200 hover:border-gray-300"
							)}
						>
							<div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
								<span className="text-xs font-bold text-indigo-500">{i + 1}</span>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-sm font-medium text-gray-900 truncate">{previewText}</span>
									<span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full shrink-0">
										{tmpl?.name || slide.template_id}
									</span>
									{slide.has_media && (
										<span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium shrink-0">
											видео / GIF
										</span>
									)}
								</div>
								<p className="text-xs text-gray-400 mt-0.5 truncate">
									{Object.keys(slide.slots).length} слотов заполнено
								</p>
							</div>
							<button
								onClick={() => toggleMedia(i)}
								title={slide.has_media ? "Убрать место для медиа" : "Добавить место для видео / GIF"}
								className={cn(
									"w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
									slide.has_media
										? "bg-indigo-600 text-white"
										: "text-gray-300 hover:text-indigo-500 hover:bg-indigo-50"
								)}
							>
								<Video className="w-3.5 h-3.5" />
							</button>
						</div>
					);
				})}
			</div>

			{/* Actions */}
			<div className="flex gap-2">
				<button
					onClick={handleDownload}
					disabled={downloading || openingEditor}
					className={cn(
						"flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all border",
						!downloading && !openingEditor
							? "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
							: "border-gray-100 text-gray-300 cursor-not-allowed"
					)}
				>
					{downloading ? (
						<>
							<div className="w-4 h-4 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
							Собираю...
						</>
					) : (
						<>
							<FileDown className="w-4 h-4" />
							Скачать PPTX
						</>
					)}
				</button>

				<button
					onClick={handleOpenInEditor}
					disabled={openingEditor || downloading}
					className={cn(
						"flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all",
						!openingEditor && !downloading
							? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md"
							: "bg-gray-100 text-gray-400 cursor-not-allowed"
					)}
				>
					{openingEditor ? (
						<>
							<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
							Рендер слайдов...
						</>
					) : (
						<>
							<ExternalLink className="w-4 h-4" />
							Открыть в редакторе
						</>
					)}
				</button>
			</div>

			<p className="text-center text-[11px] text-gray-400">
				«Открыть в редакторе» сохранит {plan.slides.length} слайдов в библиотеку и откроет полный
				редактор
			</p>
		</div>
	);
}

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
	template,
	isAdmin,
	onDelete,
	onPatch,
}: {
	template: SlideTemplate;
	isAdmin: boolean;
	onDelete: (id: string) => void;
	onPatch?: (id: string, data: { max_uses?: number | null }) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const [editingMaxUses, setEditingMaxUses] = useState(false);
	const [maxUsesInput, setMaxUsesInput] = useState(String(template.max_uses ?? ""));
	const [savingMaxUses, setSavingMaxUses] = useState(false);
	const isCustom = template.id.startsWith("custom_");

	const handleSaveMaxUses = async () => {
		if (!onPatch) return;
		setSavingMaxUses(true);
		const val = parseInt(maxUsesInput, 10);
		const newVal = isNaN(val) || val <= 0 ? null : val;
		try {
			await onPatch(template.id, { max_uses: newVal });
			setEditingMaxUses(false);
		} finally {
			setSavingMaxUses(false);
		}
	};

	return (
		<div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-all">
			<div className="p-4">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-start gap-3 min-w-0">
						<div
							className={cn(
								"w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
								isCustom ? "bg-amber-100" : "bg-indigo-50"
							)}
						>
							<LayoutTemplate
								className={cn("w-3.5 h-3.5", isCustom ? "text-amber-600" : "text-indigo-500")}
							/>
						</div>
						<div className="min-w-0">
							<div className="flex items-center gap-1.5 flex-wrap">
								<h3 className="text-sm font-semibold text-gray-900">{template.name}</h3>
								{isCustom && (
									<span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
										свой
									</span>
								)}
							</div>
							<p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{template.description}</p>
						</div>
					</div>
					<div className="flex items-center gap-1 shrink-0">
						{isAdmin && isCustom && (
							<button
								onClick={() => onDelete(template.id)}
								className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
							>
								<Trash2 className="w-3 h-3" />
							</button>
						)}
						<button
							onClick={() => setExpanded((v) => !v)}
							className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all"
						>
							{expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
						</button>
					</div>
				</div>
				<div className="flex flex-wrap gap-1 mt-2.5">
					{template.scenario_tags.slice(0, 3).map((tag) => (
						<span
							key={tag}
							className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full"
						>
							<Tag className="w-2.5 h-2.5" />
							{tag}
						</span>
					))}
					{template.scenario_tags.length > 3 && (
						<span className="text-[10px] text-gray-400">+{template.scenario_tags.length - 3}</span>
					)}
				</div>
			</div>
			{expanded && (
				<div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
					<div>
						<p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
							Слоты ({Object.keys(template.slots).length})
						</p>
						<div className="space-y-1">
							{Object.entries(template.slots).map(([key]) => (
								<code key={key} className="block text-[11px] text-indigo-600 font-mono">
									{key}
								</code>
							))}
						</div>
					</div>

					{isAdmin && (
						<div className="pt-2 border-t border-gray-100">
							<p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
								Лимит использования
							</p>
							{editingMaxUses ? (
								<div className="flex items-center gap-2">
									<input
										type="number"
										min="1"
										placeholder="∞"
										value={maxUsesInput}
										onChange={(e) => setMaxUsesInput(e.target.value)}
										className="w-20 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
										autoFocus
										onKeyDown={(e) => { if (e.key === "Enter") handleSaveMaxUses(); if (e.key === "Escape") setEditingMaxUses(false); }}
									/>
									<span className="text-[11px] text-gray-400">раз на презентацию</span>
									<button
										onClick={handleSaveMaxUses}
										disabled={savingMaxUses}
										className="text-[11px] text-white bg-indigo-500 hover:bg-indigo-600 px-2.5 py-1 rounded-lg transition-all disabled:opacity-50"
									>
										{savingMaxUses ? "..." : "Сохранить"}
									</button>
									<button
										onClick={() => { setEditingMaxUses(false); setMaxUsesInput(String(template.max_uses ?? "")); }}
										className="text-[11px] text-gray-400 hover:text-gray-600"
									>
										Отмена
									</button>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<span className={cn(
										"text-[11px] px-2 py-0.5 rounded-full font-medium",
										template.max_uses
											? "bg-amber-100 text-amber-700"
											: "bg-gray-100 text-gray-400"
									)}>
										{template.max_uses ? `${template.max_uses}× за презентацию` : "Без ограничений"}
									</span>
									<button
										onClick={() => setEditingMaxUses(true)}
										className="text-[11px] text-indigo-500 hover:text-indigo-700 underline"
									>
										Изменить
									</button>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadTemplateModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [layoutRole, setLayoutRole] = useState<"content" | "title">("content");
	const [uploading, setUploading] = useState(false);
	const [result, setResult] = useState<{ created: number } | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin());
	const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
	const { data: companies = [] } = useQuery({
		queryKey: ["admin-companies-upload"],
		queryFn: adminApi.listCompanies,
		enabled: isSuperAdmin,
	});
	const activeCompanyName = companies.find((c) => c.id === activeCompanyId)?.name;

	const handleUpload = async () => {
		if (!file) return;
		setUploading(true);
		try {
			const res = await generateApi.uploadTemplatesBatch(file, layoutRole);
			setResult({ created: res.created });
			onSuccess();
		} catch (e: unknown) {
			const msg =
				(e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
				"Ошибка загрузки";
			toast.error(msg);
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
			<div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
					<div>
						<h3 className="text-sm font-semibold text-gray-900">Загрузить шаблоны</h3>
						{isSuperAdmin && activeCompanyId && (
							<p className="text-[11px] text-amber-600 mt-0.5">
								{activeCompanyName ? `Компания: ${activeCompanyName}` : `Компания ID ${activeCompanyId}`}
							</p>
						)}
						{!isSuperAdmin && (
							<p className="text-[11px] text-gray-400 mt-0.5">
								Шаблоны будут доступны только вашей компании
							</p>
						)}
					</div>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 text-xl leading-none"
					>
						&times;
					</button>
				</div>

				{result ? (
					<div className="px-6 py-8 text-center space-y-3">
						<div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center mx-auto">
							<Check className="w-6 h-6 text-green-600" />
						</div>
						<p className="text-sm font-semibold text-gray-900">
							{result.created === 1 ? "1 шаблон добавлен" : `${result.created} шаблона добавлено`}
						</p>
						<p className="text-xs text-gray-400">
							AI автоматически сгенерировал названия, описания и теги
						</p>
						<button
							onClick={onClose}
							className="mt-2 w-full py-2.5 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-all"
						>
							Готово
						</button>
					</div>
				) : (
					<>
						<div className="px-6 py-5 space-y-4">
							<div
								onClick={() => !uploading && fileRef.current?.click()}
								className={cn(
									"border-2 border-dashed rounded-xl p-6 text-center transition-all",
									uploading
										? "border-indigo-200 bg-indigo-50/50 cursor-default"
										: file
											? "border-indigo-300 bg-indigo-50 cursor-pointer"
											: "border-gray-200 hover:border-indigo-300 cursor-pointer"
								)}
							>
								<input
									ref={fileRef}
									type="file"
									accept=".pptx"
									className="hidden"
									onChange={(e) => setFile(e.target.files?.[0] ?? null)}
								/>
								{uploading ? (
									<div className="space-y-2">
										<div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto" />
										<p className="text-xs text-indigo-600 font-medium">AI анализирует слайды...</p>
										<p className="text-[11px] text-gray-400">
											Генерирую названия и теги для каждого шаблона
										</p>
									</div>
								) : file ? (
									<div className="space-y-1">
										<Layers className="w-5 h-5 text-indigo-500 mx-auto" />
										<p className="text-sm text-indigo-700 font-medium">{file.name}</p>
										<p className="text-[11px] text-gray-400">Нажми чтобы выбрать другой файл</p>
									</div>
								) : (
									<div className="space-y-1.5">
										<Upload className="w-6 h-6 mx-auto text-gray-300" />
										<p className="text-sm text-gray-600 font-medium">Выбери .pptx файл</p>
										<p className="text-[11px] text-gray-400">
											Все слайды со слотами станут отдельными шаблонами
										</p>
										<p className="text-[11px] text-gray-300">
											AI сам сгенерирует название, описание и теги
										</p>
									</div>
								)}
							</div>

							<div>
								<p className="text-xs font-medium text-gray-600 mb-2">Тип слайдов</p>
								<div className="flex gap-2">
									<button
										onClick={() => setLayoutRole("content")}
										disabled={uploading}
										className={cn(
											"flex-1 py-2 rounded-lg text-xs font-medium border transition-all",
											layoutRole === "content"
												? "bg-indigo-600 text-white border-indigo-600"
												: "border-gray-200 text-gray-600 hover:border-indigo-300"
										)}
									>
										Контентные
									</button>
									<button
										onClick={() => setLayoutRole("title")}
										disabled={uploading}
										className={cn(
											"flex-1 py-2 rounded-lg text-xs font-medium border transition-all",
											layoutRole === "title"
												? "bg-indigo-600 text-white border-indigo-600"
												: "border-gray-200 text-gray-600 hover:border-indigo-300"
										)}
									>
										Титульные
									</button>
								</div>
							</div>
						</div>

						<div className="flex gap-2 px-6 pb-5">
							<button
								onClick={onClose}
								disabled={uploading}
								className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
							>
								Отмена
							</button>
							<button
								onClick={handleUpload}
								disabled={!file || uploading}
								className={cn(
									"flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all",
									file && !uploading
										? "bg-indigo-600 text-white hover:bg-indigo-700"
										: "bg-gray-100 text-gray-400 cursor-not-allowed"
								)}
							>
								{uploading ? (
									<div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
								) : (
									<Sparkles className="w-3.5 h-3.5" />
								)}
								{uploading ? "Обрабатываю..." : "Загрузить"}
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Generate() {
	const [pageTab, setPageTab] = useState<"generate" | "assemble">("generate");
	const [mode, setMode] = useState<GenerationMode>("full");
	const [plan, setPlan] = useState<PresentationPlan | null>(null);
	const [showUpload, setShowUpload] = useState(false);
	const [selectedTheme, setSelectedTheme] = useState("default");
	const [selectedTitleId, setSelectedTitleId] = useState<string | null>(null);

	// Assembly from library
	const [assemblyPrompt, setAssemblyPrompt] = useState("");
	const [showAssemblyTips, setShowAssemblyTips] = useState(false);
	const assemblyPromptRef = useRef<HTMLTextAreaElement>(null);

	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const user = useAuthStore((s) => s.user);
	const isAdmin = user?.is_admin ?? false;

	const assemblyMutation = useMutation({
		mutationFn: () => assemblyApi.create({ prompt: assemblyPrompt.trim(), max_slides: 15 }),
		onSuccess: (assembly) => {
			queryClient.invalidateQueries({ queryKey: ["assemblies"] });
			navigate(`/assemble/${assembly.id}`);
		},
		onError: () => toast.error("Не удалось собрать презентацию"),
	});

	const { data: templates = [], isLoading } = useQuery({
		queryKey: ["slide-templates"],
		queryFn: generateApi.listTemplates,
	});

	const { data: themes = [] } = useQuery({
		queryKey: ["slide-themes"],
		queryFn: generateApi.listThemes,
	});

	const { data: titleSlides = [] } = useQuery({
		queryKey: ["title-slides", selectedTheme],
		queryFn: () => generateApi.listTitleSlides(selectedTheme),
	});

	useEffect(() => {
		if (themes.length > 0 && !themes.includes(selectedTheme)) {
			setSelectedTheme(themes[0]);
		}
	}, [themes, selectedTheme]);

	const [showCelebration, setShowCelebration] = useState(false);
	const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
	const [showBulkMaxUses, setShowBulkMaxUses] = useState(false);
	const [bulkMaxUsesValue, setBulkMaxUsesValue] = useState<number>(1);

	const deleteMutation = useMutation({
		mutationFn: generateApi.deleteTemplate,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["slide-templates"] });
			toast.success("Шаблон удалён");
		},
		onError: (e: unknown) => {
			toast.error(
				((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as string | undefined) || "Ошибка"
			);
		},
	});

	const patchMutation = useMutation({
		mutationFn: ({ id, data }: { id: string; data: { max_uses?: number | null } }) =>
			generateApi.patchTemplate(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["slide-templates"] });
			toast.success("Лимит сохранён");
		},
		onError: () => toast.error("Не удалось сохранить лимит"),
	});

	const bulkMaxUsesMutation = useMutation({
		mutationFn: (max_uses: number | null) => generateApi.bulkSetMaxUses(max_uses),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["slide-templates"] });
			setShowBulkMaxUses(false);
			toast.success(`Лимит применён к ${data.updated} шаблонам`);
		},
		onError: () => toast.error("Не удалось применить лимит"),
	});

	const deleteAllMutation = useMutation({
		mutationFn: generateApi.deleteAllCustomTemplates,
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["slide-templates"] });
			setShowDeleteAllConfirm(false);
			toast.success(`Удалено ${data.deleted} шаблонов`);
		},
		onError: (e: unknown) => {
			toast.error(
				((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as string | undefined) || "Ошибка"
			);
		},
	});

	const [reindexDone, setReindexDone] = useState(false);
	const reindexMutation = useMutation({
		mutationFn: generateApi.reindexTemplates,
		onSuccess: (data) => {
			setReindexDone(true);
			setTimeout(() => setReindexDone(false), 4000);
			toast.success(
				data.updated === 0
					? "Все шаблоны уже проиндексированы"
					: `Проиндексировано ${data.updated} из ${data.total} шаблонов`
			);
		},
		onError: (e: unknown) => {
			toast.error(
				((e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail as string | undefined) || "Ошибка"
			);
		},
	});

	const builtIn = templates.filter(
		(t) => !t.id.startsWith("custom_") && t.layout_role === "content"
	);
	const custom = templates.filter((t) => t.id.startsWith("custom_") && t.layout_role === "content");

	const handleModeChange = (m: GenerationMode) => {
		setMode(m);
		setPlan(null);
	};

	const handleThemeChange = (t: string) => {
		setSelectedTheme(t);
		setSelectedTitleId(null);
	};

	const handlePlanReady = (p: PresentationPlan) => {
		setPlan(p);
		if (shouldShowCelebration()) {
			markGenerationCelebrated();
			setShowCelebration(true);
		}
	};

	const [pendingSaveAssemblyId, setPendingSaveAssemblyId] = useState<number | null>(null);

	const saveSlidesMutation = useMutation({
		mutationFn: (ids: number[]) => libraryApi.saveGeneratedSlides(ids),
		onSuccess: (_, ids) => {
			queryClient.invalidateQueries({ queryKey: ["slides"] });
			toast.success(`${ids.length} слайд${ids.length === 1 ? "" : ids.length < 5 ? "а" : "ов"} сохранено в «Мои генерации»`);
		},
	});

	const handleOpenInEditor = (assemblyId: number) => {
		setPendingSaveAssemblyId(assemblyId);
	};

	const handleSaveConfirm = async (selectedIds: number[]) => {
		const assemblyId = pendingSaveAssemblyId!;
		setPendingSaveAssemblyId(null);
		if (selectedIds.length > 0) {
			await saveSlidesMutation.mutateAsync(selectedIds);
		}
		toast.success("Открываю редактор");
		navigate(`/assemble/${assemblyId}`);
	};

	const handleSaveSkip = () => {
		const assemblyId = pendingSaveAssemblyId!;
		setPendingSaveAssemblyId(null);
		navigate(`/assemble/${assemblyId}`);
	};

	return (
		<div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
			{/* Save slides modal — shown after generation before opening editor */}
			{pendingSaveAssemblyId !== null && (
				<SaveSlidesModal
					assemblyId={pendingSaveAssemblyId}
					onConfirm={handleSaveConfirm}
					onSkip={handleSaveSkip}
				/>
			)}

			{/* ── Page tab switcher ─────────────────────────────────────────────── */}
			<div className="grid grid-cols-2 gap-3">
				<button
					onClick={() => setPageTab("generate")}
					className={cn(
						"relative flex flex-col items-start gap-1 p-4 rounded-2xl border-2 text-left transition-all",
						pageTab === "generate"
							? "border-indigo-500 bg-indigo-50/60 shadow-sm"
							: "border-gray-200 bg-white hover:border-indigo-200 hover:bg-gray-50"
					)}
				>
					<div className={cn(
						"w-8 h-8 rounded-xl flex items-center justify-center mb-1",
						pageTab === "generate" ? "bg-indigo-600" : "bg-gray-100"
					)}>
						<Sparkles className={cn("w-4 h-4", pageTab === "generate" ? "text-white" : "text-gray-400")} />
					</div>
					<span className={cn("text-sm font-bold", pageTab === "generate" ? "text-indigo-700" : "text-gray-700")}>
						Создать с нуля
					</span>
					<span className="text-xs text-gray-400 leading-snug">
						AI генерирует новые слайды по вашему запросу
					</span>
					{pageTab === "generate" && (
						<div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-500" />
					)}
				</button>

				<button
					onClick={() => setPageTab("assemble")}
					className={cn(
						"relative flex flex-col items-start gap-1 p-4 rounded-2xl border-2 text-left transition-all",
						pageTab === "assemble"
							? "border-brand-500 bg-brand-50/60 shadow-sm"
							: "border-gray-200 bg-white hover:border-brand-200 hover:bg-gray-50"
					)}
				>
					<div className={cn(
						"w-8 h-8 rounded-xl flex items-center justify-center mb-1",
						pageTab === "assemble" ? "bg-brand-600" : "bg-gray-100"
					)}>
						<Layers className={cn("w-4 h-4", pageTab === "assemble" ? "text-white" : "text-gray-400")} />
					</div>
					<span className={cn("text-sm font-bold", pageTab === "assemble" ? "text-brand-700" : "text-gray-700")}>
						Собрать из библиотеки
					</span>
					<span className="text-xs text-gray-400 leading-snug">
						AI подбирает готовые слайды из вашего архива
					</span>
					{pageTab === "assemble" && (
						<div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-brand-500" />
					)}
				</button>
			</div>

			{/* ── Assemble from library tab ─────────────────────────────────────── */}
			{pageTab === "assemble" && (
				<div className="space-y-4">
					<div className="flex items-center gap-2.5">
						<div className="w-8 h-8 rounded-xl bg-gradient-brand flex items-center justify-center shadow-sm">
							<Layers className="w-4 h-4 text-white" />
						</div>
						<div>
							<h1 className="text-base font-bold text-gray-900">Сборка из библиотеки</h1>
							<p className="text-xs text-gray-400">AI выберет подходящие слайды из вашего архива</p>
						</div>
					</div>

					<div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
						{/* Example chips */}
						<div className="flex flex-wrap gap-1.5">
							{[
								"Презентация о цифровизации госуслуг для руководства",
								"Стратегия развития ИИ в Казахстане на 2025–2027",
								"Итоги года: достижения и планы",
								"Введение в проект для новых сотрудников",
							].map((ex) => (
								<button
									key={ex}
									type="button"
									onClick={() => {
										setAssemblyPrompt(ex);
										assemblyPromptRef.current?.focus();
									}}
									className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-all"
								>
									{ex}
								</button>
							))}
						</div>

						<textarea
							ref={assemblyPromptRef}
							value={assemblyPrompt}
							onChange={(e) => setAssemblyPrompt(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && assemblyPrompt.trim()) {
									assemblyMutation.mutate();
								}
							}}
							placeholder="Опишите тему, цель и аудиторию презентации..."
							rows={3}
							className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 focus:bg-white transition-all"
						/>

						<div className="flex items-center justify-between">
							<button
								type="button"
								onClick={() => setShowAssemblyTips((v) => !v)}
								className="text-[11px] text-brand-500 hover:text-brand-700 font-medium underline underline-offset-2"
							>
								Как писать эффективные запросы?
							</button>
							<div className="flex items-center gap-3">
								<p className="text-[11px] text-gray-400">⌘ + Enter</p>
								<button
									type="button"
									onClick={() => assemblyMutation.mutate()}
									disabled={!assemblyPrompt.trim() || assemblyMutation.isPending}
									className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-brand text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
								>
									{assemblyMutation.isPending ? (
										<div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
									) : (
										<Layers className="w-3.5 h-3.5" />
									)}
									{assemblyMutation.isPending ? "Собираю..." : "Собрать"}
								</button>
							</div>
						</div>

						{showAssemblyTips && (
							<div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-xs text-gray-700 space-y-3">
								<p className="font-semibold text-gray-800 text-sm">Как писать запросы для лучшего результата</p>
								<div className="space-y-2">
									<p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">Что включить в запрос</p>
									<ul className="space-y-1 list-disc list-inside text-gray-600">
										<li><span className="font-medium">Тема</span> — о чём презентация</li>
										<li><span className="font-medium">Цель</span> — убедить, проинформировать, отчитаться</li>
										<li><span className="font-medium">Аудитория</span> — руководство, партнёры, новые сотрудники</li>
										<li><span className="font-medium">Объём</span> — если нужен конкретный (5 слайдов, 10 слайдов)</li>
									</ul>
								</div>
								<div className="space-y-1.5">
									<p className="font-medium text-gray-500 uppercase tracking-wide text-[10px]">Примеры: плохой → хороший</p>
									<div className="space-y-1.5">
										{[
											{ bad: "итоги", good: "Итоги работы министерства за 2024 год для коллегии — достижения, показатели и планы на 2025" },
											{ bad: "цифровизация", good: "Презентация о цифровизации госуслуг для руководства акимата — что сделано и что планируется" },
											{ bad: "проект", good: "Введение в проект ЦОН 2.0 для новых сотрудников — цели, команда, ключевые этапы" },
										].map(({ bad, good }) => (
											<div key={bad} className="flex gap-2 items-start">
												<span className="shrink-0 text-red-400 mt-0.5">✗</span>
												<span className="text-gray-400 line-through">{bad}</span>
												<span className="text-gray-300 shrink-0">→</span>
												<button
													type="button"
													onClick={() => { setAssemblyPrompt(good); setShowAssemblyTips(false); assemblyPromptRef.current?.focus(); }}
													className="text-left text-emerald-700 hover:text-brand-600 hover:underline"
												>
													{good}
												</button>
											</div>
										))}
									</div>
								</div>
								<p className="pt-1 border-t border-brand-100 text-[11px] text-gray-400">
									Чем точнее запрос — тем лучше AI подберёт слайды из вашей библиотеки.
								</p>
							</div>
						)}
					</div>
				</div>
			)}

			{showCelebration && plan && (
				<GenerationCelebration
					slideCount={plan.slides.length}
					onDownload={async () => {
						localStorage.setItem("slidex_pptx_downloaded", "1");
						try { await generateApi.downloadPresentation(plan); } catch { /* handled in PlanStep */ }
					}}
					onOpenEditor={() => navigate("/dashboard")}
					onClose={() => setShowCelebration(false)}
				/>
			)}

			{/* ── Generate section + Template library ── */}
			{pageTab === "generate" && <>
				<div>
				<div className="flex items-center gap-2.5 mb-5">
					<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
						<Sparkles className="w-4 h-4 text-white" />
					</div>
					<div>
						<h1 className="text-base font-bold text-gray-900">Генерация с нуля</h1>
						<p className="text-xs text-gray-400">AI подберёт шаблоны и заполнит слайды</p>
					</div>
				</div>

				<div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
					{/* Mode toggle — only show before plan is ready */}
					{!plan && <ModeToggle mode={mode} onChange={handleModeChange} />}

					{/* Theme + title slide picker — only for full presentation, before plan */}
					{!plan && mode === "full" && (
						<StylePicker
							themes={themes}
							selectedTheme={selectedTheme}
							onThemeChange={handleThemeChange}
							titleSlides={titleSlides}
							selectedTitleId={selectedTitleId}
							onTitleChange={setSelectedTitleId}
						/>
					)}

					{plan ? (
						<PlanStep
							plan={plan}
							templates={templates}
							onBack={() => setPlan(null)}
							onOpenInEditor={handleOpenInEditor}
						/>
					) : (
						<InputStep
							mode={mode}
							theme={selectedTheme}
							titleTemplateId={selectedTitleId}
							onPlanReady={handlePlanReady}
							onSingleSlideReady={handleOpenInEditor}
						/>
					)}
				</div>
			</div>

			{/* ── Template library ── */}
			<div>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
					<div>
						<h2 className="text-sm font-semibold text-gray-900">Библиотека шаблонов</h2>
						<p className="text-xs text-gray-400 mt-0.5">
							{templates.length} шаблонов · AI выбирает автоматически
						</p>
					</div>
					{isAdmin && (
						<div className="flex items-center gap-2 flex-wrap">
							{templates.length > 0 && (
								<button
									onClick={() => setShowDeleteAllConfirm(true)}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all"
								>
									<Trash2 className="w-3.5 h-3.5" />
									Удалить все
								</button>
							)}
							<button
								onClick={() => {
									setReindexDone(false);
									reindexMutation.mutate();
								}}
								disabled={reindexMutation.isPending}
								title="Сгенерировать эмбеддинги для шаблонов без индекса"
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
									reindexDone
										? "text-green-700 bg-green-50"
										: "text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
								)}
							>
								{reindexMutation.isPending ? (
									<RefreshCw className="w-3.5 h-3.5 animate-spin" />
								) : reindexDone ? (
									<Check className="w-3.5 h-3.5" />
								) : (
									<RefreshCw className="w-3.5 h-3.5" />
								)}
								{reindexMutation.isPending ? "Индексирую..." : reindexDone ? "Готово" : "Reindex"}
							</button>
							{custom.length > 0 && (
								<button
									onClick={() => setShowBulkMaxUses(true)}
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 transition-all"
								>
									<Layers className="w-3.5 h-3.5" />
									Лимит для всех
								</button>
							)}
							<button
								onClick={() => setShowUpload(true)}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-all"
							>
								<Plus className="w-3.5 h-3.5" />
								Добавить шаблон
							</button>
						</div>
					)}
				</div>

				{isLoading ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{[...Array(4)].map((_, i) => (
							<div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
						))}
					</div>
				) : (
					<div className="space-y-5">
						{builtIn.length > 0 && (
							<div>
								<p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
									Базовые
								</p>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{builtIn.map((t) => (
										<TemplateCard
											key={t.id}
											template={t}
											isAdmin={isAdmin}
											onDelete={(id) => deleteMutation.mutate(id)}
											onPatch={(id, data) => patchMutation.mutate({ id, data })}
										/>
									))}
								</div>
							</div>
						)}
						{custom.length > 0 && (
							<div>
								<p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
									Свои
								</p>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{custom.map((t) => (
										<TemplateCard
											key={t.id}
											template={t}
											isAdmin={isAdmin}
											onDelete={(id) => deleteMutation.mutate(id)}
											onPatch={(id, data) => patchMutation.mutate({ id, data })}
										/>
									))}
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{showUpload && (
				<UploadTemplateModal
					onClose={() => setShowUpload(false)}
					onSuccess={() => queryClient.invalidateQueries({ queryKey: ["slide-templates"] })}
				/>
			)}

			{showDeleteAllConfirm && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
								<Trash2 className="w-5 h-5 text-red-600" />
							</div>
							<div>
								<h3 className="text-sm font-semibold text-gray-900">Удалить все свои шаблоны?</h3>
								<p className="text-xs text-gray-500 mt-0.5">
									Это удалит все {templates.length} шаблон
									{templates.length === 1 ? "" : templates.length < 5 ? "а" : "ов"} из каталога.
									Действие необратимо.
								</p>
							</div>
						</div>
						<div className="flex gap-2 justify-end">
							<button
								onClick={() => setShowDeleteAllConfirm(false)}
								className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
								disabled={deleteAllMutation.isPending}
							>
								Отмена
							</button>
							<button
								onClick={() => deleteAllMutation.mutate()}
								disabled={deleteAllMutation.isPending}
								className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60"
							>
								{deleteAllMutation.isPending ? "Удаляю..." : "Да, удалить"}
							</button>
						</div>
					</div>
				</div>
			)}
			{showBulkMaxUses && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-5">
						<div>
							<h3 className="text-sm font-semibold text-gray-900">Лимит для всех шаблонов</h3>
							<p className="text-xs text-gray-500 mt-1">
								Применится ко всем контентным шаблонам твоей компании. Титульные слайды не затронет.
							</p>
						</div>

						<div>
							<div className="flex items-center justify-between mb-2">
								<span className="text-xs font-medium text-gray-700">Использований на презентацию</span>
								<span className="text-sm font-bold text-violet-600">
									{bulkMaxUsesValue === 0 ? "∞" : bulkMaxUsesValue}
								</span>
							</div>
							<input
								type="range"
								min={0}
								max={10}
								value={bulkMaxUsesValue}
								onChange={(e) => setBulkMaxUsesValue(Number(e.target.value))}
								className="w-full accent-violet-600"
							/>
							<div className="flex justify-between text-[10px] text-gray-400 mt-1">
								<span>∞ без лимита</span>
								<span>10 раз</span>
							</div>
						</div>

						<div className={cn(
							"rounded-xl px-3 py-2 text-xs",
							bulkMaxUsesValue === 0
								? "bg-gray-50 text-gray-500"
								: bulkMaxUsesValue === 1
									? "bg-green-50 text-green-700"
									: "bg-violet-50 text-violet-700"
						)}>
							{bulkMaxUsesValue === 0
								? "ИИ может выбрать любой шаблон неограниченное число раз"
								: bulkMaxUsesValue === 1
									? "Каждый шаблон появится максимум 1 раз — максимальное разнообразие"
									: `Каждый шаблон появится не более ${bulkMaxUsesValue} раз в одной презентации`}
						</div>

						<div className="flex gap-2">
							<button
								onClick={() => setShowBulkMaxUses(false)}
								disabled={bulkMaxUsesMutation.isPending}
								className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-50"
							>
								Отмена
							</button>
							<button
								onClick={() => bulkMaxUsesMutation.mutate(bulkMaxUsesValue === 0 ? null : bulkMaxUsesValue)}
								disabled={bulkMaxUsesMutation.isPending}
								className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-all disabled:opacity-50"
							>
								{bulkMaxUsesMutation.isPending ? "Применяю..." : "Применить"}
							</button>
						</div>
					</div>
				</div>
			)}
			</>}
		</div>
	);
}
