import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Assembly } from "../types";

export interface RoomUser {
	name: string;
	color: string;
}

export interface RemoteUserState extends RoomUser {
	slideIndex?: number;
	cursor?: { x: number; y: number } | null;
}

type OnUpdateFn = (assembly: Assembly) => void;
type OnSlideUpdatedFn = (slideId: number, thumbVersion: number) => void;

interface UseAssemblyRoomOptions {
	name?: string;
	onSlideUpdated?: OnSlideUpdatedFn;
}

export function useAssemblyRoom(
	assemblyId: number | null,
	onUpdate?: OnUpdateFn,
	options?: UseAssemblyRoomOptions,
) {
	const queryClient = useQueryClient();
	const onUpdateRef = useRef<OnUpdateFn | undefined>(onUpdate);
	onUpdateRef.current = onUpdate;
	const onSlideUpdatedRef = useRef<OnSlideUpdatedFn | undefined>(options?.onSlideUpdated);
	onSlideUpdatedRef.current = options?.onSlideUpdated;

	const [onlineUsers, setOnlineUsers] = useState<RoomUser[]>([]);
	const [remoteUsers, setRemoteUsers] = useState<Map<string, RemoteUserState>>(new Map());
	// true once the WS handshake is complete — slide_focus depends on this
	const [isConnected, setIsConnected] = useState(false);
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

		ws.onopen = () => setIsConnected(true);

		ws.onmessage = (e) => {
			try {
				const msg = JSON.parse(e.data) as {
					type: string;
					data?: Assembly;
					users?: RoomUser[];
					user?: RoomUser;
					x?: number | null;
					y?: number | null;
					slideIndex?: number;
					slideId?: number;
					thumbVersion?: number;
				};

				if (msg.type === "assembly_updated" && msg.data) {
					queryClient.setQueryData(["assembly", assemblyId], msg.data);
					onUpdateRef.current?.(msg.data);
				} else if (msg.type === "presence") {
					const users = msg.users ?? [];
					setOnlineUsers(users);
					// Remove state for users who left
					setRemoteUsers((prev) => {
						const activeNames = new Set(users.map((u) => u.name));
						const next = new Map(prev);
						for (const name of next.keys()) {
							if (!activeNames.has(name)) next.delete(name);
						}
						return next;
					});
				} else if (msg.type === "cursor" && msg.user) {
					const user = msg.user;
					setRemoteUsers((prev) => {
						const next = new Map(prev);
						const existing = next.get(user.name) ?? user;
						next.set(user.name, {
							...existing,
							cursor: msg.x != null && msg.y != null ? { x: msg.x, y: msg.y } : null,
						});
						return next;
					});
				} else if (msg.type === "slide_focus" && msg.user) {
					const user = msg.user;
					setRemoteUsers((prev) => {
						const next = new Map(prev);
						const existing = next.get(user.name) ?? user;
						next.set(user.name, { ...existing, slideIndex: msg.slideIndex });
						return next;
					});
				} else if (msg.type === "slide_thumbnail_updated" && msg.slideId != null && msg.thumbVersion != null) {
					onSlideUpdatedRef.current?.(msg.slideId, msg.thumbVersion);
				}
			} catch {
				// ignore malformed messages
			}
		};

		ws.onclose = () => {
			wsRef.current = null;
			setIsConnected(false);
			setOnlineUsers([]);
			setRemoteUsers(new Map());
		};

		return () => {
			ws.close();
			wsRef.current = null;
			setIsConnected(false);
		};
	// options.name intentionally excluded — reconnect only when assemblyId changes
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [assemblyId, queryClient]);

	const sendMessage = useCallback((data: object) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(data));
		}
	}, []);

	return {
		onlineUsers,
		remoteUsers: Array.from(remoteUsers.values()),
		sendMessage,
		isConnected,
	};
}
