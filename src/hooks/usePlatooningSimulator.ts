/**
 * In-Browser Platooning Simulation Engine
 * Provides authentic Dead Reckoning (Speed * Time) and Platooning Delay Queue
 * so the system can be thoroughly verified and controlled immediately.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { DrivingCommand, PlatooningTelemetry, VehiclePose, TrailPoint, PlatooningPhase } from '../types/robotics';

interface InternalQueuedItem {
  id: string;
  command: DrivingCommand;
  issueTimestamp: number;
  scheduledExecTime: number;
}

export function usePlatooningSimulator(
  initialDelaySec = 4.0,
  initialMasterSpeed = 35.0,
  initialFollowerSpeed = 35.0,
  initialMasterHeading = 0.0,
  initialFollowerHeading = 0.0
) {
  const [delaySec, setDelaySec] = useState<number>(initialDelaySec);
  const [masterSpeedCmS, setMasterSpeedCmS] = useState<number>(initialMasterSpeed);
  const [followerSpeedCmS, setFollowerSpeedCmS] = useState<number>(initialFollowerSpeed);
  const [masterInitialHeadingDeg, setMasterInitialHeadingDeg] = useState<number>(initialMasterHeading);
  const [followerInitialHeadingDeg, setFollowerInitialHeadingDeg] = useState<number>(initialFollowerHeading);
  const [safeDistanceCm, setSafeDistanceCm] = useState<number>(30.0);

  // Master initial starting origin (0,0 by default)
  const masterOriginRef = useRef<{ x: number; y: number; yaw: number }>({
    x: 0,
    y: 0,
    yaw: initialMasterHeading,
  });

  // Follower autonomous navigation phase
  const followerPhaseRef = useRef<PlatooningPhase>('INTERCEPT_ROTATING');
  const phaseDescriptionRef = useRef<string>('Phase 1A: Rotating to face Master Origin');

  // State refs for physics loop (50Hz)
  const masterPoseRef = useRef<VehiclePose>({
    x_cm: 0,
    y_cm: 0,
    yaw_deg: initialMasterHeading,
    speed_cm_s: 0,
    active_command: 'stop',
    distance_cm: 0,
  });

  const followerPoseRef = useRef<VehiclePose>({
    x_cm: 0,
    y_cm: -100, // starts 1 meter behind Master initially
    yaw_deg: initialFollowerHeading,
    speed_cm_s: 0,
    active_command: 'stop',
    distance_cm: 0,
  });

  const queueRef = useRef<InternalQueuedItem[]>([]);
  const unconsumedTrailRef = useRef<TrailPoint[]>([{ x: 0, y: 0, yaw: initialMasterHeading, t: Date.now() }]);
  const lastTickTimeRef = useRef<number>(performance.now());
  const lastTrailRecordRef = useRef<number>(0);

  // Integrated Gyroscope State
  const integratedYawRef = useRef<number>(0.0);
  const followerIntegratedYawRef = useRef<number>(0.0);
  const simulatedGzDegSRef = useRef<number>(0.0);
  const collisionSuspendedRef = useRef<boolean>(false);

  // Precise Turn Controller State
  const preciseTurnRef = useRef<{
    active: boolean;
    direction: string;
    cmd: DrivingCommand;
    target_deg: number;
    start_yaw_deg: number;
    accumulated_deg: number;
    start_time: number;
  }>({
    active: false,
    direction: 'Left',
    cmd: 'a',
    target_deg: 90,
    start_yaw_deg: 0,
    accumulated_deg: 0,
    start_time: 0,
  });

  // Exported state for UI re-renders
  const [telemetry, setTelemetry] = useState<PlatooningTelemetry>({
    master: { ...masterPoseRef.current },
    follower: { ...followerPoseRef.current },
    platooning: {
      phase: 'INTERCEPT_ROTATING',
      phase_description: 'Phase 1A: Rotating to face Master Origin',
      delay_sec: initialDelaySec,
      master_speed_cm_s: initialMasterSpeed,
      follower_speed_cm_s: initialFollowerSpeed,
      master_initial_heading_deg: initialMasterHeading,
      follower_initial_heading_deg: initialFollowerHeading,
      master_origin: { x: 0, y: 0, yaw: initialMasterHeading },
      distance_to_master_origin_cm: 100,
      rotation_needed_deg: 0,
      integrated_yaw_deg: 0,
      gap_distance_cm: 100,
      safe_distance_cm: 30,
      collision_suspended: false,
      queue_length: 0,
      queue: [],
      path_waypoints_remaining: 1,
    },
    precise_turn: {
      active: false,
      direction: 'Left',
      target_deg: 90,
      progress_deg: 0,
    },
    trails: {
      master_unconsumed: [],
      master_origin: { x: 0, y: 0, yaw: initialMasterHeading },
      rendezvous_line: { x1: 0, y1: -100, x2: 0, y2: 0 },
    },
  });

  // Inject Pre-Start Configuration UI values
  const setInitialState = useCallback(
    (
      m_x: number,
      m_y: number,
      f_x: number,
      f_y: number,
      m_heading: number,
      f_heading: number,
      m_speed: number,
      f_speed: number,
      safe_dist: number
    ) => {
      setMasterInitialHeadingDeg(m_heading);
      setFollowerInitialHeadingDeg(f_heading);
      setMasterSpeedCmS(m_speed);
      setFollowerSpeedCmS(f_speed);
      setSafeDistanceCm(safe_dist);

      masterOriginRef.current = {
        x: m_x,
        y: m_y,
        yaw: m_heading % 360,
      };

      integratedYawRef.current = 0.0;
      masterPoseRef.current = {
        x_cm: m_x,
        y_cm: m_y,
        yaw_deg: m_heading % 360,
        speed_cm_s: 0,
        active_command: 'stop',
        distance_cm: 0,
      };

      followerPoseRef.current = {
        x_cm: f_x,
        y_cm: f_y,
        yaw_deg: f_heading % 360,
        speed_cm_s: 0,
        active_command: 'stop',
        distance_cm: 0,
      };

      unconsumedTrailRef.current = [{ x: m_x, y: m_y, yaw: m_heading % 360, t: Date.now() }];
      queueRef.current = [];
      collisionSuspendedRef.current = false;
      preciseTurnRef.current.active = false;

      // Determine initial phase:
      const dx = m_x - f_x;
      const dy = m_y - f_y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 6.0) {
        followerPhaseRef.current = 'INTERCEPT_ROTATING';
        phaseDescriptionRef.current = `Phase 1A: Rotating towards Master Origin (${m_x}, ${m_y})`;
      } else {
        followerPhaseRef.current = 'PATH_TRACING';
        phaseDescriptionRef.current = 'Phase 2: At Master Origin. Ready to trace trajectory.';
      }
    },
    []
  );

  // Issue manual command
  const issueCommand = useCallback(
    (cmd: DrivingCommand) => {
      const now = Date.now();
      // If manual key is pressed during precise turn, cancel turn
      if (preciseTurnRef.current.active && cmd !== preciseTurnRef.current.cmd) {
        preciseTurnRef.current.active = false;
      }

      masterPoseRef.current.active_command = cmd;
      const scheduledTime = now + delaySec * 1000;
      queueRef.current.push({
        id: `${now}-${Math.random().toString(36).substr(2, 4)}`,
        command: cmd,
        issueTimestamp: now,
        scheduledExecTime: scheduledTime,
      });
    },
    [delaySec]
  );

  // Execute precise closed-loop turn
  const executePreciseTurn = useCallback((targetAngle: number, direction: 'Left' | 'Right') => {
    const cmd: DrivingCommand = direction === 'Left' ? 'a' : 'd';
    preciseTurnRef.current = {
      active: true,
      direction,
      cmd,
      target_deg: Math.abs(targetAngle),
      start_yaw_deg: integratedYawRef.current,
      accumulated_deg: 0,
      start_time: Date.now(),
    };

    masterPoseRef.current.active_command = cmd;
    const now = Date.now();
    queueRef.current.push({
      id: `${now}-${Math.random().toString(36).substr(2, 4)}`,
      command: cmd,
      issueTimestamp: now,
      scheduledExecTime: now + delaySec * 1000,
    });
  }, [delaySec]);

  // Inject Gyro Rad/S sample (from live phone stream, virtual feeder, or test slider)
  const injectGyroSample = useCallback(
    (gz_rad_s: number, dt: number = 0.04, isFollower: boolean = false, explicitYawDeg?: number) => {
      let gz_deg_s = gz_rad_s * (180 / Math.PI);
      // Deadband filter < 0.05 deg/s
      if (Math.abs(gz_deg_s) < 0.05) {
        gz_deg_s = 0.0;
      }
      if (isFollower) {
        if (typeof explicitYawDeg === 'number') {
          followerIntegratedYawRef.current = explicitYawDeg;
        } else {
          followerIntegratedYawRef.current += gz_deg_s * dt;
        }
        const fHeading = ((followerInitialHeadingDeg + followerIntegratedYawRef.current) % 360 + 360) % 360;
        followerPoseRef.current.yaw_deg = fHeading;
        setTelemetry((prev) => ({
          ...prev,
          follower: {
            ...prev.follower,
            yaw_deg: fHeading,
          },
          platooning: {
            ...prev.platooning,
            follower_integrated_yaw_deg: Math.round(followerIntegratedYawRef.current * 10) / 10,
            has_follower_phone: true,
          },
        }));
      } else {
        simulatedGzDegSRef.current = gz_deg_s;
        if (typeof explicitYawDeg === 'number') {
          integratedYawRef.current = explicitYawDeg;
        } else {
          integratedYawRef.current += gz_deg_s * dt;
        }
        const currentHeading = ((masterInitialHeadingDeg + integratedYawRef.current) % 360 + 360) % 360;
        masterPoseRef.current.yaw_deg = currentHeading;
        setTelemetry((prev) => ({
          ...prev,
          master: {
            ...prev.master,
            yaw_deg: currentHeading,
          },
          platooning: {
            ...prev.platooning,
            integrated_yaw_deg: Math.round(integratedYawRef.current * 10) / 10,
          },
        }));
      }
    },
    [masterInitialHeadingDeg, followerInitialHeadingDeg]
  );

  const resetYaw = useCallback(() => {
    integratedYawRef.current = 0.0;
    followerIntegratedYawRef.current = 0.0;
    masterPoseRef.current.yaw_deg = masterInitialHeadingDeg;
    followerPoseRef.current.yaw_deg = followerInitialHeadingDeg;
    setTelemetry((prev) => ({
      ...prev,
      master: { ...prev.master, yaw_deg: masterInitialHeadingDeg },
      follower: { ...prev.follower, yaw_deg: followerInitialHeadingDeg },
      platooning: {
        ...prev.platooning,
        integrated_yaw_deg: 0.0,
        follower_integrated_yaw_deg: 0.0,
      },
    }));
  }, [masterInitialHeadingDeg, followerInitialHeadingDeg]);

  // Emergency Stop
  const emergencyStop = useCallback(() => {
    masterPoseRef.current.active_command = 'stop';
    followerPoseRef.current.active_command = 'stop';
    preciseTurnRef.current.active = false;
    queueRef.current = [];
  }, []);

  // Main 50Hz Integration Loop
  useEffect(() => {
    lastTickTimeRef.current = performance.now();

    const intervalId = window.setInterval(() => {
      const nowPerf = performance.now();
      const dt = (nowPerf - lastTickTimeRef.current) / 1000;
      lastTickTimeRef.current = nowPerf;
      const nowEpoch = Date.now();

      if (dt <= 0 || dt > 0.4) return;

      // 1. Precise Turn Monitor (Master)
      if (preciseTurnRef.current.active) {
        // In simulation, if 'a' or 'd' is turning the car, simulate angular velocity ~90 deg/s
        const turnRateDegS = preciseTurnRef.current.direction === 'Left' ? -90 : 90;
        integratedYawRef.current += turnRateDegS * dt;
        const currentHeading = ((masterInitialHeadingDeg + integratedYawRef.current) % 360 + 360) % 360;
        masterPoseRef.current.yaw_deg = currentHeading;

        const deltaAngle = Math.abs(integratedYawRef.current - preciseTurnRef.current.start_yaw_deg);
        preciseTurnRef.current.accumulated_deg = deltaAngle;

        if (deltaAngle >= preciseTurnRef.current.target_deg) {
          preciseTurnRef.current.active = false;
          masterPoseRef.current.active_command = 'stop';
          queueRef.current.push({
            id: `${nowEpoch}-turnstop`,
            command: 'stop',
            issueTimestamp: nowEpoch,
            scheduledExecTime: nowEpoch + delaySec * 1000,
          });
        }
      } else {
        // If user manually pressed 'a' or 'd' for Master
        const mCmd = masterPoseRef.current.active_command;
        if (mCmd === 'a') {
          integratedYawRef.current -= 90 * dt;
          masterPoseRef.current.yaw_deg = ((masterInitialHeadingDeg + integratedYawRef.current) % 360 + 360) % 360;
        } else if (mCmd === 'd') {
          integratedYawRef.current += 90 * dt;
          masterPoseRef.current.yaw_deg = ((masterInitialHeadingDeg + integratedYawRef.current) % 360 + 360) % 360;
        }
      }

      // 2. Master Dead Reckoning
      const mCmd = masterPoseRef.current.active_command;
      const mRad = (masterPoseRef.current.yaw_deg * Math.PI) / 180;
      if (mCmd === 'w') {
        const linSpeed = masterSpeedCmS;
        masterPoseRef.current.speed_cm_s = linSpeed;
        masterPoseRef.current.x_cm += Math.sin(mRad) * linSpeed * dt;
        masterPoseRef.current.y_cm += Math.cos(mRad) * linSpeed * dt;
        masterPoseRef.current.distance_cm += linSpeed * dt;
      } else if (mCmd === 's') {
        const linSpeed = -masterSpeedCmS;
        masterPoseRef.current.speed_cm_s = linSpeed;
        masterPoseRef.current.x_cm += Math.sin(mRad) * linSpeed * dt;
        masterPoseRef.current.y_cm += Math.cos(mRad) * linSpeed * dt;
        masterPoseRef.current.distance_cm += Math.abs(linSpeed) * dt;
      } else {
        masterPoseRef.current.speed_cm_s = 0;
      }

      // Record Master Trail breadcrumb
      if (nowEpoch - lastTrailRecordRef.current > 100) {
        lastTrailRecordRef.current = nowEpoch;
        if (masterPoseRef.current.speed_cm_s !== 0 || mCmd === 'a' || mCmd === 'd') {
          unconsumedTrailRef.current.push({
            x: masterPoseRef.current.x_cm,
            y: masterPoseRef.current.y_cm,
            yaw: masterPoseRef.current.yaw_deg,
            t: nowEpoch,
          });
          if (unconsumedTrailRef.current.length > 600) unconsumedTrailRef.current.shift();
        }
      }

      // 3. Virtual Collision Avoidance Check
      const dxGap = masterPoseRef.current.x_cm - followerPoseRef.current.x_cm;
      const dyGap = masterPoseRef.current.y_cm - followerPoseRef.current.y_cm;
      const gapDistance = Math.sqrt(dxGap * dxGap + dyGap * dyGap);

      if (gapDistance < safeDistanceCm) {
        collisionSuspendedRef.current = true;
      } else {
        collisionSuspendedRef.current = false;
      }

      // 4. Follower Autonomous Navigation State Machine:
      // Phase 1: Intercept Master Origin (First rotate, then head towards initial point)
      // Phase 2: Trace Master Path (Follow waypoints left by Master)
      const origX = masterOriginRef.current.x;
      const origY = masterOriginRef.current.y;
      const dxOrig = origX - followerPoseRef.current.x_cm;
      const dyOrig = origY - followerPoseRef.current.y_cm;
      const distToOrigin = Math.sqrt(dxOrig * dxOrig + dyOrig * dyOrig);

      let targetFCmd: DrivingCommand = 'stop';

      if (collisionSuspendedRef.current) {
        targetFCmd = 'stop';
        followerPoseRef.current.speed_cm_s = 0;
      } else if (
        followerPhaseRef.current === 'INTERCEPT_ROTATING' ||
        followerPhaseRef.current === 'INTERCEPT_DRIVING'
      ) {
        if (distToOrigin > 6.0) {
          // Shortest distance vector angle to Master Origin
          const targetBearing = ((Math.atan2(dxOrig, dyOrig) * 180) / Math.PI + 360) % 360;
          const angleError = ((targetBearing - followerPoseRef.current.yaw_deg + 180) % 360) - 180;

          if (Math.abs(angleError) > 4.0) {
            // First rotate some angle towards Master initial position
            followerPhaseRef.current = 'INTERCEPT_ROTATING';
            phaseDescriptionRef.current = `Phase 1A: Rotating ${Math.abs(angleError).toFixed(0)}° to face Master Origin`;
            targetFCmd = angleError < 0 ? 'a' : 'd';
            const rotRate = 90.0; // deg/s
            if (targetFCmd === 'a') {
              followerPoseRef.current.yaw_deg = ((followerPoseRef.current.yaw_deg - rotRate * dt) % 360 + 360) % 360;
            } else {
              followerPoseRef.current.yaw_deg = ((followerPoseRef.current.yaw_deg + rotRate * dt) % 360 + 360) % 360;
            }
            followerPoseRef.current.speed_cm_s = 0;
          } else {
            // Head straight towards the initial point of the master car
            followerPhaseRef.current = 'INTERCEPT_DRIVING';
            phaseDescriptionRef.current = `Phase 1B: Driving straight to Master Origin (${distToOrigin.toFixed(0)}cm remaining)`;
            targetFCmd = 'w';
            const fRad = (followerPoseRef.current.yaw_deg * Math.PI) / 180;
            const linSpeed = followerSpeedCmS;
            followerPoseRef.current.speed_cm_s = linSpeed;
            followerPoseRef.current.x_cm += Math.sin(fRad) * linSpeed * dt;
            followerPoseRef.current.y_cm += Math.cos(fRad) * linSpeed * dt;
            followerPoseRef.current.distance_cm += linSpeed * dt;
          }
        } else {
          // Arrived at Master Origin! Transition to Path Tracing
          followerPhaseRef.current = 'PATH_TRACING';
          phaseDescriptionRef.current = 'Phase 2: Arrived at Master Origin. Tracing Master trajectory.';
          targetFCmd = 'stop';
          followerPoseRef.current.speed_cm_s = 0;
        }
      } else if (followerPhaseRef.current === 'PATH_TRACING') {
        // Phase 2: Trace the path walked by the master car
        // Consume points within 8cm
        const fx = followerPoseRef.current.x_cm;
        const fy = followerPoseRef.current.y_cm;
        const consumeRadiusSq = 8.0 * 8.0;

        while (unconsumedTrailRef.current.length > 0) {
          const pt = unconsumedTrailRef.current[0];
          const distSq = (fx - pt.x) * (fx - pt.x) + (fy - pt.y) * (fy - pt.y);
          if (distSq <= consumeRadiusSq) {
            unconsumedTrailRef.current.shift();
          } else {
            break;
          }
        }

        if (unconsumedTrailRef.current.length > 0) {
          const targetWpt = unconsumedTrailRef.current[0];
          const dxW = targetWpt.x - fx;
          const dyW = targetWpt.y - fy;
          const wptBearing = ((Math.atan2(dxW, dyW) * 180) / Math.PI + 360) % 360;
          const angleError = ((wptBearing - followerPoseRef.current.yaw_deg + 180) % 360) - 180;

          if (Math.abs(angleError) > 15.0) {
            // Steer towards waypoint
            targetFCmd = angleError < 0 ? 'a' : 'd';
            const rotRate = 90.0;
            if (targetFCmd === 'a') {
              followerPoseRef.current.yaw_deg = ((followerPoseRef.current.yaw_deg - rotRate * dt) % 360 + 360) % 360;
            } else {
              followerPoseRef.current.yaw_deg = ((followerPoseRef.current.yaw_deg + rotRate * dt) % 360 + 360) % 360;
            }
            followerPoseRef.current.speed_cm_s = 0;
            phaseDescriptionRef.current = `Phase 2: Steering to Master path (Δθ: ${angleError.toFixed(0)}°)`;
          } else {
            // Drive forward along the path
            targetFCmd = 'w';
            const fRad = (followerPoseRef.current.yaw_deg * Math.PI) / 180;
            const linSpeed = followerSpeedCmS;
            followerPoseRef.current.speed_cm_s = linSpeed;
            followerPoseRef.current.x_cm += Math.sin(fRad) * linSpeed * dt;
            followerPoseRef.current.y_cm += Math.cos(fRad) * linSpeed * dt;
            followerPoseRef.current.distance_cm += linSpeed * dt;
            phaseDescriptionRef.current = `Phase 2: Tracing Master trajectory (${unconsumedTrailRef.current.length} waypoints ahead)`;
          }
        } else {
          targetFCmd = 'stop';
          followerPoseRef.current.speed_cm_s = 0;
          phaseDescriptionRef.current = 'Phase 2: Synced with Master (Waiting for movement)';
        }
      }

      followerPoseRef.current.active_command = targetFCmd;

      // Calculate rotation needed to origin
      const targetOrigBearing = ((Math.atan2(dxOrig, dyOrig) * 180) / Math.PI + 360) % 360;
      const rotNeeded = Math.round((((targetOrigBearing - followerPoseRef.current.yaw_deg + 180) % 360) - 180) * 10) / 10;

      // Update exported telemetry
      setTelemetry({
        master: { ...masterPoseRef.current },
        follower: { ...followerPoseRef.current },
        platooning: {
          phase: followerPhaseRef.current,
          phase_description: phaseDescriptionRef.current,
          delay_sec: delaySec,
          master_speed_cm_s: masterSpeedCmS,
          follower_speed_cm_s: followerSpeedCmS,
          master_initial_heading_deg: masterInitialHeadingDeg,
          follower_initial_heading_deg: followerInitialHeadingDeg,
          master_origin: { ...masterOriginRef.current },
          distance_to_master_origin_cm: Math.round(distToOrigin * 10) / 10,
          rotation_needed_deg: rotNeeded,
          integrated_yaw_deg: Math.round(integratedYawRef.current * 10) / 10,
          follower_integrated_yaw_deg: Math.round(followerIntegratedYawRef.current * 10) / 10,
          has_follower_phone: Math.abs(followerIntegratedYawRef.current) > 0.001,
          gap_distance_cm: Math.round(gapDistance * 10) / 10,
          safe_distance_cm: safeDistanceCm,
          collision_suspended: collisionSuspendedRef.current,
          queue_length: queueRef.current.length,
          queue: queueRef.current.map((item) => ({
            command: item.command,
            issued_ago: Math.max(0, (nowEpoch - item.issueTimestamp) / 1000),
            remaining_sec: Math.max(0, (item.scheduledExecTime - nowEpoch) / 1000),
          })),
          path_waypoints_remaining: unconsumedTrailRef.current.length,
        },
        precise_turn: {
          active: preciseTurnRef.current.active,
          direction: preciseTurnRef.current.direction,
          target_deg: preciseTurnRef.current.target_deg,
          progress_deg: Math.round(preciseTurnRef.current.accumulated_deg * 10) / 10,
        },
        trails: {
          master_unconsumed: [...unconsumedTrailRef.current],
          master_origin: { ...masterOriginRef.current },
          rendezvous_line:
            followerPhaseRef.current === 'INTERCEPT_ROTATING' ||
            followerPhaseRef.current === 'INTERCEPT_DRIVING'
              ? {
                  x1: followerPoseRef.current.x_cm,
                  y1: followerPoseRef.current.y_cm,
                  x2: masterOriginRef.current.x,
                  y2: masterOriginRef.current.y,
                }
              : undefined,
        },
      });
    }, 20);

    return () => clearInterval(intervalId);
  }, [
    delaySec,
    masterSpeedCmS,
    followerSpeedCmS,
    masterInitialHeadingDeg,
    followerInitialHeadingDeg,
    safeDistanceCm,
  ]);

  return {
    telemetry,
    delaySec,
    setDelaySec,
    masterSpeedCmS,
    setMasterSpeedCmS,
    followerSpeedCmS,
    setFollowerSpeedCmS,
    masterInitialHeadingDeg,
    setMasterInitialHeadingDeg,
    followerInitialHeadingDeg,
    setFollowerInitialHeadingDeg,
    safeDistanceCm,
    setSafeDistanceCm,
    setInitialState,
    issueCommand,
    executePreciseTurn,
    emergencyStop,
    injectGyroSample,
    resetYaw,
  };
}
