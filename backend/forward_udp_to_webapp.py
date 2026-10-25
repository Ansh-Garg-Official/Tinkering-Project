"""
PlatoonCommand - Phone Gyro to WebApp Live Bridge
Run this on your laptop to bridge your Android phone's UDP stream directly into the web dashboard!

Features:
  - ZERO external dependencies! Uses Python's built-in standard library (urllib.request + json)
    (No 'pip install requests' required!)
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
import json
import urllib.request
import urllib.error

# Optional requests support if available, else transparent standard-library fallback
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

def extract_gyro_z(text: str) -> tuple[float, str]:
    """Extracts Z (yaw rate in rad/s) and detects Car1 or Car2."""
    is_follower = bool(re.search(r'car\s*2|follower', text, re.I))
    device = "Car2 (Follower)" if is_follower else "Car1 (Master)"
    
    match = re.search(r'X:\s*([-\d.]+)[,\s]+Y:\s*([-\d.]+)[,\s]+Z:\s*([-\d.]+)', text, re.I)
    if match:
        return float(match.group(3)), device
    z_match = re.search(r'Z:\s*([-\d.]+)', text, re.I)
    if z_match:
        return float(z_match.group(1)), device
    return 0.0, device

def forward_worker(packet_queue: queue.Queue, target_urls: list[str]):
    """Background worker sending HTTP POSTs without blocking the UDP socket."""
    # Use requests session if available, else urllib.request
    requests_session = requests.Session() if HAS_REQUESTS else None

    while True:
        try:
            packet_text = packet_queue.get()
            if packet_text is None:
                break

            payload_bytes = json.dumps({"packet": packet_text}).encode("utf-8")

            for url in target_urls:
                try:
                    if requests_session is not None:
                        resp = requests_session.post(url, json={"packet": packet_text}, timeout=0.25)
                        if resp.status_code == 200:
                            break
                    else:
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
                    continue
        except Exception:
            pass

def main():
    parser = argparse.ArgumentParser(description="Forward UDP Gyro stream to WebApp (Zero pip dependencies required)")
    parser.add_argument("--port", type=int, default=5005, help="UDP listening port (default 5005)")
    parser.add_argument(
        "--url",
        type=str,
        default="http://localhost:3000/api/stream",
        help="Primary WebApp API endpoint (default: http://localhost:3000/api/stream)"
    )
    parser.add_argument(
        "--cloud-url",
        type=str,
        default="https://ais-dev-jsumytbwfcctdyxegicwrc-815602787689.asia-southeast1.run.app/api/stream",
        help="Cloud fallback URL"
    )
    args = parser.parse_args()

    # Target URLs: check user-specified URL first, then fallback
    target_urls = [args.url]
    if args.cloud_url and args.cloud_url != args.url:
        target_urls.append(args.cloud_url)

    # Setup non-blocking packet queue and thread
    packet_queue = queue.Queue(maxsize=200)
    worker_thread = threading.Thread(
        target=forward_worker,
        args=(packet_queue, target_urls),
        daemon=True
    )
    worker_thread.start()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    except Exception:
        pass

    try:
        sock.bind(("0.0.0.0", args.port))
    except Exception as e:
        print(f"❌ Could not bind to UDP port {args.port}: {e}")
        print("💡 Tip: Make sure no other listener script is occupying this port.")
        sys.exit(1)

    # Detect local Wi-Fi IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"

    print("=" * 70)
    print("📡 PLATOONCOMMAND PHONE-TO-WEBAPP LIVE BRIDGE")
    print("=" * 70)
    print(f"  • Listening on UDP Port : {args.port}")
    print(f"  • Laptop Wi-Fi IP       : {local_ip}")
    print(f"  • Primary WebApp Target : {args.url}")
    print(f"  • Cloud Fallback Target : {args.cloud_url}")
    print(f"  • HTTP Engine           : {'requests' if HAS_REQUESTS else 'urllib (built-in, no pip needed)'}")
    print("\n📲 Set your Android App Target to:")
    print(f"    IP: {local_ip}  |  Port: {args.port}")
    print("\nWaiting for gyro packets from phone... (Press Ctrl+C to stop)")
    print("-" * 70)

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

            # Extract angular velocity and calculate heading
            gz, device = extract_gyro_z(text)
            gz_deg_s = gz * (180.0 / math.pi)

            # Deadband filter
            if abs(gz_deg_s) > 0.05:
                if "Car2" in device:
                    follower_yaw += gz_deg_s * dt
                else:
                    master_yaw += gz_deg_s * dt

            current_yaw = follower_yaw if "Car2" in device else master_yaw
            yaw_symbol = "↻" if gz_deg_s > 5 else ("↺" if gz_deg_s < -5 else "·")

            # Print rich terminal telemetry
            print(
                f"[{pkt_count:04d}] {device} | "
                f"gz: {gz:+0.4f} rad/s ({gz_deg_s:+05.1f}°/s) {yaw_symbol} | "
                f"Heading Yaw: {current_yaw:+06.1f}°"
            )

            # Queue for non-blocking HTTP forward to WebApp
            if not packet_queue.full():
                packet_queue.put_nowait(text)

        except KeyboardInterrupt:
            print("\nShutting down bridge...")
            break
        except Exception as e:
            print(f"Receive error: {e}")

if __name__ == "__main__":
    main()
