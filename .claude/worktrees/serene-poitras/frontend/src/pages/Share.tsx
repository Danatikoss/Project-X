import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Layers } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { assemblyApi } from "../api/client";
import { SlideCard } from "../components/common/SlideCard";
import { Spinner } from "../components/common/Spinner";

export default function Share() {
	const { token } = useParams<{ token: string }>();
	const navigate = useNavigate();

	const {
		data: assembly,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["share", token],
		queryFn: () => assemblyApi.getPublic(token!),
		enabled: !!token,
		retry: false,
	});

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (isError || !assembly) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-4">
				<div className="w-12 h-12 bg-brand-900 rounded-xl flex items-center justify-center">
					<Layers className="w-6 h-6 text-white" />
				</div>
				<h1 className="text-xl font-semibold text-gray-900">Презентация не найдена</h1>
				<p className="text-sm text-gray-500">Ссылка недействительна или срок её действия истёк.</p>
				<button
					onClick={() => navigate("/")}
					className="mt-2 px-4 py-2 bg-brand-900 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors"
				>
					На главную
				</button>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Header */}
			<header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 bg-brand-900 rounded-lg flex items-center justify-center">
						<Layers className="w-4 h-4 text-white" />
					</div>
					<span className="text-sm font-semibold text-gray-900">SLIDEX</span>
				</div>
				<button
					onClick={() => navigate("/register")}
					className="flex items-center gap-2 px-4 py-2 bg-brand-900 text-white rounded-lg text-sm font-medium hover:bg-brand-800 transition-colors"
				>
					Создать свою
					<ArrowRight className="w-4 h-4" />
				</button>
			</header>

			{/* Content */}
			<main className="max-w-5xl mx-auto px-6 py-8">
				<div className="mb-6">
					<h1 className="text-2xl font-bold text-gray-900">{assembly.title}</h1>
					{assembly.prompt && (
						<p className="mt-1 text-sm text-gray-500 italic">"{assembly.prompt}"</p>
					)}
					<p className="mt-2 text-sm text-gray-400">{assembly.slides.length} слайдов</p>
				</div>

				<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
					{assembly.slides.map((slide, idx) => (
						<div key={slide.id} className="relative">
							<div className="absolute top-2 left-2 z-10 w-5 h-5 bg-black/50 rounded text-white text-[10px] flex items-center justify-center font-medium">
								{idx + 1}
							</div>
							<SlideCard slide={slide} />
						</div>
					))}
				</div>
			</main>
		</div>
	);
}
