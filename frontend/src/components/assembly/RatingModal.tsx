import { useState } from "react";
import { X, Star } from "lucide-react";
import { cn } from "../../utils/cn";
import { assemblyApi } from "../../api/client";
import { toast } from "sonner";

const TAG_OPTIONS: Record<string, { label: string; tags: string[] }> = {
	low: {
		label: "Что пошло не так?",
		tags: [
			"Не те слайды",
			"Слабый текст",
			"Не совпадает с темой",
			"Мало слайдов",
			"Слишком много слайдов",
			"Другое",
		],
	},
	mid: {
		label: "Что можно улучшить?",
		tags: [
			"Текст можно лучше",
			"Нужно больше слайдов",
			"Хочу другой стиль",
			"Структура не та",
			"Другое",
		],
	},
	high: {
		label: "Что понравилось больше всего?",
		tags: [
			"Точно угадал тему",
			"Хороший текст",
			"Правильная структура",
			"Хороший подбор слайдов",
			"Быстро",
		],
	},
};

const PLACEHOLDERS: Record<string, string> = {
	low: "Опишите подробнее — это поможет улучшить AI",
	mid: "Что именно хотелось бы иначе?",
	high: "Поделитесь деталями — нам важно что сработало",
};

function tier(stars: number) {
	if (stars <= 2) return "low";
	if (stars === 3) return "mid";
	return "high";
}

interface Props {
	assemblyId: number;
	onClose: () => void;
}

export default function RatingModal({ assemblyId, onClose }: Props) {
	const [step, setStep] = useState<1 | 2>(1);
	const [stars, setStars] = useState(0);
	const [hovered, setHovered] = useState(0);
	const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
	const [comment, setComment] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const currentTier = tier(stars);
	const { label, tags } = TAG_OPTIONS[currentTier];

	function handleStarClick(s: number) {
		setStars(s);
		setStep(2);
		setSelectedTags(new Set());
	}

	function toggleTag(tag: string) {
		setSelectedTags((prev) => {
			const next = new Set(prev);
			next.has(tag) ? next.delete(tag) : next.add(tag);
			return next;
		});
	}

	async function handleSubmit() {
		if (!stars) return;
		setSubmitting(true);
		try {
			await assemblyApi.rate(assemblyId, {
				stars,
				tags: Array.from(selectedTags),
				comment: comment.trim() || undefined,
			});
			toast.success("Спасибо за оценку!");
			onClose();
		} catch {
			toast.error("Не удалось отправить оценку");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
			<div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-slide-up">
				{/* Header */}
				<div className="flex items-center justify-between px-6 pt-5 pb-4">
					<div>
						<p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-0.5">
							Оценка генерации
						</p>
						<h2 className="text-base font-semibold text-slate-900">
							{step === 1 ? "Как вам результат?" : label}
						</h2>
					</div>
					<button
						onClick={onClose}
						className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				<div className="px-6 pb-6 space-y-4">
					{/* Stars */}
					<div className="flex items-center gap-1.5">
						{[1, 2, 3, 4, 5].map((s) => (
							<button
								key={s}
								onClick={() => handleStarClick(s)}
								onMouseEnter={() => setHovered(s)}
								onMouseLeave={() => setHovered(0)}
								className="transition-transform hover:scale-110 active:scale-95"
							>
								<Star
									className={cn(
										"w-9 h-9 transition-colors",
										(hovered || stars) >= s
											? "fill-amber-400 text-amber-400"
											: "text-slate-200 fill-slate-200"
									)}
								/>
							</button>
						))}
						{stars > 0 && (
							<span className="ml-2 text-sm text-slate-500">
								{["", "Очень плохо", "Плохо", "Нормально", "Хорошо", "Отлично"][stars]}
							</span>
						)}
					</div>

					{/* Step 2 — tags + comment */}
					{step === 2 && (
						<>
							<div className="flex flex-wrap gap-2">
								{tags.map((tag) => (
									<button
										key={tag}
										onClick={() => toggleTag(tag)}
										className={cn(
											"px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
											selectedTags.has(tag)
												? "bg-brand-600 text-white border-brand-600"
												: "bg-slate-50 text-slate-600 border-slate-200 hover:border-brand-300"
										)}
									>
										{tag}
									</button>
								))}
							</div>

							<textarea
								value={comment}
								onChange={(e) => setComment(e.target.value)}
								placeholder={PLACEHOLDERS[currentTier]}
								rows={3}
								className={cn(
									"w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-800 resize-none",
									"placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
								)}
							/>

							<div className="flex items-center gap-3 pt-1">
								<button
									onClick={handleSubmit}
									disabled={submitting}
									className={cn(
										"flex-1 py-2.5 bg-gradient-brand text-white rounded-xl text-sm font-semibold",
										"hover:opacity-90 disabled:opacity-50 transition-all"
									)}
								>
									{submitting ? "Отправляем..." : "Отправить оценку"}
								</button>
								<button
									onClick={onClose}
									className="px-4 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
								>
									Пропустить
								</button>
							</div>
						</>
					)}

					{step === 1 && (
						<p className="text-xs text-slate-400">
							Нажмите на звезду чтобы оценить — это займёт 10 секунд
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
