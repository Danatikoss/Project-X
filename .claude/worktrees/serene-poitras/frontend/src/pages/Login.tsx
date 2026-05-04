import { BookImage, Layers, Sparkles, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authApi } from "../api/client";
import { useAuthStore } from "../store/auth";
import { cn } from "../utils/cn";

const features = [
	{ icon: Sparkles, text: "AI подбирает слайды под ваш запрос" },
	{ icon: BookImage, text: "Библиотека всех ваших презентаций" },
	{ icon: Zap, text: "Экспорт в PPTX за секунды" },
];

export default function Login() {
	const navigate = useNavigate();
	const setAuth = useAuthStore((s) => s.setAuth);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			const res = await authApi.login(email, password);
			setAuth(res.user, res.access_token, res.refresh_token);
			navigate("/dashboard", { replace: true });
		} catch (err: any) {
			toast.error(err.response?.data?.detail ?? "Ошибка входа");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex">
			{/* Left — brand panel */}
			<div className="hidden lg:flex w-[420px] shrink-0 flex-col bg-sidebar p-10">
				{/* Logo */}
				<div className="flex items-center gap-2.5 mb-auto">
					<div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-md">
						<Layers className="w-5 h-5 text-white" />
					</div>
					<span className="text-white font-bold text-lg tracking-tight">SLIDEX</span>
				</div>

				<div className="mb-auto">
					<h2 className="text-3xl font-bold text-white leading-tight mb-4">
						Презентации
						<br />
						<span className="text-gradient">собираются сами</span>
					</h2>
					<p className="text-slate-400 text-sm leading-relaxed mb-8">
						Загрузите слайды, опишите нужную презентацию — AI соберёт её из вашей библиотеки за
						секунды.
					</p>

					<div className="flex flex-col gap-4">
						{features.map(({ icon: Icon, text }) => (
							<div key={text} className="flex items-center gap-3">
								<div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center shrink-0">
									<Icon className="w-4 h-4 text-brand-400" />
								</div>
								<span className="text-slate-300 text-sm">{text}</span>
							</div>
						))}
					</div>
				</div>

				<p className="text-slate-600 text-xs">© 2025 SLIDEX</p>
			</div>

			{/* Right — form */}
			<div className="flex-1 flex items-center justify-center bg-surface p-6">
				<div className="w-full max-w-sm animate-slide-up">
					{/* Mobile logo */}
					<div className="flex items-center justify-center gap-2.5 mb-8 lg:hidden">
						<div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-md">
							<Layers className="w-5 h-5 text-white" />
						</div>
						<span className="text-slate-800 font-bold text-xl tracking-tight">SLIDEX</span>
					</div>

					<div className="bg-white rounded-2xl shadow-card border border-slate-200 p-8">
						<h1 className="text-xl font-bold text-slate-900 mb-1">Добро пожаловать</h1>
						<p className="text-sm text-slate-500 mb-6">Войдите в свой аккаунт SLIDEX</p>

						<form onSubmit={handleSubmit} className="space-y-4">
							<div>
								<label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
									Email
								</label>
								<input
									type="email"
									required
									autoComplete="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@company.com"
									className={cn(
										"w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800",
										"placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400",
										"transition-shadow hover:shadow-glow-sm"
									)}
								/>
							</div>

							<div>
								<label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
									Пароль
								</label>
								<input
									type="password"
									required
									autoComplete="current-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
									className={cn(
										"w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800",
										"placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400",
										"transition-shadow hover:shadow-glow-sm"
									)}
								/>
							</div>

							<button
								type="submit"
								disabled={loading}
								className={cn(
									"w-full py-2.5 bg-gradient-brand text-white rounded-xl text-sm font-semibold",
									"hover:opacity-90 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
								)}
							>
								{loading ? "Входим..." : "Войти"}
							</button>
						</form>

						<p className="mt-5 text-center text-sm text-slate-500">
							Нет аккаунта?{" "}
							<Link
								to="/register"
								className="text-brand-600 font-semibold hover:text-brand-700 transition-colors"
							>
								Зарегистрироваться
							</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
