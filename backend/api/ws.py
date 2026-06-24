"""
WebSocket manager for real-time updates.
  /ws/indexing/{ws_token}   — indexing progress (1:1)
  /ws/assembly/{assembly_id} — collaborative editing room (1:N)
"""
import asyncio
import hashlib
import json
import logging
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

_USER_COLORS = [
    "#4F46E5", "#7C3AED", "#059669", "#DC2626", "#D97706",
    "#0891B2", "#C026D3", "#16A34A", "#EA580C", "#9333EA",
]


def _pick_color(name: str) -> str:
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    return _USER_COLORS[h % len(_USER_COLORS)]


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
    """Manages N WebSocket connections per assembly room with presence tracking."""

    def __init__(self):
        # ws → {"name": str, "color": str}
        self._rooms: dict[int, dict[WebSocket, dict]] = {}

    async def join(self, assembly_id: int, websocket: WebSocket, user_info: dict):
        await websocket.accept()
        self._rooms.setdefault(assembly_id, {})[websocket] = user_info
        total = len(self._rooms[assembly_id])
        logger.info(f"Assembly WS join: room={assembly_id}, user={user_info['name']}, total={total}")
        await self._broadcast_presence(assembly_id)

    def leave(self, assembly_id: int, websocket: WebSocket):
        room = self._rooms.get(assembly_id)
        if room:
            room.pop(websocket, None)
            if not room:
                del self._rooms[assembly_id]
        logger.info(f"Assembly WS leave: room={assembly_id}")

    async def broadcast(self, assembly_id: int, data: dict):
        """Send a message to all clients in the room."""
        room = self._rooms.get(assembly_id, {})
        dead: list[WebSocket] = []
        for ws in list(room.keys()):
            try:
                await ws.send_text(json.dumps(data, ensure_ascii=False))
            except Exception as e:
                logger.warning(f"Assembly WS broadcast failed: {e}")
                dead.append(ws)
        for ws in dead:
            self.leave(assembly_id, ws)

    async def relay(self, assembly_id: int, sender: WebSocket, data: dict):
        """Relay a message to all clients in the room except the sender."""
        room = self._rooms.get(assembly_id, {})
        dead: list[WebSocket] = []
        for ws in list(room.keys()):
            if ws is sender:
                continue
            try:
                await ws.send_text(json.dumps(data, ensure_ascii=False))
            except Exception as e:
                logger.warning(f"Assembly WS relay failed: {e}")
                dead.append(ws)
        for ws in dead:
            self.leave(assembly_id, ws)

    async def _broadcast_presence(self, assembly_id: int):
        room = self._rooms.get(assembly_id, {})
        users = list(room.values())
        await self.broadcast(assembly_id, {"type": "presence", "users": users})


assembly_room = AssemblyRoomManager()


async def assembly_room_endpoint(websocket: WebSocket, assembly_id: int, name: str = "Гость"):
    color = _pick_color(name)
    user_info = {"name": name, "color": color}

    await assembly_room.join(assembly_id, websocket, user_info)
    try:
        while True:
            try:
                text = await asyncio.wait_for(websocket.receive_text(), timeout=25)
                try:
                    msg = json.loads(text)
                    # Relay cursor/focus/slide-content events from this client to others
                    allowed = {"typing", "cursor", "slide_focus", "slide_thumbnail_updated"}
                    if isinstance(msg, dict) and msg.get("type") in allowed:
                        msg["user"] = user_info
                        await assembly_room.relay(assembly_id, websocket, msg)
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        assembly_room.leave(assembly_id, websocket)
        # Broadcast updated presence after leave (room may be empty now)
        if assembly_id in assembly_room._rooms:
            await assembly_room._broadcast_presence(assembly_id)


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
