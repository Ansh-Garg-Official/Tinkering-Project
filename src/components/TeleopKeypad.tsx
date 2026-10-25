/**
 * Teleoperation Keypad & Keyboard Control Hook
 * Listens for physical W, A, S, D, and Spacebar keystrokes with deadman keyup release.
 * Provides on-screen clickable buttons with active press indicators.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { DrivingCommand } from '../types/robotics';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ShieldAlert, Disc } from 'lucide-react';

interface TeleopKeypadProps {
  onCommand: (cmd: DrivingCommand) => void;
  onEmergencyStop: () => void;
  activeCommand: DrivingCommand;
  disabled?: boolean;
}

export const TeleopKeypad: React.FC<TeleopKeypadProps> = ({
  onCommand,
  onEmergencyStop,
  activeCommand,
  disabled = false,
}) => {
  // Track held keys
  const [heldKeys, setHeldKeys] = useState<{ [key: string]: boolean }>({
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
  });

  const activeCommandRef = useRef<DrivingCommand>(activeCommand);
  activeCommandRef.current = activeCommand;

  // Send command helper
  const triggerCommand = useCallback((cmd: DrivingCommand) => {
    if (disabled) return;
    if (activeCommandRef.current !== cmd) {
      onCommand(cmd);
    }
  }, [disabled, onCommand]);

  // Global Keyboard Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (e.repeat) return; // Ignore autorepeat

      if (key === 'w' || key === 'arrowup') {
        e.preventDefault();
        setHeldKeys((prev) => ({ ...prev, w: true }));
        triggerCommand('w');
      } else if (key === 's' || key === 'arrowdown') {
        e.preventDefault();
        setHeldKeys((prev) => ({ ...prev, s: true }));
        triggerCommand('s');
      } else if (key === 'a' || key === 'arrowleft') {
        e.preventDefault();
        setHeldKeys((prev) => ({ ...prev, a: true }));
        triggerCommand('a');
      } else if (key === 'd' || key === 'arrowright') {
        e.preventDefault();
        setHeldKeys((prev) => ({ ...prev, d: true }));
        triggerCommand('d');
      } else if (key === ' ' || key === 'spacebar') {
        e.preventDefault();
        setHeldKeys((prev) => ({ ...prev, space: true }));
        onEmergencyStop();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === 'w' || key === 'arrowup') {
        setHeldKeys((prev) => ({ ...prev, w: false }));
        triggerCommand('stop');
      } else if (key === 's' || key === 'arrowdown') {
        setHeldKeys((prev) => ({ ...prev, s: false }));
        triggerCommand('stop');
      } else if (key === 'a' || key === 'arrowleft') {
        setHeldKeys((prev) => ({ ...prev, a: false }));
        triggerCommand('stop');
      } else if (key === 'd' || key === 'arrowright') {
        setHeldKeys((prev) => ({ ...prev, d: false }));
        triggerCommand('stop');
      } else if (key === ' ' || key === 'spacebar') {
        setHeldKeys((prev) => ({ ...prev, space: false }));
        triggerCommand('stop');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [triggerCommand, onEmergencyStop]);

  // Touch/Mouse handlers for on-screen buttons
  const startAction = (cmd: DrivingCommand, keyName: string) => {
    setHeldKeys((prev) => ({ ...prev, [keyName]: true }));
    triggerCommand(cmd);
  };

  const endAction = (keyName: string) => {
    setHeldKeys((prev) => ({ ...prev, [keyName]: false }));
    triggerCommand('stop');
  };

  const getStatusLabel = () => {
    switch (activeCommand) {
      case 'w':
        return { label: 'FORWARD', color: 'text-cyan-400 bg-cyan-950/60 border-cyan-800' };
      case 's':
        return { label: 'REVERSE', color: 'text-amber-400 bg-amber-950/60 border-amber-800' };
      case 'a':
        return { label: 'SPIN LEFT', color: 'text-blue-400 bg-blue-950/60 border-blue-800' };
      case 'd':
        return { label: 'SPIN RIGHT', color: 'text-blue-400 bg-blue-950/60 border-blue-800' };
      default:
        return { label: 'STOPPED', color: 'text-slate-400 bg-slate-900 border-slate-800' };
    }
  };

  const status = getStatusLabel();

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
      {/* Header with active command badge */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Teleoperation Control
          </h3>
          <p className="text-[11px] text-slate-500">WASD deadman keyup release</p>
        </div>
        <div className={`px-2.5 py-1 text-xs font-mono font-bold rounded border ${status.color}`}>
          {status.label}
        </div>
      </div>

      {/* WASD Virtual Directional Pad */}
      <div className="flex flex-col items-center gap-1.5 py-1 select-none">
        {/* Forward (W) */}
        <button
          onMouseDown={() => startAction('w', 'w')}
          onMouseUp={() => endAction('w')}
          onMouseLeave={() => heldKeys.w && endAction('w')}
          onTouchStart={(e) => { e.preventDefault(); startAction('w', 'w'); }}
          onTouchEnd={() => endAction('w')}
          className={`w-14 h-14 rounded-lg border font-mono font-bold flex flex-col items-center justify-center transition-all ${
            heldKeys.w || activeCommand === 'w'
              ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.5)] translate-y-0.5'
              : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
          }`}
        >
          <ArrowUp className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-none">W</span>
        </button>

        {/* Row: Left (A), Down (S), Right (D) */}
        <div className="flex items-center gap-1.5">
          {/* Left (A) */}
          <button
            onMouseDown={() => startAction('a', 'a')}
            onMouseUp={() => endAction('a')}
            onMouseLeave={() => heldKeys.a && endAction('a')}
            onTouchStart={(e) => { e.preventDefault(); startAction('a', 'a'); }}
            onTouchEnd={() => endAction('a')}
            className={`w-14 h-14 rounded-lg border font-mono font-bold flex flex-col items-center justify-center transition-all ${
              heldKeys.a || activeCommand === 'a'
                ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.5)] translate-y-0.5'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
            }`}
          >
            <ArrowLeft className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-none">A</span>
          </button>

          {/* Reverse (S) */}
          <button
            onMouseDown={() => startAction('s', 's')}
            onMouseUp={() => endAction('s')}
            onMouseLeave={() => heldKeys.s && endAction('s')}
            onTouchStart={(e) => { e.preventDefault(); startAction('s', 's'); }}
            onTouchEnd={() => endAction('s')}
            className={`w-14 h-14 rounded-lg border font-mono font-bold flex flex-col items-center justify-center transition-all ${
              heldKeys.s || activeCommand === 's'
                ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] translate-y-0.5'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
            }`}
          >
            <ArrowDown className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-none">S</span>
          </button>

          {/* Right (D) */}
          <button
            onMouseDown={() => startAction('d', 'd')}
            onMouseUp={() => endAction('d')}
            onMouseLeave={() => heldKeys.d && endAction('d')}
            onTouchStart={(e) => { e.preventDefault(); startAction('d', 'd'); }}
            onTouchEnd={() => endAction('d')}
            className={`w-14 h-14 rounded-lg border font-mono font-bold flex flex-col items-center justify-center transition-all ${
              heldKeys.d || activeCommand === 'd'
                ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.5)] translate-y-0.5'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600'
            }`}
          >
            <ArrowRight className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] leading-none">D</span>
          </button>
        </div>
      </div>

      {/* Emergency Brake Bar (Spacebar) */}
      <button
        onClick={onEmergencyStop}
        className="w-full py-2.5 px-3 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/80 hover:border-rose-600 text-rose-300 hover:text-white rounded-lg flex items-center justify-center gap-2 text-xs font-mono font-semibold transition-all shadow-sm active:scale-[0.99]"
      >
        <ShieldAlert className="w-4 h-4 text-rose-400" />
        <span>BRAKE / HALT [SPACEBAR]</span>
      </button>

      {/* Keyboard hints footer */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 border-t border-slate-800/80 pt-2">
        <span>HOLD to Move</span>
        <span>RELEASE to Stop</span>
      </div>
    </div>
  );
};
