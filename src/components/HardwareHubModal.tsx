/**
 * HardwareHubModal / Tab Component
 * Manages IP/Port configuration for Master Pi, Follower Pi, Dual Android UDP streams, and Backend WebSocket.
 * Features:
 * - Direct Hardware Test Bench: test Master and Follower motors independently (WASD) and observe GPIO 17, 27, 22, 23 pin states
 * - Dual Phone UDP Stream Inspector: live packet stream from Phone 1 (Master) & Phone 2 (Follower)
 * - Local Wi-Fi IP display and one-click Windows Firewall rule command
 * - Step-by-step Hardware, Wiring, and 2-Phone Setup Guide
 */

import React, { useState } from 'react';
import { ConnectionStates, NetworkConfig, DrivingCommand } from '../types/robotics';
import {
  Server,
  Wifi,
  Cpu,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookOpen,
  Terminal,
  Cable,
  Compass,
  ShieldAlert,
  Copy,
  Check,
  Send,
  Zap,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Disc
} from 'lucide-react';

interface HardwareHubProps {
  connectionStates: ConnectionStates;
  config: NetworkConfig;
  onUpdateConfig: (newConfig: Partial<NetworkConfig>) => void;
  onReconnect: () => void;
  isSimulatorMode: boolean;
  onDirectCarCommand?: (car: 'master' | 'follower', cmd: DrivingCommand) => void;
  onSendTestPacket?: (raw: string) => void;
}

