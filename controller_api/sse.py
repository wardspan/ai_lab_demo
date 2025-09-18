"""Lightweight Server-Sent Event broadcaster."""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator, Dict, List


class SSEManager:
    def __init__(self) -> None:
        self._subscribers: List[asyncio.Queue[str]] = []
        self._lock = asyncio.Lock()

    async def publish(self, event_type: str, data: Dict[str, Any]) -> None:
        payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        async with self._lock:
            queues = list(self._subscribers)
        for queue in queues:
            await queue.put(payload)

    async def subscribe(self) -> AsyncGenerator[str, None]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        async with self._lock:
            self._subscribers.append(queue)
        try:
            while True:
                message = await queue.get()
                yield message
        finally:
            async with self._lock:
                if queue in self._subscribers:
                    self._subscribers.remove(queue)


sse_manager = SSEManager()
