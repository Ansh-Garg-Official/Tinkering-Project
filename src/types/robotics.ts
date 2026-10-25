/**
 * PlatoonCommand - Robotics Types & Data Contracts
 */

export type DrivingCommand = 'w' | 's' | 'a' | 'd' | 'stop';

export interface VehiclePose {
  x_cm: number;
  y_cm: number;
  yaw_deg: number;
  speed_cm_s: number;
  active_command: DrivingCommand;
  distance_cm: number;
}

export interface QueuedCommand {
  command: DrivingCommand;
  issued_ago: number;
  remaining_sec: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  yaw: number;
  t: number;
}

export type PlatooningPhase =
  | 'IDLE'
  | 'INTERCEPT_ROTATING'
  | 'INTERCEPT_DRIVING'
  | 'PATH_TRACING'
  | 'COLLISION_SUSPENDED';

export interface PlatooningTelemetry {
  master: VehiclePose;
  follower: VehiclePose;
  platooning: {
    phase: PlatooningPhase;
    phase_description: string;
    delay_sec: number;
    master_speed_cm_s: number;
    follower_speed_cm_s: number;
    master_initial_heading_deg: number;
    follower_initial_heading_deg: number;
    master_origin: { x: number; y: number; yaw: number };
    distance_to_master_origin_cm: number;
    rotation_needed_deg: number;
    integrated_yaw_deg: number;
    follower_integrated_yaw_deg?: number;
    has_follower_phone?: boolean;
    gap_distance_cm: number;
    safe_distance_cm: number;
    collision_suspended: boolean;
    queue_length: number;
    queue: QueuedCommand[];
    path_waypoints_remaining: number;
  };
  precise_turn: {
    active: boolean;
    direction: string;
    target_deg: number;
    progress_deg: number;
  };
  trails: {
    master_unconsumed: TrailPoint[];
    master_origin?: { x: number; y: number; yaw: number };
    rendezvous_line?: { x1: number; y1: number; x2: number; y2: number };
  };
}

export interface PhoneTrackerState {
  name: string;
  is_active: boolean;
  packet_count: number;
  packet_rate_hz: number;
  gz_rad_s: number;
  gz_deg_s: number;
  integrated_yaw_deg: number;
  last_packet_raw: string;
  last_sender: string;
  turn_status: string;
  turn_verified: boolean;
}

export interface RawPacketEntry {
  time: string;
  device: string;
  raw: string;
  sender: string;
  gx: number;
  gy: number;
  gz: number;
  gz_deg_s: number;
  yaw_deg: number;
}

export interface ConnectionStates {
  master_tcp: boolean;
  follower_tcp: boolean;
  master_last_cmd?: string;
  follower_last_cmd?: string;
  phone_master?: PhoneTrackerState;
  phone_follower?: PhoneTrackerState;
  android_udp: boolean;
  udp_packet_count: number;
  udp_hz: number;
  current_gz_deg_s?: number;
  last_raw_packet?: string;
  recent_packets?: RawPacketEntry[];
  local_ip?: string;
  websocket_connected: boolean;
  ping_ms: number;
}

export interface InitialStateConfig {
  m_x: number;
  m_y: number;
  f_x: number;
  f_y: number;
  master_initial_heading: number;
  follower_initial_heading: number;
  master_speed: number;
  follower_speed: number;
  safe_distance: number;
}

export interface NetworkConfig {
  backend_ws_url: string;
  master_host: string;
  master_port: number;
  follower_host: string;
  follower_port: number;
  udp_port: number;
  follower_udp_port: number;
  delay_sec: number;
  local_ip?: string;
}
