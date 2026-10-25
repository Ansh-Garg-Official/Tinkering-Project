import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Zap,
  Check,
  Copy,
  Radio,
  Compass,
  Terminal,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ConnectionStates } from '../types/robotics';

interface GyroStreamBridgeBarProps {
  connectionStates: ConnectionStates;
  currentYaw: number;
  currentFollowerYaw?: number;
  onInjectPacket: (raw: string) => void;
  onResetYaw?: () => void;
}

export const GyroStreamBridgeBar: React.FC<GyroStreamBridgeBarProps> = ({
  connectionStates,
  currentYaw,
  currentFollowerYaw = 0,
  onInjectPacket,
  onResetYaw,
}) => {
  const [selectedCar, setSelectedCar] = useState<'Car1' | 'Car2'>('Car1');
  const [customInput, setCustomInput] = useState(
    '[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037'
  );
  const [showCodeGuide, setShowCodeGuide] = useState(false);
  const [showVirtualWheel, setShowVirtualWheel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSimulatingStream, setIsSimulatingStream] = useState(false);

  // Phone Browser IMU Sensor State
  const [isBrowserSensorActive, setIsBrowserSensorActive] = useState(false);
  const [sensorPermissionStatus, setSensorPermissionStatus] = useState<string>('');
  const lastSensorAlphaRef = useRef<number | null>(null);
  const lastSensorTimeRef = useRef<number>(0);

  // Update default placeholder when changing selected car
  useEffect(() => {
    if (selectedCar === 'Car2') {
      setCustomInput('[Car2] Gyro (rad/s) -> X: 0.0521, Y: -0.0412, Z: 0.1500');
    } else {
      setCustomInput('[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037');
    }
  }, [selectedCar]);

  const isStreaming =
    connectionStates.android_udp ||
    (connectionStates.phone_master?.is_active ?? false) ||
    connectionStates.udp_packet_count > 0 ||
    (connectionStates.recent_packets && connectionStates.recent_packets.length > 0);

  const lastPacket =
    connectionStates.last_raw_packet ||
    (connectionStates.recent_packets && connectionStates.recent_packets.length > 0
      ? connectionStates.recent_packets[connectionStates.recent_packets.length - 1].raw
      : 'Waiting for stream...');

  const handleFeed = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (customInput.trim()) {
      onInjectPacket(customInput.trim());
    }
  };

  // Simulates a realistic rotation stream for the selected car
  const handleSimulateTurn = (degrees: number = 90) => {
    if (isSimulatingStream) return;
    setIsSimulatingStream(true);

    const steps = 30; // 30 packets over 1.2 seconds (~25Hz)
    const dt = 0.04;
    const targetRadTotal = (degrees * Math.PI) / 180;
    const radPerSec = targetRadTotal / (steps * dt);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      const noise = (Math.random() - 0.5) * 0.02;
      const gz = (radPerSec + noise).toFixed(4);
      const gx = ((Math.random() - 0.5) * 0.04).toFixed(4);
      const gy = ((Math.random() - 0.5) * 0.04).toFixed(4);
      const tag = selectedCar === 'Car2' ? '[Car2]' : '[Car1]';
      const sample = `${tag} Gyro (rad/s) -> X: ${gx}, Y: ${gy}, Z: ${gz}`;
      onInjectPacket(sample);

      if (step >= steps) {
        clearInterval(interval);
        setTimeout(() => {
          onInjectPacket(`${tag} Gyro (rad/s) -> X: 0.0000, Y: 0.0000, Z: 0.0000`);
          setIsSimulatingStream(false);
        }, 100);
      }
    }, 40);
  };

  // Browser DeviceOrientation sensor: rotates the car in real-time when tilted!
  const toggleBrowserSensor = async () => {
    if (isBrowserSensorActive) {
      setIsBrowserSensorActive(false);
      setSensorPermissionStatus('Sensor stopped');
      return;
    }

    if (typeof window === 'undefined') return;

    // Check iOS 13+ permission requirement
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    ) {
      try {
        const perm = await (
          DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        if (perm !== 'granted') {
          setSensorPermissionStatus('Permission denied by user');
          return;
        }
      } catch (err) {
        setSensorPermissionStatus(`Permission error: ${String(err)}`);
        return;
      }
    }

    if (!('ondeviceorientation' in window)) {
      setSensorPermissionStatus('Device orientation not supported on this browser');
      return;
    }

    setSensorPermissionStatus('Active · Streaming hardware IMU');
    setIsBrowserSensorActive(true);
    lastSensorAlphaRef.current = null;
    lastSensorTimeRef.current = performance.now();
  };

  useEffect(() => {
    if (!isBrowserSensorActive) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      const alpha = event.alpha; // 0 to 360 deg compass yaw
      if (alpha === null) return;

      const now = performance.now();
      const dt = (now - lastSensorTimeRef.current) / 1000;
      lastSensorTimeRef.current = now;

      if (lastSensorAlphaRef.current !== null && dt > 0.02) {
        // Calculate angular velocity (deg/s -> rad/s)
        let diffDeg = alpha - lastSensorAlphaRef.current;
        // Handle wrap-around
        if (diffDeg > 180) diffDeg -= 360;
        if (diffDeg < -180) diffDeg += 360;

        const gz_rad_s = ((diffDeg / dt) * Math.PI) / 180;
        const tag = selectedCar === 'Car2' ? '[Car2]' : '[Car1]';
        const sample = `${tag} Gyro (rad/s) -> X: 0.0000, Y: 0.0000, Z: ${gz_rad_s.toFixed(4)}`;
        onInjectPacket(sample);
      }
      lastSensorAlphaRef.current = alpha;
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isBrowserSensorActive, onInjectPacket, selectedCar]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compute current origin URL for forwarding
  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const bridgeSnippet = `# Option A: Zero dependencies (Uses Python built-in standard library, NO pip install needed!):
import urllib.request, json

# Inside your existing while True loop (right after receiving 'data'):
# data, addr = sock.recvfrom(2048)
# text = data.decode('utf-8')
try:
    payload = json.dumps({"packet": text}).encode('utf-8')
    req = urllib.request.Request("${currentOrigin}/api/stream", data=payload, headers={"Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, timeout=0.1)
except Exception:
    pass

# Option B: If you prefer 'requests', install it first: pip install requests
# import requests
# requests.post("${currentOrigin}/api/stream", json={"packet": text}, timeout=0.1)`;

  const runBridgeCmd = `python backend/forward_udp_to_webapp.py --port 5005`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 mb-4 shadow-lg transition-all">
      {/* Top Header Row */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        {/* Stream Status Indicator */}
        <div className="flex items-center gap-3">
          <div
            className={`w-3.5 h-3.5 rounded-full shrink-0 ${
              isStreaming
                ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse'
                : 'bg-amber-400 animate-ping'
            }`}
          />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-100 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                Live Gyroscope Stream Ingest
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                  isStreaming
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}
              >
                {isStreaming ? 'STREAM ACTIVE' : 'WAITING FOR PACKETS'}
              </span>

              {/* Target Car Selector Pill */}
              <div className="flex items-center bg-slate-950 rounded p-0.5 border border-slate-800 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={() => setSelectedCar('Car1')}
                  className={`px-2 py-0.5 rounded cursor-pointer font-bold transition-all ${
                    selectedCar === 'Car1'
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Car 1 (Master)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCar('Car2')}
                  className={`px-2 py-0.5 rounded cursor-pointer font-bold transition-all ${
                    selectedCar === 'Car2'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Car 2 (Follower)
                </button>
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 truncate max-w-xl mt-1">
              Latest Packet:{' '}
              <code className="text-cyan-300 font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800/80">
                {lastPacket}
              </code>
            </div>
          </div>
        </div>

        {/* Live Metrics: Car 1 Yaw & Car 2 Yaw */}
        <div className="flex items-center gap-2.5 font-mono text-xs flex-wrap">
          {/* Car 1 Heading */}
          <div className="bg-slate-950 px-3 py-1.5 rounded border border-cyan-900/60 flex items-center gap-2">
            <div>
              <span className="text-slate-400 text-[10px] block font-bold">CAR 1 (MASTER) YAW</span>
              <span className="text-cyan-300 font-bold text-sm">
                {currentYaw >= 0 ? `+${currentYaw.toFixed(1)}°` : `${currentYaw.toFixed(1)}°`}
              </span>
            </div>
            <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
          </div>

          {/* Car 2 Heading */}
          <div className="bg-slate-950 px-3 py-1.5 rounded border border-amber-900/60 flex items-center gap-2">
            <div>
              <span className="text-slate-400 text-[10px] block font-bold">CAR 2 (FOLLOWER) YAW</span>
              <span className="text-amber-400 font-bold text-sm">
                {currentFollowerYaw >= 0
                  ? `+${currentFollowerYaw.toFixed(1)}°`
                  : `${currentFollowerYaw.toFixed(1)}°`}
              </span>
            </div>
            <Compass className="w-4 h-4 text-amber-400 animate-spin-slow" />
          </div>

          {/* Zero Yaw Calibration Button */}
          {onResetYaw && (
            <button
              type="button"
              onClick={onResetYaw}
              title="Reset integrated yaw to 0°"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-xs font-mono cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Zero</span>
            </button>
          )}

          {/* Open Code Guide */}
          <button
            type="button"
            onClick={() => setShowCodeGuide(!showCodeGuide)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 text-xs font-mono cursor-pointer transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>Connect Python</span>
            {showCodeGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Middle Controls: Live Rotation Simulator & Packet Feeder */}
      <div className="pt-3 flex flex-col md:flex-row items-center gap-2">
        {/* Packet Text Ingest */}
        <form onSubmit={handleFeed} className="flex-1 flex items-center gap-2 w-full">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Paste packet e.g. [Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037"
            className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-1.5 text-xs font-mono text-slate-100 outline-none"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono rounded cursor-pointer transition-colors flex items-center gap-1 shrink-0"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Feed Packet</span>
          </button>
        </form>

        {/* Immediate Rotation Triggers */}
        <div className="flex items-center gap-1.5 shrink-0 w-full md:w-auto flex-wrap">
          <span className="text-[11px] font-mono text-slate-400 mr-1 hidden sm:inline">Rotate {selectedCar}:</span>
          <button
            type="button"
            disabled={isSimulatingStream}
            onClick={() => handleSimulateTurn(45)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-mono text-xs font-semibold rounded border border-slate-700 cursor-pointer transition-colors"
          >
            +45°
          </button>
          <button
            type="button"
            disabled={isSimulatingStream}
            onClick={() => handleSimulateTurn(-45)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs font-semibold rounded border border-slate-700 cursor-pointer transition-colors"
          >
            -45°
          </button>
          <button
            type="button"
            disabled={isSimulatingStream}
            onClick={() => handleSimulateTurn(90)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-xs font-semibold rounded border border-slate-700 cursor-pointer transition-colors"
          >
            +90°
          </button>
          <button
            type="button"
            disabled={isSimulatingStream}
            onClick={() => handleSimulateTurn(-90)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 font-mono text-xs font-semibold rounded border border-slate-700 cursor-pointer transition-colors"
          >
            -90°
          </button>
          <button
            type="button"
            onClick={() => setShowVirtualWheel(!showVirtualWheel)}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs font-semibold rounded border border-slate-700 cursor-pointer transition-colors flex items-center gap-1"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Dial</span>
          </button>
          <button
            type="button"
            onClick={toggleBrowserSensor}
            className={`px-3 py-1.5 font-mono text-xs font-bold rounded border cursor-pointer transition-colors flex items-center gap-1.5 ${
              isBrowserSensorActive
                ? 'bg-rose-950 text-rose-300 border-rose-700 animate-pulse'
                : 'bg-emerald-950 text-emerald-300 border-emerald-700 hover:bg-emerald-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{isBrowserSensorActive ? 'Stop Phone IMU' : 'Use Phone Browser IMU'}</span>
          </button>
        </div>
      </div>

      {/* Virtual Slider Dial if enabled */}
      {showVirtualWheel && (
        <div className="mt-3 pt-3 border-t border-slate-800/80 bg-slate-950/70 p-3 rounded-lg flex items-center gap-4">
          <span className="text-xs font-mono text-slate-300 font-bold shrink-0">
            Rotate {selectedCar} Virtual Slider:
          </span>
          <input
            type="range"
            min="-180"
            max="180"
            step="5"
            defaultValue="0"
            onChange={(e) => {
              const targetDeg = parseFloat(e.target.value);
              const targetRad = (targetDeg * Math.PI) / 180;
              const tag = selectedCar === 'Car2' ? '[Car2]' : '[Car1]';
              // Send instant gyro sample with angular velocity
              const sample = `${tag} Gyro (rad/s) -> X: 0.0000, Y: 0.0000, Z: ${(targetRad * 2.5).toFixed(4)}`;
              onInjectPacket(sample);
            }}
            className="flex-1 accent-cyan-400 cursor-pointer"
          />
          <span className="text-xs font-mono text-slate-400 shrink-0">
            Drag left/right to steer car in real-time
          </span>
        </div>
      )}

      {sensorPermissionStatus && (
        <div className="mt-2 text-[11px] font-mono text-cyan-400 bg-cyan-950/30 px-3 py-1 rounded border border-cyan-800/50">
          Sensor Status: {sensorPermissionStatus}
        </div>
      )}

      {/* Expandable Python Code Guide */}
      {showCodeGuide && (
        <div className="mt-3.5 pt-3.5 border-t border-slate-800/80 bg-slate-950 p-4 rounded-lg font-mono text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-200 font-bold flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Solution 1: Pipe Your Existing Python Script into this Dashboard in 2 Lines:
            </span>
            <button
              onClick={() => copyCode(bridgeSnippet)}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>

          <p className="text-slate-400 text-[11px]">
            In the script that is already receiving packets in your terminal, add this single HTTP POST inside your loop:
          </p>

          <pre className="p-3 bg-black/70 rounded text-cyan-300 text-xs overflow-x-auto leading-relaxed border border-slate-800">
            <code>{bridgeSnippet}</code>
          </pre>

          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-200 font-bold flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Solution 2: Run the Built-In Fast UDP Bridge:
              </span>
              <button
                onClick={() => copyCode(runBridgeCmd)}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Command</span>
              </button>
            </div>
            <pre className="p-2.5 bg-black/70 rounded text-emerald-400 text-xs overflow-x-auto border border-slate-800">
              <code>{runBridgeCmd}</code>
            </pre>
            <p className="text-[11px] text-slate-400 mt-1.5">
              This script displays running yaw angles in PowerShell and streams live packets directly to this dashboard at 50Hz without dropping packets.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
