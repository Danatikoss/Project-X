import { ArrowRight, Download, Sparkles, X } from "lucide-react";

interface Props {
	slideCount: number;
	onDownload: () => void;
	onOpenEditor: () => void;
	onClose: () => void;
}

const STORAGE_KEY = "slidex_first_plan_celebrated";

export function markGenerationCelebrated() {
	localStorage.setItem(STORAGE_KEY, "1");
}

export function shouldShowCelebration(): boolean {
	return !localStorage.getItem(STORAGE_KEY);
}

export function GenerationCelebration({ slideCount, onDownload, onOpenEditor, onClose }: Props) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

			{/* Card */}
			<div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
				{/* Top gradient */}
				<div className="h-1.5 bg-gradient-brand w-full" />

				{/* Close */}
				<button
					onClick={onClose}
					className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
				>
					<X className="w-4 h-4" />
				</button>

				<div className="px-7 py-7 text-center">
					{/* Icon */}
					<div className="flex justify-center mb-4">
						<div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-lg">
							<Sparkles className="w-8 h-8 text-white" />
						</div>
					</div>

					<h2 className="text-xl font-bold text-slate-900 mb-1">
						Первая генерация!
					</h2>
					<p className="text-sm text-slate-500 mb-5">
						AI собрал презентацию из{" "}
						<span className="font-bold text-brand-600 text-base">{slideCount}</span>{" "}
						{slideCount === 1 ? "слайда" : slideCount < 5 ? "слайдов" : "слайдов"}
					</p>

					{/* Slide count pill */}
					<div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-brand-50 border border-brand-100 mb-6">
						<div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
						<span className="text-xs font-semibold text-brand-700">
							Готово к скачиванию
						</span>
					</div>

					{/* Actions */}
					<div className="flex flex-col gap-2">
						<button
							onClick={() => { onDownload(); onClose(); }}
							className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-brand text-white rounded-2xl text-sm font-semibold hover:opacity-90 transition-all shadow-md"
						>
							<Download className="w-4 h-4" />
							Скачать PPTX
						</button>
						<button
							onClick={() => { onOpenEditor(); onClose(); }}
							className="w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 text-slate-700 rounded-2xl text-sm font-semibold hover:bg-slate-50 transition-all"
						>
							Открыть в редакторе
							<ArrowRight className="w-4 h-4" />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
