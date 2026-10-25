/**
 * Tactical Radar / Map Component
 * High-performance HTML5 Canvas 2D tactical visualization
 * Displays Master and Follower vehicles, trails, heading vectors, distance gap, and metric grid.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { PlatooningTelemetry } from '../types/robotics';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Crosshair } from 'lucide-react';

interface TacticalRadarMapProps {
  telemetry: PlatooningTelemetry;
  onResetOrigin?: () => void;
}

export const TacticalRadarMap: React.FC<TacticalRadarMapProps> = ({
  telemetry,
  onResetOrigin,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan and zoom states
  // scale: pixels per centimeter. Default 1.2 px/cm (so 100cm = 120px)
  const [scale, setScale] = useState<number>(1.2);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [autoCenter, setAutoCenter] = useState<boolean>(true);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((prev) => Math.max(0.3, Math.min(prev * zoomFactor, 4.0)));
  };

  // Drag pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    setAutoCenter(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Center view on Master vehicle
  const centerOnMaster = useCallback(() => {
    setAutoCenter(true);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Center coordinates
    const centerX = width / 2 + offset.x;
    const centerY = height / 2 + offset.y;

    // Clear background - deep obsidian slate
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, width, height);

    // Transform world to canvas:
    // In our world: +Y is North (up), +X is East (right)
    // Canvas: +Y is down, +X is right
    const worldToCanvas = (xCm: number, yCm: number) => {
      return {
        x: centerX + xCm * scale,
        y: centerY - yCm * scale, // invert Y
      };
    };

    // 1. Draw Grid
    // Major grid = 100 cm (1 meter)
    // Minor grid = 20 cm
    const majorCm = 100;
    const minorCm = 20;

    // Calculate visible bounds in cm
    const minXCm = -centerX / scale;
    const maxXCm = (width - centerX) / scale;
    const minYCm = -(height - centerY) / scale;
    const maxYCm = centerY / scale;

    // Minor grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#101726'; // faint dark slate
    ctx.beginPath();
    const startMinorX = Math.floor(minXCm / minorCm) * minorCm;
    const endMinorX = Math.ceil(maxXCm / minorCm) * minorCm;
    for (let x = startMinorX; x <= endMinorX; x += minorCm) {
      const p1 = worldToCanvas(x, minYCm);
      const p2 = worldToCanvas(x, maxYCm);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    const startMinorY = Math.floor(minYCm / minorCm) * minorCm;
    const endMinorY = Math.ceil(maxYCm / minorCm) * minorCm;
    for (let y = startMinorY; y <= endMinorY; y += minorCm) {
      const p1 = worldToCanvas(minXCm, y);
      const p2 = worldToCanvas(maxXCm, y);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Major grid lines
    ctx.strokeStyle = '#1e293b'; // crisp hairline border
    ctx.beginPath();
    const startMajorX = Math.floor(minXCm / majorCm) * majorCm;
    const endMajorX = Math.ceil(maxXCm / majorCm) * majorCm;
    for (let x = startMajorX; x <= endMajorX; x += majorCm) {
      const p1 = worldToCanvas(x, minYCm);
      const p2 = worldToCanvas(x, maxYCm);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    const startMajorY = Math.floor(minYCm / majorCm) * majorCm;
    const endMajorY = Math.ceil(maxYCm / majorCm) * majorCm;
    for (let y = startMajorY; y <= endMajorY; y += majorCm) {
      const p1 = worldToCanvas(minXCm, y);
      const p2 = worldToCanvas(maxXCm, y);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    // Grid coordinate numbers (in meters)
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (let x = startMajorX; x <= endMajorX; x += majorCm) {
      if (x === 0) continue;
      const p = worldToCanvas(x, 0);
      if (p.x >= 10 && p.x <= width - 40 && p.y >= 5 && p.y <= height - 20) {
        ctx.fillText(`${(x / 100).toFixed(0)}m`, p.x + 3, p.y + 3);
      }
    }
    for (let y = startMajorY; y <= endMajorY; y += majorCm) {
      if (y === 0) continue;
      const p = worldToCanvas(0, y);
      if (p.y >= 10 && p.y <= height - 20 && p.x >= 5 && p.x <= width - 40) {
        ctx.fillText(`${(y / 100).toFixed(0)}m`, p.x + 3, p.y + 3);
      }
    }

    // Axes lines (Origin X=0 and Y=0)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    // Y-Axis
    const yTop = worldToCanvas(0, maxYCm);
    const yBottom = worldToCanvas(0, minYCm);
    ctx.moveTo(yTop.x, yTop.y);
    ctx.lineTo(yBottom.x, yBottom.y);
    // X-Axis
    const xLeft = worldToCanvas(minXCm, 0);
    const xRight = worldToCanvas(maxXCm, 0);
    ctx.moveTo(xLeft.x, xLeft.y);
    ctx.lineTo(xRight.x, xRight.y);
    ctx.stroke();

    // Origin Crosshair (0,0 world coordinates)
    const worldZero = worldToCanvas(0, 0);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(worldZero.x, worldZero.y, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#475569';
    ctx.fillText('(0,0)', worldZero.x + 5, worldZero.y - 12);

    // Master Initial Origin Pose Marker
    const mOrig = telemetry.platooning?.master_origin || { x: 0, y: 0, yaw: 0 };
    const mOrigCanvas = worldToCanvas(mOrig.x, mOrig.y);

    ctx.save();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mOrigCanvas.x, mOrigCanvas.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mOrigCanvas.x, mOrigCanvas.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#06b6d4';
    ctx.fill();

    // Crosshair ticks
    ctx.beginPath();
    ctx.moveTo(mOrigCanvas.x - 10, mOrigCanvas.y);
    ctx.lineTo(mOrigCanvas.x + 10, mOrigCanvas.y);
    ctx.moveTo(mOrigCanvas.x, mOrigCanvas.y - 10);
    ctx.lineTo(mOrigCanvas.x, mOrigCanvas.y + 10);
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
    ctx.stroke();

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#22d3ee';
    ctx.textAlign = 'left';
    ctx.fillText(`MASTER ORIGIN (${mOrig.x}, ${mOrig.y})`, mOrigCanvas.x + 12, mOrigCanvas.y + 4);
    ctx.restore();

    // Rendezvous Line (Follower -> Master Origin) during Phase 1
    const pPhase = telemetry.platooning?.phase || 'IDLE';
    const isRendezvous = pPhase === 'INTERCEPT_ROTATING' || pPhase === 'INTERCEPT_DRIVING';
    const followerPos = worldToCanvas(telemetry.follower.x_cm, telemetry.follower.y_cm);

    if (isRendezvous) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f59e0b'; // amber/gold
      ctx.beginPath();
      ctx.moveTo(followerPos.x, followerPos.y);
      ctx.lineTo(mOrigCanvas.x, mOrigCanvas.y);
      ctx.stroke();

      // Midpoint badge
      const midRX = (followerPos.x + mOrigCanvas.x) / 2;
      const midRY = (followerPos.y + mOrigCanvas.y) / 2;
      const rText = pPhase === 'INTERCEPT_ROTATING'
        ? `PHASE 1A: ROTATING TO ORIGIN (${telemetry.platooning.rotation_needed_deg}°)`
        : `PHASE 1B: TRANSIT TO ORIGIN (${telemetry.platooning.distance_to_master_origin_cm.toFixed(0)}cm)`;

      ctx.font = '10px "JetBrains Mono", monospace';
      const mText = ctx.measureText(rText);
      const bW = mText.width + 12;
      const bH = 18;

      ctx.fillStyle = '#451a03';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.fillRect(midRX - bW / 2, midRY - bH / 2, bW, bH);
      ctx.strokeRect(midRX - bW / 2, midRY - bH / 2, bW, bH);

      ctx.fillStyle = '#fef3c7';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rText, midRX, midRY);
      ctx.restore();
    }

    // 2. Draw Consumable / Fading Trail:
    // This is the active path laid by the Master vehicle that has NOT yet been consumed by the Follower.
    const unconsumedTrail = telemetry.trails.master_unconsumed || [];
    if (unconsumedTrail.length > 1) {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Draw path with glowing gradient or fading intensity
      for (let i = 0; i < unconsumedTrail.length - 1; i++) {
        const pt1 = worldToCanvas(unconsumedTrail[i].x, unconsumedTrail[i].y);
        const pt2 = worldToCanvas(unconsumedTrail[i + 1].x, unconsumedTrail[i + 1].y);

        // Alpha fades near the Follower (head of queue/oldest) and shines bright near Master (tail/newest)
        const progress = (i + 1) / unconsumedTrail.length;
        const alpha = 0.2 + progress * 0.7;

        ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.stroke();
      }

      // Draw breadcrumb dots on unconsumed path
      unconsumedTrail.forEach((pt, i) => {
        if (i % 3 === 0) {
          const p = worldToCanvas(pt.x, pt.y);
          ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // 3. Inter-Vehicle Gap Line & Collision Warning
    const masterPos = worldToCanvas(telemetry.master.x_cm, telemetry.master.y_cm);
    const isSuspended = telemetry.platooning.collision_suspended;
    const gap = telemetry.platooning.gap_distance_cm;
    const safeLimit = telemetry.platooning.safe_distance_cm || 30.0;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = isSuspended ? 2.5 : 1.5;
    ctx.strokeStyle = isSuspended ? 'rgba(239, 68, 68, 0.9)' : 'rgba(148, 163, 184, 0.4)';
    ctx.beginPath();
    ctx.moveTo(masterPos.x, masterPos.y);
    ctx.lineTo(followerPos.x, followerPos.y);
    ctx.stroke();
    ctx.restore();

    // Gap distance badge at midpoint
    const midX = (masterPos.x + followerPos.x) / 2;
    const midY = (masterPos.y + followerPos.y) / 2;
    const gapText = isSuspended
      ? `COLLISION STOP: ${gap.toFixed(1)} cm (<${safeLimit}cm)`
      : `GAP: ${gap.toFixed(1)} cm`;

    ctx.font = '10px "JetBrains Mono", monospace';
    const textMetrics = ctx.measureText(gapText);
    const bgWidth = textMetrics.width + 14;
    const bgHeight = 20;

    ctx.fillStyle = isSuspended ? '#450a0a' : '#0f172a';
    ctx.strokeStyle = isSuspended ? '#ef4444' : '#38bdf8';
    ctx.lineWidth = isSuspended ? 1.5 : 1;
    ctx.fillRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight);
    ctx.strokeRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight);

    ctx.fillStyle = isSuspended ? '#fca5a5' : '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(gapText, midX, midY);

    // Helper: Draw RC Vehicle
    const drawVehicle = (
      x: number,
      y: number,
      yawDeg: number,
      color: string,
      label: string,
      isMaster: boolean
    ) => {
      ctx.save();
      ctx.translate(x, y);

      // In canvas, 0 deg = North (up). Standard rotation:
      // When yaw is 0 deg (North), vehicle points up (canvas -Y).
      // Canvas rotate angle in radians:
      const angleRad = (yawDeg * Math.PI) / 180;
      ctx.rotate(angleRad);

      // Vehicle dimensions in cm: typical 1:16 / 1:18 RC car is approx 24cm long x 14cm wide
      // Scaled by 'scale'
      const lengthPx = Math.max(26, 24 * scale);
      const widthPx = Math.max(16, 14 * scale);

      // Headlight illumination cone for Master
      if (isMaster) {
        const coneGradient = ctx.createRadialGradient(0, -lengthPx / 2, 5, 0, -lengthPx * 2.2, lengthPx * 2.5);
        coneGradient.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
        coneGradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
        ctx.fillStyle = coneGradient;
        ctx.beginPath();
        ctx.moveTo(0, -lengthPx / 2);
        ctx.lineTo(-widthPx * 1.5, -lengthPx * 2.5);
        ctx.lineTo(widthPx * 1.5, -lengthPx * 2.5);
        ctx.closePath();
        ctx.fill();
      }

      // Wheels (4 black rounded rectangles)
      ctx.fillStyle = '#1e293b';
      const wheelW = widthPx * 0.22;
      const wheelL = lengthPx * 0.32;
      // Front Left
      ctx.fillRect(-widthPx / 2 - wheelW / 2, -lengthPx / 2 + 2, wheelW, wheelL);
      // Front Right
      ctx.fillRect(widthPx / 2 - wheelW / 2, -lengthPx / 2 + 2, wheelW, wheelL);
      // Rear Left
      ctx.fillRect(-widthPx / 2 - wheelW / 2, lengthPx / 2 - wheelL - 2, wheelW, wheelL);
      // Rear Right
      ctx.fillRect(widthPx / 2 - wheelW / 2, lengthPx / 2 - wheelL - 2, wheelW, wheelL);

      // Main Chassis Body
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Aerodynamic tapered body
      ctx.moveTo(0, -lengthPx / 2); // Front Nose point
      ctx.lineTo(widthPx / 2, -lengthPx / 3);
      ctx.lineTo(widthPx / 2, lengthPx / 2);
      ctx.lineTo(-widthPx / 2, lengthPx / 2);
      ctx.lineTo(-widthPx / 2, -lengthPx / 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Heading indicator arrow inside chassis
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -lengthPx / 2 + 5);
      ctx.lineTo(widthPx * 0.22, 0);
      ctx.lineTo(-widthPx * 0.22, 0);
      ctx.closePath();
      ctx.fill();

      // Raspberry Pi / L298N representation on deck
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-widthPx * 0.25, 2, widthPx * 0.5, lengthPx * 0.25);

      ctx.restore();

      // Vehicle Label Tag (outside rotation so text stays horizontal)
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${label} [${yawDeg.toFixed(0)}°]`, x, y - lengthPx / 2 - 6);
    };

    // Draw Follower first (underneath)
    drawVehicle(
      followerPos.x,
      followerPos.y,
      telemetry.follower.yaw_deg,
      '#f59e0b',
      'FOLLOWER',
      false
    );

    // Draw Master
    drawVehicle(
      masterPos.x,
      masterPos.y,
      telemetry.master.yaw_deg,
      '#06b6d4',
      'MASTER',
      true
    );

    ctx.restore();
  }, [telemetry, scale, offset]);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-2xl">
      {/* Canvas Header HUD */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <span className="text-xs font-semibold text-slate-200">MASTER (CAR 1)</span>
          </div>
          <span className="text-slate-600">·</span>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span className="text-xs font-semibold text-slate-200">FOLLOWER (CAR 2)</span>
          </div>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-mono text-slate-400">
            GRID: 1m / 100cm (Minor 20cm)
          </span>
        </div>

        {/* Zoom & Viewport Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setScale((s) => Math.min(s * 1.25, 4.0))}
            title="Zoom In"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s * 0.8, 0.3))}
            title="Zoom Out"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={centerOnMaster}
            title="Center View"
            className={`p-1.5 rounded transition-colors ${
              autoCenter ? 'text-cyan-400 bg-cyan-950/50' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
            }`}
          >
            <Crosshair className="w-4 h-4" />
          </button>
          {onResetOrigin && (
            <button
              onClick={onResetOrigin}
              title="Reset Coordinates to (0,0)"
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors ml-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset (0,0)
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Canvas */}
      <div className="relative flex-1 w-full h-full cursor-crosshair overflow-hidden">
        {/* Active Navigation Phase Indicator (top-left) */}
        <div className="absolute top-3 left-3 z-10 pointer-events-none">
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold backdrop-blur shadow-lg flex items-center gap-2 ${
              telemetry.platooning?.collision_suspended
                ? 'bg-rose-950/85 border-rose-500 text-rose-200 animate-pulse'
                : telemetry.platooning?.phase === 'INTERCEPT_ROTATING'
                ? 'bg-amber-950/85 border-amber-500 text-amber-200'
                : telemetry.platooning?.phase === 'INTERCEPT_DRIVING'
                ? 'bg-cyan-950/85 border-cyan-500 text-cyan-200'
                : 'bg-emerald-950/85 border-emerald-500 text-emerald-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-current inline-block" />
            <span>{telemetry.platooning?.phase_description || 'Active'}</span>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="w-full h-full block"
        />

        {/* Live Coordinate Overlay HUD (bottom-left) */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-300 backdrop-blur pointer-events-none flex flex-col gap-1 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-semibold">MASTER:</span>
            <span>X: {telemetry.master.x_cm.toFixed(1)} cm</span>
            <span className="text-slate-600">|</span>
            <span>Y: {telemetry.master.y_cm.toFixed(1)} cm</span>
            <span className="text-slate-600">|</span>
            <span>θ: {telemetry.master.yaw_deg.toFixed(1)}°</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-semibold">FOLLOWER:</span>
            <span>X: {telemetry.follower.x_cm.toFixed(1)} cm</span>
            <span className="text-slate-600">|</span>
            <span>Y: {telemetry.follower.y_cm.toFixed(1)} cm</span>
            <span className="text-slate-600">|</span>
            <span>θ: {telemetry.follower.yaw_deg.toFixed(1)}°</span>
          </div>
        </div>

        {/* Pan tip (bottom-right) */}
        <div className="absolute bottom-3 right-3 text-[11px] font-mono text-slate-500 pointer-events-none bg-slate-900/60 px-2 py-1 rounded">
          Drag to Pan · Scroll to Zoom
        </div>
      </div>
    </div>
  );
};
