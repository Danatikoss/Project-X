import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Assembly } from "../types";

type OnUpdateFn = (assembly: Assembly) => void;

/**
 * Connects to the assembly WS collaboration room.
 * When anyone (owner or collaborator) saves a change, the server broadcasts
 * the full updated assembly. This hook updates the React Query cache and calls
 * the optional onUpdate callback so the page can sync local UI state.
 */
export function useAssemblyRoom(
  assemblyId: number | null,
  onUpdate?: OnUpdateFn
) {
  const queryClient = useQueryClient();
  const onUpdateRef = useRef<OnUpdateFn | undefined>(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!assemblyId) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws/assembly/${assemblyId}`;
    const ws = new WebSocket(url);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; data?: Assembly };
        if (msg.type === "assembly_updated" && msg.data) {
          queryClient.setQueryData(["assembly", assemblyId], msg.data);
          onUpdateRef.current?.(msg.data);
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [assemblyId, queryClient]);
}
