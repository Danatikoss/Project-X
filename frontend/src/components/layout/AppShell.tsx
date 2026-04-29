import {
	ArrowRight,
	BarChart2,
	BookImage,
	Building2,
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
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { authApi } from "../../api/client";
import { WelcomeModal } from "../onboarding/WelcomeModal";
import { useAuthStore } from "../../store/auth";
import { cn } from "../../utils/cn";
import { IndexingBell } from "./IndexingBell";
import { FeedbackWidget } from "../common/FeedbackWidget";

// ─── Nav config ───────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
	{ to: "/dashboard", icon: LayoutDashboard, label: "Главная" },
	{ to: "/generate", icon: Sparkles, label: "Генерация" },
	{ to: "/library", icon: BookImage, label: "Библиотека" },
	{ to: "/media", icon: Film, label: "Медиа" },
];

const SECONDARY_NAV: { to: string; icon: React.ElementType; label: string }[] = [];


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
					{user?.is_admin && (
						<>
							<div className="my-1 border-t border-gray-100" />
							<button
								onClick={() => { setOpen(false); navigate("/org-profile"); }}
								className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
							>
								<Building2 className="w-3.5 h-3.5 text-gray-400" />
								Организация
							</button>
							<button
								onClick={() => { setOpen(false); navigate("/admin"); }}
								className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
							>
								<BarChart2 className="w-3.5 h-3.5 text-gray-400" />
								Админ
							</button>
							<button
								onClick={() => { setOpen(false); navigate("/library/upload"); }}
								className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
							>
								<Upload className="w-3.5 h-3.5 text-gray-400" />
								Загрузить
							</button>
						</>
					)}
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
		gradient: "from-orange-400 to-rose-500",
		bg: "bg-orange-50",
		border: "border-orange-100",
		num: "01",
		title: "Загрузите слайды",
		desc: "Загрузите PPTX или PDF. AI проиндексирует каждый слайд — распознает содержимое, назначит теги и создаст эмбеддинг для поиска.",
		link: "/library/upload",
		cta: "Загрузить",
	},
	{
		icon: BookImage,
		gradient: "from-sky-400 to-blue-600",
		bg: "bg-sky-50",
		border: "border-sky-100",
		num: "02",
		title: "Создайте шаблон",
		desc: "Отберите нужные слайды из библиотеки и сохраните как шаблон. Один клик по шаблону — и AI соберёт новую презентацию.",
		link: "/templates/new",
		cta: "Создать шаблон",
	},
	{
		icon: Wand2,
		gradient: "from-violet-500 to-purple-700",
		bg: "bg-violet-50",
		border: "border-violet-100",
		num: "03",
		title: "Генерируйте с AI",
		desc: "Опишите тему или загрузите документ. AI подберёт шаблоны из каталога, заполнит все слоты вашим контентом и сформирует план.",
		link: "/generate",
		cta: "Генерация",
	},
	{
		icon: Sparkles,
		gradient: "from-emerald-400 to-teal-600",
		bg: "bg-emerald-50",
		border: "border-emerald-100",
		num: "04",
		title: "Редактируйте и скачайте",
		desc: "В редакторе сборки можно менять порядок слайдов, добавлять слайды вручную и скачать готовую презентацию в PPTX.",
		link: "/dashboard",
		cta: "Мои сборки",
	},
];

const backdropVariants = {
	hidden: { opacity: 0 },
	visible: { opacity: 1 },
};

const modalVariants = {
	hidden: { opacity: 0, y: 40, scale: 0.97 },
	visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 320, damping: 28 } },
	exit: { opacity: 0, y: 24, scale: 0.97, transition: { duration: 0.18 } },
};

const staggerContainer = {
	visible: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
};

