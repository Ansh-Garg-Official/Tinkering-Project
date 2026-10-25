"""
PlatoonCommand - Central Command Center Backend (FastAPI + WebSockets)
"""

import asyncio
import json
import logging
import queue
import socket
import threading
import time
import urllib.request
import urllib.error
from contextlib import asynccontextmanager
from typing import Set, Dict, Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tcp_client import PiActuatorClient
from udp_listener import AndroidUDPListener
from platooning_engine import PlatooningEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("PlatoonServer")

def get_local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        try:
            IP = socket.gethostbyname(socket.gethostname())
        except Exception:
            IP = '127.0.0.1'
    finally:
        s.close()
    return IP

CONFIG = {
    "master_host": "192.168.137.75",
    "master_port": 8888,
    "follower_host": "192.168.137.240",
    "follower_port": 8888,
    "udp_port": 5005,
    "follower_udp_port": 5006,
    "delay_sec": 4.0,
    "master_speed_cm_s": 35.0,
    "follower_speed_cm_s": 35.0,
    "master_initial_heading_deg": 0.0,
    "follower_initial_heading_deg": 0.0,
    "safe_distance_cm": 30.0,
    "local_ip": get_local_ip(),
    "webapp_url": "http://localhost:3000/api/stream",
    "webapp_cloud_url": "https://ais-dev-jsumytbwfcctdyxegicwrc-815602787689.asia-southeast1.run.app/api/stream"
}

active_websockets: Set[WebSocket] = set()
master_client = PiActuatorClient("Master", CONFIG["master_host"], CONFIG["master_port"])
follower_client = PiActuatorClient("Follower", CONFIG["follower_host"], CONFIG["follower_port"])

async def handle_follower_due_command(cmd: str):
    udp_listener.notify_command_started("Follower", cmd)
    await follower_client.send_command(cmd)

async def handle_master_command_override(cmd: str):
    udp_listener.notify_command_started("Master", cmd)
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

last_master_print = 0.0
last_follower_print = 0.0

def on_master_yaw_sample_integrated(integrated_yaw: float, gz_deg_s: float, dt: float):
    engine.update_integrated_gyro_yaw(integrated_yaw)
    global last_master_print
    now = time.time()
    if now - last_master_print >= 0.5:
        print(f"🚗 Master Angle Rotated: {engine.master_pose.yaw_deg:.1f}°", flush=True)
        last_master_print = now

def on_follower_yaw_sample_integrated(integrated_yaw: float, gz_deg_s: float, dt: float):
    engine.update_follower_integrated_gyro_yaw(integrated_yaw)
    global last_follower_print
    now = time.time()
    if now - last_follower_print >= 0.5:
        print(f"🚙 Follower Angle Rotated: {engine.follower_pose.yaw_deg:.1f}°", flush=True)
        last_follower_print = now

webapp_forward_queue: queue.Queue = queue.Queue(maxsize=300)

def webapp_forward_worker():
    urls = [CONFIG["webapp_url"], CONFIG["webapp_cloud_url"]]
    while True:
        try:
            item = webapp_forward_queue.get()
            if item is None:
                break
            while not webapp_forward_queue.empty():
                try:
                    item = webapp_forward_queue.get_nowait()
                except queue.Empty:
                    break

            payload_bytes = json.dumps(item).encode("utf-8")
            for url in urls:
                try:
                    req = urllib.request.Request(
                        url,
                        data=payload_bytes,
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=0.25) as resp:
                        if resp.status in (200, 201, 204):
                            break
                except Exception:
                    pass
        except Exception:
            pass

forward_thread = threading.Thread(target=webapp_forward_worker, daemon=True)
forward_thread.start()

def on_packet_for_webapp(packet_data: Dict[str, Any]):
    if not webapp_forward_queue.full():
        webapp_forward_queue.put_nowait(packet_data)

udp_listener = AndroidUDPListener(
    master_port=CONFIG["udp_port"],
    follower_port=CONFIG["follower_udp_port"],
    deadband_deg_s=0.05,
    on_master_yaw_integrated=on_master_yaw_sample_integrated,
    on_follower_yaw_integrated=on_follower_yaw_sample_integrated,
    on_packet_for_webapp=on_packet_for_webapp
)

broadcast_task: asyncio.Task = None

