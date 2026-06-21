import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, Lock, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { globalSettingsApi, orgProfileApi, type GlobalSettings, type OrgProfile } from "../api/client";
import { useAuthStore } from "../store/auth";

const LANGUAGES = [
	{ value: "ru", label: "Русский" },
	{ value: "kk", label: "Қазақша" },
	{ value: "both", label: "Оба языка" },
];

const EMPTY_GLOBAL: GlobalSettings = {
	base_writing_rules: "",
	base_forbidden_words: "",
};

const EMPTY: OrgProfile = {
	org_name: "",
	org_name_short: "",
	leader_name: "",
	mission: "",
	key_products: "",
	key_stats: "",
	strategic_priorities: "",
	writing_rules: "",
	forbidden_words: "",
	language: "ru",
	logo_url: null,
};

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<label className="text-sm font-medium text-slate-700">{label}</label>
			{children}
			{hint && <p className="text-xs text-slate-400">{hint}</p>}
		</div>
	);
}

const inputCls =
	"w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition";

const textareaCls = `${inputCls} resize-none`;

export default function OrgProfile() {
	const qc = useQueryClient();
	const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin());
	const [form, setForm] = useState<OrgProfile>(EMPTY);
	const [globalForm, setGlobalForm] = useState<GlobalSettings>(EMPTY_GLOBAL);

	const { data, isLoading } = useQuery({
		queryKey: ["org-profile"],
		queryFn: orgProfileApi.get,
	});

	const { data: globalData, isLoading: isLoadingGlobal } = useQuery({
		queryKey: ["global-settings"],
		queryFn: globalSettingsApi.get,
	});

	useEffect(() => {
		if (data) setForm({ ...EMPTY, ...data });
	}, [data]);

	useEffect(() => {
		if (globalData) setGlobalForm({ ...EMPTY_GLOBAL, ...globalData });
	}, [globalData]);

	const mutation = useMutation({
		mutationFn: orgProfileApi.update,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["org-profile"] });
			toast.success("Профиль организации сохранён");
		},
		onError: () => toast.error("Не удалось сохранить"),
	});

	const logoMutation = useMutation({
		mutationFn: orgProfileApi.uploadLogo,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["org-profile"] });
			toast.success("Логотип загружен");
		},
		onError: () => toast.error("Не удалось загрузить логотип"),
	});

	const globalMutation = useMutation({
		mutationFn: globalSettingsApi.update,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["global-settings"] });
			toast.success("Базовые правила сохранены");
		},
		onError: () => toast.error("Не удалось сохранить базовые правила"),
	});

	const set = (key: keyof OrgProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
		setForm((f) => ({ ...f, [key]: e.target.value }));

	const setGlobal = (key: keyof GlobalSettings) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
		setGlobalForm((f) => ({ ...f, [key]: e.target.value }));

	if (isLoading || isLoadingGlobal) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
			</div>
		);
	}

	return (
		<div className="max-w-2xl mx-auto px-4 py-8">
			{/* Header */}
			<div className="flex items-center gap-3 mb-8">
				<div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
					<Building2 className="w-5 h-5 text-blue-600" />
				</div>
				<div>
					<h1 className="text-xl font-semibold text-slate-800">Профиль организации</h1>
					<p className="text-sm text-slate-500">
						AI использует эти данные при каждой генерации слайдов
					</p>
				</div>
			</div>

			<div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 flex flex-col gap-6">
				{/* Identity */}
				<div>
					<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
						Организация
					</p>
					<div className="flex flex-col gap-4">
						{/* Logo — super-admin only */}
						<Field label="Логотип организации" hint={isSuperAdmin ? "PNG, JPG, SVG или WebP, макс. 2 МБ" : "Логотип устанавливает только супер-администратор"}>
							<div className="flex items-center gap-3">
								{form.logo_url ? (
									<div className="h-12 w-24 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
										<img src={form.logo_url} alt="Логотип" className="h-10 w-auto object-contain" />
									</div>
								) : (
									<div className="h-12 w-24 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
										<Building2 className="w-5 h-5 text-slate-300" />
									</div>
								)}
								{isSuperAdmin && (
									<label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm text-slate-600 cursor-pointer transition">
										{logoMutation.isPending ? (
											<div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
										) : (
											<ImagePlus className="w-4 h-4" />
										)}
										{form.logo_url ? "Заменить" : "Загрузить"}
										<input
											type="file"
											className="hidden"
											accept="image/png,image/jpeg,image/svg+xml,image/webp"
											onChange={(e) => {
												const file = e.target.files?.[0];
												if (file) logoMutation.mutate(file);
												e.target.value = "";
											}}
										/>
									</label>
								)}
							</div>
						</Field>

						<Field label="Полное официальное название" hint="Используется в заголовках и официальных слайдах">
							<input
								className={inputCls}
								placeholder="Введите полное официальное название организации"
								value={form.org_name ?? ""}
								onChange={set("org_name")}
							/>
						</Field>
						<Field label="Аббревиатура / короткое название">
							<input
								className={inputCls}
								placeholder="Аббревиатура или сокращение"
								value={form.org_name_short ?? ""}
								onChange={set("org_name_short")}
							/>
						</Field>
						<Field label="Руководитель" hint="Имя и должность — AI не будет галлюцинировать">
							<input
								className={inputCls}
								placeholder="Имя и должность руководителя"
								value={form.leader_name ?? ""}
								onChange={set("leader_name")}
							/>
						</Field>
						<Field label="Миссия / чем занимается организация">
							<textarea
								className={textareaCls}
								rows={2}
								placeholder="Кратко опишите основную деятельность и цели организации"
								value={form.mission ?? ""}
								onChange={set("mission")}
							/>
						</Field>
					</div>
				</div>

				{/* Content */}
				<div>
					<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
						Контент
					</p>
					<div className="flex flex-col gap-4">
						<Field label="Главные продукты и сервисы">
							<textarea
								className={textareaCls}
								rows={2}
								placeholder="Перечислите основные продукты, проекты или сервисы организации"
								value={form.key_products ?? ""}
								onChange={set("key_products")}
							/>
						</Field>
						<Field label="Ключевые цифры и факты" hint="AI будет ссылаться на эти данные вместо плейсхолдеров">
							<textarea
								className={textareaCls}
								rows={3}
								placeholder={"Каждый факт с новой строки\nНапример: 500 млрд тенге активов под управлением\nИли: присутствие в 12 отраслях экономики"}
								value={form.key_stats ?? ""}
								onChange={set("key_stats")}
							/>
						</Field>
						<Field label="Стратегические приоритеты">
							<textarea
								className={textareaCls}
								rows={2}
								placeholder="Основные стратегические направления и программы развития"
								value={form.strategic_priorities ?? ""}
								onChange={set("strategic_priorities")}
							/>
						</Field>
					</div>
				</div>

				{/* Base rules — visible to all, editable only by super-admin */}
				<div>
					<div className="flex items-center gap-2 mb-4">
						<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
							Базовые правила
						</p>
						<span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
							применяются ко всем организациям
						</span>
					</div>
					<div className="flex flex-col gap-4">
						<Field label="Правила написания" hint={isSuperAdmin ? undefined : "Только супер-администратор может редактировать"}>
							{isSuperAdmin ? (
								<textarea
									className={textareaCls}
									rows={3}
									value={globalForm.base_writing_rules ?? ""}
									onChange={setGlobal("base_writing_rules")}
								/>
							) : (
								<div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
									<Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-300" />
									<span>{globalForm.base_writing_rules || "—"}</span>
								</div>
							)}
						</Field>
						<Field label="Запрещённые слова и фразы" hint={isSuperAdmin ? undefined : "Только супер-администратор может редактировать"}>
							{isSuperAdmin ? (
								<textarea
									className={textareaCls}
									rows={2}
									placeholder="Слова или фразы через запятую"
									value={globalForm.base_forbidden_words ?? ""}
									onChange={setGlobal("base_forbidden_words")}
								/>
							) : (
								<div className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">
									<Lock className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-300" />
									<span>{globalForm.base_forbidden_words || "—"}</span>
								</div>
							)}
						</Field>
						{isSuperAdmin && (
							<button
								onClick={() => globalMutation.mutate(globalForm)}
								disabled={globalMutation.isPending}
								className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium transition disabled:opacity-50"
							>
								{globalMutation.isPending ? (
									<div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
								) : (
									<Save className="w-4 h-4" />
								)}
								Сохранить базовые правила
							</button>
						)}
					</div>
				</div>

				{/* Rules */}
				<div>
					<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
						Правила организации
					</p>
					<div className="flex flex-col gap-4">
						<Field label="Дополнительные правила написания" hint="Добавляются к базовым правилам">
							<textarea
								className={textareaCls}
								rows={3}
								placeholder={"Тезисы — не более 2 строк\nБез пассивного залога\nЦифры писать словами до десяти, далее цифрами"}
								value={form.writing_rules ?? ""}
								onChange={set("writing_rules")}
							/>
						</Field>
						<Field label="Запрещённые слова и фразы" hint="Добавляются к базовому списку">
							<textarea
								className={textareaCls}
								rows={2}
								placeholder="Слова или фразы через запятую, которые нельзя использовать"
								value={form.forbidden_words ?? ""}
								onChange={set("forbidden_words")}
							/>
						</Field>
						<Field label="Язык генерации">
							<select
								className={inputCls}
								value={form.language}
								onChange={set("language")}
							>
								{LANGUAGES.map((l) => (
									<option key={l.value} value={l.value}>
										{l.label}
									</option>
								))}
							</select>
						</Field>
					</div>
				</div>

				<button
					onClick={() => mutation.mutate(form)}
					disabled={mutation.isPending}
					className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50"
				>
					{mutation.isPending ? (
						<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
					) : (
						<Save className="w-4 h-4" />
					)}
					Сохранить
				</button>
			</div>
		</div>
	);
}
