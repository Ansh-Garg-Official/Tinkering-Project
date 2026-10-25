"""
PlatoonCommand - Dual Mobile Phone UDP Listener for Master & Follower Gyroscopes
"""

import asyncio
import logging
import math
import re
import time
from typing import Optional, Callable, Dict, Any, List

logger = logging.getLogger("UDPListener")

class DeviceGyroTracker:
    def __init__(self, name: str, deadband_deg_s: float = 0.05):
        self.name = name
        self.deadband_deg_s = deadband_deg_s
        self.last_sample_time: Optional[float] = None
        self.current_gx_rad_s: float = 0.0
        self.current_gy_rad_s: float = 0.0
        self.current_gz_rad_s: float = 0.0
        self.current_gz_deg_s: float = 0.0
        self.integrated_yaw_deg: float = 0.0
        self.yaw_mod_360: float = 0.0
        self.last_raw_packet: str = ""
        self.last_sender_addr: str = ""
        
        self.packet_count: int = 0
        self.packet_rate_hz: float = 0.0
        self._hz_counter: int = 0
        self._hz_timer: float = time.time()
        self.packet_history: List[Dict[str, Any]] = []

        self.is_turning_commanded: bool = False
        self.commanded_turn_dir: str = ""
        self.turn_start_yaw: float = 0.0
        self.turn_start_time: float = 0.0
        self.turn_verified: bool = False
        self.turn_status: str = "IDLE"

    def reset_yaw(self, initial_val: float = 0.0):
        self.integrated_yaw_deg = initial_val
        # Restrict to [-180, 180] degree range
        self.yaw_mod_360 = round(((initial_val + 180.0) % 360.0) - 180.0, 1)
        self.last_sample_time = None

    def start_turn_verification(self, direction: str):
        self.is_turning_commanded = True
        self.commanded_turn_dir = direction
        self.turn_start_yaw = self.integrated_yaw_deg
        self.turn_start_time = time.time()
        self.turn_verified = False
        self.turn_status = f"VERIFYING (Commanded {direction})"

    def stop_turn_verification(self):
        delta = abs(self.integrated_yaw_deg - self.turn_start_yaw)
        if self.turn_verified:
            self.turn_status = f"VERIFIED OK (Measured {delta:.1f}° turn)"
        else:
            self.turn_status = "IDLE"
        self.is_turning_commanded = False

    def process_sample(self, gx: float, gy: float, gz: float, timestamp: float, raw_text: str, sender_addr: str):
        self.last_raw_packet = raw_text
        self.last_sender_addr = sender_addr
        self.packet_count += 1
        self._hz_counter += 1

        now = time.time()
        if now - self._hz_timer >= 1.0:
            self.packet_rate_hz = round(self._hz_counter / (now - self._hz_timer), 1)
            self._hz_counter = 0
            self._hz_timer = now

        self.current_gx_rad_s = gx
        self.current_gy_rad_s = gy
        self.current_gz_rad_s = gz

        # INVERT Z-axis so Left = Left and Right = Right
        gz_deg_s = -gz * (180.0 / math.pi)

        if abs(gz_deg_s) < self.deadband_deg_s:
            gz_deg_s = 0.0
        self.current_gz_deg_s = gz_deg_s

        if self.last_sample_time is not None:
            dt = timestamp - self.last_sample_time
            if dt <= 0:
                dt = 0.05
            if 0 < dt < 2.0:
                delta_yaw = gz_deg_s * dt
                self.integrated_yaw_deg += delta_yaw

        self.last_sample_time = timestamp

        # Strictly restrict angle to [-180, 180] degree boundary limits
        self.yaw_mod_360 = round(((self.integrated_yaw_deg + 180.0) % 360.0) - 180.0, 1)

        if self.is_turning_commanded:
            turn_elapsed = now - self.turn_start_time
            delta_turn = abs(self.integrated_yaw_deg - self.turn_start_yaw)
            if abs(self.current_gz_deg_s) > 2.0 or delta_turn > 2.0:
                self.turn_verified = True
                self.turn_status = f"ROTATION CONFIRMED: {delta_turn:.1f}° (Gyro {self.current_gz_deg_s:+.1f}°/s)"
            elif turn_elapsed > 1.2 and not self.turn_verified:
                self.turn_status = f"WARNING: No rotation detected for {turn_elapsed:.1f}s (Check Wheels/Motors)"

        entry = {
            "time": time.strftime("%H:%M:%S", time.localtime(now)),
            "device": self.name,
            "raw": raw_text,
            "sender": sender_addr,
            "gx": round(gx, 4),
            "gy": round(gy, 4),
            "gz": round(gz, 4),
            "gz_deg_s": round(self.current_gz_deg_s, 2),
            "yaw_deg": self.yaw_mod_360,
            "yaw_accumulated": round(self.integrated_yaw_deg, 2)
        }
        self.packet_history.append(entry)
        if len(self.packet_history) > 30:
            self.packet_history.pop(0)

    def is_active(self, timeout_sec: float = 2.0) -> bool:
        return self.last_sample_time is not None and (time.time() - self.last_sample_time < timeout_sec)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "is_active": self.is_active(),
            "packet_count": self.packet_count,
            "packet_rate_hz": self.packet_rate_hz,
            "gz_rad_s": round(self.current_gz_rad_s, 4),
            "gz_deg_s": round(self.current_gz_deg_s, 2),
            "integrated_yaw_deg": round(self.integrated_yaw_deg, 2),
            "yaw_mod_360": self.yaw_mod_360,
            "last_packet_raw": self.last_raw_packet,
            "last_sender": self.last_sender_addr,
            "turn_status": self.turn_status,
            "turn_verified": self.turn_verified
        }

class DualUDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, listener: "AndroidUDPListener", default_device: str = "Master"):
        super().__init__()
        self.listener = listener
        self.default_device = default_device

    def datagram_received(self, data: bytes, addr):
        try:
            text = data.decode("utf-8", errors="ignore").strip()
            sender_str = f"{addr[0]}:{addr[1]}"
            self.listener.handle_incoming_packet(text, sender_str, self.default_device)
        except Exception:
            pass

class AndroidUDPListener:
    def __init__(
        self,
        master_port: int = 5005,
        follower_port: int = 5006,
        deadband_deg_s: float = 0.05,
        on_master_yaw_integrated: Optional[Callable[[float, float, float], None]] = None,
        on_follower_yaw_integrated: Optional[Callable[[float, float, float], None]] = None,
        on_packet_for_webapp: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        self.master_port = master_port
        self.follower_port = follower_port
        self.deadband_deg_s = deadband_deg_s
        self.on_master_yaw_integrated = on_master_yaw_integrated
        self.on_follower_yaw_integrated = on_follower_yaw_integrated
        self.on_packet_for_webapp = on_packet_for_webapp

        self.master_tracker = DeviceGyroTracker("Master (Car 1)", deadband_deg_s)
        self.follower_tracker = DeviceGyroTracker("Follower (Car 2)", deadband_deg_s)

        self.transport_master: Optional[asyncio.DatagramTransport] = None
        self.transport_follower: Optional[asyncio.DatagramTransport] = None
        self.is_listening: bool = False
        self.recent_packets_all: List[Dict[str, Any]] = []

    async def start(self):
        if self.is_listening:
            return
        loop = asyncio.get_running_loop()
        try:
            transport1, _ = await loop.create_datagram_endpoint(
                lambda: DualUDPProtocol(self, default_device="Master"),
                local_addr=("0.0.0.0", self.master_port)
            )
            self.transport_master = transport1

            try:
                transport2, _ = await loop.create_datagram_endpoint(
                    lambda: DualUDPProtocol(self, default_device="Follower"),
                    local_addr=("0.0.0.0", self.follower_port)
                )
                self.transport_follower = transport2
            except Exception:
                pass

            self.is_listening = True
        except Exception:
            self.is_listening = False

    async def stop(self):
        if self.transport_master:
            self.transport_master.close()
            self.transport_master = None
        if self.transport_follower:
            self.transport_follower.close()
            self.transport_follower = None
        self.is_listening = False

    def reset_integrated_yaw(self, master_val: float = 0.0, follower_val: float = 0.0):
        self.master_tracker.reset_yaw(master_val)
        self.follower_tracker.reset_yaw(follower_val)

    def handle_incoming_packet(self, text: str, sender_addr: str, default_device: str):
        now = time.time()
        lines = [line.strip() for line in text.strip().split('\n') if line.strip()]
        
        for idx, line in enumerate(lines):
            print(f"📡 RAW IN [{default_device} Port]: {line}")
            
            numbers = re.findall(r"[-+]?(?:\d*\.*\d+)", line)
            
            if len(numbers) >= 3:
                gz = float(numbers[-1])
                gy = float(numbers[-2])
                gx = float(numbers[-3])
                
                device_target = default_device
                tracker = self.follower_tracker if device_target == "Follower" else self.master_tracker
                
                simulated_timestamp = now + (idx * 0.05)
                tracker.process_sample(gx, gy, gz, simulated_timestamp, line, sender_addr)

                print(f"✅ [{tracker.name}] Extracted Z: {gz:.4f} ➔ Angle Rotated: {tracker.yaw_mod_360:.1f}°")

                if device_target == "Follower":
                    if self.on_follower_yaw_integrated:
                        self.on_follower_yaw_integrated(tracker.integrated_yaw_deg, tracker.current_gz_deg_s, 0.0)
                else:
                    if self.on_master_yaw_integrated:
                        self.on_master_yaw_integrated(tracker.integrated_yaw_deg, tracker.current_gz_deg_s, 0.0)

                if self.on_packet_for_webapp:
                    try:
                        self.on_packet_for_webapp({
                            "packet": line,
                            "raw": line,
                            "device": tracker.name,
                            "gx": round(gx, 4),
                            "gy": round(gy, 4),
                            "gz": round(gz, 4),
                            "gz_deg_s": round(tracker.current_gz_deg_s, 2),
                            "yaw_deg": tracker.yaw_mod_360,
                            "yaw_accumulated": round(tracker.integrated_yaw_deg, 2)
                        })
                    except Exception:
                        pass

                pkt_entry = {
                    "time": time.strftime("%H:%M:%S", time.localtime(now)),
                    "device": device_target,
                    "raw": line,
                    "sender": sender_addr,
                    "gx": round(gx, 4),
                    "gy": round(gy, 4),
                    "gz": round(gz, 4),
                    "gz_deg_s": round((gz * 180.0 / math.pi) if gz else 0.0, 2),
                    "yaw_deg": tracker.yaw_mod_360,
                    "yaw_accumulated": round(tracker.integrated_yaw_deg, 2)
                }
                self.recent_packets_all.append(pkt_entry)
                if len(self.recent_packets_all) > 40:
                    self.recent_packets_all.pop(0)

    def notify_command_started(self, device: str, cmd: str):
        if device.lower().startswith("m"):
            if cmd in ["a", "d"]:
                self.master_tracker.start_turn_verification("Left" if cmd == "a" else "Right")
            elif cmd == "stop" and self.master_tracker.is_turning_commanded:
                self.master_tracker.stop_turn_verification()
        elif device.lower().startswith("f"):
            if cmd in ["a", "d"]:
                self.follower_tracker.start_turn_verification("Left" if cmd == "a" else "Right")
            elif cmd == "stop" and self.follower_tracker.is_turning_commanded:
                self.follower_tracker.stop_turn_verification()

    @property
    def packet_count(self) -> int:
        return self.master_tracker.packet_count + self.follower_tracker.packet_count

    @property
    def packet_rate_hz(self) -> float:
        return round(self.master_tracker.packet_rate_hz + self.follower_tracker.packet_rate_hz, 1)

    @property
    def current_gz_deg_s(self) -> float:
        return self.master_tracker.current_gz_deg_s

    @property
    def last_packet_raw(self) -> str:
        return self.master_tracker.last_raw_packet or self.follower_tracker.last_raw_packet

    def is_stream_active(self, timeout_sec: float = 2.0) -> bool:
        return self.master_tracker.is_active(timeout_sec) or self.follower_tracker.is_active(timeout_sec)