async def broadcast_loop():
    while True:
        try:
            engine.master_connected = master_client.is_connected
            engine.follower_connected = follower_client.is_connected
            engine.has_follower_phone = udp_listener.follower_tracker.is_active(timeout_sec=2.0)

            if active_websockets:
                snapshot = engine.get_telemetry_snapshot()
                
                snapshot["master"]["yaw_angle"] = snapshot["master"]["yaw_deg"]
                snapshot["follower"]["yaw_angle"] = snapshot["follower"]["yaw_deg"]

                if udp_listener.is_stream_active():
                    snapshot["platooning"]["integrated_yaw_deg"] = udp_listener.master_tracker.yaw_mod_360
                    if udp_listener.follower_tracker.is_active():
                        snapshot["platooning"]["follower_integrated_yaw_deg"] = udp_listener.follower_tracker.yaw_mod_360
                
                payload = {
                    "type": "telemetry",
                    "timestamp": time.time(),
                    "telemetry": snapshot,
                    "connections": {
                        "master_tcp": master_client.is_connected,
                        "follower_tcp": follower_client.is_connected,
                        "master_last_cmd": master_client.last_command,
                        "follower_last_cmd": follower_client.last_command,
                        "phone_master": udp_listener.master_tracker.to_dict(),
                        "phone_follower": udp_listener.follower_tracker.to_dict(),
                        "android_udp": udp_listener.is_stream_active(),
                        "udp_packet_count": udp_listener.packet_count,
                        "udp_hz": udp_listener.packet_rate_hz,
                        "current_gz_deg_s": udp_listener.current_gz_deg_s,
                        "last_raw_packet": udp_listener.last_packet_raw,
                        "recent_packets": udp_listener.recent_packets_all[-20:],
                        "local_ip": CONFIG["local_ip"],
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
            await asyncio.sleep(0.04)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Broadcast loop error: {e}")
            await asyncio.sleep(0.1)

async def emergency_stop():
    udp_listener.notify_command_started("Master", "stop")
    udp_listener.notify_command_started("Follower", "stop")
    asyncio.create_task(master_client.send_command("stop"))
    asyncio.create_task(follower_client.send_command("stop"))
    await engine.issue_master_command("stop")

@asynccontextmanager
async def lifespan(app: FastAPI):
    CONFIG["local_ip"] = get_local_ip()
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InitialStatePayload(BaseModel):
    m_x: float = 0.0
    m_y: float = 0.0
    f_x: float = 0.0
    f_y: float = 0.0
    master_initial_heading: float = 0.0
    follower_initial_heading: float = 0.0
    initial_heading: float = None
    master_speed: float = 35.0
    follower_speed: float = 35.0
    safe_distance: float = 30.0

class PreciseTurnPayload(BaseModel):
    target_angle: float = 90.0
    direction: str = "Left"

class DirectCommandPayload(BaseModel):
    target: str = "master"
    cmd: str = "w"

class TestUDPPacketPayload(BaseModel):
    raw_packet: str = "[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037"

@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "timestamp": time.time(),
        "local_ip": CONFIG["local_ip"],
        "config": CONFIG,
        "connections": {
            "master_tcp": master_client.is_connected,
            "follower_tcp": follower_client.is_connected,
            "phone_master": udp_listener.master_tracker.to_dict(),
            "phone_follower": udp_listener.follower_tracker.to_dict(),
            "android_udp": udp_listener.is_stream_active(),
            "udp_hz": udp_listener.packet_rate_hz
        },
        "telemetry": engine.get_telemetry_snapshot()
    }

@app.get("/api/network_info")
async def get_network_info():
    CONFIG["local_ip"] = get_local_ip()
    return {
        "local_ip": CONFIG["local_ip"],
        "master_udp_port": CONFIG["udp_port"],
        "follower_udp_port": CONFIG["follower_udp_port"],
        "master_tcp_target": f"{CONFIG['master_host']}:{CONFIG['master_port']}",
        "follower_tcp_target": f"{CONFIG['follower_host']}:{CONFIG['follower_port']}",
        "master_tag_examples": ["[Car1] Gyro (rad/s) -> ...", "[Master] Gyro (rad/s) -> ..."],
        "follower_tag_examples": ["[Car2] Gyro (rad/s) -> ...", "[Follower] Gyro (rad/s) -> ..."]
    }

@app.post("/api/emergency_stop")
async def api_emergency_stop():
    await emergency_stop()
    return {"status": "stopped"}

@app.post("/api/direct_command")
async def api_direct_command(payload: DirectCommandPayload):
    cmd = payload.cmd.strip().lower()
    target = payload.target.strip().lower()
    sent_master = False
    sent_follower = False

    if target in ["master", "both"]:
        udp_listener.notify_command_started("Master", cmd)
        sent_master = await master_client.send_command(cmd)

    if target in ["follower", "both"]:
        udp_listener.notify_command_started("Follower", cmd)
        sent_follower = await follower_client.send_command(cmd)

    return {
        "status": "dispatched",
        "cmd": cmd,
        "target": target,
        "master_connected": master_client.is_connected,
        "follower_connected": follower_client.is_connected,
        "sent_master": sent_master,
        "sent_follower": sent_follower
    }

@app.post("/api/test_udp_packet")
async def api_test_udp_packet(payload: TestUDPPacketPayload):
    udp_listener.handle_incoming_packet(
        text=payload.raw_packet,
        sender_addr="127.0.0.1:TEST",
        default_device="Master"
    )
    return {
        "status": "injected",
        "packet": payload.raw_packet,
        "master_yaw": udp_listener.master_tracker.integrated_yaw_deg,
        "follower_yaw": udp_listener.follower_tracker.integrated_yaw_deg
    }

@app.post("/api/initial_state")
async def set_initial_state(payload: InitialStatePayload):
    m_head = payload.master_initial_heading if payload.initial_heading is None else payload.initial_heading
    f_head = payload.follower_initial_heading if payload.follower_initial_heading is not None else m_head

    CONFIG["master_initial_heading_deg"] = m_head
    CONFIG["follower_initial_heading_deg"] = f_head
    CONFIG["master_speed_cm_s"] = payload.master_speed
    CONFIG["follower_speed_cm_s"] = payload.follower_speed
    CONFIG["safe_distance_cm"] = payload.safe_distance

    udp_listener.reset_integrated_yaw(0.0, 0.0)
    engine.set_initial_configuration(
        m_x=payload.m_x,
        m_y=payload.m_y,
        f_x=payload.f_x,
        f_y=payload.f_y,
        m_heading=m_head,
        f_heading=f_head,
        m_speed=payload.master_speed,
        f_speed=payload.follower_speed,
        safe_distance=payload.safe_distance
    )
    return {"status": "initialized", "config": CONFIG}

@app.post("/api/precise_turn")
async def api_precise_turn(payload: PreciseTurnPayload):
    engine.start_precise_turn(payload.target_angle, payload.direction)
    return {
        "status": "turn_initiated",
        "target_angle": payload.target_angle,
        "direction": payload.direction
    }

@app.websocket("/ws")
@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            try:
                if msg_type == "command":
                    cmd = str(data.get("cmd", "stop")).lower()
                    udp_listener.notify_command_started("Master", cmd)
                    asyncio.create_task(master_client.send_command(cmd))
                    await engine.issue_master_command(cmd)

                elif msg_type == "direct_car_command":
                    cmd = str(data.get("cmd", "stop")).lower()
                    car = str(data.get("car", "master")).lower()
                    if car == "master":
                        udp_listener.notify_command_started("Master", cmd)
                        asyncio.create_task(master_client.send_command(cmd))
                    elif car == "follower":
                        udp_listener.notify_command_started("Follower", cmd)
                        asyncio.create_task(follower_client.send_command(cmd))

                elif msg_type == "test_udp_packet":
                    raw_pkt = str(data.get("raw", "[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037"))
                    udp_listener.handle_incoming_packet(raw_pkt, "127.0.0.1:SIM", "Master")

                elif msg_type == "precise_turn":
                    target = float(data.get("target_angle", 90.0))
                    direction = str(data.get("direction", "Left"))
                    udp_listener.notify_command_started("Master", "a" if direction == "Left" else "d")
                    engine.start_precise_turn(target, direction)

                elif msg_type == "set_initial_state":
                    m_x = float(data.get("m_x", 0.0))
                    m_y = float(data.get("m_y", 0.0))
                    f_x = float(data.get("f_x", 0.0))
                    f_y = float(data.get("f_y", 0.0))
                    m_heading = float(data.get("master_initial_heading", data.get("initial_heading", 0.0)))
                    f_heading = float(data.get("follower_initial_heading", m_heading))
                    m_speed = float(data.get("master_speed", 35.0))
                    f_speed = float(data.get("follower_speed", 35.0))
                    safe_dist = float(data.get("safe_distance", data.get("safe_distance_cm", 30.0)))

                    CONFIG["master_initial_heading_deg"] = m_heading
                    CONFIG["follower_initial_heading_deg"] = f_heading
                    CONFIG["master_speed_cm_s"] = m_speed
                    CONFIG["follower_speed_cm_s"] = f_speed
                    CONFIG["safe_distance_cm"] = safe_dist

                    udp_listener.reset_integrated_yaw(0.0, 0.0)
                    engine.set_initial_configuration(
                        m_x=m_x,
                        m_y=m_y,
                        f_x=f_x,
                        f_y=f_y,
                        m_heading=m_heading,
                        f_heading=f_heading,
                        m_speed=m_speed,
                        f_speed=f_speed,
                        safe_distance=safe_dist
                    )

                elif msg_type == "emergency_stop":
                    await emergency_stop()

                elif msg_type == "set_delay":
                    new_delay = float(data.get("delay", 4.0))
                    CONFIG["delay_sec"] = new_delay
                    engine.set_delay(new_delay)

                elif msg_type == "set_speeds":
                    m_spd = float(data.get("master_speed", 35.0))
                    f_spd = float(data.get("follower_speed", 35.0))
                    CONFIG["master_speed_cm_s"] = m_spd
                    CONFIG["follower_speed_cm_s"] = f_spd
                    engine.set_speeds(m_spd, f_spd)

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong", "time": time.time()})

            except Exception as inner_e:
                logger.error(f"WebSocket message error ({msg_type}): {inner_e}")

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        active_websockets.discard(websocket)

if __name__ == "__main__":
    import uvicorn
    local_ip = CONFIG["local_ip"]
    print("=" * 65)
    print("🚀  PLATOONCOMMAND CENTRAL SERVER STARTED!")
    print("=" * 65)
    print(f"📡  UDP Gyroscope Listener Active on {local_ip}:{CONFIG['udp_port']}")
    print("=" * 65 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)