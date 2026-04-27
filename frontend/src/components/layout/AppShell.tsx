import {
	ArrowRight,
	BarChart2,
	BookImage,
	ChevronDown,
	Film,
	HelpCircle,
	Layers,
	LayoutDashboard,
	LogOut,
	Sparkles,
	Upload,
	User,
	Wand2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../../api/client";
import { useAuthStore } from "../../store/auth";
import { cn } from "../../utils/cn";
import { IndexingBell } from "./IndexingBell";

// ─── Nav config ───────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
	{ to: "/dashboard", icon: LayoutDashboard, label: "Главная" },
	{ to: "/generate", icon: Sparkles, label: "Генерация" },
	{ to: "/library", icon: BookImage, label: "Библиотека" },
	{ to: "/library/upload", icon: Upload, label: "Загрузить" },
	{ to: "/media", icon: Film, label: "Медиа" },
];

const SECONDARY_NAV: { to: string; icon: React.ElementType; label: string }[] = [];

const ADMIN_NAV: { to: string; icon: React.ElementType; label: string }[] = [
	{ to: "/admin", icon: BarChart2, label: "Статистика" },
];

// ─── Nav link ─────────────────────────────────────────────────────────────────

function TopNavLink({
	to,
	icon: Icon,
	label,
}: {
	to: string;
	icon: React.ElementType;
	label: string;
}) {
	return (
		<NavLink
			to={to}
			className={({ isActive }) =>
				cn(
					"relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap select-none",
					isActive
						? "text-brand-700 bg-brand-50"
						: "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
				)
			}
		>
			{({ isActive }) => (
				<>
					<Icon className={cn("w-3.5 h-3.5 shrink-0", isActive && "text-brand-600")} />
					{label}
					{isActive && (
						<span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-brand-500" />
					)}
				</>
			)}
		</NavLink>
	);
}

// ─── User menu ────────────────────────────────────────────────────────────────

function UserMenu() {
	const user = useAuthStore((s) => s.user);
	const clearAuth = useAuthStore((s) => s.clearAuth);
	const refreshToken = useAuthStore((s) => s.refreshToken);
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	const initials = user?.name
		? user.name
				.split(" ")
				.map((w: string) => w[0])
				.join("")
				.slice(0, 2)
				.toUpperCase()
		: (user?.email?.[0]?.toUpperCase() ?? "?");

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	return (
		<div ref={ref} className="relative">
			<button
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg transition-all",
					open ? "bg-gray-100" : "hover:bg-gray-100"
				)}
			>
				<div className="w-6 h-6 rounded-full bg-gradient-brand flex items-center justify-center shrink-0">
					<span className="text-white text-[10px] font-bold leading-none">{initials}</span>
				</div>
				<span className="text-xs font-medium text-gray-700 hidden lg:block max-w-[100px] truncate">
					{user?.name || user?.email || "Профиль"}
				</span>
				<ChevronDown
					className={cn(
						"w-3 h-3 text-gray-400 transition-transform hidden lg:block",
						open && "rotate-180"
					)}
				/>
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50">
					{/* User info */}
					<div className="px-3 py-2 mb-1 border-b border-gray-100">
						<p className="text-xs font-semibold text-gray-800 truncate">{user?.name || "—"}</p>
						<p className="text-[11px] text-gray-400 truncate mt-0.5">{user?.email}</p>
					</div>
					<button
						onClick={() => {
							setOpen(false);
							navigate("/profile");
						}}
						className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
					>
						<User className="w-3.5 h-3.5 text-gray-400" />
						Мой профиль
					</button>
					<div className="my-1 border-t border-gray-100" />
					<button
						onClick={async () => {
							if (refreshToken) {
								try { await authApi.logout(refreshToken); } catch { /* ignore */ }
							}
							clearAuth();
							navigate("/login");
						}}
						className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
					>
						<LogOut className="w-3.5 h-3.5" />
						Выйти
					</button>
				</div>
			)}
		</div>
	);
}

// ─── HelpModal ────────────────────────────────────────────────────────────────

const GUIDE_STEPS = [
	{
		icon: Upload,
		color: "bg-orange-100 text-orange-600",
		title: "Загрузите слайды",
		desc: "Загрузите PPTX или PDF. AI проиндексирует каждый слайд — распознает содержимое, назначит теги и создаст эмбеддинг для поиска.",
		link: "/library/upload",
		cta: "Загрузить",
	},
	{
		icon: BookImage,
		color: "bg-sky-100 text-sky-600",
		title: "Создайте шаблон",
		desc: "Отберите нужные слайды из библиотеки и сохраните как шаблон. Один клик по шаблону — и AI соберёт новую презентацию.",
		link: "/templates/new",
		cta: "Создать шаблон",
	},
	{
		icon: Wand2,
		color: "bg-indigo-100 text-indigo-600",
		title: "Генерируйте с AI",
		desc: "Опишите тему или загрузите документ. AI подберёт шаблоны из каталога, заполнит все слоты вашим контентом и сформирует план.",
		link: "/generate",
		cta: "Генерация",
	},
	{
		icon: Sparkles,
		color: "bg-emerald-100 text-emerald-600",
		title: "Редактируйте и скачайте",
		desc: "В редакторе сборки можно менять порядок слайдов, добавлять слайды вручную и скачать готовую презентацию в PPTX.",
		link: "/dashboard",
		cta: "Мои сборки",
	},
];