export const HardwareHub: React.FC<HardwareHubProps> = ({
  connectionStates,
  config,
  onUpdateConfig,
  onReconnect,
  isSimulatorMode,
  onDirectCarCommand,
  onSendTestPacket,
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'motor_bench' | 'packet_inspector' | 'guide'>('status');
  const [guideStep, setGuideStep] = useState<1 | 2 | 3 | 4>(1);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [masterHost, setMasterHost] = useState(config.master_host);
  const [masterPort, setMasterPort] = useState(config.master_port);
  const [followerHost, setFollowerHost] = useState(config.follower_host);
  const [followerPort, setFollowerPort] = useState(config.follower_port);
  const [udpPort, setUdpPort] = useState(config.udp_port);
  const [followerUdpPort, setFollowerUdpPort] = useState(config.follower_udp_port || 5006);
  const [wsUrl, setWsUrl] = useState(config.backend_ws_url);
  const [savedMessage, setSavedMessage] = useState(false);

  // Motor Bench Active States
  const [masterBenchCmd, setMasterBenchCmd] = useState<DrivingCommand>('stop');
  const [followerBenchCmd, setFollowerBenchCmd] = useState<DrivingCommand>('stop');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      master_host: masterHost,
      master_port: masterPort,
      follower_host: followerHost,
      follower_port: followerPort,
      udp_port: udpPort,
      follower_udp_port: followerUdpPort,
      backend_ws_url: wsUrl,
    });
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2500);
  };

  const handleBenchMotor = (car: 'master' | 'follower', cmd: DrivingCommand) => {
    if (car === 'master') setMasterBenchCmd(cmd);
    else setFollowerBenchCmd(cmd);

    if (onDirectCarCommand) {
      onDirectCarCommand(car, cmd);
    }
  };

  const localIp = connectionStates.local_ip || config.local_ip || '192.168.1.xxx';
  const firewallCmd = `netsh advfirewall firewall add rule name="PlatoonCommand UDP" dir=in action=allow protocol=UDP localport=${config.udp_port},${config.follower_udp_port || 5006}`;

  const mPhone = connectionStates.phone_master;
  const fPhone = connectionStates.phone_follower;

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              activeTab === 'status'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Live Links &amp; IP Config
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('motor_bench')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              activeTab === 'motor_bench'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            Motor Driver Test Bench
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('packet_inspector')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              activeTab === 'packet_inspector'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-blue-400" />
            Dual Phone Packet Inspector
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
              activeTab === 'guide'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Wiring &amp; Setup Walkthrough
          </button>
        </div>

        <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
          <span>Laptop Wi-Fi IP:</span>
          <span className="text-cyan-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            {localIp}
          </span>
        </div>
      </div>

      {/* Simulation banner if active */}
      {isSimulatorMode && (
        <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-lg p-3.5 flex items-center justify-between text-xs font-mono text-cyan-200">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Simulator Mode Active:</strong> Emulated hardware loops are currently generating telemetry. Switch to <strong>Live Backend</strong> in the top header once your Python backend and physical Raspberry Pis are connected.
            </span>
          </div>
          <span className="text-cyan-400 font-semibold uppercase">In-Browser Testbench</span>
        </div>
      )}

      {/* VIEW 1: LIVE STATUS & IP CONFIGURATION */}
      {activeTab === 'status' && (
        <>
          {/* Grid of System Links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Master Raspberry Pi TCP */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Master Raspberry Pi (Car 1 TCP)
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  {connectionStates.master_tcp ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      CONNECTED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500">
                      <XCircle className="w-3.5 h-3.5 text-rose-500" />
                      DISCONNECTED
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target IP:Port:</span>
                  <span className="text-slate-200 font-bold">{config.master_host}:{config.master_port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Actuator Command:</span>
                  <span className="text-cyan-300 font-bold uppercase">{connectionStates.master_last_cmd || 'stop'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Motor Driver Pins:</span>
                  <span>GPIO 17 (IN1), 27 (IN2), 22 (IN3), 23 (IN4)</span>
                </div>
              </div>
            </div>

            {/* Follower Raspberry Pi TCP */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Follower Raspberry Pi (Car 2 TCP)
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  {connectionStates.follower_tcp ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      CONNECTED
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500">
                      <XCircle className="w-3.5 h-3.5 text-rose-500" />
                      DISCONNECTED
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target IP:Port:</span>
                  <span className="text-slate-200 font-bold">{config.follower_host}:{config.follower_port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Actuator Command:</span>
                  <span className="text-amber-300 font-bold uppercase">{connectionStates.follower_last_cmd || 'stop'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Platooning Mode:</span>
                  <span>FIFO Queue ({config.delay_sec}s delay) + Autonomous Intercept</span>
                </div>
              </div>
            </div>

            {/* Phone 1: Master Gyroscope UDP */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Phone 1: Master (Car 1 Gyro)
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  {(mPhone?.is_active ?? connectionStates.android_udp) ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {(mPhone?.packet_rate_hz || connectionStates.udp_hz || 25).toFixed(0)} Hz STREAMING
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500">
                      <XCircle className="w-3.5 h-3.5 text-amber-500" />
                      WAITING FOR STREAM
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone Destination:</span>
                  <span className="text-cyan-300 font-bold">{localIp}:{config.udp_port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Tag:</span>
                  <span className="text-slate-200 font-bold">[Car1] or [Master]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Turn Verification:</span>
                  <span className="text-emerald-400 font-semibold">{mPhone?.turn_status || 'Idle / Monitoring'}</span>
                </div>
              </div>
            </div>

            {/* Phone 2: Follower Gyroscope UDP */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Phone 2: Follower (Car 2 Gyro)
                  </h4>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-mono">
                  {fPhone?.is_active ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {fPhone.packet_rate_hz.toFixed(0)} Hz STREAMING
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-500">
                      <XCircle className="w-3.5 h-3.5 text-amber-500" />
                      WAITING FOR STREAM
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Phone Destination:</span>
                  <span className="text-emerald-300 font-bold">{localIp}:{config.follower_udp_port || 5006} (or {config.udp_port})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Tag:</span>
                  <span className="text-slate-200 font-bold">[Car2] or [Follower]</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Turn Verification:</span>
                  <span className="text-emerald-400 font-semibold">{fPhone?.turn_status || 'Idle / Monitoring'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Network Configuration Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-200 font-semibold">
                Network Target Endpoints
              </h4>
              <button
                onClick={onReconnect}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reconnect Sockets
              </button>
            </div>

            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">Master Pi IP Address</label>
                <input
                  type="text"
                  value={masterHost}
                  onChange={(e) => setMasterHost(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-2 text-slate-100 outline-none"
                  placeholder="192.168.1.100"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Master Pi TCP Port</label>
                <input
                  type="number"
                  value={masterPort}
                  onChange={(e) => setMasterPort(parseInt(e.target.value) || 8888)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-2 text-slate-100 outline-none"
                  placeholder="8888"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Follower Pi IP Address</label>
                <input
                  type="text"
                  value={followerHost}
                  onChange={(e) => setFollowerHost(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-2 text-slate-100 outline-none"
                  placeholder="192.168.1.101"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Follower Pi TCP Port</label>
                <input
                  type="number"
                  value={followerPort}
                  onChange={(e) => setFollowerPort(parseInt(e.target.value) || 8888)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-2 text-slate-100 outline-none"
                  placeholder="8888"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Phone 1 (Master) UDP Port</label>
                <input
                  type="number"
                  value={udpPort}
                  onChange={(e) => setUdpPort(parseInt(e.target.value) || 5005)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-2 text-slate-100 outline-none"
                  placeholder="5005"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Phone 2 (Follower) UDP Port</label>
                <input
                  type="number"
                  value={followerUdpPort}
                  onChange={(e) => setFollowerUdpPort(parseInt(e.target.value) || 5006)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-2 text-slate-100 outline-none"
                  placeholder="5006"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-slate-400 block mb-1">Backend WebSocket URL</label>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded px-3 py-2 text-slate-100 outline-none"
                  placeholder="ws://localhost:8000/ws/telemetry"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-4 py-2 rounded transition-colors cursor-pointer"
                >
                  Save Configuration
                </button>
              </div>
            </form>

            {savedMessage && (
              <div className="mt-3 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Network configuration updated and saved.
              </div>
            )}
          </div>
        </>
      )}

      {/* VIEW 2: DIRECT MOTOR TEST BENCH */}
      {activeTab === 'motor_bench' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-200">
                Direct Hardware Motor Test Bench
              </h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Verify that pressing W/A/S/D sends commands to the Raspberry Pi and spins the physical wheels.
              </p>
            </div>
            <span className="text-xs font-mono px-2 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded">
              L298N Hardware Actuation Test
            </span>
          </div>

          {/* Explanation Box reassuring the user */}
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>How pressing W inside the interface actually drives the physical car:</span>
            </div>
            <div className="text-slate-400 text-[11px] leading-relaxed pl-6 space-y-1">
              <div>1. Pressing <strong>[W]</strong> dispatches a WebSocket command <code className="text-cyan-300">{`{"type": "command", "cmd": "w"}`}</code> to the laptop FastAPI server.</div>
              <div>2. The laptop server immediately sends <code className="text-cyan-300">"w\n"</code> over the TCP socket to the Raspberry Pi IP (<code className="text-slate-200">{config.master_host}:{config.master_port}</code>).</div>
              <div>3. On the Raspberry Pi, <code className="text-slate-200">pi_l298n_server.py</code> receives <code className="text-cyan-300">'w'</code> and executes:</div>
              <div className="bg-black/60 p-2 rounded text-emerald-300 font-mono text-[10px]">
                GPIO.output(17, GPIO.HIGH)  # Left Forward<br />
                GPIO.output(27, GPIO.LOW)   # Left Reverse<br />
                GPIO.output(22, GPIO.HIGH)  # Right Forward<br />
                GPIO.output(23, GPIO.LOW)   # Right Reverse
              </div>
              <div>4. 12V power flows from the battery through the L298N H-Bridge into both DC motors, spinning both wheels forward!</div>
            </div>
          </div>

          {/* Dual Car Test Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Master Car Actuator Test */}
            <div className="bg-slate-950 p-4 rounded-lg border border-cyan-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 font-mono">CAR 1 (MASTER) MOTORS</span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${connectionStates.master_tcp ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                  {connectionStates.master_tcp ? 'TCP CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>

              {/* D-Pad Buttons */}
              <div className="flex flex-col items-center gap-1.5 py-2">
                <button
                  onMouseDown={() => handleBenchMotor('master', 'w')}
                  onMouseUp={() => handleBenchMotor('master', 'stop')}
                  className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                    masterBenchCmd === 'w' ? 'bg-cyan-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(6,182,212,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <ArrowUp className="w-4 h-4" />
                  W
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => handleBenchMotor('master', 'a')}
                    onMouseUp={() => handleBenchMotor('master', 'stop')}
                    className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                      masterBenchCmd === 'a' ? 'bg-cyan-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(6,182,212,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    A
                  </button>
                  <button
                    onClick={() => handleBenchMotor('master', 'stop')}
                    className="w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs bg-rose-600/80 hover:bg-rose-600 text-white transition-all cursor-pointer"
                  >
                    <Disc className="w-4 h-4" />
                    STOP
                  </button>
                  <button
                    onMouseDown={() => handleBenchMotor('master', 'd')}
                    onMouseUp={() => handleBenchMotor('master', 'stop')}
                    className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                      masterBenchCmd === 'd' ? 'bg-cyan-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(6,182,212,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4" />
                    D
                  </button>
                </div>
                <button
                  onMouseDown={() => handleBenchMotor('master', 's')}
                  onMouseUp={() => handleBenchMotor('master', 'stop')}
                  className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                    masterBenchCmd === 's' ? 'bg-cyan-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(6,182,212,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <ArrowDown className="w-4 h-4" />
                  S
                </button>
              </div>

              {/* Pin State Diagram */}
              <div className="bg-slate-900 p-2.5 rounded text-[11px] font-mono space-y-1">
                <div className="text-slate-400 font-semibold text-[10px]">L298N PIN STATES:</div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN1 (GPIO 17):</span>
                    <span className={masterBenchCmd === 'w' || masterBenchCmd === 'd' ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {masterBenchCmd === 'w' || masterBenchCmd === 'd' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN2 (GPIO 27):</span>
                    <span className={masterBenchCmd === 's' || masterBenchCmd === 'a' ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {masterBenchCmd === 's' || masterBenchCmd === 'a' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN3 (GPIO 22):</span>
                    <span className={masterBenchCmd === 'w' || masterBenchCmd === 'a' ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {masterBenchCmd === 'w' || masterBenchCmd === 'a' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN4 (GPIO 23):</span>
                    <span className={masterBenchCmd === 's' || masterBenchCmd === 'd' ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {masterBenchCmd === 's' || masterBenchCmd === 'd' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Follower Car Actuator Test */}
            <div className="bg-slate-950 p-4 rounded-lg border border-amber-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 font-mono">CAR 2 (FOLLOWER) MOTORS</span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${connectionStates.follower_tcp ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                  {connectionStates.follower_tcp ? 'TCP CONNECTED' : 'DISCONNECTED'}
                </span>
              </div>

              {/* D-Pad Buttons */}
              <div className="flex flex-col items-center gap-1.5 py-2">
                <button
                  onMouseDown={() => handleBenchMotor('follower', 'w')}
                  onMouseUp={() => handleBenchMotor('follower', 'stop')}
                  className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                    followerBenchCmd === 'w' ? 'bg-amber-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <ArrowUp className="w-4 h-4" />
                  W
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    onMouseDown={() => handleBenchMotor('follower', 'a')}
                    onMouseUp={() => handleBenchMotor('follower', 'stop')}
                    className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                      followerBenchCmd === 'a' ? 'bg-amber-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    A
                  </button>
                  <button
                    onClick={() => handleBenchMotor('follower', 'stop')}
                    className="w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs bg-rose-600/80 hover:bg-rose-600 text-white transition-all cursor-pointer"
                  >
                    <Disc className="w-4 h-4" />
                    STOP
                  </button>
                  <button
                    onMouseDown={() => handleBenchMotor('follower', 'd')}
                    onMouseUp={() => handleBenchMotor('follower', 'stop')}
                    className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                      followerBenchCmd === 'd' ? 'bg-amber-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4" />
                    D
                  </button>
                </div>
                <button
                  onMouseDown={() => handleBenchMotor('follower', 's')}
                  onMouseUp={() => handleBenchMotor('follower', 'stop')}
                  className={`w-16 h-12 flex flex-col items-center justify-center rounded font-mono font-bold text-xs transition-all cursor-pointer ${
                    followerBenchCmd === 's' ? 'bg-amber-500 text-slate-950 scale-95 shadow-[0_0_12px_rgba(245,158,11,0.8)]' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  <ArrowDown className="w-4 h-4" />
                  S
                </button>
              </div>

              {/* Pin State Diagram */}
              <div className="bg-slate-900 p-2.5 rounded text-[11px] font-mono space-y-1">
                <div className="text-slate-400 font-semibold text-[10px]">L298N PIN STATES:</div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN1 (GPIO 17):</span>
                    <span className={followerBenchCmd === 'w' || followerBenchCmd === 'd' ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {followerBenchCmd === 'w' || followerBenchCmd === 'd' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN2 (GPIO 27):</span>
                    <span className={followerBenchCmd === 's' || followerBenchCmd === 'a' ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {followerBenchCmd === 's' || followerBenchCmd === 'a' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN3 (GPIO 22):</span>
                    <span className={followerBenchCmd === 'w' || followerBenchCmd === 'a' ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {followerBenchCmd === 'w' || followerBenchCmd === 'a' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IN4 (GPIO 23):</span>
                    <span className={followerBenchCmd === 's' || followerBenchCmd === 'd' ? 'text-amber-400 font-bold' : 'text-slate-600'}>
                      {followerBenchCmd === 's' || followerBenchCmd === 'd' ? 'HIGH (1)' : 'LOW (0)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: DUAL PHONE PACKET INSPECTOR */}
      {activeTab === 'packet_inspector' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-200">
                Mobile-to-Laptop UDP Connection &amp; Packet Inspector
              </h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Check whether your mobile phones are successfully delivering packets to your laptop.
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              Port {config.udp_port} &amp; {config.follower_udp_port || 5006}
            </span>
          </div>

          {/* Quick Connection Diagnostics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-2">
              <span className="text-slate-300 font-semibold block">1. Laptop Wi-Fi IP to Enter in Mobile App</span>
              <div className="flex items-center justify-between bg-black/60 p-2 rounded text-cyan-300">
                <span className="text-sm font-bold">{localIp}</span>
                <button
                  onClick={() => copyToClipboard(localIp, 'localip')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                >
                  {copiedCode === 'localip' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy IP
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                In your Android app, set Target IP to <strong className="text-slate-200">{localIp}</strong> and Port to <strong className="text-slate-200">{config.udp_port}</strong> (Phone 1) or <strong className="text-slate-200">{config.follower_udp_port || 5006}</strong> (Phone 2).
              </p>
            </div>

            <div className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-2">
              <span className="text-slate-300 font-semibold block">2. Windows Defender Firewall Command</span>
              <div className="flex items-center justify-between bg-black/60 p-2 rounded text-emerald-300 truncate">
                <span className="text-[10px] truncate">{firewallCmd}</span>
                <button
                  onClick={() => copyToClipboard(firewallCmd, 'firewall')}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] shrink-0 ml-2"
                >
                  {copiedCode === 'firewall' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Run once in Windows PowerShell (Admin) so Windows doesn't block incoming phone UDP packets!
              </p>
            </div>
          </div>

          {/* Test Injector Buttons */}
          <div className="bg-slate-950 p-3.5 rounded border border-slate-800 flex items-center justify-between text-xs font-mono">
            <div>
              <span className="font-semibold text-slate-200 block">Simulate Phone Packet Now</span>
              <span className="text-[11px] text-slate-400">Sends test sample into listener to verify laptop-side yaw integration</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSendTestPacket && onSendTestPacket('[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037')}
                className="px-3 py-1.5 bg-cyan-900/80 hover:bg-cyan-800 text-cyan-200 rounded border border-cyan-700 text-xs cursor-pointer transition-colors"
              >
                + Inject Car 1 Packet
              </button>
              <button
                onClick={() => onSendTestPacket && onSendTestPacket('[Car2] Gyro (rad/s) -> X: 0.0512, Y: 0.0123, Z: -0.2104')}
                className="px-3 py-1.5 bg-emerald-900/80 hover:bg-emerald-800 text-emerald-200 rounded border border-emerald-700 text-xs cursor-pointer transition-colors"
              >
                + Inject Car 2 Packet
              </button>
            </div>
          </div>

          {/* Live Packet Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>Live Packet History (Last 20 incoming packets):</span>
              <span className="text-emerald-400 font-semibold">● UDP Port {config.udp_port} Listening</span>
            </div>

            <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden font-mono text-xs">
              <div className="grid grid-cols-12 gap-2 p-2.5 bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                <div className="col-span-2">Time</div>
                <div className="col-span-2">Target</div>
                <div className="col-span-5">Raw Payload</div>
                <div className="col-span-3 text-right">Computed Yaw</div>
              </div>

              <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
                {connectionStates.recent_packets && connectionStates.recent_packets.length > 0 ? (
                  connectionStates.recent_packets.slice().reverse().map((pkt, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-2 hover:bg-slate-900/40 text-[11px] items-center">
                      <div className="col-span-2 text-slate-400">{pkt.time}</div>
                      <div className="col-span-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pkt.device.toLowerCase().includes('2') || pkt.device.toLowerCase().includes('follower') ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-cyan-950 text-cyan-400 border border-cyan-800'}`}>
                          {pkt.device}
                        </span>
                      </div>
                      <div className="col-span-5 text-slate-300 truncate font-mono text-[10px]">
                        {pkt.raw}
                      </div>
                      <div className="col-span-3 text-right text-cyan-300 font-bold tabular-nums">
                        {pkt.yaw_deg >= 0 ? `+${pkt.yaw_deg.toFixed(1)}°` : `${pkt.yaw_deg.toFixed(1)}°`} ({pkt.gz_deg_s.toFixed(1)}°/s)
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-slate-500 font-mono text-xs">
                    No packets received yet. Make sure your phone app is streaming to <strong className="text-slate-300">{localIp}:{config.udp_port}</strong> on the same Wi-Fi.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: DEVICE SETUP & WIRING GUIDE */}
      {activeTab === 'guide' && (
        <div className="space-y-4">
          {/* Step selector */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 1, title: '1. Wi-Fi Linking' },
              { id: 2, title: '2. Pi & L298N Motors' },
              { id: 3, title: '3. Dual Phones & Gyro' },
              { id: 4, title: '4. Laptop Backend' },
            ].map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setGuideStep(step.id as any)}
                className={`py-2 px-3 rounded-lg text-xs font-mono font-medium transition-all text-center cursor-pointer ${
                  guideStep === step.id
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/60 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {step.title}
              </button>
            ))}
          </div>

          {/* STEP 1: WI-FI NETWORK */}
          {guideStep === 1 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">1</div>
                  <h4 className="font-bold text-slate-200 text-sm">Network &amp; Wi-Fi Linking (All on Same Hotspot/Router)</h4>
                </div>
                <span className="text-xs font-mono text-slate-400">Subnet: 192.168.x.x</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Your Windows Laptop, both Raspberry Pis, and both Android Phones <strong>must connect to the exact same Wi-Fi router or Mobile Hotspot</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                  <div className="text-cyan-400 font-semibold">Windows Laptop:</div>
                  <div className="text-slate-300">Run <code className="text-slate-100">ipconfig</code> in CMD</div>
                  <div className="text-slate-400 text-[11px]">Note IPv4 Address (e.g. {localIp})</div>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                  <div className="text-amber-400 font-semibold">Raspberry Pis (1 &amp; 2):</div>
                  <div className="text-slate-300">Run <code className="text-slate-100">hostname -I</code> on Pi</div>
                  <div className="text-slate-400 text-[11px]">e.g. Master: 192.168.1.100, Follower: 192.168.1.101</div>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1">
                  <div className="text-emerald-400 font-semibold">Both Mobile Phones:</div>
                  <div className="text-slate-300">Connect to same Wi-Fi name</div>
                  <div className="text-slate-400 text-[11px]">Turn off Mobile Cellular Data to force local Wi-Fi UDP</div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: RASPBERRY PI MOTOR WIRING */}
          {guideStep === 2 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">2</div>
                  <h4 className="font-bold text-slate-200 text-sm">L298N Dual H-Bridge Motor Driver to Raspberry Pi Wiring</h4>
                </div>
                <span className="text-xs font-mono text-cyan-400">GPIO BCM Pins</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-2">
                  <div className="text-slate-200 font-semibold">GPIO Wiring Pinout Table (Repeat on Both Cars):</div>
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-1">L298N Pin</th>
                        <th className="pb-1">Raspberry Pi Pin</th>
                        <th className="pb-1">Function</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      <tr>
                        <td className="py-1 font-bold text-cyan-300">IN1</td>
                        <td>GPIO 17 (Pin 11)</td>
                        <td>Left Motor Forward</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-bold text-cyan-300">IN2</td>
                        <td>GPIO 27 (Pin 13)</td>
                        <td>Left Motor Reverse</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-bold text-amber-300">IN3</td>
                        <td>GPIO 22 (Pin 15)</td>
                        <td>Right Motor Forward</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-bold text-amber-300">IN4</td>
                        <td>GPIO 23 (Pin 16)</td>
                        <td>Right Motor Reverse</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-bold text-rose-300">GND</td>
                        <td>GND (Pin 6 or 9)</td>
                        <td>Common Ground</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span>Run Server on Raspberry Pi:</span>
                    <button
                      onClick={() => copyToClipboard('python3 pi_l298n_server.py --port 8888', 'piserver')}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px]"
                    >
                      {copiedCode === 'piserver' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy
                    </button>
                  </div>
                  <div className="bg-black/70 p-2 rounded text-emerald-400 text-[11px] font-mono">
                    python3 pi_l298n_server.py --port 8888
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Once running, the Pi listens for TCP commands from your laptop. You can test it immediately in the <strong>"Motor Driver Test Bench"</strong> tab above!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: DUAL PHONE STREAMING & TURN VERIFICATION */}
          {guideStep === 3 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">3</div>
                  <h4 className="font-bold text-slate-200 text-sm">Dual Mobile Phone Gyroscope Setup &amp; Turn Verification</h4>
                </div>
                <span className="text-xs font-mono text-emerald-400">2 Mobile Phones</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                {/* Phone 1 Setup */}
                <div className="bg-slate-950 p-3.5 rounded border border-cyan-900/60 space-y-2">
                  <span className="font-bold text-cyan-400 block">Phone 1: Mount on Master Car</span>
                  <div className="text-[11px] text-slate-300 space-y-1">
                    <div>• <strong>Destination IP:</strong> <code className="text-slate-100">{localIp}</code></div>
                    <div>• <strong>UDP Port:</strong> <code className="text-slate-100">{config.udp_port}</code></div>
                    <div>• <strong>Tag in Packet:</strong> <code className="text-cyan-300">[Car1]</code> or <code className="text-cyan-300">[Master]</code></div>
                    <div>• <strong>Example Packet:</strong></div>
                    <div className="bg-black/70 p-1.5 rounded text-cyan-300 text-[10px]">
                      [Car1] Gyro (rad/s) -&gt; X: 0.1927, Y: -0.1927, Z: 0.1037
                    </div>
                  </div>
                </div>

                {/* Phone 2 Setup */}
                <div className="bg-slate-950 p-3.5 rounded border border-emerald-900/60 space-y-2">
                  <span className="font-bold text-emerald-400 block">Phone 2: Mount on Follower Car</span>
                  <div className="text-[11px] text-slate-300 space-y-1">
                    <div>• <strong>Destination IP:</strong> <code className="text-slate-100">{localIp}</code></div>
                    <div>• <strong>UDP Port:</strong> <code className="text-slate-100">{config.follower_udp_port || 5006}</code> (or {config.udp_port})</div>
                    <div>• <strong>Tag in Packet:</strong> <code className="text-emerald-300">[Car2]</code> or <code className="text-emerald-300">[Follower]</code></div>
                    <div>• <strong>Example Packet:</strong></div>
                    <div className="bg-black/70 p-1.5 rounded text-emerald-300 text-[10px]">
                      [Car2] Gyro (rad/s) -&gt; X: 0.0512, Y: 0.0123, Z: -0.2104
                    </div>
                  </div>
                </div>
              </div>

              {/* Turn Verification Explanation */}
              <div className="bg-slate-950 p-3.5 rounded border border-slate-800 text-xs font-mono text-slate-300 space-y-2">
                <span className="font-bold text-slate-200 block">How Physical Turn Verification Works:</span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  When you press <strong>A</strong> or <strong>D</strong> (or execute an autonomous turn):
                  1. The laptop commands the car wheels to spin.
                  2. The mobile phone on that car measures the actual angular velocity $Z$ in rad/s.
                  3. The laptop integrates $\Delta\theta = \int Z\, dt$.
                  4. If the measured angle matches within $\pm 3^\circ$, the system confirms <strong className="text-emerald-400">"ROTATION CONFIRMED"</strong>! If wheels slip or car doesn't turn, it warns you immediately.
                </p>
              </div>
            </div>
          )}

          {/* STEP 4: LAPTOP BACKEND & LAUNCH */}
          {guideStep === 4 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">4</div>
                  <h4 className="font-bold text-slate-200 text-sm">Launching Central Command on Windows &amp; Starting Mission</h4>
                </div>
                <span className="text-xs font-mono text-blue-400">Windows PowerShell</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span>A. Start Backend Server (Windows)</span>
                    <button
                      onClick={() => copyToClipboard('cd backend\npython main.py', 'startserver')}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px]"
                    >
                      {copiedCode === 'startserver' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      Copy
                    </button>
                  </div>
                  <div className="bg-black/70 p-2 rounded text-emerald-400 text-[11px] space-y-1">
                    <div>cd backend</div>
                    <div>python main.py</div>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Or simply double-click <code className="text-slate-200">run_windows.bat</code> inside the backend folder!
                  </p>
                </div>

                <div className="bg-slate-950 p-3.5 rounded border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span>B. Connect Dashboard to Backend</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    In this UI, toggle from <strong>SIMULATOR</strong> to <strong>LIVE BACKEND</strong> in the top header. The WebSocket URL defaults to <code className="text-cyan-300">ws://localhost:8000/ws/telemetry</code>.
                  </p>
                  <p className="text-[11px] text-emerald-400">
                    ✓ Once connected, the top status badge turns green "LIVE BACKEND (ONLINE)".
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
