/**
 * WebSocket Hook for Local Python Backend
 * Connects to ws://localhost:8000/ws/telemetry with latency ping and auto-reconnect.
 * Supports dual phone stream inspection and direct motor actuation tests.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DrivingCommand, PlatooningTelemetry, ConnectionStates, InitialStateConfig, RawPacketEntry } from '../types/robotics';

function createDefaultTelemetry(): PlatooningTelemetry {
  return {
    master: { x_cm: 0, y_cm: 0, yaw_deg: 0, speed_cm_s: 0, active_command: 'stop', distance_cm: 0 },
    follower: { x_cm: 0, y_cm: -100, yaw_deg: 0, speed_cm_s: 0, active_command: 'stop', distance_cm: 0 },
    platooning: {
      phase: 'PATH_TRACING',
      phase_description: 'Active Hardware Stream',
      delay_sec: 4.0,
      master_speed_cm_s: 35.0,
      follower_speed_cm_s: 35.0,
      master_initial_heading_deg: 0.0,
      follower_initial_heading_deg: 0.0,
      master_origin: { x: 0, y: 0, yaw: 0 },
      distance_to_master_origin_cm: 0,
      rotation_needed_deg: 0,
      integrated_yaw_deg: 0.0,
      follower_integrated_yaw_deg: 0.0,
      has_follower_phone: false,
      gap_distance_cm: 100.0,
      safe_distance_cm: 30.0,
      collision_suspended: false,
      queue_length: 0,
      queue: [],
      path_waypoints_remaining: 0,
    },
    trails: {
      master_unconsumed: [],
      master_origin: { x: 0, y: 0, yaw: 0 },
    },
    precise_turn: {
      active: false,
      direction: 'Left',
      target_deg: 90,
      progress_deg: 0,
    },
  };
}

export function useLiveBackendWebSocket(
  serverUrl: string = 'ws://localhost:8000/ws/telemetry',
  onPacketReceived?: (pkt: RawPacketEntry) => void
) {
  const [telemetry, setTelemetry] = useState<PlatooningTelemetry | null>(null);
  const onPacketReceivedRef = useRef(onPacketReceived);
  useEffect(() => {
    onPacketReceivedRef.current = onPacketReceived;
  }, [onPacketReceived]);

  const [connectionStates, setConnectionStates] = useState<ConnectionStates>({
    master_tcp: false,
    follower_tcp: false,
    android_udp: false,
    udp_packet_count: 0,
    udp_hz: 0,
    websocket_connected: false,
    ping_ms: 0,
    recent_packets: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const pingStartRef = useRef<number>(0);
  const shouldConnectRef = useRef<boolean>(true);

  // 1. WebSocket connection to local Python backend
  const connect = useCallback(() => {
    if (!shouldConnectRef.current) return;
    try {
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStates((prev) => ({ ...prev, websocket_connected: true }));
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartRef.current = performance.now();
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 1500);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'telemetry') {
            setTelemetry(data.telemetry);
            if (data.connections) {
              setConnectionStates((prev) => ({
                ...prev,
                master_tcp: data.connections.master_tcp ?? false,
                follower_tcp: data.connections.follower_tcp ?? false,
                master_last_cmd: data.connections.master_last_cmd,
                follower_last_cmd: data.connections.follower_last_cmd,
                phone_master: data.connections.phone_master,
                phone_follower: data.connections.phone_follower,
                android_udp: data.connections.android_udp ?? false,
                udp_packet_count: data.connections.udp_packet_count ?? 0,
                udp_hz: data.connections.udp_hz ?? 0,
                current_gz_deg_s: data.connections.current_gz_deg_s ?? 0,
                last_raw_packet: data.connections.last_raw_packet,
                recent_packets: data.connections.recent_packets ?? prev.recent_packets,
                local_ip: data.connections.local_ip,
                websocket_connected: true,
              }));
            }
          } else if (data.type === 'pong') {
            const rtt = Math.round(performance.now() - pingStartRef.current);
            setConnectionStates((prev) => ({ ...prev, ping_ms: rtt }));
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setConnectionStates((prev) => ({
          ...prev,
          websocket_connected: false,
          master_tcp: false,
          follower_tcp: false,
        }));
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (shouldConnectRef.current) {
          setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      if (shouldConnectRef.current) {
        setTimeout(connect, 3000);
      }
    }
  }, [serverUrl]);

  // 2. Connect to Server-Sent Events (SSE) Cloud Stream Gateway (/api/stream/events)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/stream/events');

      es.onmessage = (e) => {
        try {
          const pkt = JSON.parse(e.data);
          if (pkt.type === 'init') {
            if (pkt.recent && pkt.recent.length > 0) {
              setConnectionStates((prev) => ({
                ...prev,
                android_udp: true,
                recent_packets: pkt.recent,
              }));
            }
            return;
          }

          // Real-time packet received from Python forwarder or test injection
          const isFollower = pkt.device && (pkt.device.includes('2') || pkt.device.includes('Follower'));
          const pktEntry: RawPacketEntry = {
            time: pkt.time || new Date().toLocaleTimeString('en-US', { hour12: false }),
            device: pkt.device || (isFollower ? 'Follower (Car 2)' : 'Master (Car 1)'),
            raw: pkt.raw,
            sender: pkt.sender || 'Stream',
            gx: pkt.gx || 0,
            gy: pkt.gy || 0,
            gz: pkt.gz || 0,
            gz_deg_s: pkt.gz_deg_s || 0,
            yaw_deg: pkt.yaw_deg || 0,
          };
          onPacketReceivedRef.current?.(pktEntry);

          setConnectionStates((prev) => {
            const prevList = prev.recent_packets || [];
            const recent = [...prevList, pktEntry].slice(-25);

            return {
              ...prev,
              android_udp: true,
              udp_packet_count: prev.udp_packet_count + 1,
              current_gz_deg_s: pkt.gz_deg_s,
              last_raw_packet: pkt.raw,
              recent_packets: recent,
              phone_master: !isFollower
                ? {
                    name: 'Master (Car 1)',
                    is_active: true,
                    packet_count: (prev.phone_master?.packet_count || 0) + 1,
                    packet_rate_hz: 25.0,
                    gz_rad_s: pkt.gz,
                    gz_deg_s: pkt.gz_deg_s,
                    integrated_yaw_deg: pkt.yaw_deg,
                    last_packet_raw: pkt.raw,
                    last_sender: pkt.sender,
                    turn_status: Math.abs(pkt.gz_deg_s) > 10 ? 'Turning' : 'Idle / Monitoring',
                    turn_verified: true,
                  }
                : prev.phone_master,
              phone_follower: isFollower
                ? {
                    name: 'Follower (Car 2)',
                    is_active: true,
                    packet_count: (prev.phone_follower?.packet_count || 0) + 1,
                    packet_rate_hz: 25.0,
                    gz_rad_s: pkt.gz,
                    gz_deg_s: pkt.gz_deg_s,
                    integrated_yaw_deg: pkt.yaw_deg,
                    last_packet_raw: pkt.raw,
                    last_sender: pkt.sender,
                    turn_status: Math.abs(pkt.gz_deg_s) > 10 ? 'Turning' : 'Idle / Monitoring',
                    turn_verified: true,
                  }
                : prev.phone_follower,
            };
          });

          // Update active telemetry yaw so dials turn in real time
          setTelemetry((prev) => {
            const base = prev || createDefaultTelemetry();
            if (isFollower) {
              const fHeading = ((base.platooning.follower_initial_heading_deg + pkt.yaw_deg) % 360 + 360) % 360;
              return {
                ...base,
                follower: {
                  ...base.follower,
                  yaw_deg: fHeading,
                },
                platooning: {
                  ...base.platooning,
                  follower_integrated_yaw_deg: pkt.yaw_deg,
                  has_follower_phone: true,
                },
              };
            } else {
              const mHeading = ((base.platooning.master_initial_heading_deg + pkt.yaw_deg) % 360 + 360) % 360;
              return {
                ...base,
                master: {
                  ...base.master,
                  yaw_deg: mHeading,
                },
                platooning: {
                  ...base.platooning,
                  integrated_yaw_deg: pkt.yaw_deg,
                },
              };
            }
          });
        } catch {
          // ignore parse errors
        }
      };
    } catch {
      // EventSource not supported or failed
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  useEffect(() => {
    shouldConnectRef.current = true;
    connect();

    return () => {
      shouldConnectRef.current = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendCommand = useCallback((cmd: DrivingCommand) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'command', cmd }));
    }
  }, []);

  const sendDirectCarCommand = useCallback((car: 'master' | 'follower', cmd: DrivingCommand) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'direct_car_command', car, cmd }));
    }
  }, []);

  const sendTestUDPPacket = useCallback((raw: string) => {
    // 1. Post to Cloud SSE Gateway
    fetch('/api/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packet: raw }),
    }).catch(() => {});

    // 2. Also send to local WebSocket if open
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'test_udp_packet', raw }));
    }
  }, []);

  const sendPreciseTurn = useCallback((target_angle: number, direction: 'Left' | 'Right') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'precise_turn', target_angle, direction }));
    }
  }, []);

  const sendInitialState = useCallback((config: InitialStateConfig) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'set_initial_state',
          ...config,
          initial_heading: config.master_initial_heading, // backward compatibility
        })
      );
    }
  }, []);

  const sendEmergencyStop = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'emergency_stop' }));
    }
  }, []);

  const sendSetDelay = useCallback((delay: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_delay', delay }));
    }
  }, []);

  const sendSetSpeeds = useCallback((master_speed: number, follower_speed: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_speeds', master_speed, follower_speed }));
    }
  }, []);

  const resetYaw = useCallback(() => {
    fetch('/api/reset-yaw', { method: 'POST' }).catch(() => {});
    setTelemetry((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        master: { ...prev.master, yaw_deg: prev.platooning.master_initial_heading_deg },
        follower: { ...prev.follower, yaw_deg: prev.platooning.follower_initial_heading_deg },
        platooning: {
          ...prev.platooning,
          integrated_yaw_deg: 0.0,
          follower_integrated_yaw_deg: 0.0,
        },
      };
    });
  }, []);

  return {
    telemetry,
    connectionStates,
    sendCommand,
    sendDirectCarCommand,
    sendTestUDPPacket,
    sendPreciseTurn,
    sendInitialState,
    sendEmergencyStop,
    sendSetDelay,
    sendSetSpeeds,
    resetYaw,
    reconnect: connect,
  };
}
