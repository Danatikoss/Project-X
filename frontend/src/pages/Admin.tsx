import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDownToLine,
	Bug,
	Clock,
	KeyRound,
	LayoutTemplate,
	Lightbulb,
	MessageCircle,
	MessageSquare,
	RefreshCw,
	Repeat2,
	ShieldCheck,
	ShieldOff,
	Sparkles,
	TrendingUp,
	UserCheck,
	UserX,
	Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { adminApi, feedbackApi, type AdminStats } from "../api/client";
import type { AdminUser } from "../types";
import { cn } from "../utils/cn";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
	if (n == null) return "—";
	return n.toLocaleString("ru-RU");
}

function fmtSec(s: number | null | undefined): string {
	if (s == null) return "—";
	if (s >= 60) return `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`;
	return `${s.toFixed(0)} с`;
}

function actionLabel(action: string): string {
	const map: Record<string, string> = {
		plan: "Генерация плана",
		download: "Скачивание PPTX",
		assembly: "Открыть в редакторе",
		upload_template: "Загрузка шаблона",
		upload_batch: "Пакетная загрузка",
	};
	return map[action] ?? action;
}

function timeAgo(iso: string | null): string {
	if (!iso) return "—";
	const diff = (Date.now() - new Date(iso).getTime()) / 1000;
	if (diff < 60) return "только что";
	if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
	if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
	return `${Math.floor(diff / 86400)} д назад`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
	icon: Icon,
	label,
	value,
	sub,
	color = "indigo",
}: {
	icon: React.ElementType;
	label: string;
	value: string;
	sub?: string;
	color?: "indigo" | "emerald" | "amber" | "violet" | "sky" | "rose";
}) {
	const colors = {
		indigo: "bg-indigo-50 text-indigo-600",
		emerald: "bg-emerald-50 text-emerald-600",
		amber: "bg-amber-50 text-amber-600",
		violet: "bg-violet-50 text-violet-600",
		sky: "bg-sky-50 text-sky-600",
		rose: "bg-rose-50 text-rose-600",
	};
	return (
		<div className="bg-white border border-gray-200 rounded-2xl p-5 flex items-start gap-4">
			<div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
				<Icon className="w-5 h-5" />
			</div>
			<div className="min-w-0">
				<p className="text-xs text-gray-400 mb-0.5">{label}</p>
				<p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
				{sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
			</div>
		</div>
	);
}

function FunnelBar({ plans, downloads, rate }: { plans: number; downloads: number; rate: number }) {
	const fill = Math.min(rate, 100);
	const color =
		fill >= 60 ? "bg-emerald-500" : fill >= 35 ? "bg-amber-400" : "bg-rose-400";

	return (
		<div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
			<p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Воронка</p>

			<div className="flex items-end gap-6">
				<div className="text-center">
					<p className="text-3xl font-bold text-gray-900">{fmt(plans)}</p>
					<p className="text-xs text-gray-400 mt-1">Генераций плана</p>
				</div>
				<div className="flex-1 flex items-center gap-2 pb-1">
					<div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
						<div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${fill}%` }} />
					</div>
					<span className={`text-sm font-bold tabular-nums ${fill >= 60 ? "text-emerald-600" : fill >= 35 ? "text-amber-500" : "text-rose-500"}`}>
						{rate}%
					</span>
				</div>
				<div className="text-center">
					<p className="text-3xl font-bold text-gray-900">{fmt(downloads)}</p>
					<p className="text-xs text-gray-400 mt-1">Скачиваний PPTX</p>
				</div>
			</div>

			<p className="text-xs text-gray-400">
				{rate >= 60
					? "Отличная конверсия — результат нравится пользователям"
					: rate >= 35
					? "Средняя конверсия — часть пользователей не скачивает"
					: plans === 0
					? "Данных пока нет"
					: "Низкая конверсия — стоит проверить качество генерации"}
			</p>
		</div>
	);
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
	const queryClient = useQueryClient();
	const [tempPasswords, setTempPasswords] = useState<Record<number, string>>({});

	const { data: users, isLoading } = useQuery<AdminUser[]>({
		queryKey: ["admin-users"],
		queryFn: adminApi.listUsers,
	});

	const patchMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: { is_admin?: boolean; is_active?: boolean } }) =>
			adminApi.patchUser(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
		onError: (err: any) => toast.error(err.response?.data?.detail ?? "Ошибка"),
	});

	const resetMutation = useMutation({
		mutationFn: (id: number) => adminApi.resetPassword(id),
		onSuccess: (data, id) => {
			setTempPasswords((prev) => ({ ...prev, [id]: data.temp_password }));
			toast.success("Пароль сброшен");
		},
		onError: () => toast.error("Не удалось сбросить пароль"),
	});

	if (isLoading) return <div className="text-sm text-gray-400 py-8 text-center">Загрузка…</div>;

	return (
		<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-gray-100 bg-gray-50">
						<th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Пользователь</th>
						<th className="text-center px-3 py-3 text-xs font-semibold text-gray-400">Презентаций</th>
						<th className="text-center px-3 py-3 text-xs font-semibold text-gray-400">Роль</th>
						<th className="text-center px-3 py-3 text-xs font-semibold text-gray-400">Статус</th>
						<th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Действия</th>
					</tr>
				</thead>
				<tbody>
					{users?.map((u) => (
						<tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
							<td className="px-4 py-3">
								<p className={cn("font-medium leading-none", u.is_active ? "text-gray-800" : "text-gray-400 line-through")}>
									{u.name || u.email}
								</p>
								{u.name && <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>}
								{u.created_at && (
									<p className="text-[11px] text-gray-300 mt-0.5">
										с {new Date(u.created_at).toLocaleDateString("ru-RU")}
									</p>
								)}
							</td>
							<td className="px-3 py-3 text-center">
								<span className="inline-flex items-center justify-center bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full px-2.5 py-0.5">
									{u.presentations_count}
								</span>
							</td>
							<td className="px-3 py-3 text-center">
								<span className={cn(
									"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
									u.is_admin ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"
								)}>
									{u.is_admin ? "Админ" : "Юзер"}
								</span>
							</td>
							<td className="px-3 py-3 text-center">
								<span className={cn(
									"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
									u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-500"
								)}>
									{u.is_active ? "Активен" : "Заблокирован"}
								</span>
							</td>
							<td className="px-4 py-3">
								<div className="flex items-center justify-end gap-1">
									{/* Reset password */}
									<button
										onClick={() => resetMutation.mutate(u.id)}
										disabled={resetMutation.isPending}
										title="Сбросить пароль"
										className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
									>
										<KeyRound className="w-4 h-4" />
									</button>

									{/* Toggle admin */}
									<button
										onClick={() => patchMutation.mutate({ id: u.id, data: { is_admin: !u.is_admin } })}
										disabled={patchMutation.isPending}
										title={u.is_admin ? "Снять права админа" : "Сделать админом"}
										className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
									>
										{u.is_admin ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
									</button>

									{/* Toggle active */}
									<button
										onClick={() => patchMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })}
										disabled={patchMutation.isPending}
										title={u.is_active ? "Заблокировать" : "Разблокировать"}
										className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
									>
										{u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
									</button>
								</div>

								{/* Temp password display */}
								{tempPasswords[u.id] && (
									<div className="mt-1.5 flex items-center gap-1.5 justify-end">
										<code className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded font-mono">
											{tempPasswords[u.id]}
										</code>
										<button
											onClick={() => setTempPasswords((p) => { const n = { ...p }; delete n[u.id]; return n; })}
											className="text-[10px] text-gray-400 hover:text-gray-600"
										>
											✕
										</button>
									</div>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ─── Feedback Tab ─────────────────────────────────────────────────────────────

interface FeedbackItem {
	id: number;
	user_id: number;
	user_email: string;
	category: string;
	message: string;
	page_url: string | null;
	attachment_url: string | null;
	created_at: string;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
	template_idea: { label: "Идея шаблона", icon: Lightbulb, color: "text-amber-500 bg-amber-50" },
	bug: { label: "Баг", icon: Bug, color: "text-red-500 bg-red-50" },
	general: { label: "Отзыв", icon: MessageSquare, color: "text-blue-500 bg-blue-50" },
};

function FeedbackTab() {
	const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
		queryKey: ["admin-feedback"],
		queryFn: async () => {
			const res = await feedbackApi.list();
			return res;
		},
	});

	if (isLoading) return <div className="py-16 text-center text-sm text-gray-400">Загрузка...</div>;
	if (!items.length) return <div className="py-16 text-center text-sm text-gray-400">Отзывов пока нет</div>;

	return (
		<div className="space-y-3">
			{items.map((fb) => {
				const meta = CATEGORY_META[fb.category] ?? CATEGORY_META.general;
				const Icon = meta.icon;
				return (
					<div key={fb.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
						<div className="flex items-center justify-between gap-2 flex-wrap">
							<span className={cn("flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full", meta.color)}>
								<Icon className="w-3 h-3" /> {meta.label}
							</span>
							<span className="text-[11px] text-gray-400">
								{new Date(fb.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
							</span>
						</div>
						<p className="text-sm text-gray-800 leading-relaxed">{fb.message}</p>
						<div className="flex items-center gap-3 flex-wrap">
							<p className="text-[11px] text-gray-400">{fb.user_email}</p>
							{fb.page_url && (
								<span className="text-[11px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
									📍 {fb.page_url}
								</span>
							)}
						</div>
						{fb.attachment_url && (
							<a href={fb.attachment_url} target="_blank" rel="noopener noreferrer">
								<img
									src={fb.attachment_url}
									alt="скриншот"
									className="mt-1 max-h-48 rounded-lg border border-gray-100 object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
								/>
							</a>
						)}
					</div>
				);
			})}
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Admin() {
	const [tab, setTab] = useState<"stats" | "users" | "feedback">("stats");

	const { data: stats, isLoading, isError, refetch, isFetching } = useQuery<AdminStats>({
		queryKey: ["admin-stats"],
		queryFn: adminApi.getStats,
		refetchInterval: 30_000,
	});

	return (
		<div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
			{/* Header + tabs */}
			<div className="flex items-center justify-between">
				<div className="flex gap-1 bg-gray-100 rounded-xl p-1">
					<button
						onClick={() => setTab("stats")}
						className={cn(
							"flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
							tab === "stats" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
						)}
					>
						<TrendingUp className="w-4 h-4" /> Статистика
					</button>
					<button
						onClick={() => setTab("users")}
						className={cn(
							"flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
							tab === "users" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
						)}
					>
						<Users className="w-4 h-4" /> Пользователи
					</button>
					<button
						onClick={() => setTab("feedback")}
						className={cn(
							"flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
							tab === "feedback" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
						)}
					>
						<MessageCircle className="w-4 h-4" /> Отзывы
					</button>
				</div>
				{tab === "stats" && (
					<button
						onClick={() => refetch()}
						disabled={isFetching}
						className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-40"
					>
						<RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
						Обновить
					</button>
				)}
			</div>

			{/* Users tab */}
			{tab === "users" && <UsersTab />}

			{/* Feedback tab */}
			{tab === "feedback" && <FeedbackTab />}

			{/* Stats tab */}
			{tab === "stats" && isLoading && (
				<div className="flex items-center justify-center h-64 text-gray-400 text-sm">
					Загрузка статистики…
				</div>
			)}
			{tab === "stats" && (isError || (!isLoading && !stats)) && (
				<div className="flex items-center justify-center h-64 text-red-400 text-sm">
					Не удалось загрузить статистику
				</div>
			)}
			{tab === "stats" && stats && <div className="space-y-8">

			{/* Overview */}
			<section>
				<h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Общее</h2>
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
					<StatCard
						icon={Users}
						label="Пользователи"
						value={fmt(stats.users.total)}
						sub={`+${fmt(stats.users.new_7d)} за 7 дней`}
						color="indigo"
					/>
					<StatCard
						icon={TrendingUp}
						label="Презентации"
						value={fmt(stats.presentations.total)}
						sub={`+${fmt(stats.presentations.new_7d)} за 7 дней`}
						color="violet"
					/>
					<StatCard
						icon={Repeat2}
						label="Возвращаются"
						value={`${stats.users.retention_rate}%`}
						sub={`${fmt(stats.users.returning)} из ${fmt(stats.users.total)} юзеров`}
						color="emerald"
					/>
					<StatCard
						icon={LayoutTemplate}
						label="Шаблонов"
						value={fmt(stats.templates.total)}
						color="sky"
					/>
				</div>
			</section>

			{/* Funnel */}
			<section>
				<FunnelBar
					plans={stats.funnel.plans}
					downloads={stats.funnel.downloads}
					rate={stats.funnel.conversion_rate}
				/>
			</section>

			{/* Quality signals */}
			<section>
				<h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Качество и скорость</h2>
				<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
					<StatCard
						icon={Sparkles}
						label="Среднее слайдов"
						value={stats.presentations.avg_slides != null ? `${stats.presentations.avg_slides}` : "—"}
						sub="на одну презентацию"
						color="violet"
					/>
					<StatCard
						icon={Clock}
						label="Полный цикл"
						value={fmtSec(stats.cycle_time.avg_total_seconds)}
						sub="от промпта до PPTX"
						color="amber"
					/>
					<StatCard
						icon={ArrowDownToLine}
						label="Время скачивания"
						value={fmtSec(stats.cycle_time.avg_download_seconds)}
						sub="сборка PPTX"
						color="amber"
					/>
				</div>
			</section>

			{/* Top users */}
			{stats.top_users.length > 0 && (
				<section>
					<h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
						Топ пользователей
					</h2>
					<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-gray-100">
									<th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">#</th>
									<th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Пользователь</th>
									<th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Презентаций</th>
								</tr>
							</thead>
							<tbody>
								{stats.top_users.map((u, i) => (
									<tr key={i} className="border-b border-gray-50 last:border-0">
										<td className="px-4 py-2.5 text-gray-300 font-mono text-xs">{i + 1}</td>
										<td className="px-4 py-2.5">
											<p className="text-gray-800 font-medium leading-none">{u.name}</p>
											{u.email && u.email !== u.name && (
												<p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
											)}
										</td>
										<td className="px-4 py-2.5 text-right">
											<span className="inline-flex items-center justify-center bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full px-2.5 py-0.5">
												{u.presentations}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}

			{/* Recent activity */}
			<section>
				<h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
					Последние события
				</h2>
				{stats.recent_activity.length === 0 ? (
					<p className="text-sm text-gray-400">Событий пока нет</p>
				) : (
					<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-gray-100">
									<th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Действие</th>
									<th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Время</th>
									<th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Слайдов</th>
									<th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Когда</th>
								</tr>
							</thead>
							<tbody>
								{stats.recent_activity.map((e, i) => (
									<tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
										<td className="px-4 py-2.5 text-gray-700">{actionLabel(e.action)}</td>
										<td className="px-4 py-2.5 text-right text-gray-500">{fmtSec(e.elapsed_seconds)}</td>
										<td className="px-4 py-2.5 text-right text-gray-400">{e.slide_count ?? "—"}</td>
										<td className="px-4 py-2.5 text-right text-gray-400 whitespace-nowrap">
											{timeAgo(e.created_at)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</div>}
		</div>
	);
}
