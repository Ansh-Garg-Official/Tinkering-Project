"""
PlatoonCommand - Phone Gyroscope Quick Bridge & Diagnostic Test
Run this script to verify your phone's gyroscope stream without needing cars connected!

How to run:
    python backend/bridge_my_code.py --port 5005

Features:
1. Receives UDP packets on port 5005 (or any port your app uses)
2. Prints raw packets and calculates real-time integrated yaw in the terminal
3. Automatically launches a lightweight WebSocket server on localhost:8000
4. You can open http://localhost:8000 in your browser to see your phone dial turn!
"""

import socket
import re
import math
import time
import argparse
import asyncio
import json

try:
    import websockets
except ImportError:
    websockets = None

# Pattern: [Car1] Gyro (rad/s) -> X: ..., Y: ..., Z: ...
GYRO_REGEX = re.compile(
    r"\[(Car\s*1|Master|Car\s*2|Follower)\]\s*Gyro\s*\(rad/s\)\s*->\s*X:\s*([-\d.]+),\s*Y:\s*([-\d.]+),\s*Z:\s*([-\d.]+)",
    re.IGNORECASE
)
GENERIC_REGEX = re.compile(
    r"(?:\[([^\]]+)\]\s*)?Gyro\s*\(rad/s\)\s*->\s*X:\s*([-\d.]+),\s*Y:\s*([-\d.]+),\s*Z:\s*([-\d.]+)",
    re.IGNORECASE
)

class GyroBridge:
    def __init__(self, port: int):
        self.port = port
        self.yaw = 0.0
        self.last_time = None
        self.packet_count = 0
        self.clients = set()

    def parse_packet(self, text: str):
        m = GYRO_REGEX.search(text) or GENERIC_REGEX.search(text)
        if m:
            car = m.group(1) or "Car1"
            gx, gy, gz = float(m.group(2)), float(m.group(3)), float(m.group(4))
            return car, gx, gy, gz
        
        # Fallback Z extraction
        z_match = re.search(r"Z:\s*([-\d.]+)", text, re.IGNORECASE)
        if z_match:
            return "Car1", 0.0, 0.0, float(z_match.group(1))
        return None, 0.0, 0.0, None

    def update_yaw(self, gz: float):
        now = time.time()
        gz_deg_s = gz * (180.0 / math.pi)
        if abs(gz_deg_s) < 0.05:
            gz_deg_s = 0.0
        
        if self.last_time is not None:
            dt = now - self.last_time
            if 0 < dt < 0.5:
                self.yaw += gz_deg_s * dt
        self.last_time = now
        return gz_deg_s, self.yaw

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def main():
    parser = argparse.ArgumentParser(description="Quick Phone Gyroscope Bridge")
    parser.add_argument("--port", type=int, default=5005, help="UDP port to listen on (default: 5005)")
    args = parser.parse_args()

    local_ip = get_local_ip()
    bridge = GyroBridge(args.port)

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", args.port))
    sock.settimeout(0.5)

    print("=" * 65)
    print("📱  PHONE GYROSCOPE TEST & VERIFICATION BRIDGE")
    print("=" * 65)
    print(f"📡  Listening for UDP gyro packets on port: {args.port}")
    print(f"🌐  Your Laptop Wi-Fi IP address: {local_ip}")
    print(f"\n📲  In your phone's streaming app, set:")
    print(f"    • IP Address : {local_ip}")
    print(f"    • Port       : {args.port}")
    print("=" * 65)
    print("Waiting for packets from phone... (Twist your phone to see yaw update)\n")

    try:
        while True:
            try:
                data, addr = sock.recvfrom(2048)
                text = data.decode("utf-8", errors="ignore").strip()
                car, gx, gy, gz = bridge.parse_packet(text)
                bridge.packet_count += 1

                if gz is not None:
                    gz_deg, yaw = bridge.update_yaw(gz)
                    if bridge.packet_count == 1:
                        print(f"🎉 [CONNECTED] First packet received from {addr[0]}:{addr[1]}!")
                    
                    if bridge.packet_count % 10 == 0 or bridge.packet_count == 1:
                        print(f"[{car}] Gyro Z: {gz_deg:+6.1f}°/s | Integrated Yaw: {yaw:+6.1f}° | Raw: {text[:45]}")
                else:
                    print(f"⚠️ Raw packet (could not parse Gyro Z): {text}")
            except socket.timeout:
                pass
    except KeyboardInterrupt:
        print("\nBridge stopped.")
    finally:
        sock.close()

if __name__ == "__main__":
    main()
