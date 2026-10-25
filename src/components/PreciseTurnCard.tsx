/**
 * PreciseTurnCard Component
 * Closed-Loop Turning UI:
 * - Angle input (e.g. 45°, 90°, 180°)
 * - Direction dropdown ("Left" / "Right")
 * - "Execute Turn" button
 * - Live progress bar showing integrated degrees rotated and auto-stop state
 */

import React, { useState } from 'react';
import { RotateCcw, RotateCw, Play, CheckCircle2, Loader2, Disc } from 'lucide-react';

interface PreciseTurnCardProps {
  onExecuteTurn: (targetAngle: number, direction: 'Left' | 'Right') => void;
  isTurnActive: boolean;
  turnDirection: string;
  turnTargetDeg: number;
  turnProgressDeg: number;
  disabled?: boolean;
}

export const PreciseTurnCard: React.FC<PreciseTurnCardProps> = ({
  onExecuteTurn,
  isTurnActive,
  turnDirection,
  turnTargetDeg,
  turnProgressDeg,
  disabled = false,
}) => {
  const [angleInput, setAngleInput] = useState<number>(90);
  const [direction, setDirection] = useState<'Left' | 'Right'>('Left');

  const handleStartTurn = (e: React.FormEvent) => {
    e.preventDefault();
    if (angleInput > 0 && !disabled) {
      onExecuteTurn(angleInput, direction);
    }
  };

  const pct = turnTargetDeg > 0 ? Math.min(100, (turnProgressDeg / turnTargetDeg) * 100) : 0;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {direction === 'Left' ? (
            <RotateCcw className="w-4 h-4 text-cyan-400" />
          ) : (
            <RotateCw className="w-4 h-4 text-cyan-400" />
          )}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Precise Closed-Loop Turn
          </h3>
        </div>
        {isTurnActive && (
          <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            TURNING {turnDirection.toUpperCase()}
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-tight">
        Monitors integrated gyroscope in real-time and auto-stops the exact millisecond the requested angle is reached.
      </p>

      {/* Active Turn Progress Bar (if active) */}
      {isTurnActive && (
        <div className="bg-slate-950 border border-amber-900/60 rounded p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Progress:</span>
            <span className="text-amber-400 font-bold tabular-nums">
              {turnProgressDeg.toFixed(1)}° / {turnTargetDeg}° ({pct.toFixed(0)}%)
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-400 h-full transition-all duration-75"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Turn Control Form */}
      <form onSubmit={handleStartTurn} className="grid grid-cols-12 gap-2 text-xs font-mono">
        {/* Angle Input */}
        <div className="col-span-5 flex flex-col gap-1">
          <label className="text-[10px] uppercase text-slate-400">Angle (°)</label>
          <input
            type="number"
            min="5"
            max="360"
            step="1"
            value={angleInput}
            onChange={(e) => setAngleInput(parseFloat(e.target.value) || 0)}
            disabled={isTurnActive || disabled}
            className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded px-2.5 py-1.5 text-slate-100 font-bold outline-none"
            placeholder="90"
          />
        </div>

        {/* Direction Dropdown */}
        <div className="col-span-4 flex flex-col gap-1">
          <label className="text-[10px] uppercase text-slate-400">Direction</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'Left' | 'Right')}
            disabled={isTurnActive || disabled}
            className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded px-2 py-1.5 text-slate-100 font-medium outline-none cursor-pointer"
          >
            <option value="Left">Left (CCW)</option>
            <option value="Right">Right (CW)</option>
          </select>
        </div>

        {/* Execute Button */}
        <div className="col-span-3 flex flex-col justify-end">
          <button
            type="submit"
            disabled={isTurnActive || disabled}
            className="w-full py-1.5 px-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold rounded flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm text-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Turn</span>
          </button>
        </div>
      </form>

      {/* Preset Angle Chips */}
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 pt-1">
        <span className="text-slate-500">Presets:</span>
        {[45, 90, 180].map((deg) => (
          <button
            key={deg}
            type="button"
            onClick={() => setAngleInput(deg)}
            disabled={isTurnActive || disabled}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {deg}°
          </button>
        ))}
      </div>
    </div>
  );
};
