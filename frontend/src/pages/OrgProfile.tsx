import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { orgProfileApi, type OrgProfile } from "../api/client";

const LANGUAGES = [
	{ value: "ru", label: "Русский" },
	{ value: "kk", label: "Қазақша" },
	{ value: "both", label: "Оба языка" },
];

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
	const [form, setForm] = useState<OrgProfile>(EMPTY);

	const { data, isLoading } = useQuery({
		queryKey: ["org-profile"],
		queryFn: orgProfileApi.get,
	});

	useEffect(() => {
		if (data) setForm({ ...EMPTY, ...data });
	}, [data]);

	const mutation = useMutation({
		mutationFn: orgProfileApi.update,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["org-profile"] });
			toast.success("Профиль организации сохранён");
		},
		onError: () => toast.error("Не удалось сохранить"),
	});

	const set = (key: keyof OrgProfile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
		setForm((f) => ({ ...f, [key]: e.target.value }));

	if (isLoading) {
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
						<Field label="Полное официальное название" hint="Используется в заголовках и официальных слайдах">
							<input
								className={inputCls}
								placeholder="Министерство цифрового развития, инноваций и аэрокосмической промышленности РК"
								value={form.org_name ?? ""}
								onChange={set("org_name")}
							/>
						</Field>
						<Field label="Аббревиатура / короткое название">
							<input
								className={inputCls}
								placeholder="МЦРИАП"
								value={form.org_name_short ?? ""}
								onChange={set("org_name_short")}
							/>
						</Field>
						<Field label="Руководитель" hint="Имя и должность — AI не будет галлюцинировать">
							<input
								className={inputCls}
								placeholder="Министр Багдат Мусин"
								value={form.leader_name ?? ""}
								onChange={set("leader_name")}
							/>
						</Field>
						<Field label="Миссия / чем занимается организация">
							<textarea
								className={textareaCls}
								rows={2}
								placeholder="Цифровая трансформация государственного управления Казахстана"
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
								placeholder="eGov.kz, ЦОН, Государственная база данных «Физические лица»"
								value={form.key_products ?? ""}
								onChange={set("key_products")}
							/>
						</Field>
						<Field label="Ключевые цифры и факты" hint="AI будет ссылаться на эти данные вместо плейсхолдеров">
							<textarea
								className={textareaCls}
								rows={3}
								placeholder={"12.5 млн активных пользователей eGov\n97% госуслуг переведено в цифровой формат\n2 место в рейтинге ООН по e-government (2024)"}
								value={form.key_stats ?? ""}
								onChange={set("key_stats")}
							/>
						</Field>
						<Field label="Стратегические приоритеты">
							<textarea
								className={textareaCls}
								rows={2}
								placeholder="Цифровой Казахстан 2025-2029, ИИ-стратегия РК, цифровизация сельских регионов"
								value={form.strategic_priorities ?? ""}
								onChange={set("strategic_priorities")}
							/>
						</Field>
					</div>
				</div>

				{/* Rules */}
				<div>
					<p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
						Правила генерации
					</p>
					<div className="flex flex-col gap-4">
						<Field label="Правила написания текста в слайдах">
							<textarea
								className={textareaCls}
								rows={3}
								placeholder={"Тезисы — не более 2 строк\nБез пассивного залога\nЦифры писать словами до десяти, далее цифрами"}
								value={form.writing_rules ?? ""}
								onChange={set("writing_rules")}
							/>
						</Field>
						<Field label="Запрещённые слова и фразы" hint="AI никогда не будет использовать эти выражения">
							<textarea
								className={textareaCls}
								rows={2}
								placeholder="коррупция, провал, нет данных, неизвестно"
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
