import { BookImage, Eye, EyeOff, Layers, Sparkles, Zap } from "lucide-react";
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

function isValidEmail(value: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
	if (pwd.length === 0) return { score: 0, label: "", color: "" };
	let score = 0;
	if (pwd.length >= 8) score++;
	if (pwd.length >= 12) score++;
	if (/[A-Z]/.test(pwd)) score++;
	if (/[0-9]/.test(pwd)) score++;
	if (/[^A-Za-z0-9]/.test(pwd)) score++;

	if (score <= 1) return { score: 1, label: "Слабый", color: "bg-red-400" };
	if (score <= 2) return { score: 2, label: "Средний", color: "bg-yellow-400" };
	if (score <= 3) return { score: 3, label: "Хороший", color: "bg-blue-400" };
	return { score: 4, label: "Надёжный", color: "bg-green-500" };
}

export default function Register() {
	const navigate = useNavigate();
	const setAuth = useAuthStore((s) => s.setAuth);

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [passwordTouched, setPasswordTouched] = useState(false);

	const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string }>({});

	const strength = passwordStrength(password);

	function validateField(field: "email" | "password" | "name", value: string) {
		if (field === "email") {
			if (!value) return "Введите email";
			if (!isValidEmail(value)) return "Некорректный формат email";
			return undefined;
		}
		if (field === "password") {
			if (!value) return "Введите пароль";
			if (value.length < 8) return "Минимум 8 символов";
			if (!/[A-Za-z]/.test(value)) return "Пароль должен содержать хотя бы одну букву";
			if (!/[0-9]/.test(value)) return "Пароль должен содержать хотя бы одну цифру";
			return undefined;
		}
		if (field === "name") {
			if (value.length > 100) return "Имя не должно превышать 100 символов";
			return undefined;
		}
	}

	function handleBlur(field: "email" | "password" | "name") {
		const value = field === "email" ? email : field === "password" ? password : name;
		const error = validateField(field, value);
		setErrors((prev) => ({ ...prev, [field]: error }));
		if (field === "password") setPasswordTouched(true);
	}

	function handleChange(field: "email" | "password" | "name", value: string) {
		if (field === "email") setEmail(value);
		else if (field === "password") setPassword(value);
		else setName(value);
		if (errors[field]) {
			setErrors((prev) => ({ ...prev, [field]: undefined }));
		}
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		const emailErr = validateField("email", email);
		const passwordErr = validateField("password", password);
		const nameErr = validateField("name", name);
		if (emailErr || passwordErr || nameErr) {
			setErrors({ email: emailErr, password: passwordErr, name: nameErr });
			setPasswordTouched(true);
			return;
		}

		setLoading(true);
		try {
			const res = await authApi.register(email, password, name || undefined);
			setAuth(res.user, res.access_token, res.refresh_token);
			navigate("/dashboard", { replace: true });
		} catch (err: any) {
			const detail = err.response?.data?.detail ?? "Ошибка регистрации";
			if (err.response?.status === 409) {
				setErrors({ email: "Этот email уже зарегистрирован" });
			} else if (err.response?.status === 429) {
				toast.error("Слишком много попыток. Подождите минуту.");
			} else {
				toast.error(detail);
			}
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex">
			{/* Left — brand panel */}
			<div className="hidden lg:flex w-[420px] shrink-0 flex-col bg-sidebar p-10">
				<div className="flex items-center gap-2.5 mb-auto">
					<div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-md">
						<Layers className="w-5 h-5 text-white" />
					</div>
					<span className="text-white font-bold text-lg tracking-tight">SLIDEX</span>
				</div>

				<div className="mb-auto">
					<h2 className="text-3xl font-bold text-white leading-tight mb-4">
						Начните бесплатно
						<br />
						<span className="text-gradient">прямо сейчас</span>
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
						<h1 className="text-xl font-bold text-slate-900 mb-1">Создать аккаунт</h1>
						<p className="text-sm text-slate-500 mb-6">Начните работу с SLIDEX бесплатно</p>

						<form onSubmit={handleSubmit} className="space-y-4" noValidate>
							{/* Name */}
							<div>
								<label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
									Имя <span className="text-slate-400 normal-case font-normal">(необязательно)</span>
								</label>
								<input
									type="text"
									autoComplete="name"
									value={name}
									onChange={(e) => handleChange("name", e.target.value)}
									onBlur={() => handleBlur("name")}
									placeholder="Иван Иванов"
									className={cn(
										"w-full px-4 py-2.5 rounded-xl border text-sm text-slate-800",
										"placeholder-slate-400 focus:outline-none focus:ring-2 transition-shadow",
										errors.name
											? "border-red-400 focus:ring-red-200 focus:border-red-400"
											: "border-slate-200 focus:ring-brand-300 focus:border-brand-400"
									)}
								/>
								{errors.name && (
									<p className="mt-1.5 text-xs text-red-500">{errors.name}</p>
								)}
							</div>

							{/* Email */}
							<div>
								<label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
									Email
								</label>
								<input
									type="email"
									autoComplete="email"
									value={email}
									onChange={(e) => handleChange("email", e.target.value)}
									onBlur={() => handleBlur("email")}
									placeholder="you@company.com"
									className={cn(
										"w-full px-4 py-2.5 rounded-xl border text-sm text-slate-800",
										"placeholder-slate-400 focus:outline-none focus:ring-2 transition-shadow",
										errors.email
											? "border-red-400 focus:ring-red-200 focus:border-red-400"
											: "border-slate-200 focus:ring-brand-300 focus:border-brand-400 hover:shadow-glow-sm"
									)}
								/>
								{errors.email && (
									<p className="mt-1.5 text-xs text-red-500">{errors.email}</p>
								)}
							</div>

							{/* Password */}
							<div>
								<label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
									Пароль
								</label>
								<div className="relative">
									<input
										type={showPassword ? "text" : "password"}
										autoComplete="new-password"
										value={password}
										onChange={(e) => handleChange("password", e.target.value)}
										onBlur={() => handleBlur("password")}
										placeholder="Минимум 8 символов"
										className={cn(
											"w-full px-4 py-2.5 pr-11 rounded-xl border text-sm text-slate-800",
											"placeholder-slate-400 focus:outline-none focus:ring-2 transition-shadow",
											errors.password
												? "border-red-400 focus:ring-red-200 focus:border-red-400"
												: "border-slate-200 focus:ring-brand-300 focus:border-brand-400 hover:shadow-glow-sm"
										)}
									/>
									<button
										type="button"
										tabIndex={-1}
										onClick={() => setShowPassword((v) => !v)}
										className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
									>
										{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
									</button>
								</div>

								{/* Strength bar */}
								{passwordTouched && password.length > 0 && (
									<div className="mt-2">
										<div className="flex gap-1 mb-1">
											{[1, 2, 3, 4].map((i) => (
												<div
													key={i}
													className={cn(
														"h-1 flex-1 rounded-full transition-colors",
														strength.score >= i ? strength.color : "bg-slate-200"
													)}
												/>
											))}
										</div>
										<p className={cn(
											"text-xs",
											strength.score <= 1 ? "text-red-500" :
											strength.score <= 2 ? "text-yellow-600" :
											strength.score <= 3 ? "text-blue-500" : "text-green-600"
										)}>
											{strength.label}
										</p>
									</div>
								)}

								{errors.password && (
									<p className="mt-1.5 text-xs text-red-500">{errors.password}</p>
								)}
							</div>

							<button
								type="submit"
								disabled={loading}
								className={cn(
									"w-full py-2.5 bg-gradient-brand text-white rounded-xl text-sm font-semibold",
									"hover:opacity-90 disabled:opacity-50 transition-all shadow-sm hover:shadow-md"
								)}
							>
								{loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
							</button>
						</form>

						<p className="mt-5 text-center text-sm text-slate-500">
							Уже есть аккаунт?{" "}
							<Link
								to="/login"
								className="text-brand-600 font-semibold hover:text-brand-700 transition-colors"
							>
								Войти
							</Link>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
