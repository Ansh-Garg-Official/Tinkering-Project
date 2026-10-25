"""
PlatoonCommand - Real Raspberry Pi L298N Motor Driver TCP Actuator Server
Hardware Connections:
  - IN1 -> GPIO 17 (Left Forward)
  - IN2 -> GPIO 27 (Left Backward)
  - IN3 -> GPIO 22 (Right Forward)
  - IN4 -> GPIO 23 (Right Backward)
  - ENA -> GPIO 25 (Left Motor PWM Speed Control)  <-- NEW
  - ENB -> GPIO 26 (Right Motor PWM Speed Control) <-- NEW
  - GND -> Common GND
"""

import argparse
import socket
import sys
import time

try:
    import RPi.GPIO as GPIO
    HARDWARE_GPIO_AVAILABLE = True
except ImportError:
    print("[WARNING] RPi.GPIO not found. Running in simulation mode.")
    HARDWARE_GPIO_AVAILABLE = False

# Pin Definitions (BCM numbering)
PIN_IN1 = 17
PIN_IN2 = 27
PIN_IN3 = 22
PIN_IN4 = 23
PIN_ENA = 25  
PIN_ENB = 26  

pwm_a = None
pwm_b = None

# ==========================================
# MOTOR CALIBRATION (Adjust between 0-100)
# If the left side is faster, lower LEFT_SPEED to 90
# ==========================================
LEFT_SPEED = 90
RIGHT_SPEED = 100

def setup_gpio():
    global pwm_a, pwm_b
    if HARDWARE_GPIO_AVAILABLE:
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        for pin in [PIN_IN1, PIN_IN2, PIN_IN3, PIN_IN4, PIN_ENA, PIN_ENB]:
            GPIO.setup(pin, GPIO.OUT)
            GPIO.output(pin, GPIO.LOW)
        
        # Initialize PWM at 1000Hz frequency
        pwm_a = GPIO.PWM(PIN_ENA, 1000)
        pwm_b = GPIO.PWM(PIN_ENB, 1000)
        pwm_a.start(0)
        pwm_b.start(0)
        print("[GPIO] Pins and PWM speed control configured.")

def cleanup_gpio():
    global pwm_a, pwm_b
    if HARDWARE_GPIO_AVAILABLE:
        if pwm_a: pwm_a.stop()
        if pwm_b: pwm_b.stop()
        for pin in [PIN_IN1, PIN_IN2, PIN_IN3, PIN_IN4]:
            GPIO.output(pin, GPIO.LOW)
        GPIO.cleanup()
        print("[GPIO] Cleaned up.")

def set_motors(cmd: str):
    cmd = cmd.strip().lower()
    in1, in2, in3, in4 = 0, 0, 0, 0
    duty_a, duty_b = 0, 0
    
    if cmd == "w":
        in1, in2, in3, in4 = 1, 0, 1, 0
        duty_a, duty_b = LEFT_SPEED, RIGHT_SPEED
        desc = "FORWARD"
    elif cmd == "s":
        in1, in2, in3, in4 = 0, 1, 0, 1
        duty_a, duty_b = LEFT_SPEED, RIGHT_SPEED
        desc = "REVERSE"
    elif cmd == "a":
        in1, in2, in3, in4 = 0, 1, 1, 0
        duty_a, duty_b = LEFT_SPEED, RIGHT_SPEED
        desc = "SPIN LEFT"
    elif cmd == "d":
        in1, in2, in3, in4 = 1, 0, 0, 1
        duty_a, duty_b = LEFT_SPEED, RIGHT_SPEED
        desc = "SPIN RIGHT"
    elif cmd == "stop":
        in1, in2, in3, in4 = 0, 0, 0, 0
        duty_a, duty_b = 0, 0
        desc = "STOPPED"
    else:
        in1, in2, in3, in4 = 0, 0, 0, 0
        duty_a, duty_b = 0, 0
        desc = f"UNKNOWN ({cmd}) -> STOPPED"

    if HARDWARE_GPIO_AVAILABLE:
        GPIO.output(PIN_IN1, GPIO.HIGH if in1 else GPIO.LOW)
        GPIO.output(PIN_IN2, GPIO.HIGH if in2 else GPIO.LOW)
        GPIO.output(PIN_IN3, GPIO.HIGH if in3 else GPIO.LOW)
        GPIO.output(PIN_IN4, GPIO.HIGH if in4 else GPIO.LOW)
        
        # Apply the calibrated speeds
        pwm_a.ChangeDutyCycle(duty_a)
        pwm_b.ChangeDutyCycle(duty_b)

    print(f"[{time.strftime('%H:%M:%S')}] Actuator: {desc} (Speed L:{duty_a}% R:{duty_b}%)")

def run_server(port: int):
    setup_gpio()
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        server.bind(("0.0.0.0", port))
    except Exception as e:
        print(f"Error binding to port {port}: {e}")
        cleanup_gpio()
        sys.exit(1)

    server.listen(1)
    print("=" * 60)
    print(f"🚗 Raspberry Pi L298N Actuator Server (PWM Enabled)")
    print(f"Listening on 0.0.0.0:{port}...")
    print("=" * 60)

    try:
        while True:
            conn, addr = server.accept()
            print(f"\n[+] Central Command Center connected from {addr[0]}:{addr[1]}")
            buffer = ""
            conn.settimeout(2.5)
            
            try:
                while True:
                    try:
                        data = conn.recv(1024)
                    except socket.timeout:
                        print("[-] Socket timeout (no heartbeat from Central Hub). Safety STOP.")
                        set_motors("stop")
                        continue

                    if not data:
                        print(f"[-] Central Hub disconnected. Stopping motors.")
                        set_motors("stop")
                        break

                    buffer += data.decode("utf-8")
                    while "\n" in buffer:
                        cmd, buffer = buffer.split("\n", 1)
                        if cmd.strip():
                            set_motors(cmd)

            except Exception as e:
                print(f"Connection error: {e}")
                set_motors("stop")
            finally:
                conn.close()

    except KeyboardInterrupt:
        print("\nShutting down server...")
    finally:
        set_motors("stop")
        cleanup_gpio()
        server.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Raspberry Pi L298N Socket Server")
    parser.add_argument("--port", type=int, default=8888, help="Port to listen on (default 8888)")
    args = parser.parse_args()
    run_server(args.port)