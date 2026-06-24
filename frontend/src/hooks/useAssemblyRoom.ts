import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Assembly } from "../types";

export interface RoomUser {
	name: string;
	color: string;
}

type OnUpdateFn = (assembly: Assembly) => void;

interface UseAssemblyRoomOptions {
	name?: string;
}

export function useAssemblyRoom(
	assemblyId: number | null,
	onUpdate?: OnUpdateFn,
	options?: UseAssemblyRoomOptions,
) {
	const queryClient = useQueryClient();
	const onUpdateRef = useRef<OnUpdateFn | undefined>(onUpdate);
	onUpdateRef.current = onUpdate;

	const [onlineUsers, setOnlineUsers] = useState<RoomUser[]>([]);
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		if (!assemblyId) return;

		const proto = window.location.protocol === "https:" ? "wss" : "ws";
		const params = new URLSearchParams();
		if (options?.name) params.set("name", options.name);
		const qs = params.toString();
		const url = `${proto}://${window.location.host}/ws/assembly/${assemblyId}${qs ? `?${qs}` : ""}`;

		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data) as { type: string; data?: Assembly; users?: RoomUser[] };
				if (msg.type === "assembly_updated" && msg.data) {
					queryClient.setQueryData(["assembly", assemblyId], msg.data);
					onUpdateRef.current?.(msg.data);
				} else if (msg.type === "presence") {
					setOnlineUsers(msg.users ?? []);
				}
			} catch {
				// ignore malformed messages
			}
		};

		ws.onclose = () => {
			wsRef.current = null;
			setOnlineUsers([]);
		};

		return () => {
			ws.close();
			wsRef.current = null;
		};
	// options.name intentionally excluded — reconnect only when assemblyId changes
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [assemblyId, queryClient]);

	const sendMessage = (data: object) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(data));
		}
	};

	return { onlineUsers, sendMessage };
}
