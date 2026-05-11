import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowDownToLine,
	Bug,
	Building2,
	ChevronDown,
	Clock,
	Copy,
	Eye,
	EyeOff,
	KeyRound,
	LayoutTemplate,
	Lightbulb,
	Link2,
	MessageCircle,
	MessageSquare,
	Plus,
	RefreshCw,
	Repeat2,
	ShieldCheck,
	ShieldOff,
	Sparkles,
	Trash2,
	TrendingUp,
	UserCheck,
	UserX,
	Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { adminApi, feedbackApi, templatesApi, type AdminStats } from "../api/client";
import { useAuthStore } from "../store/auth";
import type { AdminUser, AssemblyTemplate, Company, InviteToken } from "../types";
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

function UsersTab({ companyId }: { companyId?: number | null }) {
	const queryClient = useQueryClient();
	const [tempPasswords, setTempPasswords] = useState<Record<number, string>>({});

	const { data: users, isLoading } = useQuery<AdminUser[]>({
		queryKey: ["admin-users", companyId],
		queryFn: () => adminApi.listUsers(companyId),
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
						<th className="text-center px-3 py-3 text-xs font-semibold text-gray-400">Компания</th>
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
								<span className="text-xs text-gray-500">{u.company_name ?? "—"}</span>
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
									<button
										onClick={() => resetMutation.mutate(u.id)}
										disabled={resetMutation.isPending}
										title="Сбросить пароль"
										className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
									>
										<KeyRound className="w-4 h-4" />
									</button>
									<button
										onClick={() => patchMutation.mutate({ id: u.id, data: { is_admin: !u.is_admin } })}
										disabled={patchMutation.isPending}
										title={u.is_admin ? "Снять права админа" : "Сделать админом"}
										className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
									>
										{u.is_admin ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
									</button>
									<button
										onClick={() => patchMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })}
										disabled={patchMutation.isPending}
										title={u.is_active ? "Заблокировать" : "Разблокировать"}
										className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
									>
										{u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
									</button>
								</div>
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

// ─── Companies Tab ────────────────────────────────────────────────────────────

function CompaniesTab() {
	const queryClient = useQueryClient();
	const [newCompanyName, setNewCompanyName] = useState("");
	const [newCompanySlug, setNewCompanySlug] = useState("");
	const [showNewCompany, setShowNewCompany] = useState(false);
	const [selectedCompanyForInvite, setSelectedCompanyForInvite] = useState<number | null>(null);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteNote, setInviteNote] = useState("");
	const [showInviteForm, setShowInviteForm] = useState(false);

	const { data: companies = [], isLoading: companiesLoading } = useQuery<Company[]>({
		queryKey: ["admin-companies"],
		queryFn: adminApi.listCompanies,
	});

	const { data: invites = [], isLoading: invitesLoading } = useQuery<InviteToken[]>({
		queryKey: ["admin-invites"],
		queryFn: () => adminApi.listInvites(),
	});

	const createCompanyMutation = useMutation({
		mutationFn: adminApi.createCompany,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
			setNewCompanyName("");
			setNewCompanySlug("");
			setShowNewCompany(false);
			toast.success("Компания создана");
		},
		onError: (err: any) => toast.error(err.response?.data?.detail ?? "Ошибка"),
	});

	const createInviteMutation = useMutation({
		mutationFn: adminApi.createInvite,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-invites"] });
			setInviteEmail("");
			setInviteNote("");
			setShowInviteForm(false);
			toast.success("Приглашение создано");
		},
		onError: (err: any) => toast.error(err.response?.data?.detail ?? "Ошибка"),
	});

	const deleteInviteMutation = useMutation({
		mutationFn: adminApi.deleteInvite,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-invites"] }),
		onError: () => toast.error("Не удалось удалить приглашение"),
	});

	function copyInviteLink(token: string) {
		const url = `${window.location.origin}/register?token=${token}`;
		navigator.clipboard.writeText(url);
		toast.success("Ссылка скопирована");
	}

	const activeInvites = invites.filter((i) => !i.used_at && new Date(i.expires_at) > new Date());
	const usedInvites = invites.filter((i) => i.used_at);

	return (
		<div className="space-y-6">
			{/* Companies list */}
			<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
				<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
					<p className="text-sm font-semibold text-gray-700">Компании</p>
					<button
						onClick={() => setShowNewCompany((v) => !v)}
						className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
					>
						<Plus className="w-3.5 h-3.5" />
						Добавить
					</button>
				</div>

				{showNewCompany && (
					<div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
						<div className="flex gap-2">
							<input
								type="text"
								placeholder="Название компании"
								value={newCompanyName}
								onChange={(e) => setNewCompanyName(e.target.value)}
								className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
							/>
							<input
								type="text"
								placeholder="slug (латиница)"
								value={newCompanySlug}
								onChange={(e) => setNewCompanySlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
								className="w-32 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
							/>
							<button
								onClick={() => createCompanyMutation.mutate({ name: newCompanyName, slug: newCompanySlug })}
								disabled={!newCompanyName || !newCompanySlug || createCompanyMutation.isPending}
								className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
							>
								Создать
							</button>
						</div>
					</div>
				)}

				{companiesLoading ? (
					<div className="py-8 text-center text-sm text-gray-400">Загрузка…</div>
				) : companies.length === 0 ? (
					<div className="py-8 text-center text-sm text-gray-400">Компаний пока нет</div>
				) : (
					<table className="w-full text-sm">
						<thead>
							<tr className="bg-gray-50 border-b border-gray-100">
								<th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400">Название</th>
								<th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400">Slug</th>
								<th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-400">Пользователей</th>
								<th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-400">Статус</th>
								<th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400">Приглашение</th>
							</tr>
						</thead>
						<tbody>
							{companies.map((c) => (
								<tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
									<td className="px-5 py-3 font-medium text-gray-800">{c.name}</td>
									<td className="px-3 py-3 font-mono text-xs text-gray-400">{c.slug}</td>
									<td className="px-3 py-3 text-center">
										<span className="inline-flex items-center justify-center bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full px-2.5 py-0.5">
											{c.user_count}
										</span>
									</td>
									<td className="px-3 py-3 text-center">
										<span className={cn(
											"text-xs px-2 py-0.5 rounded-full font-medium",
											c.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-500"
										)}>
											{c.is_active ? "Активна" : "Отключена"}
										</span>
									</td>
									<td className="px-5 py-3 text-right">
										<button
											onClick={() => {
												setSelectedCompanyForInvite(c.id);
												setShowInviteForm(true);
											}}
											className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium ml-auto"
										>
											<Link2 className="w-3.5 h-3.5" />
											Создать инвайт
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{/* Invite creation form */}
			{showInviteForm && selectedCompanyForInvite !== null && (
				<div className="bg-white border border-brand-200 rounded-2xl p-5 space-y-3">
					<div className="flex items-center justify-between">
						<p className="text-sm font-semibold text-gray-700">
							Новое приглашение — {companies.find((c) => c.id === selectedCompanyForInvite)?.name}
						</p>
						<button onClick={() => setShowInviteForm(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
					</div>
					<div className="flex gap-2">
						<input
							type="email"
							placeholder="Email (необязательно)"
							value={inviteEmail}
							onChange={(e) => setInviteEmail(e.target.value)}
							className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
						/>
						<input
							type="text"
							placeholder="Заметка"
							value={inviteNote}
							onChange={(e) => setInviteNote(e.target.value)}
							className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
						/>
						<button
							onClick={() => createInviteMutation.mutate({
								company_id: selectedCompanyForInvite,
								email: inviteEmail || undefined,
								note: inviteNote || undefined,
								days: 30,
							})}
							disabled={createInviteMutation.isPending}
							className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
						>
							Создать
						</button>
					</div>
					<p className="text-xs text-gray-400">Если указать email — ссылка будет привязана к конкретному адресу</p>
				</div>
			)}

			{/* Active invites */}
			<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
				<div className="px-5 py-4 border-b border-gray-100">
					<p className="text-sm font-semibold text-gray-700">
						Активные приглашения
						{activeInvites.length > 0 && (
							<span className="ml-2 text-xs bg-brand-50 text-brand-600 px-2 py-0.5 rounded-full font-medium">
								{activeInvites.length}
							</span>
						)}
					</p>
				</div>
				{invitesLoading ? (
					<div className="py-8 text-center text-sm text-gray-400">Загрузка…</div>
				) : activeInvites.length === 0 ? (
					<div className="py-8 text-center text-sm text-gray-400">Нет активных приглашений</div>
				) : (
					<div className="divide-y divide-gray-50">
						{activeInvites.map((inv) => (
							<div key={inv.id} className="px-5 py-3 flex items-center gap-3">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-xs font-medium text-gray-700">{inv.company_name}</span>
										{inv.email && (
											<span className="text-xs text-gray-400">→ {inv.email}</span>
										)}
										{inv.note && (
											<span className="text-xs text-gray-300 italic">{inv.note}</span>
										)}
									</div>
									<p className="text-[11px] text-gray-300 mt-0.5">
										до {new Date(inv.expires_at).toLocaleDateString("ru-RU")}
									</p>
								</div>
								<button
									onClick={() => copyInviteLink(inv.token)}
									title="Скопировать ссылку"
									className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
								>
									<Copy className="w-4 h-4" />
								</button>
								<button
									onClick={() => deleteInviteMutation.mutate(inv.id)}
									disabled={deleteInviteMutation.isPending}
									title="Удалить приглашение"
									className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
								>
									<Trash2 className="w-4 h-4" />
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Used invites */}
			{usedInvites.length > 0 && (
				<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
					<div className="px-5 py-4 border-b border-gray-100">
						<p className="text-sm font-semibold text-gray-700">Использованные приглашения</p>
					</div>
					<div className="divide-y divide-gray-50">
						{usedInvites.map((inv) => (
							<div key={inv.id} className="px-5 py-3 flex items-center gap-3 opacity-60">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-xs font-medium text-gray-700">{inv.company_name}</span>
										{inv.used_by_name && (
											<span className="text-xs text-gray-400">→ {inv.used_by_name}</span>
										)}
									</div>
									<p className="text-[11px] text-gray-300 mt-0.5">
										использовано {inv.used_at ? new Date(inv.used_at).toLocaleDateString("ru-RU") : "—"}
									</p>
								</div>
								<span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">использовано</span>
							</div>
						))}
					</div>
				</div>
			)}
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

// ─── Security Tab ─────────────────────────────────────────────────────────────

interface SecurityData {
	events: { id: number; type: string; ip: string | null; email: string | null; detail: string | null; created_at: string }[];
	top_ips: { ip: string; count: number }[];
	top_emails: { email: string; count: number }[];
	fail2ban_banned: { ip: string; banned_at: string }[];
	total_failed_logins: number;
}

function SecurityTab() {
	const { data, isLoading, refetch, isFetching } = useQuery<SecurityData>({
		queryKey: ["admin-security"],
		queryFn: async () => {
			const res = await fetch("/api/admin/security", {
				headers: { Authorization: `Bearer ${(await import("../store/auth")).useAuthStore.getState().accessToken}` },
			});
			return res.json();
		},
		refetchInterval: 30_000,
	});

	if (isLoading) return <div className="py-16 text-center text-sm text-gray-400">Загрузка...</div>;
	if (!data) return null;

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
				<div className="bg-white border border-gray-200 rounded-2xl p-4">
					<p className="text-xs text-gray-400 mb-1">Попыток взлома</p>
					<p className="text-2xl font-bold text-red-500">{data.total_failed_logins}</p>
					<p className="text-xs text-gray-400 mt-1">всего в базе</p>
				</div>
				<div className="bg-white border border-gray-200 rounded-2xl p-4">
					<p className="text-xs text-gray-400 mb-1">Заблокировано IP</p>
					<p className="text-2xl font-bold text-orange-500">{data.fail2ban_banned.length}</p>
					<p className="text-xs text-gray-400 mt-1">fail2ban сейчас</p>
				</div>
				<div className="bg-white border border-gray-200 rounded-2xl p-4">
					<p className="text-xs text-gray-400 mb-1">Уник. атак. IP</p>
					<p className="text-2xl font-bold text-amber-500">{data.top_ips.length}</p>
					<p className="text-xs text-gray-400 mt-1">уникальных</p>
				</div>
				<div className="bg-white border border-gray-200 rounded-2xl p-4">
					<p className="text-xs text-gray-400 mb-1">Целевых email</p>
					<p className="text-2xl font-bold text-slate-700">{data.top_emails.length}</p>
					<p className="text-xs text-gray-400 mt-1">атакованных</p>
				</div>
			</div>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div className="bg-white border border-gray-200 rounded-2xl p-5">
					<p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Топ атакующих IP</p>
					{data.top_ips.length === 0 ? (
						<p className="text-sm text-gray-400">Атак не зафиксировано</p>
					) : (
						<div className="space-y-2">
							{data.top_ips.map((r) => (
								<div key={r.ip} className="flex items-center justify-between">
									<span className="text-sm font-mono text-gray-700">{r.ip}</span>
									<span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
										{r.count} попыток
									</span>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="bg-white border border-gray-200 rounded-2xl p-5">
					<p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Заблокированы fail2ban</p>
					{data.fail2ban_banned.length === 0 ? (
						<p className="text-sm text-gray-400">Нет активных банов</p>
					) : (
						<div className="space-y-2 max-h-48 overflow-y-auto">
							{data.fail2ban_banned.map((b) => (
								<div key={b.ip} className="flex items-center justify-between">
									<span className="text-sm font-mono text-gray-700">{b.ip}</span>
									<span className="text-xs text-gray-400">{b.banned_at.slice(0, 16)}</span>
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			<div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
				<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
					<p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Последние попытки входа</p>
					<button onClick={() => refetch()} disabled={isFetching} className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
						<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
					</button>
				</div>
				{data.events.length === 0 ? (
					<p className="text-sm text-gray-400 px-5 py-8 text-center">Событий нет</p>
				) : (
					<table className="w-full text-sm">
						<thead>
							<tr className="bg-gray-50 border-b border-gray-100">
								<th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-400">Email</th>
								<th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400">IP</th>
								<th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-400">Причина</th>
								<th className="text-right px-5 py-2.5 text-xs font-semibold text-gray-400">Время</th>
							</tr>
						</thead>
						<tbody>
							{data.events.map((e) => (
								<tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-red-50/30">
									<td className="px-5 py-2.5 font-mono text-xs text-gray-700">{e.email ?? "—"}</td>
									<td className="px-3 py-2.5 font-mono text-xs text-gray-500">{e.ip ?? "—"}</td>
									<td className="px-3 py-2.5">
										<span className={cn(
											"text-xs px-2 py-0.5 rounded-full font-medium",
											e.detail === "wrong_credentials" ? "bg-red-50 text-red-500" : "bg-orange-50 text-orange-500"
										)}>
											{e.detail === "wrong_credentials" ? "Неверный пароль" : e.detail === "account_disabled" ? "Аккаунт отключён" : e.detail ?? "—"}
										</span>
									</td>
									<td className="px-5 py-2.5 text-right text-xs text-gray-400 whitespace-nowrap">
										{new Date(e.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
	const queryClient = useQueryClient();
	const { data: templates = [], isLoading } = useQuery<AssemblyTemplate[]>({
		queryKey: ["admin-templates"],
		queryFn: templatesApi.list,
	});

	const toggleMutation = useMutation({
		mutationFn: ({ id, is_public }: { id: number; is_public: boolean }) =>
			templatesApi.setVisibility(id, is_public),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-templates"] }),
		onError: () => toast.error("Не удалось изменить видимость"),
	});

	if (isLoading) return <div className="py-16 text-center text-sm text-gray-400">Загрузка...</div>;
	if (!templates.length) return <div className="py-16 text-center text-sm text-gray-400">Шаблонов пока нет</div>;

	return (
		<div className="space-y-2">
			{templates.map((t) => (
				<div key={t.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
					<div className="flex -space-x-2 shrink-0">
						{t.slides_preview.slice(0, 3).map((s) => (
							<img
								key={s.id}
								src={s.thumbnail_url}
								className="w-8 h-6 rounded object-cover border border-white shadow-sm"
								alt=""
							/>
						))}
						{t.slides_preview.length === 0 && (
							<div className="w-8 h-6 rounded bg-gray-100 border border-white" />
						)}
					</div>

					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
						<p className="text-[11px] text-gray-400 truncate">
							{t.owner_name ?? "—"} · {t.slide_ids.length} слайдов
						</p>
					</div>

					{t.is_public && (
						<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">
							Публичный
						</span>
					)}

					<button
						onClick={() => toggleMutation.mutate({ id: t.id, is_public: !t.is_public })}
						disabled={toggleMutation.isPending}
						title={t.is_public ? "Скрыть от пользователей" : "Показать всем пользователям"}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shrink-0",
							t.is_public
								? "border-gray-200 text-gray-500 hover:border-red-200 hover:text-red-500 hover:bg-red-50"
								: "border-gray-200 text-gray-500 hover:border-emerald-200 hover:text-emerald-600 hover:bg-emerald-50"
						)}
					>
						{t.is_public ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
						{t.is_public ? "Скрыть" : "Открыть"}
					</button>
				</div>
			))}
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Admin() {
	const [tab, setTab] = useState<"stats" | "users" | "companies" | "feedback" | "templates" | "security">("stats");
	const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

	const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin());
	const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
	const setActiveCompany = useAuthStore((s) => s.setActiveCompany);

	const { data: companies = [] } = useQuery<Company[]>({
		queryKey: ["admin-companies"],
		queryFn: adminApi.listCompanies,
		enabled: isSuperAdmin,
	});

	const activeCompany = companies.find((c) => c.id === activeCompanyId);

	const { data: stats, isLoading, isError, refetch, isFetching } = useQuery<AdminStats>({
		queryKey: ["admin-stats", activeCompanyId],
		queryFn: () => adminApi.getStats(isSuperAdmin ? activeCompanyId : undefined),
		refetchInterval: 30_000,
	});

	return (
		<div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
			{/* Super-admin company switcher */}
			{isSuperAdmin && (
				<div className="relative">
					<button
						onClick={() => setShowCompanyDropdown((v) => !v)}
						className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-colors shadow-sm"
					>
						<Building2 className="w-4 h-4 text-gray-400" />
						{activeCompany ? activeCompany.name : "Все компании"}
						<ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
					</button>

					{showCompanyDropdown && (
						<div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-20 min-w-48 overflow-hidden">
							<button
								onClick={() => { setActiveCompany(null); setShowCompanyDropdown(false); }}
								className={cn(
									"w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors",
									!activeCompanyId ? "font-semibold text-brand-600" : "text-gray-700"
								)}
							>
								Все компании
							</button>
							{companies.map((c) => (
								<button
									key={c.id}
									onClick={() => { setActiveCompany(c.id); setShowCompanyDropdown(false); }}
									className={cn(
										"w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-t border-gray-50",
										activeCompanyId === c.id ? "font-semibold text-brand-600" : "text-gray-700"
									)}
								>
									{c.name}
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* Header + tabs */}
			<div className="flex items-center justify-between flex-wrap gap-2">
				<div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
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
					{isSuperAdmin && (
						<button
							onClick={() => setTab("companies")}
							className={cn(
								"flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
								tab === "companies" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
							)}
						>
							<Building2 className="w-4 h-4" /> Компании
						</button>
					)}
					<button
						onClick={() => setTab("feedback")}
						className={cn(
							"flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
							tab === "feedback" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
						)}
					>
						<MessageCircle className="w-4 h-4" /> Отзывы
					</button>
					<button
						onClick={() => setTab("templates")}
						className={cn(
							"flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
							tab === "templates" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
						)}
					>
						<LayoutTemplate className="w-4 h-4" /> Шаблоны
					</button>
					<button
						onClick={() => setTab("security")}
						className={cn(
							"flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
							tab === "security" ? "bg-white text-red-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
						)}
					>
						<ShieldCheck className="w-4 h-4" /> Безопасность
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
			{tab === "users" && <UsersTab companyId={isSuperAdmin ? activeCompanyId : undefined} />}

			{/* Companies tab */}
			{tab === "companies" && <CompaniesTab />}

			{/* Feedback tab */}
			{tab === "feedback" && <FeedbackTab />}

			{/* Templates tab */}
			{tab === "templates" && <TemplatesTab />}

			{/* Security tab */}
			{tab === "security" && <SecurityTab />}

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
