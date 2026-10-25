/**
 * PreStartConfigModal Component
 * Before driving, allows setting:
 * - Master Car Speed (cm/s) and Follower Car Speed (cm/s)
 * - Initial X, Y coordinates for both Master and Follower
 * - Initial Heading angle based on N/S/E/W compass reading
 * - Safe collision distance threshold (e.g. 30 cm)
 */

import React, { useState } from 'react';
import { InitialStateConfig } from '../types/robotics';
import { Settings, Compass, Gauge, MapPin, ShieldCheck, Play } from 'lucide-react';

interface PreStartConfigModalProps {
  currentConfig: InitialStateConfig;
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: InitialStateConfig) => void;
}

export const PreStartConfigModal: React.FC<PreStartConfigModalProps> = ({
  currentConfig,
  isOpen,
  onClose,
  onApply,
}) => {
  const [mX, setMX] = useState(currentConfig.m_x);
  const [mY, setMY] = useState(currentConfig.m_y);
  const [fX, setFX] = useState(currentConfig.f_x);
  const [fY, setFY] = useState(currentConfig.f_y);
  const [mHeading, setMHeading] = useState(currentConfig.master_initial_heading ?? 0);
  const [fHeading, setFHeading] = useState(currentConfig.follower_initial_heading ?? 0);
  const [mSpeed, setMSpeed] = useState(currentConfig.master_speed);
  const [fSpeed, setFSpeed] = useState(currentConfig.follower_speed);
  const [safeDist, setSafeDist] = useState(currentConfig.safe_distance || 30.0);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply({
      m_x: Number(mX),
      m_y: Number(mY),
      f_x: Number(fX),
      f_y: Number(fY),
      master_initial_heading: Number(mHeading),
      follower_initial_heading: Number(fHeading),
      master_speed: Number(mSpeed),
      follower_speed: Number(fSpeed),
      safe_distance: Number(safeDist),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Pre-Start Fleet Configuration
              </h2>
              <p className="text-[11px] text-slate-400">
                Calibrate initial poses, independent compass bearings, speeds, and safety boundaries.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-xs font-mono p-1 rounded hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 text-xs font-mono overflow-y-auto max-h-[80vh]">
          {/* Section 1: Independent Initial Headings */}
          <div className="space-y-3">
            {/* Master Heading */}
            <div className="bg-slate-950/70 border border-cyan-900/40 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-slate-200 font-bold flex items-center gap-2">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  Master Car Initial Heading (θm₀) from Phone Compass
                </label>
                <span className="text-cyan-400 font-bold text-sm tabular-nums">{mHeading}°</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Read azimuth from Master car compass (0° = North, 90° = East, 180° = South, 270° = West).
              </p>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="359"
                  step="1"
                  value={mHeading}
                  onChange={(e) => setMHeading(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded px-3 py-1.5 text-slate-100 font-bold text-sm outline-none"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setMHeading(deg)}
                      className={`px-2 py-1 rounded border text-[11px] cursor-pointer ${
                        mHeading === deg ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {deg === 0 ? 'N (0°)' : deg === 90 ? 'E (90°)' : deg === 180 ? 'S (180°)' : 'W (270°)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Follower Heading */}
            <div className="bg-slate-950/70 border border-amber-900/40 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-slate-200 font-bold flex items-center gap-2">
                  <Compass className="w-4 h-4 text-amber-400" />
                  Follower Car Initial Heading (θf₀)
                </label>
                <span className="text-amber-400 font-bold text-sm tabular-nums">{fHeading}°</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Starting orientation of the Follower car before autonomous origin alignment.
              </p>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="359"
                  step="1"
                  value={fHeading}
                  onChange={(e) => setFHeading(parseFloat(e.target.value) || 0)}
                  className="w-24 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded px-3 py-1.5 text-slate-100 font-bold text-sm outline-none"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setFHeading(deg)}
                      className={`px-2 py-1 rounded border text-[11px] cursor-pointer ${
                        fHeading === deg ? 'bg-amber-500/20 text-amber-300 border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {deg === 0 ? 'N (0°)' : deg === 90 ? 'E (90°)' : deg === 180 ? 'S (180°)' : 'W (270°)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Initial Coordinates (X, Y) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Master Coordinates */}
            <div className="bg-slate-950/70 border border-cyan-900/40 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-cyan-400 font-bold">
                <MapPin className="w-4 h-4" />
                <span>Master Car Initial Pose</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block text-[10px] uppercase">X (cm)</label>
                  <input
                    type="number"
                    value={mX}
                    onChange={(e) => setMX(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-400 rounded px-2.5 py-1.5 text-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block text-[10px] uppercase">Y (cm)</label>
                  <input
                    type="number"
                    value={mY}
                    onChange={(e) => setMY(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-400 rounded px-2.5 py-1.5 text-slate-100 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Follower Coordinates */}
            <div className="bg-slate-950/70 border border-amber-900/40 rounded-lg p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <MapPin className="w-4 h-4" />
                <span>Follower Car Initial Pose</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block text-[10px] uppercase">X (cm)</label>
                  <input
                    type="number"
                    value={fX}
                    onChange={(e) => setFX(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded px-2.5 py-1.5 text-slate-100 outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block text-[10px] uppercase">Y (cm)</label>
                  <input
                    type="number"
                    value={fY}
                    onChange={(e) => setFY(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded px-2.5 py-1.5 text-slate-100 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Independent Speeds & Virtual Collision Threshold */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-1.5">
              <label className="text-slate-300 font-semibold block text-[11px] flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Master Speed (cm/s)
              </label>
              <input
                type="number"
                min="5"
                max="200"
                value={mSpeed}
                onChange={(e) => setMSpeed(parseFloat(e.target.value) || 35)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 outline-none font-bold"
              />
              <span className="text-[10px] text-slate-500 block">Fully charged battery ~35 cm/s</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-1.5">
              <label className="text-slate-300 font-semibold block text-[11px] flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                Follower Speed (cm/s)
              </label>
              <input
                type="number"
                min="5"
                max="200"
                value={fSpeed}
                onChange={(e) => setFSpeed(parseFloat(e.target.value) || 35)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 outline-none font-bold"
              />
              <span className="text-[10px] text-slate-500 block">Calibrated independently</span>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 space-y-1.5">
              <label className="text-slate-300 font-semibold block text-[11px] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
                Safe Gap Limit (cm)
              </label>
              <input
                type="number"
                min="10"
                max="150"
                value={safeDist}
                onChange={(e) => setSafeDist(parseFloat(e.target.value) || 30)}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-100 outline-none font-bold"
              />
              <span className="text-[10px] text-slate-500 block">Auto-suspends Follower if &lt; 30cm</span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Apply & Initialize Fleet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
