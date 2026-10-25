/**
 * TopNav Component
 * Follows the 3-Zone Top Bar Contract:
 * [Brand wordmark] --- [Nav Links] --- [Primary Action Zone (Mode Switch & E-STOP)]
 */

import React from 'react';
import { ShieldAlert, Radio, Laptop } from 'lucide-react';

export type ActiveTab = 'radar' | 'telemetry' | 'hardware' | 'python_setup';

interface TopNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isSimulatorMode: boolean;
  onToggleSimulatorMode: (sim: boolean) => void;
  onEmergencyStop: () => void;
  isBackendConnected: boolean;
  masterConnected: boolean;
  followerConnected: boolean;
  androidConnected: boolean;
  phoneMasterConnected?: boolean;
  phoneFollowerConnected?: boolean;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onTabChange,
  isSimulatorMode,
  onToggleSimulatorMode,
  onEmergencyStop,
  isBackendConnected,
  masterConnected,
  followerConnected,
  androidConnected,
  phoneMasterConnected,
  phoneFollowerConnected,
}) => {
  const mPhone = phoneMasterConnected ?? androidConnected;
  const fPhone = phoneFollowerConnected ?? false;

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-50">
      {/* Zone 1: Brand Wordmark (Single text element) */}
      <div className="flex items-center gap-3 shrink-0">
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); onTabChange('radar'); }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <span className="w-2.5 h-2.5 bg-cyan-400 rotate-45 inline-block"></span>
          PLATOON<span className="text-cyan-400">·</span>CMD
        </a>

        {/* Quiet status metadata with typographic separators */}
        <div className="hidden xl:flex items-center gap-2 text-xs font-mono text-slate-400 pl-3 border-l border-slate-800">
          <span className={masterConnected ? 'text-cyan-400 font-semibold' : 'text-slate-500'}>
            Master Pi: {masterConnected ? 'TCP OK' : 'OFFLINE'}
          </span>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <span className={followerConnected ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
            Follower Pi: {followerConnected ? 'TCP OK' : 'OFFLINE'}
          </span>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <span className={mPhone ? 'text-cyan-300 font-semibold' : 'text-slate-500'}>
            Phone 1 (M): {mPhone ? 'UDP SYNC' : 'WAITING'}
          </span>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <span className={fPhone ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
            Phone 2 (F): {fPhone ? 'UDP SYNC' : 'WAITING'}
          </span>
        </div>
      </div>

      {/* Zone 2: Navigation Links (Single-line text with subtle underlines) */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => onTabChange('radar')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'radar' ? 'text-cyan-400 font-semibold border-b-2 border-cyan-400 py-1' : ''
          }`}
        >
          Tactical Radar
        </button>
        <button
          onClick={() => onTabChange('telemetry')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'telemetry' ? 'text-cyan-400 font-semibold border-b-2 border-cyan-400 py-1' : ''
          }`}
        >
          Telemetry & Poses
        </button>
        <button
          onClick={() => onTabChange('hardware')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'hardware' ? 'text-cyan-400 font-semibold border-b-2 border-cyan-400 py-1' : ''
          }`}
        >
          Hardware & Network
        </button>
        <button
          onClick={() => onTabChange('python_setup')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'python_setup' ? 'text-cyan-400 font-semibold border-b-2 border-cyan-400 py-1' : ''
          }`}
        >
          Python Windows Backend & Code
        </button>
      </nav>

      {/* Zone 3: Primary Action Zone */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Mode Selector (Segmented control) */}
        <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono">
          <button
            onClick={() => onToggleSimulatorMode(false)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors whitespace-nowrap cursor-pointer ${
              !isSimulatorMode
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Connect to local FastAPI / WebSocket server (ws://localhost:8000)"
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Live Backend</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isBackendConnected ? 'bg-slate-950' : 'bg-rose-500'
              }`}
            />
          </button>

          <button
            onClick={() => onToggleSimulatorMode(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors whitespace-nowrap cursor-pointer ${
              isSimulatorMode
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Run interactive in-browser simulation testbench"
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Simulator</span>
          </button>
        </div>

        {/* Global E-STOP Button */}
        <button
          onClick={onEmergencyStop}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 rounded-lg transition-all shadow-[0_0_12px_rgba(225,29,72,0.4)] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>E-STOP</span>
        </button>
      </div>
    </header>
  );
};
