/**
 * Dual GyroCompassHUD Component
 * Renders the absolute Yaw angles for BOTH Master Car (Phone 1) and Follower Car (Phone 2).
 * Displays:
 * - Dual compass rose dials with real-time heading
 * - Closed-loop physical turn verification badges (measures if car actually turned)
 * - Raw packet inspector with exact [Car1] / [Car2] Gyro (rad/s) format
 * - Quick UDP test packet injector for testing phone communication
 */

import React, { useState } from 'react';
import { Compass, Wifi, Activity, CheckCircle2, AlertTriangle, Send, Smartphone } from 'lucide-react';
import { PhoneTrackerState } from '../types/robotics';

interface GyroCompassHUDProps {
  masterYawDeg: number;
  masterInitialHeadingDeg?: number;
  masterIntegratedYawDeg?: number;
  masterGzDegS?: number;
  masterPhone?: PhoneTrackerState;

  followerYawDeg: number;
  followerInitialHeadingDeg?: number;
  followerIntegratedYawDeg?: number;
  followerGzDegS?: number;
  followerPhone?: PhoneTrackerState;

  lastRawPacket?: string;
  udpHz: number;
  packetCount: number;
  isStreamActive: boolean;
  isSimulatorMode?: boolean;
  onSendTestPacket?: (raw: string) => void;
}

