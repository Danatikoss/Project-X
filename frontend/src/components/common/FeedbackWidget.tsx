import { AnimatePresence, motion } from "framer-motion";
import {
	Bug,
	CheckCircle2,
	Image,
	Lightbulb,
	MessageCircle,
	MessageSquare,
	Send,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { feedbackApi } from "../../api/client";
import { cn } from "../../utils/cn";

type Category = "general" | "template_idea" | "bug";

const CATEGORIES: { value: Category; label: string; icon: React.ElementType; color: string }[] = [
	{ value: "template_idea", label: "Идея шаблона", icon: Lightbulb, color: "text-amber-500" },
	{ value: "bug", label: "Нашёл баг", icon: Bug, color: "text-red-500" },
	{ value: "general", label: "Обратная связь", icon: MessageSquare, color: "text-blue-500" },
];

const PAGE_LABELS: Record<string, string> = {
	"/dashboard": "Главная",
	"/generate": "Генерация",
	"/library": "Библиотека",
	"/media": "Медиа",
	"/profile": "Профиль",
	"/admin": "Админ",
};

function pageLabel(pathname: string): string {
	if (pathname.startsWith("/assemble/")) return "Редактор сборки";
	if (pathname.startsWith("/templates/")) return "Редактор шаблона";
	if (pathname.startsWith("/library/upload")) return "Загрузка";
	return PAGE_LABELS[pathname] ?? pathname;
}

export function FeedbackWidget() {
	const location = useLocation();
	const [open, setOpen] = useState(false);
	const [category, setCategory] = useState<Category>("general");
	const [message, setMessage] = useState("");
	const [attachment, setAttachment] = useState<File | null>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const applyFile = useCallback((file: File) => {
		if (!file.type.startsWith("image/")) {
			toast.error("Только изображения (PNG, JPEG, GIF, WebP)");
			return;
		}
		setAttachment(file);
		const url = URL.createObjectURL(file);
		setPreview(url);
	}, []);

	const removeAttachment = () => {
		if (preview) URL.revokeObjectURL(preview);
		setAttachment(null);
		setPreview(null);
	};

	// Paste from clipboard
	useEffect(() => {
		if (!open) return;
		const handler = (e: ClipboardEvent) => {
			const items = Array.from(e.clipboardData?.items ?? []);
			const imgItem = items.find((i) => i.type.startsWith("image/"));
			if (imgItem) {
				const file = imgItem.getAsFile();
				if (file) applyFile(file);
			}
		};
		window.addEventListener("paste", handler);
		return () => window.removeEventListener("paste", handler);
	}, [open, applyFile]);

	// Cleanup preview URL on unmount
	useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

	const reset = () => {
		setMessage("");
		removeAttachment();
		setCategory("general");
	};

	const handleSubmit = async () => {
		if (!message.trim()) return;
		setSending(true);
		try {
			await feedbackApi.submit(category, message.trim(), location.pathname, attachment);
			setSent(true);
			reset();
			setTimeout(() => {
				setSent(false);
				setOpen(false);
			}, 2200);
		} catch {
			toast.error("Не удалось отправить — попробуйте позже");
		} finally {
			setSending(false);
		}
	};

	const currentPage = pageLabel(location.pathname);

	return (
		<div className="group fixed right-0 z-40 bottom-20 md:bottom-6">
		<div className={cn("flex flex-col items-end gap-2 pr-4 transition-transform duration-300 ease-out", open ? "translate-x-0" : "translate-x-[calc(100%-10px)] group-hover:translate-x-0")}>
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: 12, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 12, scale: 0.95 }}
						transition={{ type: "spring", stiffness: 340, damping: 26 }}
						className="w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
					>
						{/* Header */}
						<div className="bg-gradient-to-br from-brand-600 to-violet-700 px-4 py-3 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<MessageCircle className="w-4 h-4 text-white" />
								<span className="text-sm font-semibold text-white">Обратная связь</span>
							</div>
							<button
								onClick={() => setOpen(false)}
								className="w-6 h-6 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>

						{sent ? (
							<div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
								<motion.div
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									transition={{ type: "spring", stiffness: 400, damping: 20 }}
								>
									<CheckCircle2 className="w-10 h-10 text-emerald-500" />
								</motion.div>
								<p className="text-sm font-semibold text-gray-800">Спасибо!</p>
								<p className="text-xs text-gray-400 text-center">Мы учтём ваш отзыв при развитии SLIDEX</p>
							</div>
						) : (
							<div className="p-4 space-y-3">
								{/* Page badge */}
								<div className="flex items-center gap-1.5 text-[11px] text-gray-400">
									<span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
									Страница: <span className="font-medium text-gray-600">{currentPage}</span>
								</div>

								{/* Category tabs */}
								<div className="flex gap-1.5 flex-wrap">
									{CATEGORIES.map(({ value, label, icon: Icon, color }) => (
										<button
											key={value}
											onClick={() => setCategory(value)}
											className={cn(
												"flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
												category === value
													? "bg-brand-50 border-brand-200 text-brand-700"
													: "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
											)}
										>
											<Icon className={cn("w-3 h-3", category === value ? "text-brand-500" : color)} />
											{label}
										</button>
									))}
								</div>

								{/* Hint for template idea */}
								{category === "template_idea" && (
									<p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-relaxed">
										Опишите тему или структуру шаблона — о чём слайды, сколько слотов, какой контент нужен
									</p>
								)}

								{/* Message */}
								<textarea
									value={message}
									onChange={(e) => setMessage(e.target.value)}
									placeholder={
										category === "template_idea"
											? "Например: шаблон для квартальных отчётов с графиками и таблицами"
											: category === "bug"
											? "Опишите что произошло и где"
											: "Ваши мысли, предложения или вопросы..."
									}
									rows={3}
									className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-gray-800 placeholder:text-gray-300"
								/>

								{/* Attachment preview */}
								{preview && (
									<div className="relative rounded-xl overflow-hidden border border-gray-200">
										<img src={preview} alt="скриншот" className="w-full max-h-36 object-cover" />
										<button
											onClick={removeAttachment}
											className="absolute top-1.5 right-1.5 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
										>
											<X className="w-3 h-3 text-white" />
										</button>
									</div>
								)}

								{/* Attachment row + send */}
								<div className="flex items-center gap-2">
									{/* Hidden file input */}
									<input
										ref={fileInputRef}
										type="file"
										accept="image/*"
										className="hidden"
										onChange={(e) => {
											const f = e.target.files?.[0];
											if (f) applyFile(f);
											e.target.value = "";
										}}
									/>
									<button
										onClick={() => fileInputRef.current?.click()}
										title="Прикрепить скриншот (или вставить Ctrl+V)"
										className={cn(
											"flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium border transition-all shrink-0",
											attachment
												? "border-brand-300 text-brand-600 bg-brand-50"
												: "border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600"
										)}
									>
										<Image className="w-3.5 h-3.5" />
										{attachment ? "Заменить" : "Прикрепить"}
									</button>

									<button
										onClick={handleSubmit}
										disabled={!message.trim() || sending}
										className={cn(
											"flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all",
											message.trim() && !sending
												? "bg-gradient-to-r from-brand-600 to-violet-600 text-white hover:opacity-90 shadow-sm"
												: "bg-gray-100 text-gray-400 cursor-not-allowed"
										)}
									>
										{sending ? (
											<div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
										) : (
											<Send className="w-3.5 h-3.5" />
										)}
										Отправить
									</button>
								</div>

								<p className="text-[10px] text-gray-300 text-center">
									Ctrl+V — вставить скриншот из буфера
								</p>
							</div>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			{/* FAB */}
			<motion.button
				onClick={() => setOpen((v) => !v)}
				whileHover={{ scale: 1.08 }}
				whileTap={{ scale: 0.94 }}
				className={cn(
					"w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all",
					open
						? "bg-gray-800 text-white"
						: "bg-gradient-to-br from-brand-600 to-violet-600 text-white"
				)}
				title="Обратная связь"
			>
				<AnimatePresence mode="wait">
					{open ? (
						<motion.div
							key="x"
							initial={{ rotate: -90, opacity: 0 }}
							animate={{ rotate: 0, opacity: 1 }}
							exit={{ rotate: 90, opacity: 0 }}
							transition={{ duration: 0.15 }}
						>
							<X className="w-5 h-5" />
						</motion.div>
					) : (
						<motion.div
							key="msg"
							initial={{ rotate: 90, opacity: 0 }}
							animate={{ rotate: 0, opacity: 1 }}
							exit={{ rotate: -90, opacity: 0 }}
							transition={{ duration: 0.15 }}
						>
							<MessageCircle className="w-5 h-5" />
						</motion.div>
					)}
				</AnimatePresence>
			</motion.button>
		</div>
		</div>
	);
}
