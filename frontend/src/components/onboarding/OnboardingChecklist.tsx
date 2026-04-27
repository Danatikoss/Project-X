import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Download, Sparkles, Upload, UserCheck, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { assemblyApi, profileApi } from "../../api/client";
import { cn } from "../../utils/cn";

const STORAGE_KEY = "slidex_checklist_dismissed";
const DOWNLOADED_KEY = "slidex_pptx_downloaded";

interface Step {
	id: string;
	icon: React.ElementType;
	title: string;
	desc: string;
	cta: string;
	path: string;
}

const STEPS: Step[] = [
	{
		id: "account",
		icon: UserCheck,
		title: "Аккаунт создан",
		desc: "Ты уже в системе",
		cta: "",
		path: "",
	},
	{
		id: "upload",
		icon: Upload,
		title: "Загрузи презентации",
		desc: "Загрузи PPTX — AI проиндексирует каждый слайд",
		cta: "Загрузить",
		path: "/library/upload",
	},
	{
		id: "generate",
		icon: Sparkles,
		title: "Сгенерируй первую сборку",
		desc: "Опиши нужную презентацию — AI соберёт из библиотеки",
		cta: "Генерировать",
		path: "/generate",
	},
	{
		id: "download",
		icon: Download,
		title: "Скачай PPTX",
		desc: "Экспортируй готовую презентацию",
		cta: "Открыть сборку",
		path: "/dashboard",
	},
];

export function OnboardingChecklist() {
	const navigate = useNavigate();
	const [dismissed, setDismissed] = useState(
		() => !!localStorage.getItem(STORAGE_KEY)
	);

	const { data: stats } = useQuery({
		queryKey: ["profile-stats"],
		queryFn: profileApi.stats,
	});

	const { data: assemblies } = useQuery({
		queryKey: ["assemblies"],
		queryFn: assemblyApi.list,
	});

	const pptxDownloaded = !!localStorage.getItem(DOWNLOADED_KEY);

	const completed = {
		account: true,
		upload: (stats?.sources_count ?? 0) > 0,
		generate: (assemblies?.length ?? 0) > 0,
		download: pptxDownloaded,
	};

	const doneCount = Object.values(completed).filter(Boolean).length;
	const allDone = doneCount === STEPS.length;

	if (dismissed) return null;

	return (
		<div className={cn(
			"mb-6 rounded-2xl border overflow-hidden",
			allDone
				? "bg-emerald-50 border-emerald-100"
				: "bg-gradient-to-br from-brand-50 to-indigo-50 border-brand-100"
		)}>
			{/* Header */}
			<div className="flex items-center justify-between px-5 pt-4 pb-3">
				<div>
					<p className="text-sm font-bold text-slate-900">
						{allDone ? "Всё готово! 🎉" : "Быстрый старт"}
					</p>
					<p className="text-xs text-slate-500 mt-0.5">
						{allDone
							? "Ты освоил основные возможности SLIDEX"
							: `Выполнено ${doneCount} из ${STEPS.length}`}
					</p>
				</div>
				<button
					onClick={() => {
						localStorage.setItem(STORAGE_KEY, "1");
						setDismissed(true);
					}}
					className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
				>
					<X className="w-4 h-4" />
				</button>
			</div>

			{/* Progress bar */}
			<div className="px-5 pb-4">
				<div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
					<div
						className={cn(
							"h-full rounded-full transition-all duration-700",
							allDone ? "bg-emerald-500" : "bg-gradient-brand"
						)}
						style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
					/>
				</div>
			</div>

			{/* Steps */}
			<div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
				{STEPS.map((step) => {
					const done = completed[step.id as keyof typeof completed];
					const Icon = step.icon;
					return (
						<div
							key={step.id}
							className={cn(
								"flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all",
								done
									? "bg-white/50 opacity-70"
									: "bg-white border border-white/80 shadow-sm"
							)}
						>
							{/* Icon / Check */}
							<div className={cn(
								"w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
								done ? "bg-emerald-100" : "bg-gradient-brand shadow-sm"
							)}>
								{done
									? <Check className="w-4 h-4 text-emerald-600" />
									: <Icon className="w-4 h-4 text-white" />
								}
							</div>

							{/* Text */}
							<div className="flex-1 min-w-0">
								<p className={cn(
									"text-xs font-semibold leading-none",
									done ? "text-slate-400 line-through" : "text-slate-800"
								)}>
									{step.title}
								</p>
								{!done && (
									<p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{step.desc}</p>
								)}
							</div>

							{/* CTA */}
							{!done && step.cta && (
								<button
									onClick={() => navigate(step.path)}
									className="shrink-0 flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:text-brand-800 transition-colors"
								>
									{step.cta}
									<ArrowRight className="w-3 h-3" />
								</button>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
