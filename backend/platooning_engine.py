"""
PlatoonCommand - Platooning Engine & Dead Reckoning State Tracker
"""

import asyncio
import logging
import math
import time
from collections import deque
from dataclasses import dataclass
from typing import Optional, Callable, Dict, Any

logger = logging.getLogger("PlatooningEngine")

@dataclass
class QueuedCommand:
    command: str           
    issue_timestamp: float 
    scheduled_exec_time: float 
    executed: bool = False

@dataclass
class VehiclePose:
    x_cm: float = 0.0
    y_cm: float = 0.0
    yaw_deg: float = 0.0  
    speed_cm_per_sec: float = 0.0
    active_command: str = "stop"
    distance_traveled_cm: float = 0.0

@dataclass
class PreciseTurnTask:
    active: bool = False
    direction: str = "Left"  
    cmd: str = "a"           
    target_angle_deg: float = 90.0
    start_yaw_deg: float = 0.0
    accumulated_angle_deg: float = 0.0
    start_time: float = 0.0

class PlatooningEngine:
    def __init__(
        self,
        delay_seconds: float = 4.0,
        master_speed_cm_s: float = 35.0,
        follower_speed_cm_s: float = 35.0,
        master_initial_heading_deg: float = 0.0,
        follower_initial_heading_deg: float = 0.0,
        safe_distance_threshold_cm: float = 30.0,
        on_follower_command_due: Optional[Callable[[str], Any]] = None,
        on_master_command_override: Optional[Callable[[str], Any]] = None
    ):
        self.delay_seconds = delay_seconds
        self.master_speed_cm_s = master_speed_cm_s
        self.follower_speed_cm_s = follower_speed_cm_s
        self.master_initial_heading_deg = master_initial_heading_deg % 360.0
        self.follower_initial_heading_deg = follower_initial_heading_deg % 360.0
        self.integrated_gyro_yaw_deg = 0.0
        self.follower_integrated_gyro_yaw_deg = 0.0
        self.has_follower_phone = False
        self.safe_distance_threshold_cm = safe_distance_threshold_cm

        self.master_connected: bool = True
        self.follower_connected: bool = True

        self.on_follower_command_due = on_follower_command_due
        self.on_master_command_override = on_master_command_override

        self.master_origin_x: float = 0.0
        self.master_origin_y: float = 0.0

        self.master_pose = VehiclePose(yaw_deg=self.master_initial_heading_deg)
        self.follower_pose = VehiclePose(yaw_deg=self.follower_initial_heading_deg)

        self.follower_phase: str = "IDLE"
        self.phase_description: str = "Awaiting initialization"
        self.collision_suspended: bool = False

        self.precise_turn = PreciseTurnTask()

        self.command_queue: deque[QueuedCommand] = deque()
        self.path_recorded_from_master: deque[Dict[str, Any]] = deque(maxlen=800)
        self.unconsumed_master_trail: deque[Dict[str, float]] = deque(maxlen=600)
        self.intercept_start_pos: Optional[Dict[str, float]] = None

        self._last_integration_time = time.time()
        self._last_follower_dispatch_time = 0.0
        self._is_running = False
        self._loop_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    def set_initial_configuration(
        self,
        m_x: float,
        m_y: float,
        f_x: float,
        f_y: float,
        m_heading: float = 0.0,
        f_heading: float = 0.0,
        m_speed: float = 35.0,
        f_speed: float = 35.0,
        safe_distance: float = 30.0,
        **kwargs
    ):
        if "m_initial_heading" in kwargs:
            m_heading = kwargs["m_initial_heading"]
        if "f_initial_heading" in kwargs:
            f_heading = kwargs["f_initial_heading"]

        self.master_origin_x = m_x
        self.master_origin_y = m_y
        self.master_initial_heading_deg = m_heading % 360.0
        self.follower_initial_heading_deg = f_heading % 360.0
        self.master_speed_cm_s = max(5.0, m_speed)
        self.follower_speed_cm_s = max(5.0, f_speed)
        self.safe_distance_threshold_cm = max(10.0, safe_distance)

        self.master_pose.x_cm = m_x
        self.master_pose.y_cm = m_y
        self.master_pose.yaw_deg = (self.master_initial_heading_deg + self.integrated_gyro_yaw_deg) % 360.0
        self.master_pose.active_command = "stop"
        self.master_pose.speed_cm_per_sec = 0.0

        self.follower_pose.x_cm = f_x
        self.follower_pose.y_cm = f_y
        self.follower_pose.yaw_deg = self.follower_initial_heading_deg
        self.follower_pose.active_command = "stop"
        self.follower_pose.speed_cm_per_sec = 0.0

        self.intercept_start_pos = {"x": f_x, "y": f_y}
        self.unconsumed_master_trail.clear()
        self.path_recorded_from_master.clear()
        self.command_queue.clear()
        self.collision_suspended = False
        self.precise_turn.active = False
        self._last_follower_dispatch_time = 0.0

        dist_to_origin = self.get_distance_to_master_origin()
        if dist_to_origin > 12.0:
            self.follower_phase = "INTERCEPT_ROTATING"
            self.phase_description = f"Phase 1A: Rotating to face Master origin ({m_x}, {m_y})"
        else:
            self.follower_phase = "PATH_TRACING"
            self.phase_description = "Phase 2: At Master origin, ready to trace path"

        self._record_master_breadcrumb()

    def _get_shortest_angle(self, target: float, current: float) -> float:
        return ((target - current + 180.0) % 360.0) - 180.0

    def get_distance_to_master_origin(self) -> float:
        dx = self.master_origin_x - self.follower_pose.x_cm
        dy = self.master_origin_y - self.follower_pose.y_cm
        return round(math.sqrt(dx * dx + dy * dy), 1)

    def get_rotation_needed_to_master_origin(self) -> float:
        dx = self.master_origin_x - self.follower_pose.x_cm
        dy = self.master_origin_y - self.follower_pose.y_cm
        target_bearing = math.degrees(math.atan2(dx, dy)) % 360.0
        return round(self._get_shortest_angle(target_bearing, self.follower_pose.yaw_deg), 1)

    def set_delay(self, seconds: float):
        self.delay_seconds = max(0.2, min(seconds, 30.0))

    def set_speeds(self, master_speed: float, follower_speed: float):
        self.master_speed_cm_s = max(5.0, min(master_speed, 200.0))
        self.follower_speed_cm_s = max(5.0, min(follower_speed, 200.0))

    def update_integrated_gyro_yaw(self, integrated_yaw_deg: float):
        self.integrated_gyro_yaw_deg = integrated_yaw_deg
        current_heading = (self.master_initial_heading_deg + self.integrated_gyro_yaw_deg) % 360.0
        if current_heading < 0:
            current_heading += 360.0
        self.master_pose.yaw_deg = current_heading

        if self.precise_turn.active:
            self._evaluate_precise_turn()

    def update_follower_integrated_gyro_yaw(self, integrated_yaw_deg: float):
        self.follower_integrated_gyro_yaw_deg = integrated_yaw_deg
        self.has_follower_phone = True
        current_heading = (self.follower_initial_heading_deg + self.follower_integrated_gyro_yaw_deg) % 360.0
        if current_heading < 0:
            current_heading += 360.0
        self.follower_pose.yaw_deg = current_heading

    def start_precise_turn(self, target_angle_deg: float, direction: str):
        dir_clean = "Left" if direction.lower().startswith("l") else "Right"
        cmd = "a" if dir_clean == "Left" else "d"

        self.precise_turn.active = True
        self.precise_turn.direction = dir_clean
        self.precise_turn.cmd = cmd
        self.precise_turn.target_angle_deg = abs(target_angle_deg)
        self.precise_turn.start_yaw_deg = self.integrated_gyro_yaw_deg
        self.precise_turn.accumulated_angle_deg = 0.0
        self.precise_turn.start_time = time.time()

        self.master_pose.active_command = cmd
        if self.on_master_command_override:
            res = self.on_master_command_override(cmd)
            if asyncio.iscoroutine(res):
                asyncio.create_task(res)

        self._enqueue_follower_cmd(cmd)

    def _evaluate_precise_turn(self):
        if not self.precise_turn.active:
            return

        delta = abs(self.integrated_gyro_yaw_deg - self.precise_turn.start_yaw_deg)
        self.precise_turn.accumulated_angle_deg = delta

        timed_out = (time.time() - self.precise_turn.start_time) > 10.0
        if delta >= self.precise_turn.target_angle_deg or timed_out:
            self.precise_turn.active = False
            self.master_pose.active_command = "stop"
            if self.on_master_command_override:
                res = self.on_master_command_override("stop")
                if asyncio.iscoroutine(res):
                    asyncio.create_task(res)
            self._enqueue_follower_cmd("stop")

    def _enqueue_follower_cmd(self, cmd: str):
        now = time.time()
        scheduled_time = now + self.delay_seconds
        item = QueuedCommand(
            command=cmd,
            issue_timestamp=now,
            scheduled_exec_time=scheduled_time,
            executed=False
        )
        self.command_queue.append(item)
        self.path_recorded_from_master.append({
            "cmd": cmd,
            "x": self.master_pose.x_cm,
            "y": self.master_pose.y_cm,
            "yaw": self.master_pose.yaw_deg,
            "t": now
        })

    async def issue_master_command(self, cmd: str) -> QueuedCommand:
        now = time.time()
        cmd_clean = cmd.strip().lower()
        if cmd_clean not in ["w", "s", "a", "d", "stop"]:
            cmd_clean = "stop"

        async with self._lock:
            if self.precise_turn.active and cmd_clean != self.precise_turn.cmd:
                self.precise_turn.active = False

            await self._step_simulation_and_navigation(now)
            
            self.master_pose.active_command = cmd_clean
            self._enqueue_follower_cmd(cmd_clean)
            return self.command_queue[-1]

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
                await self._step_simulation_and_navigation(now)
            await asyncio.sleep(0.02)  # 50 Hz

    async def _step_simulation_and_navigation(self, now: float):
        dt = now - self._last_integration_time
        self._last_integration_time = now

        if dt <= 0 or dt > 0.5:
            return

        # 1. Master Dead Reckoning
        m_cmd = self.master_pose.active_command
        m_yaw_rad = math.radians(self.master_pose.yaw_deg)

        if m_cmd == "w":
            lin_speed = self.master_speed_cm_s
            self.master_pose.speed_cm_per_sec = lin_speed
            self.master_pose.x_cm += math.sin(m_yaw_rad) * lin_speed * dt
            self.master_pose.y_cm += math.cos(m_yaw_rad) * lin_speed * dt
            self.master_pose.distance_traveled_cm += lin_speed * dt
        elif m_cmd == "s":
            lin_speed = -self.master_speed_cm_s
            self.master_pose.speed_cm_per_sec = lin_speed
            self.master_pose.x_cm += math.sin(m_yaw_rad) * lin_speed * dt
            self.master_pose.y_cm += math.cos(m_yaw_rad) * lin_speed * dt
            self.master_pose.distance_traveled_cm += abs(lin_speed) * dt
        else:
            self.master_pose.speed_cm_per_sec = 0.0

        if self.master_pose.speed_cm_per_sec != 0 or m_cmd in ["a", "d"]:
            if len(self.unconsumed_master_trail) == 0 or (now - self.unconsumed_master_trail[-1].get("t", 0)) >= 0.10:
                self._record_master_breadcrumb()

        # 2. Virtual Collision Check
        gap_dist = self.get_gap_distance_cm()
        if gap_dist < self.safe_distance_threshold_cm:
            if not self.collision_suspended:
                self.collision_suspended = True
                if self.on_follower_command_due:
                    res = self.on_follower_command_due("stop")
                    if asyncio.iscoroutine(res):
                        asyncio.create_task(res)
            self.follower_pose.active_command = "stop"
            self.follower_pose.speed_cm_per_sec = 0.0
            return
        else:
            if self.collision_suspended:
                self.collision_suspended = False

        # 3. Follower Autonomous State Machine
        dist_to_origin = self.get_distance_to_master_origin()
        old_cmd = self.follower_pose.active_command
        target_cmd = "stop"

        if self.follower_phase in ["IDLE", "INTERCEPT_ROTATING", "INTERCEPT_DRIVING"]:
            if dist_to_origin > 6.0:
                dx_orig = self.master_origin_x - self.follower_pose.x_cm
                dy_orig = self.master_origin_y - self.follower_pose.y_cm
                target_bearing = math.degrees(math.atan2(dx_orig, dy_orig)) % 360.0
                angle_error = self._get_shortest_angle(target_bearing, self.follower_pose.yaw_deg)

                if abs(angle_error) > 4.0:
                    self.follower_phase = "INTERCEPT_ROTATING"
                    self.phase_description = f"Phase 1A: Rotating {abs(angle_error):.0f}° towards Master Origin"
                    target_cmd = "a" if angle_error < 0 else "d"
                    rot_rate = 90.0
                    if not self.has_follower_phone:
                        if target_cmd == "a":
                            self.follower_pose.yaw_deg = (self.follower_pose.yaw_deg - rot_rate * dt) % 360.0
                        else:
                            self.follower_pose.yaw_deg = (self.follower_pose.yaw_deg + rot_rate * dt) % 360.0
                    self.follower_pose.speed_cm_per_sec = 0.0
                else:
                    self.follower_phase = "INTERCEPT_DRIVING"
                    self.phase_description = f"Phase 1B: Driving straight to Master Origin ({dist_to_origin:.0f}cm remaining)"
                    target_cmd = "w"
                    f_yaw_rad = math.radians(self.follower_pose.yaw_deg)
                    self.follower_pose.speed_cm_per_sec = self.follower_speed_cm_s
                    self.follower_pose.x_cm += math.sin(f_yaw_rad) * self.follower_speed_cm_s * dt
                    self.follower_pose.y_cm += math.cos(f_yaw_rad) * self.follower_speed_cm_s * dt
                    self.follower_pose.distance_traveled_cm += self.follower_speed_cm_s * dt
            else:
                self.follower_phase = "PATH_TRACING"
                self.phase_description = "Phase 2: At Master origin, ready to trace path"
                target_cmd = "stop"
                self.follower_pose.speed_cm_per_sec = 0.0

        elif self.follower_phase == "PATH_TRACING":
            while self.unconsumed_master_trail:
                head = self.unconsumed_master_trail[0]
                dx_p = head["x"] - self.follower_pose.x_cm
                dy_p = head["y"] - self.follower_pose.y_cm
                
                if math.sqrt(dx_p * dx_p + dy_p * dy_p) <= 25.0:
                    self.unconsumed_master_trail.popleft()
                else:
                    break

            if self.unconsumed_master_trail:
                target_wpt = self.unconsumed_master_trail[0]
                dx_w = target_wpt["x"] - self.follower_pose.x_cm
                dy_w = target_wpt["y"] - self.follower_pose.y_cm
                
                wpt_bearing = math.degrees(math.atan2(dx_w, dy_w)) % 360.0
                wpt_angle_error = self._get_shortest_angle(wpt_bearing, self.follower_pose.yaw_deg)

                if abs(wpt_angle_error) > 15.0:
                    target_cmd = "a" if wpt_angle_error < 0 else "d"
                    rot_rate = 90.0
                    if not self.has_follower_phone:
                        if target_cmd == "a":
                            self.follower_pose.yaw_deg = (self.follower_pose.yaw_deg - rot_rate * dt) % 360.0
                        else:
                            self.follower_pose.yaw_deg = (self.follower_pose.yaw_deg + rot_rate * dt) % 360.0
                    self.follower_pose.speed_cm_per_sec = 0.0
                    self.phase_description = f"Phase 2: Steering to Master path (Δθ: {wpt_angle_error:.0f}°)"
                else:
                    target_cmd = "w"
                    f_yaw_rad = math.radians(self.follower_pose.yaw_deg)
                    self.follower_pose.speed_cm_per_sec = self.follower_speed_cm_s
                    self.follower_pose.x_cm += math.sin(f_yaw_rad) * self.follower_speed_cm_s * dt
                    self.follower_pose.y_cm += math.cos(f_yaw_rad) * self.follower_speed_cm_s * dt
                    self.follower_pose.distance_traveled_cm += self.follower_speed_cm_s * dt
                    self.phase_description = f"Phase 2: Tracing Master trajectory ({len(self.unconsumed_master_trail)} waypoints ahead)"
            else:
                target_cmd = "stop"
                self.follower_pose.speed_cm_per_sec = 0.0
                self.phase_description = "Phase 2: Synced with Master (Waiting for new movement)"

        self.follower_pose.active_command = target_cmd

        # Hardware Heartbeat: Refresh Raspberry Pi timeout without blocking the loop
        time_since_dispatch = now - self._last_follower_dispatch_time
        if (target_cmd != old_cmd or time_since_dispatch > 1.5) and self.on_follower_command_due:
            self._last_follower_dispatch_time = now
            try:
                res = self.on_follower_command_due(target_cmd)
                if asyncio.iscoroutine(res):
                    asyncio.create_task(res)
            except Exception as e:
                logger.error(f"Follower dispatch error: {e}")

    def _record_master_breadcrumb(self):
        self.unconsumed_master_trail.append({
            "x": round(self.master_pose.x_cm, 1),
            "y": round(self.master_pose.y_cm, 1),
            "yaw": round(self.master_pose.yaw_deg, 1),
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

        rendezvous_line = None
        if self.follower_phase in ["INTERCEPT_ROTATING", "INTERCEPT_DRIVING"]:
            rendezvous_line = {
                "x1": round(self.follower_pose.x_cm, 1),
                "y1": round(self.follower_pose.y_cm, 1),
                "x2": round(self.master_origin_x, 1),
                "y2": round(self.master_origin_y, 1)
            }

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
                "active_command": "stop" if self.collision_suspended else self.follower_pose.active_command,
                "distance_cm": round(self.follower_pose.distance_traveled_cm, 1)
            },
            "platooning": {
                "phase": self.follower_phase,
                "phase_description": self.phase_description,
                "delay_sec": self.delay_seconds,
                "master_speed_cm_s": self.master_speed_cm_s,
                "follower_speed_cm_s": self.follower_speed_cm_s,
                "master_initial_heading_deg": self.master_initial_heading_deg,
                "follower_initial_heading_deg": self.follower_initial_heading_deg,
                "master_origin": {
                    "x": round(self.master_origin_x, 1),
                    "y": round(self.master_origin_y, 1),
                    "yaw": round(self.master_initial_heading_deg, 1)
                },
                "distance_to_master_origin_cm": self.get_distance_to_master_origin(),
                "rotation_needed_deg": self.get_rotation_needed_to_master_origin(),
                "integrated_yaw_deg": round(self.integrated_gyro_yaw_deg, 2),
                "follower_integrated_yaw_deg": round(self.follower_integrated_gyro_yaw_deg, 2),
                "has_follower_phone": self.has_follower_phone,
                "gap_distance_cm": self.get_gap_distance_cm(),
                "safe_distance_cm": self.safe_distance_threshold_cm,
                "collision_suspended": self.collision_suspended,
                "queue_length": len(self.command_queue),
                "queue": queue_items,
                "path_waypoints_remaining": len(self.unconsumed_master_trail)
            },
            "precise_turn": {
                "active": self.precise_turn.active,
                "direction": self.precise_turn.direction,
                "target_deg": self.precise_turn.target_angle_deg,
                "progress_deg": round(self.precise_turn.accumulated_angle_deg, 1)
            },
            "trails": {
                "master_unconsumed": list(self.unconsumed_master_trail),
                "master_origin": {
                    "x": round(self.master_origin_x, 1),
                    "y": round(self.master_origin_y, 1),
                    "yaw": round(self.master_initial_heading_deg, 1)
                },
                "rendezvous_line": rendezvous_line
            }
        }