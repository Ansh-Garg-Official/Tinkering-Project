/**
 * BackendCodeDrawer Component
 * Provides complete in-app inspection, syntax display, 1-click clipboard copy,
 * individual file downloads, and complete ZIP package export for running on Windows.
 */

import React, { useState } from 'react';
import JSZip from 'jszip';
import { Download, Copy, Check, Terminal, FileCode, Archive, ExternalLink } from 'lucide-react';

interface CodeFile {
  name: string;
  description: string;
  content: string;
}

const BACKEND_FILES: CodeFile[] = [
  {
    name: 'main.py',
    description: 'FastAPI + WebSockets server orchestration, closed-loop turn controller, collision avoidance, and state initialization',
    content: `"""
PlatoonCommand - Central Command Center Backend (FastAPI + WebSockets)
Features:
- Master & Follower TCP socket actuation
- UDP Gyro parser for [Car1] Gyro (rad/s) -> X: {gx}, Y: {gy}, Z: {gz}
- Deadband filter (<0.05 deg/s) & time-integration
- Virtual Collision Avoidance (auto-suspend if gap < 30 cm)
- Closed-Loop Precise Turning (auto-stop on target angle)
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Set, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tcp_client import PiActuatorClient
from udp_listener import AndroidUDPListener
from platooning_engine import PlatooningEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s")
logger = logging.getLogger("PlatoonServer")

CONFIG = {
    "master_host": "192.168.1.100",
    "master_port": 8888,
    "follower_host": "192.168.1.101",
    "follower_port": 8888,
    "udp_port": 5005,
    "delay_sec": 4.0,
    "master_speed_cm_s": 35.0,
    "follower_speed_cm_s": 35.0,
    "master_initial_heading_deg": 0.0,
    "follower_initial_heading_deg": 0.0,
    "safe_distance_cm": 30.0
}

active_websockets: Set[WebSocket] = set()

master_client = PiActuatorClient("Master", CONFIG["master_host"], CONFIG["master_port"])
follower_client = PiActuatorClient("Follower", CONFIG["follower_host"], CONFIG["follower_port"])

async def handle_follower_due_command(cmd: str):
    await follower_client.send_command(cmd)

async def handle_master_command_override(cmd: str):
    await master_client.send_command(cmd)

engine = PlatooningEngine(
    delay_seconds=CONFIG["delay_sec"],
    master_speed_cm_s=CONFIG["master_speed_cm_s"],
    follower_speed_cm_s=CONFIG["follower_speed_cm_s"],
    master_initial_heading_deg=CONFIG["master_initial_heading_deg"],
    follower_initial_heading_deg=CONFIG["follower_initial_heading_deg"],
    safe_distance_threshold_cm=CONFIG["safe_distance_cm"],
    on_follower_command_due=handle_follower_due_command,
    on_master_command_override=handle_master_command_override
)

def on_yaw_sample_integrated(integrated_yaw: float, gz_deg_s: float, dt: float):
    engine.update_integrated_gyro_yaw(integrated_yaw)

udp_listener = AndroidUDPListener(
    port=CONFIG["udp_port"],
    deadband_deg_s=0.05,
    on_yaw_integrated=on_yaw_sample_integrated
)

broadcast_task: asyncio.Task = None

async def broadcast_loop():
    while True:
        try:
            if active_websockets:
                snapshot = engine.get_telemetry_snapshot()
                payload = {
                    "type": "telemetry",
                    "timestamp": time.time(),
                    "telemetry": snapshot,
                    "connections": {
                        "master_tcp": master_client.is_connected,
                        "follower_tcp": follower_client.is_connected,
                        "android_udp": udp_listener.is_stream_active(),
                        "udp_packet_count": udp_listener.packet_count,
                        "udp_hz": udp_listener.packet_rate_hz,
                        "current_gz_deg_s": udp_listener.current_gz_deg_s,
                        "last_raw_packet": udp_listener.last_packet_raw,
                        "config": CONFIG
                    }
                }
                to_remove = set()
                for ws in list(active_websockets):
                    try:
                        await ws.send_json(payload)
                    except Exception:
                        to_remove.add(ws)
                for dead_ws in to_remove:
                    active_websockets.discard(dead_ws)
            await asyncio.sleep(0.04)  # 25 Hz
        except asyncio.CancelledError:
            break
        except Exception as e:
            await asyncio.sleep(0.1)

async def emergency_stop():
    logger.warning("EMERGENCY STOP ACTIVATED")
    await master_client.send_command("stop")
    await follower_client.send_command("stop")
    await engine.issue_master_command("stop")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await master_client.start()
    await follower_client.start()
    await udp_listener.start()
    await engine.start()
    global broadcast_task
    broadcast_task = asyncio.create_task(broadcast_loop())
    yield
    if broadcast_task:
        broadcast_task.cancel()
    await emergency_stop()
    await engine.stop()
    await udp_listener.stop()
    await master_client.stop()
    await follower_client.stop()

app = FastAPI(title="PlatoonCommand Server", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class InitialStatePayload(BaseModel):
    m_x: float = 0.0
    m_y: float = 0.0
    f_x: float = 0.0
    f_y: float = 0.0
    initial_heading: float = 0.0
    master_speed: float = 35.0
    follower_speed: float = 35.0
    safe_distance: float = 30.0

class PreciseTurnPayload(BaseModel):
    target_angle: float = 90.0
    direction: str = "Left"

@app.post("/api/initial_state")
async def set_initial_state(payload: InitialStatePayload):
    CONFIG["initial_heading_deg"] = payload.initial_heading
    CONFIG["master_speed_cm_s"] = payload.master_speed
    CONFIG["follower_speed_cm_s"] = payload.follower_speed
    CONFIG["safe_distance_cm"] = payload.safe_distance

    udp_listener.reset_integrated_yaw(0.0)
    engine.set_initial_configuration(
        payload.m_x, payload.m_y, payload.f_x, payload.f_y,
        payload.initial_heading, payload.master_speed, payload.follower_speed, payload.safe_distance
    )
    return {"status": "initialized", "config": CONFIG}

@app.post("/api/precise_turn")
async def api_precise_turn(payload: PreciseTurnPayload):
    engine.start_precise_turn(payload.target_angle, payload.direction)
    return {"status": "turn_initiated", "target": payload.target_angle, "direction": payload.direction}

@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            if msg_type == "command":
                cmd = str(data.get("cmd", "stop")).lower()
                await master_client.send_command(cmd)
                await engine.issue_master_command(cmd)
            elif msg_type == "precise_turn":
                target = float(data.get("target_angle", 90.0))
                direction = str(data.get("direction", "Left"))
                engine.start_precise_turn(target, direction)
            elif msg_type == "set_initial_state":
                m_head = float(data.get("master_initial_heading", data.get("initial_heading", 0)))
                f_head = float(data.get("follower_initial_heading", m_head))
                engine.set_initial_configuration(
                    float(data.get("m_x", 0)), float(data.get("m_y", 0)),
                    float(data.get("f_x", 0)), float(data.get("f_y", 0)),
                    m_head, f_head,
                    float(data.get("master_speed", 35)),
                    float(data.get("follower_speed", 35)),
                    float(data.get("safe_distance", 30))
                )
            elif msg_type == "emergency_stop":
                await emergency_stop()
            elif msg_type == "set_delay":
                engine.set_delay(float(data.get("delay", 4.0)))
    except WebSocketDisconnect:
        pass
    finally:
        active_websockets.discard(websocket)
        if len(active_websockets) == 0:
            await emergency_stop()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
`,
  },
  {
    name: 'platooning_engine.py',
    description: 'Dead reckoning integration (Speed * Time, Heading fusion) and FIFO command delay queue',
    content: `"""
PlatoonCommand - Platooning Engine & Dead Reckoning State Tracker
Manages command delay queue for Follower actuation and dead reckoning numerical integration.
"""

import asyncio
import logging
import math
import time
from collections import deque
from dataclasses import dataclass
from typing import List, Optional, Callable, Dict, Any

logger = logging.getLogger("PlatooningEngine")

@dataclass
class QueuedCommand:
    command: str           # 'w', 's', 'a', 'd', 'stop'
    issue_timestamp: float # Epoch seconds when master received it
    scheduled_exec_time: float # When follower must execute it
    executed: bool = False

@dataclass
class VehiclePose:
    x_cm: float = 0.0
    y_cm: float = 0.0
    yaw_deg: float = 0.0
    speed_cm_per_sec: float = 0.0
    active_command: str = "stop"
    distance_traveled_cm: float = 0.0

class PlatooningEngine:
    def __init__(
        self,
        delay_seconds: float = 4.0,
        speed_cm_per_sec: float = 35.0,
        on_follower_command_due: Optional[Callable[[str], Any]] = None
    ):
        self.delay_seconds = delay_seconds
        self.speed_cm_per_sec = speed_cm_per_sec
        self.on_follower_command_due = on_follower_command_due

        self.master_pose = VehiclePose()
        self.follower_pose = VehiclePose()

        self.command_queue: deque[QueuedCommand] = deque()
        self.completed_history: deque[Dict[str, Any]] = deque(maxlen=50)

        self.master_trail: deque[Dict[str, float]] = deque(maxlen=500)
        self.follower_trail: deque[Dict[str, float]] = deque(maxlen=500)

        self._last_integration_time = time.time()
        self._is_running = False
        self._loop_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

        self._record_master_breadcrumb()
        self._record_follower_breadcrumb()

    def set_delay(self, seconds: float):
        self.delay_seconds = max(0.2, min(seconds, 30.0))

    def set_speed_constant(self, speed_cm: float):
        self.speed_cm_per_sec = max(5.0, min(speed_cm, 200.0))

    def update_yaw_from_udp(self, yaw_deg: float):
        self.master_pose.yaw_deg = yaw_deg % 360.0

    def reset_positions(self):
        self.master_pose.x_cm = 0.0
        self.master_pose.y_cm = 0.0
        self.master_pose.distance_traveled_cm = 0.0
        self.follower_pose.x_cm = 0.0
        self.follower_pose.y_cm = 0.0
        self.follower_pose.distance_traveled_cm = 0.0
        self.master_trail.clear()
        self.follower_trail.clear()
        self.command_queue.clear()
        self._record_master_breadcrumb()
        self._record_follower_breadcrumb()

    async def issue_master_command(self, cmd: str) -> QueuedCommand:
        now = time.time()
        cmd_clean = cmd.strip().lower()
        if cmd_clean not in ["w", "s", "a", "d", "stop"]:
            cmd_clean = "stop"

        async with self._lock:
            self._integrate_step(now)
            self.master_pose.active_command = cmd_clean

            scheduled_time = now + self.delay_seconds
            item = QueuedCommand(
                command=cmd_clean,
                issue_timestamp=now,
                scheduled_exec_time=scheduled_time,
                executed=False
            )
            self.command_queue.append(item)
            return item

    async def start(self):
        self._is_running = True
        self._last_integration_time = time.time()
        if self._loop_task is None or self._loop_task.done():
            self._loop_task = asyncio.create_task(self._engine_loop())

    async def stop(self):
        self._is_running = False
        if self._loop_task:
            self._loop_task.cancel()

    async def _engine_loop(self):
        while self._is_running:
            now = time.time()
            async with self._lock:
                self._integrate_step(now)
                await self._process_follower_queue(now)
            await asyncio.sleep(0.02)

    def _integrate_step(self, now: float):
        dt = now - self._last_integration_time
        self._last_integration_time = now
        if dt <= 0 or dt > 0.5:
            return

        self._integrate_vehicle(self.master_pose, dt)
        self._integrate_vehicle(self.follower_pose, dt)

        if len(self.master_trail) == 0 or (now - self.master_trail[-1].get("t", 0)) >= 0.15:
            self._record_master_breadcrumb()
            self._record_follower_breadcrumb()

    def _integrate_vehicle(self, pose: VehiclePose, dt: float):
        cmd = pose.active_command
        yaw_rad = math.radians(pose.yaw_deg)

        if cmd == "w":
            lin_speed = self.speed_cm_per_sec
            pose.speed_cm_per_sec = lin_speed
            dx = math.sin(yaw_rad) * lin_speed * dt
            dy = math.cos(yaw_rad) * lin_speed * dt
            pose.x_cm += dx
            pose.y_cm += dy
            pose.distance_traveled_cm += lin_speed * dt
        elif cmd == "s":
            lin_speed = -self.speed_cm_per_sec
            pose.speed_cm_per_sec = lin_speed
            dx = math.sin(yaw_rad) * lin_speed * dt
            dy = math.cos(yaw_rad) * lin_speed * dt
            pose.x_cm += dx
            pose.y_cm += dy
            pose.distance_traveled_cm += abs(lin_speed) * dt
        elif cmd == "a":
            pose.speed_cm_per_sec = 0.0
            pose.yaw_deg = (pose.yaw_deg - 90.0 * dt) % 360.0
        elif cmd == "d":
            pose.speed_cm_per_sec = 0.0
            pose.yaw_deg = (pose.yaw_deg + 90.0 * dt) % 360.0
        else:
            pose.speed_cm_per_sec = 0.0

    async def _process_follower_queue(self, now: float):
        while self.command_queue and self.command_queue[0].scheduled_exec_time <= now:
            item = self.command_queue.popleft()
            item.executed = True
            self.follower_pose.active_command = item.command

            if self.on_follower_command_due:
                try:
                    res = self.on_follower_command_due(item.command)
                    if asyncio.iscoroutine(res):
                        await res
                except Exception as e:
                    logger.error(f"Follower dispatch error: {e}")

    def _record_master_breadcrumb(self):
        self.master_trail.append({
            "x": round(self.master_pose.x_cm, 1),
            "y": round(self.master_pose.y_cm, 1),
            "yaw": round(self.master_pose.yaw_deg, 1),
            "t": time.time()
        })

    def _record_follower_breadcrumb(self):
        self.follower_trail.append({
            "x": round(self.follower_pose.x_cm, 1),
            "y": round(self.follower_pose.y_cm, 1),
            "yaw": round(self.follower_pose.yaw_deg, 1),
            "t": time.time()
        })

    def get_gap_distance_cm(self) -> float:
        dx = self.master_pose.x_cm - self.follower_pose.x_cm
        dy = self.master_pose.y_cm - self.follower_pose.y_cm
        return round(math.sqrt(dx * dx + dy * dy), 1)

    def get_telemetry_snapshot(self) -> Dict[str, Any]:
        now = time.time()
        queue_items = []
        for item in list(self.command_queue):
            remaining = max(0.0, item.scheduled_exec_time - now)
            queue_items.append({
                "command": item.command,
                "issued_ago": round(now - item.issue_timestamp, 2),
                "remaining_sec": round(remaining, 2)
            })

        return {
            "master": {
                "x_cm": round(self.master_pose.x_cm, 1),
                "y_cm": round(self.master_pose.y_cm, 1),
                "yaw_deg": round(self.master_pose.yaw_deg, 1),
                "speed_cm_s": round(self.master_pose.speed_cm_per_sec, 1),
                "active_command": self.master_pose.active_command,
                "distance_cm": round(self.master_pose.distance_traveled_cm, 1)
            },
            "follower": {
                "x_cm": round(self.follower_pose.x_cm, 1),
                "y_cm": round(self.follower_pose.y_cm, 1),
                "yaw_deg": round(self.follower_pose.yaw_deg, 1),
                "speed_cm_s": round(self.follower_pose.speed_cm_per_sec, 1),
                "active_command": self.follower_pose.active_command,
                "distance_cm": round(self.follower_pose.distance_traveled_cm, 1)
            },
            "platooning": {
                "delay_sec": self.delay_seconds,
                "speed_constant_cm_s": self.speed_cm_per_sec,
                "gap_distance_cm": self.get_gap_distance_cm(),
                "queue_length": len(self.command_queue),
                "queue": queue_items
            },
            "trails": {
                "master": list(self.master_trail),
                "follower": list(self.follower_trail)
            }
        }
`,
  },
  {
    name: 'tcp_client.py',
    description: 'Asynchronous TCP socket client for Raspberry Pi motor actuators with auto-reconnection',
    content: `"""
PlatoonCommand - Asynchronous TCP Socket Client for Raspberry Pi Actuators
"""
import asyncio
import logging
from typing import Optional, Callable

logger = logging.getLogger("TCPClient")

class PiActuatorClient:
    def __init__(self, name: str, host: str, port: int, on_status_change: Optional[Callable[[str, bool], None]] = None):
        self.name = name
        self.host = host
        self.port = port
        self.on_status_change = on_status_change
        self.reader = None
        self.writer = None
        self.is_connected = False
        self._lock = asyncio.Lock()
        self._reconnect_task = None
        self._should_run = True

    async def start(self):
        self._should_run = True
        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.create_task(self._connection_loop())

    async def stop(self):
        self._should_run = False
        if self._reconnect_task:
            self._reconnect_task.cancel()
        await self._disconnect()

    async def update_target(self, host: str, port: int):
        if self.host != host or self.port != port:
            self.host = host
            self.port = port
            await self._disconnect()

    async def _connection_loop(self):
        retry_delay = 1.0
        while self._should_run:
            if not self.is_connected:
                try:
                    self.reader, self.writer = await asyncio.wait_for(
                        asyncio.open_connection(self.host, self.port),
                        timeout=3.0
                    )
                    self.is_connected = True
                    retry_delay = 1.0
                    if self.on_status_change:
                        self.on_status_change(self.name, True)
                except Exception:
                    self.is_connected = False
                    if self.on_status_change:
                        self.on_status_change(self.name, False)
                    await asyncio.sleep(retry_delay)
                    retry_delay = min(retry_delay * 1.5, 5.0)
                    continue

            try:
                if self.reader:
                    data = await asyncio.wait_for(self.reader.read(1024), timeout=1.0)
                    if not data:
                        await self._disconnect()
            except asyncio.TimeoutError:
                pass
            except Exception:
                await self._disconnect()

    async def send_command(self, cmd: str) -> bool:
        cmd_clean = cmd.strip().lower()
        async with self._lock:
            if not self.is_connected or not self.writer:
                return False
            try:
                self.writer.write(f"{cmd_clean}\\n".encode("utf-8"))
                await asyncio.wait_for(self.writer.drain(), timeout=0.5)
                return True
            except Exception:
                await self._disconnect()
                return False

    async def _disconnect(self):
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
`,
  },
  {
    name: 'udp_listener.py',
    description: 'UDP listener for Android phone orientation stream (JSON or CSV yaw)',
    content: `"""
PlatoonCommand - UDP Listener for Android Phone Orientation / Gyroscope Stream
"""
import asyncio
import json
import logging
import math
import time
from typing import Optional, Callable, Dict, Any

logger = logging.getLogger("UDPListener")

class AndroidUDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, on_yaw_update: Callable[[float, Dict[str, Any]], None]):
        super().__init__()
        self.on_yaw_update = on_yaw_update

    def datagram_received(self, data: bytes, addr):
        try:
            text = data.decode("utf-8").strip()
            yaw = self._parse_yaw(text)
            if yaw is not None:
                norm_yaw = ((yaw % 360.0) + 360.0) % 360.0
                self.on_yaw_update(norm_yaw, {"raw": text, "sender": addr[0]})
        except Exception:
            pass

    def _parse_yaw(self, text: str) -> Optional[float]:
        if text.startswith("{") and text.endswith("}"):
            try:
                payload = json.loads(text)
                for key in ["yaw", "azimuth", "heading", "rot_z", "rotZ", "z", "angle"]:
                    if key in payload:
                        return float(payload[key])
                if "values" in payload and len(payload["values"]) > 0:
                    return float(payload["values"][0])
            except Exception:
                pass

        for d in [",", ";", "\t", " "]:
            if d in text:
                parts = [p.strip() for p in text.split(d) if p.strip()]
                for p in parts:
                    try:
                        return float(p)
                    except ValueError:
                        continue
        try:
            return float(text)
        except ValueError:
            return None

class AndroidUDPListener:
    def __init__(self, port: int = 5005, on_yaw_callback: Optional[Callable[[float], None]] = None):
        self.port = port
        self.on_yaw_callback = on_yaw_callback
        self.current_yaw = 0.0
        self.last_packet_time = 0.0
        self.packet_count = 0
        self.packet_rate_hz = 0.0
        self._hz_counter = 0
        self._hz_timer = time.time()
        self.transport = None
        self.is_listening = False

    async def start(self):
        if self.is_listening:
            return
        loop = asyncio.get_running_loop()
        try:
            transport, _ = await loop.create_datagram_endpoint(
                lambda: AndroidUDPProtocol(self._handle_yaw_update),
                local_addr=("0.0.0.0", self.port)
            )
            self.transport = transport
            self.is_listening = True
        except Exception as e:
            logger.error(f"Failed to bind UDP port {self.port}: {e}")

    async def stop(self):
        if self.transport:
            self.transport.close()
            self.transport = None
        self.is_listening = False

    def _handle_yaw_update(self, yaw_deg: float, metadata: Dict[str, Any]):
        now = time.time()
        self.current_yaw = yaw_deg
        self.last_packet_time = now
        self.packet_count += 1
        self._hz_counter += 1

        if now - self._hz_timer >= 1.0:
            self.packet_rate_hz = round(self._hz_counter / (now - self._hz_timer), 1)
            self._hz_counter = 0
            self._hz_timer = now

        if self.on_yaw_callback:
            self.on_yaw_callback(yaw_deg)

    def is_stream_active(self, timeout_sec: float = 2.0) -> bool:
        return self.is_listening and (time.time() - self.last_packet_time < timeout_sec)
`,
  },
  {
    name: 'pi_l298n_server.py',
    description: 'Hardware GPIO script to run on each physical Raspberry Pi with L298N motor driver',
    content: `"""
PlatoonCommand - Real Raspberry Pi L298N Motor Driver TCP Actuator Server
Run this script on each physical Raspberry Pi.
Pins: IN1=17, IN2=27, IN3=22, IN4=23
"""
import argparse
import socket
import sys
import time

try:
    import RPi.GPIO as GPIO
    HARDWARE_GPIO = True
except ImportError:
    HARDWARE_GPIO = False

PIN_IN1, PIN_IN2, PIN_IN3, PIN_IN4 = 17, 27, 22, 23

def setup_gpio():
    if HARDWARE_GPIO:
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        for p in [PIN_IN1, PIN_IN2, PIN_IN3, PIN_IN4]:
            GPIO.setup(p, GPIO.OUT)
            GPIO.output(p, GPIO.LOW)

def set_motors(cmd: str):
    cmd = cmd.strip().lower()
    in1, in2, in3, in4 = 0, 0, 0, 0
    if cmd == "w":
        in1, in2, in3, in4 = 1, 0, 1, 0
    elif cmd == "s":
        in1, in2, in3, in4 = 0, 1, 0, 1
    elif cmd == "a":
        in1, in2, in3, in4 = 0, 1, 1, 0
    elif cmd == "d":
        in1, in2, in3, in4 = 1, 0, 0, 1

    if HARDWARE_GPIO:
        GPIO.output(PIN_IN1, GPIO.HIGH if in1 else GPIO.LOW)
        GPIO.output(PIN_IN2, GPIO.HIGH if in2 else GPIO.LOW)
        GPIO.output(PIN_IN3, GPIO.HIGH if in3 else GPIO.LOW)
        GPIO.output(PIN_IN4, GPIO.HIGH if in4 else GPIO.LOW)

    print(f"[{time.strftime('%H:%M:%S')}] CMD: {cmd.upper():<5} -> {in1},{in2},{in3},{in4}")

def run_server(port: int):
    setup_gpio()
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", port))
    server.listen(1)
    print(f"Raspberry Pi L298N Server listening on port {port}...")

    try:
        while True:
            conn, addr = server.accept()
            conn.settimeout(2.5)
            buffer = ""
            try:
                while True:
                    try:
                        data = conn.recv(1024)
                    except socket.timeout:
                        set_motors("stop")
                        continue
                    if not data:
                        set_motors("stop")
                        break
                    buffer += data.decode("utf-8")
                    while "\\n" in buffer:
                        cmd, buffer = buffer.split("\\n", 1)
                        if cmd.strip():
                            set_motors(cmd)
            except Exception:
                set_motors("stop")
            finally:
                conn.close()
    finally:
        set_motors("stop")
        if HARDWARE_GPIO:
            GPIO.cleanup()
        server.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8888)
    args = parser.parse_args()
    run_server(args.port)
`,
  },
  {
    name: 'requirements.txt',
    description: 'Python pip requirements list',
    content: `fastapi>=0.110.0
uvicorn[standard]>=0.29.0
websockets>=12.0
pydantic>=2.6.0
python-dotenv>=1.0.0
`,
  },
  {
    name: 'run_windows.bat',
    description: '1-Click Windows launcher script for PowerShell or CMD',
    content: `@echo off
echo ========================================================
echo   PlatoonCommand - Central Command Center Launcher
echo ========================================================
echo.

IF NOT EXIST "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\\Scripts\\activate.bat

echo Checking and installing dependencies...
pip install -r requirements.txt

echo.
echo Starting PlatoonCommand Server on http://localhost:8000 ...
python main.py

pause
`,
  },
  {
    name: 'forward_udp_to_webapp.py',
    description: 'Instant lightweight Python bridge: forwards your phone UDP stream straight into this web dashboard with 0 setup',
    content: `"""
PlatoonCommand - Phone Gyro to WebApp Live Bridge
Run this on your laptop to bridge your Android phone's UDP stream directly into the web dashboard!

Features:
  - Non-blocking background worker thread (zero packet drops at 50Hz)
  - Computes running Yaw angle in real-time right inside your terminal
  - Auto-forwards packets to WebApp (/api/stream)
  - Supports Car1 (Master) and Car2 (Follower) dual phone streams

How to run:
    python backend/forward_udp_to_webapp.py --port 5005
"""

import socket
import sys
import argparse
import time
import math
import re
import queue
import threading
import requests

def extract_gyro_z(text: str) -> tuple[float, str]:
    is_follower = bool(re.search(r'car\\s*2|follower', text, re.I))
    device = "Car2 (Follower)" if is_follower else "Car1 (Master)"
    match = re.search(r'X:\\s*([-\\d.]+)[,\\s]+Y:\\s*([-\\d.]+)[,\\s]+Z:\\s*([-\\d.]+)', text, re.I)
    if match:
        return float(match.group(3)), device
    z_match = re.search(r'Z:\\s*([-\\d.]+)', text, re.I)
    if z_match:
        return float(z_match.group(1)), device
    return 0.0, device

def forward_worker(packet_queue: queue.Queue, target_urls: list[str]):
    session = requests.Session()
    while True:
        try:
            packet_text = packet_queue.get()
            if packet_text is None:
                break
            for url in target_urls:
                try:
                    resp = session.post(url, json={"packet": packet_text}, timeout=0.3)
                    if resp.status_code == 200:
                        break
                except Exception:
                    continue
        except Exception:
            pass

def main():
    parser = argparse.ArgumentParser(description="Forward UDP Gyro stream to WebApp")
    parser.add_argument("--port", type=int, default=5005, help="UDP listening port (default 5005)")
    parser.add_argument("--url", type=str, default="http://localhost:3000/api/stream")
    parser.add_argument("--cloud-url", type=str, default="https://ais-dev-jsumytbwfcctdyxegicwrc-815602787689.asia-southeast1.run.app/api/stream")
    args = parser.parse_args()

    target_urls = [args.url]
    if args.cloud_url and args.cloud_url != args.url:
        target_urls.append(args.cloud_url)

    packet_queue = queue.Queue(maxsize=200)
    worker_thread = threading.Thread(target=forward_worker, args=(packet_queue, target_urls), daemon=True)
    worker_thread.start()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", args.port))
    except Exception as e:
        print(f"Error binding port {args.port}: {e}")
        sys.exit(1)

    print("=" * 65)
    print("📡 PLATOONCOMMAND PHONE-TO-WEBAPP LIVE BRIDGE")
    print(f"  • Listening on UDP Port : {args.port}")
    print(f"  • Primary Target        : {args.url}")
    print("📲 Waiting for gyro packets... (Press Ctrl+C to stop)")
    print("=" * 65)

    pkt_count = 0
    master_yaw = 0.0
    follower_yaw = 0.0
    last_time = time.time()

    while True:
        try:
            data, addr = sock.recvfrom(2048)
            text = data.decode("utf-8", errors="ignore").strip()
            now = time.time()
            dt = min(max(now - last_time, 0.005), 0.2)
            last_time = now

            pkt_count += 1
            gz, device = extract_gyro_z(text)
            gz_deg_s = gz * (180.0 / math.pi)

            if abs(gz_deg_s) > 0.05:
                if "Car2" in device:
                    follower_yaw += gz_deg_s * dt
                else:
                    master_yaw += gz_deg_s * dt

            current_yaw = follower_yaw if "Car2" in device else master_yaw
            print(f"[{pkt_count:04d}] {device} | gz: {gz:+0.4f} rad/s ({gz_deg_s:+05.1f}°/s) | Yaw: {current_yaw:+06.1f}°")

            if not packet_queue.full():
                packet_queue.put_nowait(text)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Receive error: {e}")

if __name__ == "__main__":
    main()
`,
  },
];

