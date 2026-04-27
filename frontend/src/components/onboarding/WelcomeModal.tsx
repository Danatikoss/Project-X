import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Layers, Sparkles, Upload, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { profileApi } from "../../api/client";
import { useAuthStore } from "../../store/auth";
import { cn } from "../../utils/cn";

const STORAGE_KEY = "slidex_welcome_shown";

const FEATURES = [
	{ icon: Upload, title: "Загрузи презентации", desc: "AI проиндексирует каждый слайд" },
	{ icon: Sparkles, title: "Опиши что нужно", desc: "Промпт — и план готов за секунды" },
	{ icon: Wand2, title: "Получи PPTX", desc: "Готовая презентация для скачивания" },
];

export function WelcomeModal() {
	const user = useAuthStore((s) => s.user);
	const queryClient = useQueryClient();
	const [visible, setVisible] = useState(false);
	const [step, setStep] = useState(0);
	const [name, setName] = useState("");
	const [company, setCompany] = useState("");
	const [position, setPosition] = useState("");

	const { data: profile } = useQuery({
		queryKey: ["profile"],
		queryFn: profileApi.get,
		enabled: visible,
	});

	useEffect(() => {
		if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
	}, []);

	useEffect(() => {
		if (profile) {
			setName(profile.name || user?.name || "");
			setCompany(profile.company || "");
			setPosition(profile.position || "");
		}
	}, [profile, user]);

	const saveMutation = useMutation({
		mutationFn: () => profileApi.update({ name, company, position }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["profile"] }),
	});

	const handleFinish = async () => {
		if (name || company || position) await saveMutation.mutateAsync();
		localStorage.setItem(STORAGE_KEY, "1");
		setVisible(false);
	};

	const handleSkip = () => {
		localStorage.setItem(STORAGE_KEY, "1");
		setVisible(false);
	};

	if (!visible) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop */}
			<div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

			{/* Card */}
			<div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-slide-up">
				{/* Top gradient bar */}
				<div className="h-1.5 bg-gradient-brand w-full" />

				{/* Close */}
				<button
					onClick={handleSkip}
					className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
				>
					<X className="w-4 h-4" />
				</button>

				{/* Step dots */}
				<div className="flex justify-center gap-1.5 pt-5">
					{[0, 1].map((i) => (
						<div
							key={i}
							className={cn(
								"rounded-full transition-all duration-300",
								i === step ? "w-6 h-2 bg-brand-600" : "w-2 h-2 bg-slate-200"
							)}
						/>
					))}
				</div>

				{/* ── Step 0: Welcome ─────────────────────────────────────────────── */}
				{step === 0 && (
					<div className="px-8 pb-8 pt-4">
						{/* Logo */}
						<div className="flex justify-center mb-5">
							<div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-lg">
								<Layers className="w-8 h-8 text-white" />
							</div>
						</div>

						<h1 className="text-2xl font-bold text-slate-900 text-center mb-1">
							Добро пожаловать в SLIDEX
						</h1>
						<p className="text-sm text-slate-500 text-center mb-7">
							{user?.name ? `${user.name}, ` : ""}AI-платформа для сборки презентаций из вашей библиотеки слайдов
						</p>

						{/* Features */}
						<div className="space-y-3 mb-8">
							{FEATURES.map(({ icon: Icon, title, desc }, i) => (
								<div key={i} className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
									<div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0 shadow-sm">
										<Icon className="w-4.5 h-4.5 text-white" />
									</div>
									<div>
										<p className="text-sm font-semibold text-slate-800">{title}</p>
										<p className="text-xs text-slate-500">{desc}</p>
									</div>
									<div className="ml-auto w-6 h-6 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
										<span className="text-xs font-bold text-brand-600">{i + 1}</span>
									</div>
								</div>
							))}
						</div>

						<button
							onClick={() => setStep(1)}
							className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-brand text-white rounded-2xl text-sm font-semibold hover:opacity-90 transition-all shadow-md"
						>
							Продолжить
							<ArrowRight className="w-4 h-4" />
						</button>
					</div>
				)}

				{/* ── Step 1: Profile ─────────────────────────────────────────────── */}
				{step === 1 && (
					<div className="px-8 pb-8 pt-4">
						<h2 className="text-xl font-bold text-slate-900 text-center mb-1">Расскажи о себе</h2>
						<p className="text-sm text-slate-500 text-center mb-6">
							AI будет учитывать это при генерации
						</p>

						<div className="space-y-3 mb-6">
							<div>
								<label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
									Имя
								</label>
								<input
									type="text"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Иван Иванов"
									autoFocus
									className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
								/>
							</div>
							<div>
								<label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
									Организация
								</label>
								<input
									type="text"
									value={company}
									onChange={(e) => setCompany(e.target.value)}
									placeholder="Министерство / компания"
									className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
								/>
							</div>
							<div>
								<label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
									Должность
								</label>
								<input
									type="text"
									value={position}
									onChange={(e) => setPosition(e.target.value)}
									placeholder="Аналитик, директор, менеджер..."
									className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition"
								/>
							</div>
						</div>

						<button
							onClick={handleFinish}
							disabled={saveMutation.isPending}
							className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-brand text-white rounded-2xl text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-all shadow-md"
						>
							Начать работу
							<ArrowRight className="w-4 h-4" />
						</button>

						<button
							onClick={handleSkip}
							className="w-full mt-2 py-2 text-xs text-slate-400 hover:text-slate-600 transition-colors"
						>
							Пропустить
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
