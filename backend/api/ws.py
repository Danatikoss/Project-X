"""
WebSocket manager for real-time updates.
  /ws/indexing/{ws_token}   — indexing progress (1:1)
  /ws/assembly/{assembly_id} — collaborative editing room (1:N)
"""
import asyncio
import json
import logging
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, token: str, websocket: WebSocket):
        await websocket.accept()
        self._connections[token] = websocket
        logger.info(f"WS connected: {token}")

    def disconnect(self, token: str):
        self._connections.pop(token, None)
        logger.info(f"WS disconnected: {token}")

    async def send(self, token: str, data: dict):
        ws = self._connections.get(token)
        if ws:
            try:
                await ws.send_text(json.dumps(data, ensure_ascii=False))
            except Exception as e:
                logger.warning(f"WS send failed for {token}: {e}")
                self.disconnect(token)

    async def send_progress(self, token: str, stage: str, progress: float,
                             message: str, processed: int = 0, total: int = 0):
        await self.send(token, {
            "stage": stage,
            "progress": round(progress, 3),
            "message": message,
            "processed": processed,
            "total": total,
        })

    async def send_done(self, token: str, source_id: int, slide_count: int):
        await self.send(token, {
            "stage": "done",
            "progress": 1.0,
            "message": f"Индексация завершена. Добавлено слайдов: {slide_count}",
            "processed": slide_count,
            "total": slide_count,
            "source_id": source_id,
        })

    async def send_error(self, token: str, error: str):
        await self.send(token, {
            "stage": "error",
            "progress": 0.0,
            "message": f"Ошибка: {error}",
        })


manager = ConnectionManager()


# ─── Assembly collaboration room ──────────────────────────────────────────────

class AssemblyRoomManager:
    """Manages N WebSocket connections per assembly room."""

    def __init__(self):
        self._rooms: dict[int, set[WebSocket]] = {}

    async def join(self, assembly_id: int, websocket: WebSocket):
        await websocket.accept()
        self._rooms.setdefault(assembly_id, set()).add(websocket)
        logger.info(f"Assembly WS join: room={assembly_id}, total={len(self._rooms[assembly_id])}")

    def leave(self, assembly_id: int, websocket: WebSocket):
        room = self._rooms.get(assembly_id)
        if room:
            room.discard(websocket)
            if not room:
                del self._rooms[assembly_id]
        logger.info(f"Assembly WS leave: room={assembly_id}")

    async def broadcast(self, assembly_id: int, data: dict):
        """Send a message to all clients in the room."""
        room = self._rooms.get(assembly_id, set())
        dead: set[WebSocket] = set()
        for ws in room:
            try:
                await ws.send_text(json.dumps(data, ensure_ascii=False))
            except Exception as e:
                logger.warning(f"Assembly WS broadcast failed: {e}")
                dead.add(ws)
        for ws in dead:
            self.leave(assembly_id, ws)


assembly_room = AssemblyRoomManager()


async def assembly_room_endpoint(websocket: WebSocket, assembly_id: int):
    await assembly_room.join(assembly_id, websocket)
    try:
        while True:
            await asyncio.sleep(30)
            try:
                await websocket.send_text(json.dumps({"type": "ping"}))
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        assembly_room.leave(assembly_id, websocket)


async def websocket_endpoint(websocket: WebSocket, ws_token: str):
    await manager.connect(ws_token, websocket)
    try:
        while True:
            # Keep connection alive; indexing service sends messages
            await asyncio.sleep(30)
            try:
                await websocket.send_text(json.dumps({"stage": "ping"}))
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws_token)
