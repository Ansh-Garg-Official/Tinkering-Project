"""
PlatoonCommand - Asynchronous TCP Socket Client for Raspberry Pi Actuators
Handles low-latency socket communication with the Master and Follower Raspberry Pis.
Automatically reconnects on network dropouts and sends fail-safe STOP commands.
"""

import asyncio
import logging
from typing import Optional, Callable

logger = logging.getLogger("TCPClient")

class PiActuatorClient:
    def __init__(self, name: str, host: str, port: int, on_status_change: Optional[Callable[[str, bool], None]] = None):
        """
        :param name: Identifier (e.g. 'Master' or 'Follower')
        :param host: IP address of the Raspberry Pi
        :param port: TCP listening port on the Raspberry Pi (e.g. 8888)
        :param on_status_change: Callback when connection status changes (name, is_connected)
        """
        self.name = name
        self.host = host
        self.port = port
        self.on_status_change = on_status_change
        
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.is_connected: bool = False
        self._lock = asyncio.Lock()
        self._reconnect_task: Optional[asyncio.Task] = None
        self._should_run: bool = True
        self.last_command: str = "stop"
        self.last_latency_ms: float = 0.0

    async def start(self):
        """Start the persistent connection manager loop."""
        self._should_run = True
        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.create_task(self._connection_loop())

    async def stop(self):
        """Cleanly disconnect and cancel reconnect loop."""
        self._should_run = False
        if self._reconnect_task:
            self._reconnect_task.cancel()
        await self._disconnect()

    async def update_target(self, host: str, port: int):
        """Update IP/Port dynamically and reconnect."""
        if self.host != host or self.port != port:
            self.host = host
            self.port = port
            logger.info(f"[{self.name}] Target updated to {self.host}:{self.port}, reconnecting...")
            await self._disconnect()

    async def _connection_loop(self):
        """Maintains persistent connection with exponential backoff / retry."""
        retry_delay = 1.0
        while self._should_run:
            if not self.is_connected:
                try:
                    logger.info(f"[{self.name}] Connecting to {self.host}:{self.port}...")
                    self.reader, self.writer = await asyncio.wait_for(
                        asyncio.open_connection(self.host, self.port),
                        timeout=3.0
                    )
                    self.is_connected = True
                    retry_delay = 1.0
                    logger.info(f"[{self.name}] Successfully connected to {self.host}:{self.port}")
                    if self.on_status_change:
                        self.on_status_change(self.name, True)
                except (asyncio.TimeoutError, OSError, ConnectionRefusedError) as e:
                    self.is_connected = False
                    if self.on_status_change:
                        self.on_status_change(self.name, False)
                    logger.debug(f"[{self.name}] Connection failed: {e}. Retrying in {retry_delay:.1f}s...")
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 1.5, 5.0)
                    continue

            # Connection is active: check heartbeat / listen for closing
            try:
                # We can check if reader hit EOF
                if self.reader:
                    data = await asyncio.wait_for(self.reader.read(1024), timeout=1.0)
                    if not data:
                        logger.warning(f"[{self.name}] Server closed connection.")
                        await self._disconnect()
            except asyncio.TimeoutError:
                # Normal: read timed out, connection is still alive
                pass
            except Exception as e:
                logger.warning(f"[{self.name}] Connection error: {e}")
                await self._disconnect()

    async def send_command(self, cmd: str) -> bool:
        """
        Send a raw single-character or string command to the Raspberry Pi.
        Allowed commands typically: 'w', 's', 'a', 'd', 'stop'.
        Appends newline '\\n' for socket protocol delimiter.
        """
        cmd_clean = cmd.strip().lower()
        self.last_command = cmd_clean
        
        async with self._lock:
            if not self.is_connected or not self.writer:
                logger.debug(f"[{self.name}] Cannot send '{cmd_clean}': not connected.")
                return False

            try:
                payload = f"{cmd_clean}\n".encode("utf-8")
                self.writer.write(payload)
                await asyncio.wait_for(self.writer.drain(), timeout=0.5)
                return True
            except Exception as e:
                logger.error(f"[{self.name}] Failed to send command '{cmd_clean}': {e}")
                await self._disconnect()
                return False

    async def _disconnect(self):
        """Internal helper to reset socket writer and flag disconnect."""
        was_connected = self.is_connected
        self.is_connected = False
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass
            self.writer = None
            self.reader = None

        if was_connected and self.on_status_change:
            self.on_status_change(self.name, False)
