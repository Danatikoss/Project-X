import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send, X, Lightbulb, Bug, MessageSquare, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { feedbackApi } from "../../api/client";
import { cn } from "../../utils/cn";

type Category = "general" | "template_idea" | "bug";

const CATEGORIES: { value: Category; label: string; icon: React.ElementType; color: string }[] = [
	{ value: "template_idea", label: "Идея шаблона", icon: Lightbulb, color: "text-amber-500" },
	{ value: "bug", label: "Нашёл баг", icon: Bug, color: "text-red-500" },
	{ value: "general", label: "Обратная связь", icon: MessageSquare, color: "text-blue-500" },
];

export function FeedbackWidget() {
	const [open, setOpen] = useState(false);
	const [category, setCategory] = useState<Category>("general");
	const [message, setMessage] = useState("");
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);

	const handleSubmit = async () => {
		if (!message.trim()) return;
		setSending(true);
		try {
			await feedbackApi.submit(category, message.trim());
			setSent(true);
			setMessage("");
			setTimeout(() => {
				setSent(false);
				setOpen(false);
			}, 2000);
		} catch {
			toast.error("Не удалось отправить — попробуйте позже");
		} finally {
			setSending(false);
		}
	};

	return (
		<div className="fixed bottom-20 right-4 md:bottom-6 z-40 flex flex-col items-end gap-2">
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
									rows={4}
									className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-transparent text-gray-800 placeholder:text-gray-300"
								/>

								<button
									onClick={handleSubmit}
									disabled={!message.trim() || sending}
									className={cn(
										"w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all",
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
						<motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
							<X className="w-5 h-5" />
						</motion.div>
					) : (
						<motion.div key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
							<MessageCircle className="w-5 h-5" />
						</motion.div>
					)}
				</AnimatePresence>
			</motion.button>
		</div>
	);
}
