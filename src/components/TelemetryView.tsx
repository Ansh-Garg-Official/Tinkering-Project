/**
 * TelemetryView Component
 * Detailed telemetry inspection cards, pose comparisons, and dead reckoning odometer logs.
 */

import React from 'react';
import { PlatooningTelemetry } from '../types/robotics';
import { Activity, Gauge, MapPin, Navigation, ShieldCheck } from 'lucide-react';

interface TelemetryViewProps {
  telemetry: PlatooningTelemetry;
  onResetOrigin: () => void;
}

export const TelemetryView: React.FC<TelemetryViewProps> = ({ telemetry, onResetOrigin }) => {
  const m = telemetry.master;
  const f = telemetry.follower;
  const p = telemetry.platooning;

  const theoreticalGap = Math.round((p.follower_speed_cm_s || 35.0) * p.delay_sec * 10) / 10;
  const gapError = Math.round((p.gap_distance_cm - theoreticalGap) * 10) / 10;

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Top Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono uppercase text-slate-400">Inter-Vehicle Gap</div>
          <div className="text-3xl font-mono font-bold text-slate-100 tabular-nums mt-1">
            {p.gap_distance_cm.toFixed(1)} <span className="text-xs text-slate-400 font-normal">cm</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Target: <span className="text-amber-300 font-semibold">{theoreticalGap} cm</span> ({p.delay_sec}s delay)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono uppercase text-slate-400">Tracking Gap Deviation</div>
          <div className={`text-3xl font-mono font-bold tabular-nums mt-1 ${
            Math.abs(gapError) > 20 ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {gapError > 0 ? `+${gapError.toFixed(1)}` : gapError.toFixed(1)} <span className="text-xs text-slate-400 font-normal">cm</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Status: {p.collision_suspended ? 'COLLISION SUSPENDED' : (Math.abs(gapError) < 15 ? 'NOMINAL PLATOON' : 'TRANSIENT LAG')}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono uppercase text-slate-400">Master Speed (vₘ)</div>
          <div className="text-3xl font-mono font-bold text-cyan-400 tabular-nums mt-1">
            {p.master_speed_cm_s.toFixed(0)} <span className="text-xs text-slate-400 font-normal">cm/s</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Follower: {p.follower_speed_cm_s.toFixed(0)} cm/s
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono uppercase text-slate-400">Platooning Delay Queue</div>
          <div className="text-3xl font-mono font-bold text-amber-400 tabular-nums mt-1">
            {p.queue_length} <span className="text-xs text-slate-400 font-normal">cmds</span>
          </div>
          <div className="text-xs font-mono text-slate-400 mt-1">
            Buffer: {p.delay_sec.toFixed(1)}s sliding window
          </div>
        </div>
      </div>

      {/* Dual Vehicle Comparison Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Master Vehicle Telemetry */}
        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-lg p-5 flex flex-col gap-4 shadow-lg shadow-cyan-950/20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-cyan-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Master Vehicle (Car 1)
              </h3>
            </div>
            <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
              CMD: {m.active_command.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">X Coordinate</span>
              <span className="text-xl font-bold text-slate-100 tabular-nums">
                {m.x_cm.toFixed(1)} <span className="text-xs font-normal text-slate-400">cm</span>
              </span>
              <span className="text-slate-500 block text-[10px]">({(m.x_cm / 100).toFixed(2)} m)</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Y Coordinate</span>
              <span className="text-xl font-bold text-slate-100 tabular-nums">
                {m.y_cm.toFixed(1)} <span className="text-xs font-normal text-slate-400">cm</span>
              </span>
              <span className="text-slate-500 block text-[10px]">({(m.y_cm / 100).toFixed(2)} m)</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Absolute Yaw (Phone Gyro)</span>
              <span className="text-xl font-bold text-cyan-300 tabular-nums">
                {m.yaw_deg.toFixed(1)}°
              </span>
              <span className="text-slate-500 block text-[10px]">
                {((m.yaw_deg * Math.PI) / 180).toFixed(2)} rad
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Linear Velocity</span>
              <span className="text-xl font-bold text-slate-100 tabular-nums">
                {m.speed_cm_s.toFixed(1)} <span className="text-xs font-normal text-slate-400">cm/s</span>
              </span>
              <span className="text-slate-500 block text-[10px]">
                {(m.speed_cm_s * 0.036).toFixed(2)} km/h
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80 col-span-2">
              <span className="text-slate-400 block text-[11px]">Odometer (Total Dead Reckoned Distance)</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-lg font-bold text-slate-200 tabular-nums">
                  {m.distance_cm.toFixed(1)} cm
                </span>
                <span className="text-slate-400">{(m.distance_cm / 100).toFixed(2)} meters</span>
              </div>
            </div>
          </div>
        </div>

        {/* Follower Vehicle Telemetry */}
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-lg p-5 flex flex-col gap-4 shadow-lg shadow-amber-950/20">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Follower Vehicle (Car 2)
              </h3>
            </div>
            <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-amber-950 border border-amber-800 text-amber-300">
              CMD: {f.active_command.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">X Coordinate</span>
              <span className="text-xl font-bold text-slate-100 tabular-nums">
                {f.x_cm.toFixed(1)} <span className="text-xs font-normal text-slate-400">cm</span>
              </span>
              <span className="text-slate-500 block text-[10px]">({(f.x_cm / 100).toFixed(2)} m)</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Y Coordinate</span>
              <span className="text-xl font-bold text-slate-100 tabular-nums">
                {f.y_cm.toFixed(1)} <span className="text-xs font-normal text-slate-400">cm</span>
              </span>
              <span className="text-slate-500 block text-[10px]">({(f.y_cm / 100).toFixed(2)} m)</span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Follower Estimated Yaw</span>
              <span className="text-xl font-bold text-amber-300 tabular-nums">
                {f.yaw_deg.toFixed(1)}°
              </span>
              <span className="text-slate-500 block text-[10px]">
                {((f.yaw_deg * Math.PI) / 180).toFixed(2)} rad
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80">
              <span className="text-slate-400 block text-[11px]">Linear Velocity</span>
              <span className="text-xl font-bold text-slate-100 tabular-nums">
                {f.speed_cm_s.toFixed(1)} <span className="text-xs font-normal text-slate-400">cm/s</span>
              </span>
              <span className="text-slate-500 block text-[10px]">
                {(f.speed_cm_s * 0.036).toFixed(2)} km/h
              </span>
            </div>

            <div className="bg-slate-950/70 p-3 rounded border border-slate-800/80 col-span-2">
              <span className="text-slate-400 block text-[11px]">Odometer (Total Dead Reckoned Distance)</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-lg font-bold text-slate-200 tabular-nums">
                  {f.distance_cm.toFixed(1)} cm
                </span>
                <span className="text-slate-400">{(f.distance_cm / 100).toFixed(2)} meters</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Autonomous Navigation & Rendezvous State Card */}
      <div className="bg-slate-900 border border-amber-500/40 rounded-lg p-5">
        <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-bold mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-amber-400">
            <Activity className="w-4 h-4" />
            Autonomous Origin Rendezvous & Path Following Status
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-950 border border-amber-500/50 text-amber-300 text-[11px]">
            PHASE: {p.phase}
          </span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-slate-950/70 p-3 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Active Nav Subroutine</span>
            <span className="text-slate-100 font-bold text-sm block mt-0.5">{p.phase_description}</span>
          </div>
          <div className="bg-slate-950/70 p-3 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Master Starting Origin</span>
            <span className="text-cyan-300 font-bold text-sm block mt-0.5">
              ({p.master_origin?.x ?? 0}, {p.master_origin?.y ?? 0}) · θₘ₀={p.master_initial_heading_deg}°
            </span>
          </div>
          <div className="bg-slate-950/70 p-3 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Follower Dist to Origin</span>
            <span className="text-amber-300 font-bold text-sm block mt-0.5">
              {p.distance_to_master_origin_cm?.toFixed(1) ?? '0.0'} cm
            </span>
            <span className="text-slate-500 text-[10px]">
              Align error: {p.rotation_needed_deg ?? 0}°
            </span>
          </div>
          <div className="bg-slate-950/70 p-3 rounded border border-slate-800">
            <span className="text-slate-400 block text-[10px]">Trajectory Waypoints Ahead</span>
            <span className="text-emerald-400 font-bold text-sm block mt-0.5">
              {p.path_waypoints_remaining ?? 0} waypoints
            </span>
            <span className="text-slate-500 text-[10px]">
              Consumed on arrival (&lt;8cm)
            </span>
          </div>
        </div>
      </div>

      {/* Engineering Sensor Fusion & Dead Reckoning Notes */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h4 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          Sensor Fusion & Dead Reckoning Architecture Notes
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-400 leading-relaxed">
          <div className="bg-slate-950/60 p-3 rounded border border-slate-800">
            <span className="text-slate-200 font-semibold block mb-1">1. Distance Integration</span>
            Since the RC cars lack wheel encoders and ultrasonic sensors, linear displacement is calculated via continuous numerical integration:
            <code className="block mt-1 text-cyan-400">ΔX = v · sin(θ) · Δt</code>
            <code className="block text-cyan-400">ΔY = v · cos(θ) · Δt</code>
            Calibrated on fully charged battery voltage.
          </div>

          <div className="bg-slate-950/60 p-3 rounded border border-slate-800">
            <span className="text-slate-200 font-semibold block mb-1">2. Android UDP Yaw Fusion</span>
            Time-based differential steering is notoriously prone to rotational slip. Mounting an Android phone on the Master vehicle allows streaming 9-DoF sensor fusion absolute yaw angle ($Z$-axis) over UDP at 20-50 Hz, eliminating heading drift.
          </div>

          <div className="bg-slate-950/60 p-3 rounded border border-slate-800">
            <span className="text-slate-200 font-semibold block mb-1">3. Deterministic Platooning</span>
            Commands dispatched to Master are timestamped and held in a high-resolution FIFO delay queue. Once elapsed time equals configured delay $\Delta t$, the identical command is sent to the Follower car via TCP socket.
          </div>
        </div>
      </div>
    </div>
  );
};
