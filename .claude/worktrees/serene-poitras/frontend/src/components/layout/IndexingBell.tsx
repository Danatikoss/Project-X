import { Bell, CheckCircle, Trash2, Upload, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useIndexingStore } from "../../store/indexing";
import { cn } from "../../utils/cn";
import { Spinner } from "../common/Spinner";

export function IndexingBell() {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const { jobs, uploadQueue, dismiss, dismissCompleted } = useIndexingStore();

	const uploadingEntries = uploadQueue.filter(
		(e) => e.status === "queued" || e.status === "uploading"
	);
	const activeJobsCount = jobs.filter((j) => j.status === "indexing").length;
	const activeCount = uploadingEntries.length + activeJobsCount;
	const hasAny = jobs.length > 0 || uploadQueue.length > 0;
	const hasCompleted = jobs.some((j) => j.status !== "indexing");

	// Close on outside click
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, []);

	if (!hasAny) return null;

	return (
		<div ref={ref} className="relative">
			<button
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"w-8 h-8 rounded-lg flex items-center justify-center relative transition-colors",
					open
						? "bg-brand-50 text-brand-700"
						: "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
				)}
				title="Индексация"
			>
				{activeCount > 0 ? <Spinner size="sm" /> : <Bell className="w-4 h-4" />}
				{activeCount > 0 && (
					<span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand-600 text-white text-[8px] font-bold flex items-center justify-center">
						{activeCount}
					</span>
				)}
				{activeCount === 0 && hasCompleted && (
					<span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
				)}
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
					<div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
						<span className="text-xs font-semibold text-gray-700">Индексация файлов</span>
						<div className="flex items-center gap-1">
							{hasCompleted && (
								<button
									onClick={dismissCompleted}
									className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
									title="Очистить завершённые"
								>
									<Trash2 className="w-3.5 h-3.5" />
								</button>
							)}
						</div>
					</div>

					<div className="max-h-72 overflow-y-auto">
						{/* Uploading/queued entries (pre-indexing phase) */}
						{uploadingEntries.map((entry) => (
							<div
								key={entry.id}
								className="flex items-start gap-2.5 px-3 py-2.5 border-b border-gray-50 last:border-0"
							>
								<div className="mt-0.5 shrink-0">
									{entry.status === "uploading" ? (
										<Spinner size="sm" />
									) : (
										<Upload className="w-4 h-4 text-gray-400" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-xs font-medium text-gray-800 truncate">{entry.filename}</p>
									<p className="text-[11px] text-gray-400 mt-0.5">
										{entry.status === "uploading" ? "Загрузка на сервер..." : "В очереди"}
									</p>
								</div>
							</div>
						))}

						{/* Indexing jobs */}
						{jobs.map((job) => (
							<div
								key={job.ws_token}
								className="flex items-start gap-2.5 px-3 py-2.5 border-b border-gray-50 last:border-0"
							>
								<div className="mt-0.5 shrink-0">
									{job.status === "indexing" ? (
										<Spinner size="sm" />
									) : job.status === "done" ? (
										<CheckCircle className="w-4 h-4 text-green-500" />
									) : (
										<XCircle className="w-4 h-4 text-red-400" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<p className="text-xs font-medium text-gray-800 truncate">{job.filename}</p>
									<p className="text-[11px] text-gray-400 mt-0.5">{job.message}</p>
									{job.status === "indexing" && job.progress > 0 && (
										<div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
											<div
												className="h-full bg-brand-700 rounded-full transition-all duration-300"
												style={{ width: `${Math.round(job.progress * 100)}%` }}
											/>
										</div>
									)}
								</div>
								{job.status !== "indexing" && (
									<button
										onClick={() => dismiss(job.ws_token)}
										className="p-0.5 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 transition-colors shrink-0"
									>
										<X className="w-3 h-3" />
									</button>
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
