import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ArrowLeft,
	CheckCircle,
	FileText,
	FileType2,
	Trash2,
	Upload as UploadIcon,
	X,
	XCircle,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { libraryApi } from "../api/client";
import { Spinner } from "../components/common/Spinner";
import { type UploadEntry, useIndexingStore } from "../store/indexing";
import type { SourcePresentation } from "../types";
import { cn } from "../utils/cn";

function FileRow({ entry, onRemove }: { entry: UploadEntry; onRemove: () => void }) {
	const job = useIndexingStore((s) => s.jobs.find((j) => j.ws_token === entry.wsToken));
	const isDone = entry.status === "done";
	const isError = entry.status === "error";

	return (
		<div className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-white shadow-card">
			<div
				className={cn(
					"w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
					isDone ? "bg-emerald-100" : isError ? "bg-red-100" : "bg-brand-100"
				)}
			>
				{isDone ? (
					<CheckCircle className="w-4 h-4 text-emerald-600" />
				) : isError ? (
					<XCircle className="w-4 h-4 text-red-500" />
				) : entry.status === "queued" ? (
					<FileText className="w-4 h-4 text-slate-400" />
				) : (
					<Spinner size="sm" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-semibold text-slate-800 truncate">{entry.filename}</p>
				<p className="text-xs text-slate-400">
					{(entry.fileSize / 1024 / 1024).toFixed(1)} МБ
					{entry.status === "queued" && " · В очереди"}
					{entry.status === "uploading" && " · Загрузка..."}
					{isDone && " · Готово"}
					{isError && ` · Ошибка: ${entry.error}`}
				</p>
				{entry.status === "indexing" && job && job.progress > 0 && (
					<div className="mt-1.5">
						<div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
							<div
								className="h-full rounded-full transition-all duration-300 bg-gradient-brand"
								style={{ width: `${Math.round(job.progress * 100)}%` }}
							/>
						</div>
						<p className="text-xs text-slate-400 mt-1">{job.message}</p>
					</div>
				)}
			</div>
			{(entry.status === "queued" || isDone || isError) && (
				<button
					onClick={onRemove}
					className="p-1 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
				>
					<X className="w-3.5 h-3.5 text-slate-400" />
				</button>
			)}
		</div>
	);
}

function SourceRow({ source, onDelete }: { source: SourcePresentation; onDelete: () => void }) {
	const date = new Date(source.uploaded_at).toLocaleDateString("ru-RU", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});

	return (
		<div className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all">
			<div
				className={cn(
					"w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold uppercase",
					source.file_type === "pptx" ? "bg-orange-100 text-orange-600" : "bg-red-100 text-red-600"
				)}
			>
				{source.file_type}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium text-slate-800 truncate">{source.filename}</p>
				<p className="text-xs text-slate-400 mt-0.5">
					{source.slide_count} слайдов · {date}
				</p>
			</div>
			<span
				className={cn(
					"text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0",
					source.status === "done"
						? "bg-emerald-50 text-emerald-600"
						: source.status === "error"
							? "bg-red-50 text-red-600"
							: "bg-slate-100 text-slate-500"
				)}
			>
				{source.status === "done" ? "Готово" : source.status === "error" ? "Ошибка" : "Обработка"}
			</span>
			<button
				onClick={onDelete}
				className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
				title="Удалить презентацию и все её слайды"
			>
				<Trash2 className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}

export default function Upload() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { uploadQueue, enqueue, removeFromQueue } = useIndexingStore();
	const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

	const { data: sources = [], isLoading: sourcesLoading } = useQuery<SourcePresentation[]>({
		queryKey: ["sources"],
		queryFn: libraryApi.listSources,
	});

	const deleteSourceMutation = useMutation({
		mutationFn: libraryApi.deleteSource,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["sources"] });
			queryClient.invalidateQueries({ queryKey: ["slides"] });
			setDeleteConfirmId(null);
			toast.success("Презентация удалена");
		},
		onError: () => toast.error("Не удалось удалить"),
	});

	const handleFiles = useCallback(
		(files: FileList | null) => {
			if (!files?.length) return;
			const valid: File[] = [];
			for (const file of Array.from(files)) {
				const ext = file.name.split(".").pop()?.toLowerCase();
				if (!["pptx", "pdf"].includes(ext || "")) {
					toast.error(`${file.name}: поддерживаются только PPTX и PDF`);
					continue;
				}
				if (file.size > 500 * 1024 * 1024) {
					toast.error(`${file.name}: файл превышает 500 МБ`);
					continue;
				}
				valid.push(file);
			}
			if (!valid.length) return;
			enqueue(valid);
		},
		[enqueue]
	);

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		handleFiles(e.dataTransfer.files);
	};

	const doneCount = uploadQueue.filter((e) => e.status === "done").length;
	const allDone =
		uploadQueue.length > 0 && uploadQueue.every((e) => e.status === "done" || e.status === "error");
	const sourceToDelete = sources.find((s) => s.id === deleteConfirmId);

	return (
		<div className="min-h-full bg-surface">
			<div className="max-w-2xl mx-auto px-6 py-8">
				<button
					onClick={() => navigate("/library")}
					className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-8 transition-colors font-medium"
				>
					<ArrowLeft className="w-4 h-4" />
					Вернуться в библиотеку
				</button>

				<h1 className="text-2xl font-bold text-slate-900 mb-2">Загрузить презентации</h1>
				<p className="text-slate-500 mb-8">
					Загружайте несколько файлов PPTX или PDF. Каждый слайд будет проиндексирован с помощью AI.
				</p>

				{/* Drop zone */}
				<div
					onDragEnter={() => setIsDragging(true)}
					onDragLeave={() => setIsDragging(false)}
					onDragOver={(e) => e.preventDefault()}
					onDrop={handleDrop}
					onClick={() => fileInputRef.current?.click()}
					className={cn(
						"border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-4",
						"cursor-pointer transition-all",
						isDragging
							? "border-brand-500 bg-brand-50 scale-[1.01]"
							: "border-slate-200 hover:border-brand-400 hover:bg-brand-50/50"
					)}
				>
					<input
						ref={fileInputRef}
						type="file"
						accept=".pptx,.pdf"
						multiple
						className="hidden"
						onChange={(e) => handleFiles(e.target.files)}
					/>
					<div
						className={cn(
							"w-16 h-16 rounded-2xl flex items-center justify-center transition-colors",
							isDragging ? "bg-brand-100" : "bg-white border border-slate-200 shadow-sm"
						)}
					>
						<UploadIcon
							className={cn("w-8 h-8", isDragging ? "text-brand-600" : "text-slate-400")}
						/>
					</div>
					<div className="text-center">
						<p className="text-base font-semibold text-slate-800">
							Перетащите файлы или нажмите для выбора
						</p>
						<p className="text-sm text-slate-400 mt-1">
							PPTX, PDF — до 500 МБ каждый · Можно несколько
						</p>
					</div>
				</div>

				{/* Active upload queue */}
				{uploadQueue.length > 0 && (
					<div className="mt-6 flex flex-col gap-2">
						<div className="flex items-center justify-between mb-1">
							<p className="text-sm font-semibold text-slate-700">
								Загрузка{" "}
								<span className="text-slate-400 font-normal">
									({doneCount}/{uploadQueue.length} готово)
								</span>
							</p>
							{allDone && (
								<button
									onClick={() => navigate("/library")}
									className="text-sm text-brand-600 hover:text-brand-800 font-semibold transition-colors"
								>
									Перейти в библиотеку →
								</button>
							)}
						</div>
						{uploadQueue.map((entry) => (
							<FileRow key={entry.id} entry={entry} onRemove={() => removeFromQueue(entry.id)} />
						))}
					</div>
				)}

				{/* Uploaded presentations history */}
				{(sources.length > 0 || sourcesLoading) && (
					<div className="mt-8">
						<div className="flex items-center gap-2 mb-3">
							<FileType2 className="w-4 h-4 text-slate-400" />
							<h2 className="text-sm font-semibold text-slate-700">Загруженные презентации</h2>
							<span className="ml-auto text-xs text-slate-400">{sources.length} файлов</span>
						</div>
						{sourcesLoading ? (
							<div className="flex justify-center py-6">
								<Spinner />
							</div>
						) : (
							<div className="flex flex-col gap-2">
								{sources.map((source) => (
									<SourceRow
										key={source.id}
										source={source}
										onDelete={() => setDeleteConfirmId(source.id)}
									/>
								))}
							</div>
						)}
					</div>
				)}

				{/* Instructions (only when no uploads in progress and no history) */}
				{uploadQueue.length === 0 && sources.length === 0 && !sourcesLoading && (
					<div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
						{[
							{ step: "1", title: "Загрузите", desc: "PPTX или PDF файлы с вашими слайдами" },
							{
								step: "2",
								title: "AI анализирует",
								desc: "Каждый слайд получает заголовок, теги и эмбеддинг",
							},
							{
								step: "3",
								title: "Используйте",
								desc: "Слайды доступны для умной сборки презентаций",
							},
						].map(({ step, title, desc }) => (
							<div
								key={step}
								className="p-4 rounded-2xl bg-white border border-slate-200 shadow-card"
							>
								<div className="w-8 h-8 rounded-xl bg-gradient-brand text-white text-sm font-bold flex items-center justify-center mb-3 shadow-sm">
									{step}
								</div>
								<p className="font-semibold text-sm text-slate-800">{title}</p>
								<p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Delete confirmation modal */}
			{deleteConfirmId && sourceToDelete && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
					onClick={() => setDeleteConfirmId(null)}
				>
					<div
						className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="flex items-center gap-3 mb-4">
							<div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
								<Trash2 className="w-5 h-5 text-red-500" />
							</div>
							<div>
								<p className="font-semibold text-gray-900">Удалить презентацию?</p>
								<p className="text-sm text-gray-500 mt-0.5 line-clamp-1">
									{sourceToDelete.filename}
								</p>
							</div>
						</div>
						<p className="text-sm text-gray-500 mb-5">
							Будут удалены все {sourceToDelete.slide_count} слайдов из этой презентации. Действие
							нельзя отменить.
						</p>
						<div className="flex gap-3">
							<button
								onClick={() => setDeleteConfirmId(null)}
								className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
							>
								Отмена
							</button>
							<button
								onClick={() => deleteSourceMutation.mutate(deleteConfirmId)}
								disabled={deleteSourceMutation.isPending}
								className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
							>
								{deleteSourceMutation.isPending ? (
									<Spinner size="sm" />
								) : (
									<Trash2 className="w-4 h-4" />
								)}
								Удалить
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
