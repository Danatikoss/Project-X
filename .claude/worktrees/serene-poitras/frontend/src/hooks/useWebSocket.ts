import { useEffect, useRef, useState } from "react";
import type { IndexProgress } from "../types";

export function useWebSocket(token: string | null) {
	const [progress, setProgress] = useState<IndexProgress | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		if (!token) return;

		const url = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/indexing/${token}`;
		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onmessage = (e) => {
			try {
				const data = JSON.parse(e.data) as IndexProgress;
				if (data.stage !== "ping") {
					setProgress(data);
				}
			} catch {
				// ignore malformed messages
			}
		};

		ws.onerror = () => {
			setProgress((prev) =>
				prev ? { ...prev, stage: "error", message: "Соединение прервано" } : null
			);
		};

		return () => {
			ws.close();
			wsRef.current = null;
		};
	}, [token]);

	return progress;
}