function HelpModal({ onClose }: { onClose: () => void }) {
	const navigate = useNavigate();

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
					<div className="flex items-center gap-2.5">
						<div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-sm">
							<HelpCircle className="w-3.5 h-3.5 text-white" />
						</div>
						<div>
							<p className="text-sm font-bold text-gray-900">Как пользоваться SLIDEX</p>
							<p className="text-[11px] text-gray-400">Четыре шага до готовой презентации</p>
						</div>
					</div>
					<button
						onClick={onClose}
						className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				</div>

				{/* Steps */}
				<div className="px-6 py-5 space-y-3">
					{GUIDE_STEPS.map(({ icon: Icon, color, title, desc, link, cta }, i) => (
						<div
							key={i}
							className="flex gap-4 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-all"
						>
							<div
								className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}
							>
								<Icon className="w-4 h-4" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 mb-1">
									<span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
										Шаг {i + 1}
									</span>
								</div>
								<p className="text-sm font-semibold text-gray-900">{title}</p>
								<p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
							</div>
							<button
								onClick={() => {
									onClose();
									navigate(link);
								}}
								className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 shrink-0 self-center transition-colors"
							>
								{cta}
								<ArrowRight className="w-3 h-3" />
							</button>
						</div>
					))}
				</div>

				{/* Footer tip */}
				<div className="px-6 pb-5">
					<div className="bg-indigo-50 rounded-xl px-4 py-3">
						<p className="text-[11px] text-indigo-600 leading-relaxed">
							<span className="font-semibold">Совет:</span> начните с загрузки хотя бы одной
							презентации — после индексации AI сможет подобрать слайды под любой запрос.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell() {
	const location = useLocation();
	const isAssemblePage = location.pathname.startsWith("/assemble/");
	const user = useAuthStore((s) => s.user);
	const [helpOpen, setHelpOpen] = useState(false);

	const initials = user?.name
		? user.name
				.split(" ")
				.map((w: string) => w[0])
				.join("")
				.slice(0, 2)
				.toUpperCase()
		: (user?.email?.[0]?.toUpperCase() ?? "?");

	const allNavItems = [...PRIMARY_NAV, ...SECONDARY_NAV, ...(user?.is_admin ? ADMIN_NAV : [])];

	return (
		<div className="flex flex-col h-screen bg-surface overflow-hidden">
			{/* ── Top header ─────────────────────────────────────────────────────── */}
			<header className="hidden md:flex items-center shrink-0 h-[52px] px-4 bg-white border-b border-gray-200 z-20 relative">
				{/* Logo — left fixed */}
				<NavLink to="/dashboard" className="flex items-center gap-2 shrink-0 group">
					<div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
						<Layers className="w-3.5 h-3.5 text-white" />
					</div>
					<span className="font-bold text-[15px] tracking-tight text-gray-900">SLIDEX</span>
				</NavLink>

				{/* Center nav — absolutely centered */}
				<div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
					<nav className="flex items-center gap-0.5">
						{PRIMARY_NAV.map((item) => (
							<TopNavLink key={item.to} {...item} />
						))}
					</nav>

					<div className="w-px h-5 bg-gray-200 mx-2 shrink-0" />

					<nav className="flex items-center gap-0.5">
						{SECONDARY_NAV.map((item) => (
							<TopNavLink key={item.to} {...item} />
						))}
						{user?.is_admin && ADMIN_NAV.map((item) => <TopNavLink key={item.to} {...item} />)}
					</nav>
				</div>

				{/* Right side — fixed to the right */}
				<div className="flex items-center gap-1 ml-auto shrink-0">
					<button
						onClick={() => setHelpOpen(true)}
						title="Как пользоваться"
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
					>
						<HelpCircle className="w-3.5 h-3.5" />
						<span className="hidden lg:inline">Гайд</span>
					</button>
					<IndexingBell />
					<div className="w-px h-5 bg-gray-200 mx-1" />
					<UserMenu />
				</div>
			</header>

			{/* ── Main ─────────────────────────────────────────────────────────────── */}
			<main
				className={cn(
					"flex-1 overflow-auto pb-14 md:pb-0 min-h-0",
					isAssemblePage ? "overflow-hidden pb-0" : ""
				)}
			>
				<Outlet />
			</main>

			{/* ── Bottom nav — mobile ─────────────────────────────────────────────── */}
			<nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center px-1 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
				{allNavItems.slice(0, 5).map(({ to, icon: Icon, label }) => (
					<NavLink
						key={to}
						to={to}
						className={({ isActive }) =>
							cn(
								"flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg transition-colors",
								isActive ? "text-brand-600" : "text-gray-400 hover:text-gray-600"
							)
						}
					>
						<Icon className="w-5 h-5" />
						<span className="text-[9px] font-medium">{label}</span>
					</NavLink>
				))}
				<NavLink
					to="/profile"
					className={({ isActive }) =>
						cn(
							"flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-lg transition-colors",
							isActive ? "text-brand-600" : "text-gray-400 hover:text-gray-600"
						)
					}
				>
					<div className="w-5 h-5 rounded-full bg-gradient-brand flex items-center justify-center">
						<span className="text-white text-[8px] font-bold">{initials}</span>
					</div>
					<span className="text-[9px] font-medium">Профиль</span>
				</NavLink>
			</nav>

			{helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
		</div>
	);
}
