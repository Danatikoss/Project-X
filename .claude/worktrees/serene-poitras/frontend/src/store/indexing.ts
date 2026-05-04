import { toast } from "sonner";
import { create } from "zustand";
import { libraryApi } from "../api/client";

export interface IndexingJob {
	ws_token: string;
	filename: string;
	source_id: number;
	status: "indexing" | "done" | "error";
	progress: number; // 0–1
	message: string;
}

export interface UploadEntry {
	id: string;
	file: File;
	filename: string;
	fileSize: number;
	status: "queued" | "uploading" | "indexing" | "done" | "error";
	wsToken: string | null;
	error?: string;
}

// WebSocket connections live outside Zustand (not serializable)
const _connections = new Map<string, WebSocket>();
// Prevent double-starting the queue loop
let _queueRunning = false;

interface IndexingState {
	jobs: IndexingJob[];
	uploadQueue: UploadEntry[];
	enqueue: (files: File[]) => void;
	removeFromQueue: (id: string) => void;
	addJob: (ws_token: string, filename: string, source_id: number) => void;
	_updateJob: (ws_token: string, update: Partial<IndexingJob>) => void;
	_updateEntry: (id: string, update: Partial<UploadEntry>) => void;
	_runQueue: () => Promise<void>;
	dismiss: (ws_token: string) => void;
	dismissCompleted: () => void;
}

export const useIndexingStore = create<IndexingState>((set, get) => ({
	jobs: [],
	uploadQueue: [],

	enqueue: (files: File[]) => {
		const newEntries: UploadEntry[] = files.map((file) => ({
			id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			file,
			filename: file.name,
			fileSize: file.size,
			status: "queued" as const,
			wsToken: null,
		}));
		set((s) => ({ uploadQueue: [...s.uploadQueue, ...newEntries] }));
		if (!_queueRunning) {
			get()._runQueue();
		}
	},

	removeFromQueue: (id: string) => {
		set((s) => ({ uploadQueue: s.uploadQueue.filter((e) => e.id !== id) }));
	},

	_runQueue: async () => {
		if (_queueRunning) return;
		_queueRunning = true;
		try {
			while (true) {
				const next = get().uploadQueue.find((e) => e.status === "queued");
				if (!next) break;

				get()._updateEntry(next.id, { status: "uploading" });

				try {
					const res = await libraryApi.upload(next.file);
					get()._updateEntry(next.id, { wsToken: res.ws_token, status: "indexing" });
					get().addJob(res.ws_token, next.filename, res.source_id);

					// Wait for indexing job to complete before processing next file
					await new Promise<void>((resolve) => {
						const interval = setInterval(() => {
							const job = get().jobs.find((j) => j.ws_token === res.ws_token);
							if (job?.status === "done" || job?.status === "error") {
								clearInterval(interval);
								resolve();
							}
						}, 500);
						// Safety timeout: 10 minutes
						setTimeout(() => {
							clearInterval(interval);
							resolve();
						}, 600_000);
					});
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
					get()._updateEntry(next.id, { status: "error", error: msg });
					toast.error(`Ошибка загрузки ${next.filename}: ${msg}`);
				}
			}
		} finally {
			_queueRunning = false;
		}
	},

	addJob: (ws_token, filename, source_id) => {
		// Don't add duplicates
		if (get().jobs.some((j) => j.ws_token === ws_token)) return;

		set((s) => ({
			jobs: [
				{
					ws_token,
					filename,
					source_id,
					status: "indexing",
					progress: 0,
					message: "Подготовка...",
				},
				...s.jobs,
			],
		}));

		const protocol = window.location.protocol === "https:" ? "wss" : "ws";
		const ws = new WebSocket(`${protocol}://${window.location.host}/ws/indexing/${ws_token}`);
		_connections.set(ws_token, ws);

		ws.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data);
				if (data.stage === "ping") return;

				if (data.stage === "done") {
					get()._updateJob(ws_token, { status: "done", progress: 1, message: "Готово" });
					const entry = get().uploadQueue.find((e) => e.wsToken === ws_token);
					if (entry) get()._updateEntry(entry.id, { status: "done" });
					toast.success(`«${filename}» проиндексирован`, { duration: 4000 });
					ws.close();
				} else if (data.stage === "error") {
					get()._updateJob(ws_token, { status: "error", message: data.message || "Ошибка" });
					const entry = get().uploadQueue.find((e) => e.wsToken === ws_token);
					if (entry)
						get()._updateEntry(entry.id, { status: "error", error: data.message || "Ошибка" });
					toast.error(`Ошибка при индексации «${filename}»`);
					ws.close();
				} else {
					get()._updateJob(ws_token, {
						progress: data.progress || 0,
						message: data.message || "",
					});
				}
			} catch {
				/* ignore malformed */
			}
		};

		ws.onerror = () => {
			get()._updateJob(ws_token, { status: "error", message: "Соединение прервано" });
			const entry = get().uploadQueue.find((e) => e.wsToken === ws_token);
			if (entry) get()._updateEntry(entry.id, { status: "error", error: "Соединение прервано" });
		};

		ws.onclose = () => {
			_connections.delete(ws_token);
		};
	},

	_updateJob: (ws_token, update) => {
		set((s) => ({
			jobs: s.jobs.map((j) => (j.ws_token === ws_token ? { ...j, ...update } : j)),
		}));
	},

	_updateEntry: (id, update) => {
		set((s) => ({
			uploadQueue: s.uploadQueue.map((e) => (e.id === id ? { ...e, ...update } : e)),
		}));
	},

	dismiss: (ws_token) => {
		_connections.get(ws_token)?.close();
		set((s) => ({ jobs: s.jobs.filter((j) => j.ws_token !== ws_token) }));
	},

	dismissCompleted: () => {
		set((s) => ({ jobs: s.jobs.filter((j) => j.status === "indexing") }));
	},
}));
