"""
WebSocket manager for real-time indexing progress updates.
Endpoint: /ws/indexing/{ws_token}
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