export const BackendCodeDrawer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string>(BACKEND_FILES[0].name);
  const [copied, setCopied] = useState<boolean>(false);
  const [zipping, setZipping] = useState<boolean>(false);

  const active = BACKEND_FILES.find((f) => f.name === selectedFile) || BACKEND_FILES[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(active.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingle = () => {
    const blob = new Blob([active.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = active.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('platoon_command_backend');
      BACKEND_FILES.forEach((f) => {
        folder?.file(f.name, f.content);
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'platoon_command_windows_package.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('ZIP generation failed', e);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Top Banner / Quick Instructions */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            Python Backend & Windows Setup Center
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Download the pre-configured Python backend or copy files directly into your Windows project directory.
          </p>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={zipping}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono rounded-lg transition-all shadow-md shrink-0 cursor-pointer"
        >
          <Archive className="w-4 h-4" />
          <span>{zipping ? 'Creating ZIP...' : 'Download Complete Package (.ZIP)'}</span>
        </button>
      </div>

      {/* Windows Step-by-Step Command Strip */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs">
        <span className="text-slate-400 font-semibold block mb-2">Windows PowerShell 3-Step Setup:</span>
        <div className="space-y-1.5 text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 select-none">1.</span>
            <code>python -m venv venv & .\venv\Scripts\Activate.ps1</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 select-none">2.</span>
            <code>pip install -r requirements.txt</code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 select-none">3.</span>
            <code>python main.py</code>
          </div>
        </div>
      </div>

      {/* Interactive Code Viewer Stage */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex flex-col">
        {/* File Tabs Strip */}
        <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            {BACKEND_FILES.map((file) => (
              <button
                key={file.name}
                onClick={() => setSelectedFile(file.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-colors whitespace-nowrap cursor-pointer ${
                  selectedFile === file.name
                    ? 'bg-slate-800 text-cyan-400 font-semibold border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>{file.name}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0 pl-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>
            <button
              onClick={handleDownloadSingle}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download</span>
            </button>
          </div>
        </div>

        {/* File Description Header */}
        <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800/80 text-xs font-mono text-slate-400">
          <span className="text-slate-200 font-semibold">{active.name}:</span> {active.description}
        </div>

        {/* Code Content Container */}
        <pre className="p-4 bg-slate-950 text-slate-300 text-xs font-mono overflow-x-auto max-h-[550px] leading-relaxed select-text">
          <code>{active.content}</code>
        </pre>
      </div>
    </div>
  );
};