const stepVariants = {
	hidden: { opacity: 0, x: -16 },
	visible: { opacity: 1, x: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

function HelpModal({ onClose }: { onClose: () => void }) {
	const navigate = useNavigate();
	const [active, setActive] = useState<number | null>(null);

	return (
		<motion.div
			className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
			variants={backdropVariants}
			initial="hidden"
			animate="visible"
			exit="hidden"
			transition={{ duration: 0.2 }}
			onClick={onClose}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />

			<motion.div
				className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
				variants={modalVariants}
				initial="hidden"
				animate="visible"
				exit="exit"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Gradient header */}
				<div className="relative bg-gradient-to-br from-brand-600 to-violet-700 px-6 pt-6 pb-7 shrink-0">
					{/* Decorative circles */}
					<div className="absolute -top-4 -right-4 w-24 h-24 rounded-full bg-white/5" />
					<div className="absolute top-2 right-8 w-12 h-12 rounded-full bg-white/5" />

					<button
						onClick={onClose}
						className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
					>
						<X className="w-4 h-4" />
					</button>

					<div className="flex items-center gap-3 mb-3">
						<div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
							<HelpCircle className="w-5 h-5 text-white" />
						</div>
						<div>
							<p className="text-sm font-bold text-white">Как работает SLIDEX</p>
							<p className="text-xs text-white/60">4 шага до готовой презентации</p>
						</div>
					</div>

					{/* Progress dots */}
					<div className="flex gap-1.5">
						{GUIDE_STEPS.map((_, i) => (
							<motion.div
								key={i}
								className="h-1 rounded-full bg-white/30"
								animate={{ width: active === i ? 20 : 8, backgroundColor: active === i ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)" }}
								transition={{ type: "spring", stiffness: 300, damping: 25 }}
							/>
						))}
					</div>
				</div>

				{/* Steps */}
				<motion.div
					className="px-4 py-4 space-y-2 overflow-y-auto"
					variants={staggerContainer}
					initial="hidden"
					animate="visible"
				>
					{GUIDE_STEPS.map(({ icon: Icon, gradient, bg, border, num, title, desc, link, cta }, i) => (
						<motion.div key={i} variants={stepVariants}>
							<motion.button
								className={cn(
									"w-full text-left rounded-2xl border transition-colors overflow-hidden",
									active === i ? `${bg} ${border}` : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/60"
								)}
								onClick={() => setActive(active === i ? null : i)}
								whileHover={{ scale: 1.01 }}
								whileTap={{ scale: 0.99 }}
								transition={{ type: "spring", stiffness: 400, damping: 25 }}
							>
								<div className="flex items-center gap-3.5 px-4 py-3.5">
									{/* Icon */}
									<div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 shadow-sm`}>
										<Icon className="w-4 h-4 text-white" />
									</div>

									{/* Title + num */}
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-bold text-slate-300 tabular-nums">{num}</span>
											<p className="text-sm font-semibold text-slate-800">{title}</p>
										</div>
									</div>

									{/* Chevron */}
									<motion.div
										animate={{ rotate: active === i ? 180 : 0 }}
										transition={{ type: "spring", stiffness: 300, damping: 22 }}
										className="text-slate-300 shrink-0"
									>
										<ChevronDown className="w-4 h-4" />
									</motion.div>
								</div>

								{/* Expandable content */}
								<AnimatePresence initial={false}>
									{active === i && (
										<motion.div
											initial={{ height: 0, opacity: 0 }}
											animate={{ height: "auto", opacity: 1 }}
											exit={{ height: 0, opacity: 0 }}
											transition={{ type: "spring", stiffness: 300, damping: 28 }}
										>
											<div className="px-4 pb-4 pt-0">
												<p className="text-xs text-slate-500 leading-relaxed mb-3">{desc}</p>
												<motion.button
													onClick={(e) => {
														e.stopPropagation();
														onClose();
														navigate(link);
													}}
													className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r ${gradient} text-white text-xs font-semibold shadow-sm`}
													whileHover={{ scale: 1.03, opacity: 0.92 }}
													whileTap={{ scale: 0.97 }}
												>
													{cta}
													<ArrowRight className="w-3.5 h-3.5" />
												</motion.button>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</motion.button>
						</motion.div>
					))}
				</motion.div>

				{/* Footer */}
				<div className="px-4 pb-5 shrink-0">
					<motion.div
						className="flex items-start gap-2.5 bg-indigo-50 rounded-2xl px-4 py-3"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.45 }}
					>
						<Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
						<p className="text-[11px] text-indigo-600 leading-relaxed">
							<span className="font-semibold">Совет:</span> начните с загрузки хотя бы одной
							презентации — после индексации AI сможет подобрать слайды под любой запрос.
						</p>
					</motion.div>
				</div>
			</motion.div>
		</motion.div>
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

	const allNavItems = [...PRIMARY_NAV, ...SECONDARY_NAV];

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

			<WelcomeModal />
			<FeedbackWidget />

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
