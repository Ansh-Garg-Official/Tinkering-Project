import React from 'react';
import { QueuedCommand, PlatooningPhase } from '../types/robotics';
import { Timer, Sliders, Clock, ArrowRight, Layers, Navigation, Compass, CheckCircle2 } from 'lucide-react';

interface PlatoonQueueCardProps {
  delaySec: number;
  masterSpeedCmS: number;
  followerSpeedCmS: number;
  gapDistanceCm: number;
  safeDistanceCm?: number;
  isCollisionSuspended?: boolean;
  queue: QueuedCommand[];
  onDelayChange: (newDelay: number) => void;
  followerActiveCommand: string;
  phase?: PlatooningPhase;
  phaseDescription?: string;
  distanceToOriginCm?: number;
  rotationNeededDeg?: number;
  pathWaypointsRemaining?: number;
}

export const PlatoonQueueCard: React.FC<PlatoonQueueCardProps> = ({
  delaySec,
  masterSpeedCmS,
  followerSpeedCmS,
  gapDistanceCm,
  safeDistanceCm = 30.0,
  isCollisionSuspended = false,
  queue,
  onDelayChange,
  followerActiveCommand,
  phase = 'IDLE',
  phaseDescription = 'Autonomous Navigation Active',
  distanceToOriginCm = 0,
  rotationNeededDeg = 0,
  pathWaypointsRemaining = 0,
}) => {
  // Theoretical linear distance gap = speed * delay
  const theoreticalGap = Math.round(followerSpeedCmS * delaySec * 10) / 10;

  const getCmdBadge = (cmd: string) => {
    switch (cmd) {
      case 'w':
        return { label: 'FWD', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' };
      case 's':
        return { label: 'REV', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'a':
        return { label: 'LEFT', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'd':
        return { label: 'RIGHT', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' };
      case 'stop':
        return { label: 'STOP', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
      default:
        return { label: cmd.toUpperCase(), color: 'bg-slate-700 text-slate-300 border-slate-600' };
    }
  };

  const isStep1 = phase === 'INTERCEPT_ROTATING';
  const isStep2 = phase === 'INTERCEPT_DRIVING';
  const isStep3 = phase === 'PATH_TRACING';

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col gap-3.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Autonomous Platooning & Path Navigation Engine
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-slate-400">Waypoints Ahead:</span>
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-bold tabular-nums">
            {pathWaypointsRemaining}
          </span>
        </div>
      </div>

      {/* 3-Step Autonomous Rendezvous & Path Following Stepper */}
      <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-amber-400" />
            Navigation State Machine:
          </span>
          <span className="text-amber-400 font-bold">{phaseDescription}</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
          {/* Step 1: Rotate to origin */}
          <div
            className={`p-2 rounded border transition-colors ${
              isStep1
                ? 'bg-amber-950/60 border-amber-500/70 text-amber-200'
                : isStep2 || isStep3
                ? 'bg-slate-900 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900/50 border-slate-800 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between font-bold mb-0.5">
              <span>1. Rotate to Origin</span>
              {isStep2 || isStep3 ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : isStep1 ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              ) : null}
            </div>
            <span>
              {isStep1 ? `Aligning: ${rotationNeededDeg}°` : 'Aligned to (X₀, Y₀)'}
            </span>
          </div>

          {/* Step 2: Transit straight to origin */}
          <div
            className={`p-2 rounded border transition-colors ${
              isStep2
                ? 'bg-cyan-950/60 border-cyan-500/70 text-cyan-200'
                : isStep3
                ? 'bg-slate-900 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900/50 border-slate-800 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between font-bold mb-0.5">
              <span>2. Transit to Origin</span>
              {isStep3 ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              ) : isStep2 ? (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              ) : null}
            </div>
            <span>
              {isStep2 ? `${distanceToOriginCm.toFixed(0)}cm remaining` : isStep3 ? 'Arrived at Origin' : 'Pending'}
            </span>
          </div>

          {/* Step 3: Trace master trajectory */}
          <div
            className={`p-2 rounded border transition-colors ${
              isStep3
                ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200'
                : 'bg-slate-900/50 border-slate-800 text-slate-500'
            }`}
          >
            <div className="flex items-center justify-between font-bold mb-0.5">
              <span>3. Trace Path</span>
              {isStep3 && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            </div>
            <span>
              {isStep3 ? `${pathWaypointsRemaining} pts active` : 'Awaiting rendezvous'}
            </span>
          </div>
        </div>
      </div>

      {/* Collision Warning Banner if Suspended */}
      {isCollisionSuspended && (
        <div className="bg-rose-950/70 border border-rose-700 text-rose-200 px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between animate-pulse">
          <span>
            ⚠️ <strong>VIRTUAL COLLISION SUSPENSION:</strong> Gap ({gapDistanceCm.toFixed(1)}cm) &lt; {safeDistanceCm}cm limit.
          </span>
          <span className="font-bold text-rose-400">FOLLOWER PAUSED</span>
        </div>
      )}

      {/* Primary Metrics Strip */}
      <div className="grid grid-cols-3 gap-2">
        {/* Actual Gap Distance */}
        <div className="bg-slate-950/60 border border-slate-800 rounded p-2.5">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Virtual Distance</span>
          <div className={`text-xl font-mono font-bold tabular-nums mt-0.5 ${
            isCollisionSuspended ? 'text-rose-400' : 'text-slate-100'
          }`}>
            {gapDistanceCm.toFixed(1)} <span className="text-xs font-normal text-slate-400">cm</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            Safe limit: {safeDistanceCm} cm
          </span>
        </div>

        {/* Master Speed */}
        <div className="bg-slate-950/60 border border-slate-800 rounded p-2.5">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Master Speed</span>
          <div className="text-xl font-mono font-bold text-cyan-300 tabular-nums mt-0.5">
            {masterSpeedCmS.toFixed(0)} <span className="text-xs font-normal text-slate-400">cm/s</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            Linear Dead Reckoning
          </span>
        </div>

        {/* Follower Speed */}
        <div className="bg-slate-950/60 border border-slate-800 rounded p-2.5">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Follower Speed</span>
          <div className="text-xl font-mono font-bold text-amber-300 tabular-nums mt-0.5">
            {followerSpeedCmS.toFixed(0)} <span className="text-xs font-normal text-slate-400">cm/s</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            Theoretical gap: {theoreticalGap}cm
          </span>
        </div>
      </div>

      {/* Delay Slider */}
      <div className="bg-slate-950/40 border border-slate-800/80 rounded-lg p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-amber-400" />
            Follower Platooning Delay (Δt):
          </span>
          <span className="text-amber-400 font-bold tabular-nums bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/60">
            {delaySec.toFixed(1)}s
          </span>
        </div>
        <input
          type="range"
          min="0.5"
          max="10.0"
          step="0.1"
          value={delaySec}
          onChange={(e) => onDelayChange(parseFloat(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded"
        />
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>0.5s (Close Platoon)</span>
          <span>4.0s (Default)</span>
          <span>10.0s (Long Gap)</span>
        </div>
      </div>

      {/* Live Queue Inspection Timeline */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Active Command Queue for Follower:</span>
          <span>Firing in:</span>
        </div>

        {queue.length === 0 ? (
          <div className="py-4 text-center border border-dashed border-slate-800 rounded-lg text-xs font-mono text-slate-500">
            Queue idle · Follower currently executing:{' '}
            <span className="text-amber-400 font-bold">
              {followerActiveCommand.toUpperCase()}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto pr-1">
            {queue.slice(0, 6).map((item, idx) => {
              const badge = getCmdBadge(item.command);
              // Calculate countdown percentage
              const pct = Math.max(0, Math.min(100, (item.remaining_sec / delaySec) * 100));

              return (
                <div
                  key={idx}
                  className="relative overflow-hidden bg-slate-950 border border-slate-800/90 rounded px-2.5 py-1.5 flex items-center justify-between text-xs font-mono"
                >
                  {/* Background progress countdown bar */}
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-amber-500/10 pointer-events-none transition-all duration-75"
                    style={{ width: `${100 - pct}%` }}
                  />

                  <div className="flex items-center gap-2 z-10">
                    <span className="text-[10px] text-slate-500 font-mono">#{idx + 1}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.color}`}>
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-slate-300">
                      cmd: <code className="text-amber-300 font-bold">"{item.command}"</code>
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 z-10">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-300 font-bold tabular-nums">
                      {item.remaining_sec.toFixed(2)}s
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
