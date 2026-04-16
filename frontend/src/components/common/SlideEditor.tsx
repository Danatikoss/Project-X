/**
 * SlideEditor — Collabora Online iframe modal for editing a single slide.
 *
 * Feature flag: this component is only rendered when VITE_COLLABORA_URL is set.
 * Use isCollaboraEnabled() to check before rendering.
 */

import { AlertCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { wopiApi } from "../../api/client";
import { Spinner } from "./Spinner";

export function isCollaboraEnabled(): boolean {
	return !!import.meta.env.VITE_COLLABORA_URL;
}

interface SlideEditorProps {
	slideId: number;
	onClose: () => void;
}

export function SlideEditor({ slideId, onClose }: SlideEditorProps) {
	const [editorUrl, setEditorUrl] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setEditorUrl(null);
		setError(null);
		wopiApi
			.getEditorUrl(slideId)
			.then((data) => setEditorUrl(data.editor_url))
			.catch(() => setError("Не удалось открыть редактор. Проверьте настройки Collabora."));
	}, [slideId]);

	return (
		<div className="fixed inset-0 bg-black/60 z-50 flex flex-col">
			{/* Header */}
			<div className="flex items-center justify-between bg-white px-4 py-2.5 border-b border-gray-200 shrink-0">
				<p className="text-sm font-medium text-gray-700">Редактор слайда</p>
				<button
					onClick={onClose}
					className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
					title="Закрыть"
				>
					<X className="w-5 h-5" />
				</button>
			</div>

			{/* Editor area */}
			<div className="flex-1 bg-gray-100 overflow-hidden">
				{error ? (
					<div className="flex flex-col items-center justify-center h-full gap-3 text-red-500">
						<AlertCircle className="w-8 h-8" />
						<p className="text-sm">{error}</p>
						<button
							onClick={onClose}
							className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
						>
							Закрыть
						</button>
					</div>
				) : editorUrl ? (
					<iframe
						src={editorUrl}
						className="w-full h-full border-0"
						allow="fullscreen"
						title="Collabora Online Editor"
					/>
				) : (
					<div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
						<Spinner size="lg" />
						<p className="text-sm">Загрузка редактора…</p>
					</div>
				)}
			</div>
		</div>
	);
}
