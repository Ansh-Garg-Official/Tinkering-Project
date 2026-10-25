import React, { useState, useCallback } from 'react';
import { TopNav, ActiveTab } from './components/TopNav';
import { TacticalRadarMap } from './components/TacticalRadarMap';
import { TeleopKeypad } from './components/TeleopKeypad';
import { GyroCompassHUD } from './components/GyroCompassHUD';
import { PlatoonQueueCard } from './components/PlatoonQueueCard';
import { PreciseTurnCard } from './components/PreciseTurnCard';
import { PreStartConfigModal } from './components/PreStartConfigModal';
import { TelemetryView } from './components/TelemetryView';
import { HardwareHub } from './components/HardwareHubModal';
import { BackendCodeDrawer } from './components/BackendCodeDrawer';
import { GyroStreamBridgeBar } from './components/GyroStreamBridgeBar';

import { usePlatooningSimulator } from './hooks/usePlatooningSimulator';
import { useLiveBackendWebSocket } from './hooks/useLiveBackendWebSocket';
import { DrivingCommand, NetworkConfig, InitialStateConfig, ConnectionStates, RawPacketEntry } from './types/robotics';
import { AlertTriangle, WifiOff, Settings, ShieldAlert } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('radar');
  const [isSimulatorMode, setIsSimulatorMode] = useState<boolean>(true);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState<boolean>(false);

  // Initial State / Calibration Configuration
  const [initialConfig, setInitialConfig] = useState<InitialStateConfig>({
    m_x: 0,
    m_y: 0,
    f_x: 0,
    f_y: -100, // follower starts 1m behind
    master_initial_heading: 0, // 0 = North
    follower_initial_heading: 0,
    master_speed: 35.0,
    follower_speed: 35.0,
    safe_distance: 30.0,
  });

  // Network Configuration
  const [config, setConfig] = useState<NetworkConfig>({
    backend_ws_url: 'ws://localhost:8000/ws/telemetry',
    master_host: '192.168.1.100',
    master_port: 8888,
    follower_host: '192.168.1.101',
    follower_port: 8888,
    udp_port: 5005,
    follower_udp_port: 5006,
    delay_sec: 4.0,
  });

  // Mode 1: Simulator Hook (In-browser high-precision physics)
  const sim = usePlatooningSimulator(
    config.delay_sec,
    initialConfig.master_speed,
    initialConfig.follower_speed,
    initialConfig.master_initial_heading,
    initialConfig.follower_initial_heading
  );

  // Callback for live packets received from SSE / Python forwarder
  const handleLivePacketReceived = useCallback(
    (pkt: RawPacketEntry) => {
      const isFollower = pkt.device.includes('2') || pkt.device.includes('Follower');
      sim.injectGyroSample(pkt.gz, 0.04, isFollower, pkt.yaw_deg);
    },
    [sim]
  );

  // Mode 2: Live Backend WebSocket Hook (Connects to Windows localhost:8000 & Cloud SSE)
  const liveWs = useLiveBackendWebSocket(config.backend_ws_url, handleLivePacketReceived);

  // Resolve active telemetry based on mode
  const activeTelemetry = isSimulatorMode
    ? sim.telemetry
    : liveWs.telemetry || sim.telemetry;

  // Active command dispatcher (WASD)
  const handleCommand = useCallback(
    (cmd: DrivingCommand) => {
      if (isSimulatorMode) {
        sim.issueCommand(cmd);
      } else {
        liveWs.sendCommand(cmd);
      }
    },
    [isSimulatorMode, sim, liveWs]
  );

  // Direct car test dispatcher (for motor test bench)
  const handleDirectCarCommand = useCallback(
    (car: 'master' | 'follower', cmd: DrivingCommand) => {
      if (!isSimulatorMode) {
        liveWs.sendDirectCarCommand(car, cmd);
      } else {
        if (car === 'master') sim.issueCommand(cmd);
      }
    },
    [isSimulatorMode, sim, liveWs]
  );

  const [injectedPackets, setInjectedPackets] = useState<RawPacketEntry[]>([]);

  // Test UDP packet injection & live stream feed
  const handleSendTestPacket = useCallback(
    (rawPacket: string) => {
      // 1. Send to live WebSocket and Cloud SSE endpoint
      liveWs.sendTestUDPPacket(rawPacket);

      // 2. Parse packet locally for instant UI update
      const match = rawPacket.match(/X:\s*([-\d.]+)[,\s]+Y:\s*([-\d.]+)[,\s]+Z:\s*([-\d.]+)/i);
      let gz = 0;
      let gx = 0;
      let gy = 0;
      if (match) {
        gx = parseFloat(match[1]) || 0;
        gy = parseFloat(match[2]) || 0;
        gz = parseFloat(match[3]) || 0;
      } else {
        const zMatch = rawPacket.match(/Z:\s*([-\d.]+)/i);
        if (zMatch) gz = parseFloat(zMatch[1]) || 0;
      }
      const gz_deg_s = (gz * 180) / Math.PI;
      const isFollower = /car\s*2|follower/i.test(rawPacket);

      // 3. Inject into simulator physics immediately so Car 1 / Car 2 rotates on canvas
      sim.injectGyroSample(gz, 0.04, isFollower);

      // 4. Record in local recent packets
      const nowStr = new Date().toLocaleTimeString('en-US', { hour12: false });
      const currentHeading = isFollower
        ? activeTelemetry.follower.yaw_deg
        : activeTelemetry.master.yaw_deg;

      const newEntry: RawPacketEntry = {
        time: nowStr,
        device: isFollower ? 'Follower (Car 2)' : 'Master (Car 1)',
        raw: rawPacket,
        sender: '127.0.0.1:Stream',
        gx,
        gy,
        gz,
        gz_deg_s: Math.round(gz_deg_s * 100) / 100,
        yaw_deg: Math.round(currentHeading * 10) / 10,
      };

      setInjectedPackets((prev) => [...prev, newEntry].slice(-30));
    },
    [liveWs, sim, activeTelemetry.master.yaw_deg, activeTelemetry.follower.yaw_deg]
  );

  const handleResetYaw = useCallback(() => {
    sim.resetYaw();
    liveWs.resetYaw();
    setInjectedPackets([]);
  }, [sim, liveWs]);

  // Precise closed-loop turn dispatcher
  const handleExecuteTurn = useCallback(
    (targetAngle: number, direction: 'Left' | 'Right') => {
      if (isSimulatorMode) {
        sim.executePreciseTurn(targetAngle, direction);
      } else {
        liveWs.sendPreciseTurn(targetAngle, direction);
      }
    },
    [isSimulatorMode, sim, liveWs]
  );

  // Pre-Start Configuration Applicator
  const handleApplyInitialConfig = useCallback(
    (newConfig: InitialStateConfig) => {
      setInitialConfig(newConfig);
      if (isSimulatorMode) {
        sim.setInitialState(
          newConfig.m_x,
          newConfig.m_y,
          newConfig.f_x,
          newConfig.f_y,
          newConfig.master_initial_heading,
          newConfig.follower_initial_heading,
          newConfig.master_speed,
          newConfig.follower_speed,
          newConfig.safe_distance
        );
      } else {
        liveWs.sendInitialState(newConfig);
      }
    },
    [isSimulatorMode, sim, liveWs]
  );

  // Emergency stop dispatcher
  const handleEmergencyStop = useCallback(() => {
    if (isSimulatorMode) {
      sim.emergencyStop();
    } else {
      liveWs.sendEmergencyStop();
    }
  }, [isSimulatorMode, sim, liveWs]);

  // Platooning delay change
  const handleDelayChange = useCallback(
    (newDelay: number) => {
      setConfig((prev) => ({ ...prev, delay_sec: newDelay }));
      if (isSimulatorMode) {
        sim.setDelaySec(newDelay);
      } else {
        liveWs.sendSetDelay(newDelay);
      }
    },
    [isSimulatorMode, sim, liveWs]
  );

  // Configuration update
  const handleUpdateConfig = useCallback((newConfig: Partial<NetworkConfig>) => {
    setConfig((prev) => ({ ...prev, ...newConfig }));
  }, []);

  // Merged recent packets list from live SSE/WebSocket or local injections
  const effectiveRecentPackets =
    liveWs.connectionStates.recent_packets && liveWs.connectionStates.recent_packets.length > 0
      ? liveWs.connectionStates.recent_packets
      : injectedPackets;

  const effectiveLastPacket =
    liveWs.connectionStates.last_raw_packet ||
    (injectedPackets.length > 0
      ? injectedPackets[injectedPackets.length - 1].raw
      : '[Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037');

  // Connection states resolution
  const connectionStates: ConnectionStates = isSimulatorMode
    ? {
        master_tcp: true,
        follower_tcp: true,
        android_udp: effectiveRecentPackets.length > 0 || liveWs.connectionStates.android_udp,
        phone_master: {
          name: 'Master (Car 1)',
          is_active: true,
          packet_count: 450 + injectedPackets.length,
          packet_rate_hz: 25.0,
          gz_rad_s: 0.0,
          gz_deg_s: 0.0,
          integrated_yaw_deg: activeTelemetry.platooning.integrated_yaw_deg,
          last_packet_raw: effectiveLastPacket,
          last_sender: '127.0.0.1:5005',
          turn_status: 'Active / Streaming',
          turn_verified: true,
        },
        phone_follower: {
          name: 'Follower (Car 2)',
          is_active: true,
          packet_count: 450,
          packet_rate_hz: 25.0,
          gz_rad_s: 0.0,
          gz_deg_s: 0.0,
          integrated_yaw_deg: activeTelemetry.platooning.follower_integrated_yaw_deg || 0.0,
          last_packet_raw: '[Car2] Gyro (rad/s) -> X: 0.0000, Y: 0.0000, Z: 0.0000',
          last_sender: '127.0.0.1:5006',
          turn_status: 'Idle / Verified',
          turn_verified: true,
        },
        udp_packet_count: 900 + injectedPackets.length,
        udp_hz: 25.0,
        current_gz_deg_s: liveWs.connectionStates.current_gz_deg_s || 0.0,
        last_raw_packet: effectiveLastPacket,
        recent_packets: effectiveRecentPackets,
        websocket_connected: true,
        ping_ms: 1,
      }
    : {
        ...liveWs.connectionStates,
        recent_packets: effectiveRecentPackets,
        last_raw_packet: effectiveLastPacket,
      };

  // Auto-switch to live hardware if websocket connects and packets are arriving
  React.useEffect(() => {
    if (liveWs.connectionStates.websocket_connected && isSimulatorMode) {
      setIsSimulatorMode(false);
    }
  }, [liveWs.connectionStates.websocket_connected, isSimulatorMode]);

  const isHttpsPreview = typeof window !== 'undefined' && window.location.protocol === 'https:';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Bar Navigation */}
      <TopNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isSimulatorMode={isSimulatorMode}
        onToggleSimulatorMode={setIsSimulatorMode}
        onEmergencyStop={handleEmergencyStop}
        isBackendConnected={liveWs.connectionStates.websocket_connected}
        masterConnected={connectionStates.master_tcp}
        followerConnected={connectionStates.follower_tcp}
        androidConnected={connectionStates.android_udp}
        phoneMasterConnected={connectionStates.phone_master?.is_active ?? connectionStates.android_udp}
        phoneFollowerConnected={connectionStates.phone_follower?.is_active ?? false}
      />

      {/* Guidance banner when viewing on Cloud HTTPS preview */}
      {isHttpsPreview && !liveWs.connectionStates.websocket_connected && (
        <div className="bg-sky-950/70 border-b border-sky-800/80 px-6 py-2.5 flex items-center justify-between text-xs font-mono text-sky-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>
              <strong>Local Setup:</strong> To connect your phone's gyroscope stream to this dashboard, run <code className="text-cyan-300 font-bold">npm run dev</code> on your laptop and open <code className="text-cyan-300 font-bold">http://localhost:3000</code> alongside <code className="text-cyan-300 font-bold">python backend/main.py</code>.
            </span>
          </div>
          <button
            onClick={() => setActiveTab('python_setup')}
            className="px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded border border-cyan-500/40 text-xs font-mono cursor-pointer transition-colors shrink-0"
          >
            View Setup Instructions
          </button>
        </div>
      )}

      {/* Warning notice when Live Backend mode is selected but Python server is not yet running */}
      {!isSimulatorMode && !liveWs.connectionStates.websocket_connected && !isHttpsPreview && (
        <div className="bg-amber-950/40 border-b border-amber-800/80 px-6 py-2.5 flex items-center justify-between text-xs font-mono text-amber-200">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Local Python Server Offline:</strong> Looking for{' '}
              <code className="text-amber-300 font-bold">{config.backend_ws_url}</code>. Make sure to run{' '}
              <code className="text-amber-300 font-bold">python backend/main.py</code> on your laptop.
            </span>
          </div>
          <button
            onClick={() => setIsSimulatorMode(true)}
            className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/40 text-xs font-mono cursor-pointer transition-colors"
          >
            Switch to Browser Simulator
          </button>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="flex-1 p-4 lg:p-6 max-w-[1720px] w-full mx-auto flex flex-col">
        {/* Live Gyroscope Stream Ingest & Feeder Bar */}
        <GyroStreamBridgeBar
          connectionStates={connectionStates}
          currentYaw={activeTelemetry.platooning.integrated_yaw_deg}
          currentFollowerYaw={activeTelemetry.platooning.follower_integrated_yaw_deg || 0}
          onInjectPacket={handleSendTestPacket}
          onResetYaw={handleResetYaw}
        />

        {activeTab === 'radar' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 items-stretch">
            {/* Left Column: Pre-Start Config Button + Teleop Keypad + Precise Turn UI + Dual Gyro HUD (4 Cols) */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {/* Pre-Start Configuration Bar */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-cyan-400" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">Pre-Start Configuration</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      θₘ₀: {initialConfig.master_initial_heading}° · θ_f₀: {initialConfig.follower_initial_heading}° · vₘ: {initialConfig.master_speed}cm/s
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsConfigModalOpen(true)}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono rounded transition-colors cursor-pointer"
                >
                  Configure
                </button>
              </div>

              {/* Teleoperation Keypad (WASD) */}
              <TeleopKeypad
                onCommand={handleCommand}
                onEmergencyStop={handleEmergencyStop}
                activeCommand={activeTelemetry.master.active_command}
                disabled={activeTelemetry.precise_turn.active}
              />

              {/* Precise Closed-Loop Turn Control */}
              <PreciseTurnCard
                onExecuteTurn={handleExecuteTurn}
                isTurnActive={activeTelemetry.precise_turn.active}
                turnDirection={activeTelemetry.precise_turn.direction}
                turnTargetDeg={activeTelemetry.precise_turn.target_deg}
                turnProgressDeg={activeTelemetry.precise_turn.progress_deg}
              />

              {/* Dual Gyro Compass & Turn Verification HUD */}
              <GyroCompassHUD
                masterYawDeg={activeTelemetry.master.yaw_deg}
                masterInitialHeadingDeg={activeTelemetry.platooning.master_initial_heading_deg}
                masterIntegratedYawDeg={activeTelemetry.platooning.integrated_yaw_deg}
                masterGzDegS={connectionStates.current_gz_deg_s || 0}
                masterPhone={connectionStates.phone_master}

                followerYawDeg={activeTelemetry.follower.yaw_deg}
                followerInitialHeadingDeg={activeTelemetry.platooning.follower_initial_heading_deg}
                followerIntegratedYawDeg={activeTelemetry.platooning.follower_integrated_yaw_deg || 0}
                followerGzDegS={connectionStates.phone_follower?.gz_deg_s || 0}
                followerPhone={connectionStates.phone_follower}

                lastRawPacket={connectionStates.last_raw_packet}
                udpHz={connectionStates.udp_hz}
                packetCount={connectionStates.udp_packet_count}
                isStreamActive={connectionStates.android_udp}
                isSimulatorMode={isSimulatorMode}
                onSendTestPacket={handleSendTestPacket}
              />
            </div>

            {/* Right Column: 2D Radar Map Canvas (Top) & Platooning Delay Queue Inspector (Bottom) (8 Cols) */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              {/* Tactical Radar Canvas with Consumable Trail & Collision Warning */}
              <div className="h-[480px] xl:h-[520px] w-full">
                <TacticalRadarMap
                  telemetry={activeTelemetry}
                  onResetOrigin={() => handleApplyInitialConfig(initialConfig)}
                />
              </div>

              {/* Platooning Delay Queue & Parameter Hub */}
              <PlatoonQueueCard
                delaySec={activeTelemetry.platooning.delay_sec}
                masterSpeedCmS={activeTelemetry.platooning.master_speed_cm_s}
                followerSpeedCmS={activeTelemetry.platooning.follower_speed_cm_s}
                gapDistanceCm={activeTelemetry.platooning.gap_distance_cm}
                safeDistanceCm={activeTelemetry.platooning.safe_distance_cm}
                isCollisionSuspended={activeTelemetry.platooning.collision_suspended}
                queue={activeTelemetry.platooning.queue}
                onDelayChange={handleDelayChange}
                followerActiveCommand={activeTelemetry.follower.active_command}
                phase={activeTelemetry.platooning.phase}
                phaseDescription={activeTelemetry.platooning.phase_description}
                distanceToOriginCm={activeTelemetry.platooning.distance_to_master_origin_cm}
                rotationNeededDeg={activeTelemetry.platooning.rotation_needed_deg}
                pathWaypointsRemaining={activeTelemetry.platooning.path_waypoints_remaining}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Full Telemetry Table & State Poses */}
        {activeTab === 'telemetry' && (
          <TelemetryView
            telemetry={activeTelemetry}
            onResetOrigin={() => handleApplyInitialConfig(initialConfig)}
          />
        )}

        {/* Tab 3: Hardware & Network Links */}
        {activeTab === 'hardware' && (
          <HardwareHub
            connectionStates={connectionStates}
            config={{ ...config, delay_sec: activeTelemetry.platooning.delay_sec }}
            onUpdateConfig={handleUpdateConfig}
            onReconnect={() => liveWs.reconnect()}
            isSimulatorMode={isSimulatorMode}
            onDirectCarCommand={handleDirectCarCommand}
            onSendTestPacket={handleSendTestPacket}
          />
        )}

        {/* Tab 4: Python Backend & Windows Setup Center */}
        {activeTab === 'python_setup' && (
          <BackendCodeDrawer />
        )}
      </main>

      {/* Pre-Start Configuration Modal */}
      <PreStartConfigModal
        currentConfig={initialConfig}
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        onApply={handleApplyInitialConfig}
      />

      {/* Footer Status Line */}
      <footer className="border-t border-slate-900 px-6 py-2.5 text-xs font-mono text-slate-400 flex items-center justify-between bg-slate-950">
        <div className="flex items-center gap-3">
          <span>PLATOON·CMD v2.0</span>
          <span className="text-slate-700">·</span>
          <span>Dual Gyro Closed-Loop Integration</span>
          <span className="text-slate-700">·</span>
          <span>Collision Threshold: {activeTelemetry.platooning.safe_distance_cm}cm</span>
          <span className="text-slate-700">·</span>
          <span>Consumable Trajectory Trail</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Mode: {isSimulatorMode ? 'In-Browser Testbench' : 'Live Python Link'}</span>
          <span className="text-slate-700">·</span>
          <span className="text-slate-400">Controls: [W] [A] [S] [D] · [SPACE] Brake</span>
        </div>
      </footer>
    </div>
  );
}