export const GyroCompassHUD: React.FC<GyroCompassHUDProps> = ({
  masterYawDeg,
  masterInitialHeadingDeg = 0,
  masterIntegratedYawDeg = 0,
  masterGzDegS = 0,
  masterPhone,

  followerYawDeg,
  followerInitialHeadingDeg = 0,
  followerIntegratedYawDeg = 0,
  followerGzDegS = 0,
  followerPhone,

  lastRawPacket,
  udpHz,
  packetCount,
  isStreamActive,
  isSimulatorMode = false,
  onSendTestPacket,
}) => {
  const [selectedCar, setSelectedCar] = useState<'master' | 'follower' | 'both'>('master');
  const [customTestGz, setCustomTestGz] = useState<number>(0.25);

  const getCardinal = (deg: number) => {
    const norm = ((deg % 360) + 360) % 360;
    if (norm >= 337.5 || norm < 22.5) return 'N (0°)';
    if (norm >= 22.5 && norm < 67.5) return 'NE (45°)';
    if (norm >= 67.5 && norm < 112.5) return 'E (90°)';
    if (norm >= 112.5 && norm < 157.5) return 'SE (135°)';
    if (norm >= 157.5 && norm < 202.5) return 'S (180°)';
    if (norm >= 202.5 && norm < 247.5) return 'SW (225°)';
    if (norm >= 247.5 && norm < 292.5) return 'W (270°)';
    return 'NW (315°)';
  };

  const normMaster = ((masterYawDeg % 360) + 360) % 360;
  const normFollower = ((followerYawDeg % 360) + 360) % 360;

  const mPhoneActive = isSimulatorMode ? true : (masterPhone?.is_active ?? isStreamActive);
  const fPhoneActive = isSimulatorMode ? true : (followerPhone?.is_active ?? false);

  const mTurnStatus = masterPhone?.turn_status || 'IDLE';
  const fTurnStatus = followerPhone?.turn_status || 'IDLE';

  const handleInjectSample = (carTag: 'Car1' | 'Car2') => {
    if (!onSendTestPacket) return;
    const gzVal = carTag === 'Car1' ? customTestGz : -customTestGz;
    const pkt = `[${carTag}] Gyro (rad/s) -> X: 0.0012, Y: -0.0024, Z: ${gzVal.toFixed(4)}`;
    onSendTestPacket(pkt);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-4 flex flex-col gap-3 shadow-lg">
      {/* Header with Dual Phone Switcher */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Dual Gyroscope Turn Verification
          </h3>
        </div>
        {/* Car Selector Tabs */}
        <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px] font-mono">
          <button
            onClick={() => setSelectedCar('master')}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              selectedCar === 'master' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Car 1 (Master)
          </button>
          <button
            onClick={() => setSelectedCar('follower')}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              selectedCar === 'follower' ? 'bg-emerald-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Car 2 (Follower)
          </button>
          <button
            onClick={() => setSelectedCar('both')}
            className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
              selectedCar === 'both' ? 'bg-purple-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dual View
          </button>
        </div>
      </div>

      {/* Main Dial Stage */}
      <div className={`grid ${selectedCar === 'both' ? 'grid-cols-2 gap-3' : 'grid-cols-1'} items-center`}>
        {/* Car 1 / Master Dial */}
        {(selectedCar === 'master' || selectedCar === 'both') && (
          <div className="flex items-center gap-3 p-2 bg-slate-950/50 rounded-lg border border-cyan-900/40">
            {/* SVG Compass */}
            <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#1e293b" strokeWidth="2" />
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = i * 30;
                  const rad = (angle * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1={50 + 38 * Math.cos(rad)}
                      y1={50 + 38 * Math.sin(rad)}
                      x2={50 + 44 * Math.cos(rad)}
                      y2={50 + 44 * Math.sin(rad)}
                      stroke={i % 3 === 0 ? '#38bdf8' : '#334155'}
                      strokeWidth={i % 3 === 0 ? '2' : '1'}
                    />
                  );
                })}
              </svg>
              {/* Needle */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-75 pointer-events-none"
                style={{ transform: `rotate(${normMaster}deg)` }}
              >
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[34px] border-b-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.7)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-cyan-400 z-10 -my-1" />
                  <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[28px] border-t-slate-600" />
                </div>
              </div>
              <span className="absolute top-1 text-[8px] font-mono font-bold text-cyan-400">N</span>
              <span className="absolute bottom-1 text-[8px] font-mono text-slate-500">S</span>
              <span className="absolute right-1 text-[8px] font-mono text-slate-500">E</span>
              <span className="absolute left-1 text-[8px] font-mono text-slate-500">W</span>
            </div>

            {/* Readouts */}
            <div className="flex-1 text-xs font-mono space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-cyan-400 font-bold uppercase">Master (Car 1)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${mPhoneActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>
                  {mPhoneActive ? `${(masterPhone?.packet_rate_hz || udpHz || 25).toFixed(0)} Hz` : 'OFFLINE'}
                </span>
              </div>
              <div className="text-xl font-bold text-slate-100 tabular-nums">
                {normMaster.toFixed(1)}° <span className="text-xs text-cyan-400 font-normal">{getCardinal(normMaster)}</span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-800/80 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Integrated Yaw (Δθ):</span>
                  <span className="text-cyan-300 font-bold tabular-nums">
                    {masterIntegratedYawDeg >= 0 ? `+${masterIntegratedYawDeg.toFixed(1)}°` : `${masterIntegratedYawDeg.toFixed(1)}°`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Angular Velocity:</span>
                  <span className="text-slate-200 tabular-nums">{(masterPhone?.gz_deg_s ?? masterGzDegS).toFixed(2)}°/s</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Car 2 / Follower Dial */}
        {(selectedCar === 'follower' || selectedCar === 'both') && (
          <div className="flex items-center gap-3 p-2 bg-slate-950/50 rounded-lg border border-emerald-900/40">
            {/* SVG Compass */}
            <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#1e293b" strokeWidth="2" />
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = i * 30;
                  const rad = (angle * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1={50 + 38 * Math.cos(rad)}
                      y1={50 + 38 * Math.sin(rad)}
                      x2={50 + 44 * Math.cos(rad)}
                      y2={50 + 44 * Math.sin(rad)}
                      stroke={i % 3 === 0 ? '#34d399' : '#334155'}
                      strokeWidth={i % 3 === 0 ? '2' : '1'}
                    />
                  );
                })}
              </svg>
              {/* Needle */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-75 pointer-events-none"
                style={{ transform: `rotate(${normFollower}deg)` }}
              >
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[34px] border-b-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-950 border border-emerald-400 z-10 -my-1" />
                  <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[28px] border-t-slate-600" />
                </div>
              </div>
              <span className="absolute top-1 text-[8px] font-mono font-bold text-emerald-400">N</span>
              <span className="absolute bottom-1 text-[8px] font-mono text-slate-500">S</span>
              <span className="absolute right-1 text-[8px] font-mono text-slate-500">E</span>
              <span className="absolute left-1 text-[8px] font-mono text-slate-500">W</span>
            </div>

            {/* Readouts */}
            <div className="flex-1 text-xs font-mono space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-emerald-400 font-bold uppercase">Follower (Car 2)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${fPhoneActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-500'}`}>
                  {fPhoneActive ? `${(followerPhone?.packet_rate_hz || 25).toFixed(0)} Hz` : 'OFFLINE'}
                </span>
              </div>
              <div className="text-xl font-bold text-slate-100 tabular-nums">
                {normFollower.toFixed(1)}° <span className="text-xs text-emerald-400 font-normal">{getCardinal(normFollower)}</span>
              </div>
              <div className="text-[11px] text-slate-400 space-y-0.5 border-t border-slate-800/80 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Integrated Yaw (Δθ):</span>
                  <span className="text-emerald-300 font-bold tabular-nums">
                    {followerIntegratedYawDeg >= 0 ? `+${followerIntegratedYawDeg.toFixed(1)}°` : `${followerIntegratedYawDeg.toFixed(1)}°`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Angular Velocity:</span>
                  <span className="text-slate-200 tabular-nums">{(followerPhone?.gz_deg_s ?? followerGzDegS).toFixed(2)}°/s</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Turn Verification Card: Closed loop feedback that car has physically rotated */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-md p-2.5 text-xs font-mono">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Closed-Loop Turn Verification (Mobile Gyro):</span>
          </div>
          <span className="text-[10px] text-slate-500">Tolerance: ±3°</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          {/* Master Turn Status */}
          <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
            <div className="text-cyan-400 font-bold text-[10px] mb-0.5">CAR 1 (MASTER) TURN:</div>
            <div className="text-slate-200 truncate">
              {mTurnStatus.includes('ROTATION CONFIRMED') ? (
                <span className="text-emerald-400 font-bold">✓ {mTurnStatus}</span>
              ) : mTurnStatus.includes('WARNING') ? (
                <span className="text-amber-400 font-bold">⚠ {mTurnStatus}</span>
              ) : mTurnStatus.includes('VERIFYING') ? (
                <span className="text-cyan-300 animate-pulse font-bold">⟳ {mTurnStatus}</span>
              ) : (
                <span className="text-slate-400">Idle / Ready</span>
              )}
            </div>
          </div>

          {/* Follower Turn Status */}
          <div className="bg-slate-900/90 p-2 rounded border border-slate-800">
            <div className="text-emerald-400 font-bold text-[10px] mb-0.5">CAR 2 (FOLLOWER) TURN:</div>
            <div className="text-slate-200 truncate">
              {fTurnStatus.includes('ROTATION CONFIRMED') ? (
                <span className="text-emerald-400 font-bold">✓ {fTurnStatus}</span>
              ) : fTurnStatus.includes('WARNING') ? (
                <span className="text-amber-400 font-bold">⚠ {fTurnStatus}</span>
              ) : fTurnStatus.includes('VERIFYING') ? (
                <span className="text-emerald-300 animate-pulse font-bold">⟳ {fTurnStatus}</span>
              ) : (
                <span className="text-slate-400">Autonomous alignment ready</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Raw Incoming UDP Packet Inspector & Quick Injector */}
      <div className="bg-slate-950 border border-slate-800/90 rounded p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>Latest Received Packet:</span>
          </div>
          <span className="text-slate-500 text-[10px]">Format: [Car1] Gyro (rad/s) -&gt; X, Y, Z</span>
        </div>

        <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800 font-mono text-[11px] text-cyan-300 truncate">
          {lastRawPacket || '[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037'}
        </div>

        {/* Quick Test Buttons to Test Data Flow Immediately */}
        {onSendTestPacket && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-[11px] font-mono">
            <span className="text-slate-400 text-[10px]">Simulate Phone Stream:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleInjectSample('Car1')}
                className="px-2 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded text-[10px] cursor-pointer transition-colors"
                title="Send simulated Car 1 packet to test integration"
              >
                + Test Car 1 Packet
              </button>
              <button
                onClick={() => handleInjectSample('Car2')}
                className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded text-[10px] cursor-pointer transition-colors"
                title="Send simulated Car 2 packet to test integration"
              >
                + Test Car 2 Packet
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
