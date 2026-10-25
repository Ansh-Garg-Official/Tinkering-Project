# PlatoonCommand - Central Command Center for Vehicle Platooning

A full-stack robotics teleoperation and platooning management system for two RC vehicles (Master and Follower) driven by Raspberry Pis, L298N motor drivers, and Dual Mobile Phone Gyroscopes with closed-loop turn verification.

---

## 1. Quick Start on Windows (PowerShell or CMD)

### Step 1: Open PowerShell or Command Prompt
Navigate to the `backend` directory:
```powershell
cd path\to\platooning\backend
```

### Step 2: Create and Activate Virtual Environment
```powershell
python -m venv venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Or on Windows Command Prompt:
venv\Scripts\activate.bat
```

### Step 3: Install Dependencies
```powershell
pip install -r requirements.txt
```

### Step 4: Run the Backend Server
```powershell
python main.py
```
Or double-click `run_windows.bat`.

The FastAPI and WebSocket server will start on `http://0.0.0.0:8000`:
- Telemetry WebSocket: `ws://localhost:8000/ws/telemetry`
- REST Endpoints: `http://localhost:8000/api/status`
- Network Diagnostics: `http://localhost:8000/api/network_info`

---

## 2. Windows Firewall Configuration (Critical for Phone UDP)

Because both mobile phones stream UDP packets over your local Wi-Fi, Windows Defender Firewall may block incoming UDP packets on ports 5005 and 5006.

To allow UDP ports 5005 & 5006 and TCP port 8000, run PowerShell as Administrator:
```powershell
New-NetFirewallRule -DisplayName "PlatoonCommand UDP" -Direction Inbound -LocalPort 5005,5006 -Protocol UDP -Action Allow
New-NetFirewallRule -DisplayName "PlatoonCommand Web 8000" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

---

## 3. Dual Mobile Phone Setup (2 Mobile Phones on 2 Cars)

Mount **Phone 1 on Car 1 (Master)** and **Phone 2 on Car 2 (Follower)** facing forward.

### Packet Format Supported (Your Exact App Format):
```
[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037
[Car2] Gyro (rad/s) -> X: 0.0512, Y: 0.0123, Z: -0.2104
```
*(Also accepts tags `[Master]` and `[Follower]`)*

### Configuration:
1. **Find Laptop IP:**
   - In the web dashboard header or under "Hardware & Network", see your laptop's detected local IP (e.g., `192.168.1.50`).
2. **Phone 1 (Car 1 / Master):**
   - Set Destination IP: Laptop IP (e.g. `192.168.1.50`)
   - Set UDP Port: `5005`
   - Tag: `[Car1]`
3. **Phone 2 (Car 2 / Follower):**
   - Set Destination IP: Laptop IP (e.g. `192.168.1.50`)
   - Set UDP Port: `5006` (or `5005`)
   - Tag: `[Car2]`
4. **Laptop-Side Yaw Angle Integration:**
   - The laptop server receives the raw angular velocity around Z in rad/s ($gz$).
   - Converts to degrees/sec: $\omega_z = gz \times (180 / \pi)$.
   - Applies deadband filtering ($|\omega_z| < 0.05^\circ/\text{s}$ ignored) to eliminate stationary drift.
   - Integrates: $\text{Yaw}(t) = \text{Yaw}_0 + \int \omega_z(t)\, dt$.
5. **Physical Turn Verification:**
   - When a car is commanded to turn ('a' or 'd'), the server checks if that car's phone gyro actually detects physical rotation ($|\omega_z| > 2^\circ/\text{s}$).
   - If verified, the UI displays a green checkmark: `ROTATION CONFIRMED: +45°`.
   - If commanded to turn but phone stays stationary (e.g. motor stall or wheel slip), the system displays an alert warning!

---

## 4. Hardware Wiring: Raspberry Pi GPIO to L298N Motor Driver

Wire both Raspberry Pis identically:
| L298N Pin | Raspberry Pi Pin (BCM) | Function |
| :--- | :--- | :--- |
| **IN1** | GPIO 17 (Pin 11) | Left Motor Forward |
| **IN2** | GPIO 27 (Pin 13) | Left Motor Reverse |
| **IN3** | GPIO 22 (Pin 15) | Right Motor Forward |
| **IN4** | GPIO 23 (Pin 16) | Right Motor Reverse |
| **ENA / ENB** | 5V / Jumper Cap or PWM GPIO | Enable Full Speed |
| **GND** | Raspberry Pi GND (Pin 6 or 9) | Common Ground |
| **VCC (12V)** | Battery Positive (+7.4V to +12V) | Motor Power Supply |

### Running the Actuator Server on Each Raspberry Pi:
```bash
# On Master Pi:
python3 pi_l298n_server.py --port 8888

# On Follower Pi:
python3 pi_l298n_server.py --port 8888
```

---

## 5. Testing & Verification Tools (Built Into Dashboard)

1. **Direct Motor Test Bench:**
   - Navigate to the **"Hardware & Network"** tab -> **"Motor Driver Test Bench"**.
   - Click **W, A, S, D, STOP** for Master or Follower independently.
   - You can see the exact GPIO pin states (IN1, IN2, IN3, IN4) toggling on the Raspberry Pi.
2. **Dual Phone Packet Inspector:**
   - Navigate to the **"Dual Phone Packet Inspector"** tab to see real-time packets arriving with sender IP:port, raw text, and computed yaw angle.
   - Click **"+ Inject Car 1 Packet"** or **"+ Inject Car 2 Packet"** to test laptop integration immediately without hardware.
3. **Mock Streamer Script:**
   ```powershell
   # Simulate both phones streaming simultaneously:
   python mock_android_phone.py --mode dual --port 5005
   ```
