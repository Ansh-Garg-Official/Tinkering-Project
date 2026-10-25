import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.text());

// In-memory subscribers for Server-Sent Events (SSE)
const sseClients = new Set<express.Response>();

interface GyroPacket {
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

// Integrated yaw trackers on the cloud server
let masterYawDeg = 0.0;
let followerYawDeg = 0.0;
let lastMasterTime = 0;
let lastFollowerTime = 0;
const recentPackets: GyroPacket[] = [];

// Parse gyro packet matching format: [Car1] Gyro (rad/s) -> X: 0.1927, Y: -0.1927, Z: 0.1037
function parseGyroPacket(raw: string, sender: string = 'remote'): GyroPacket | null {
  const text = raw.trim();
  const now = Date.now();
  const timeStr = new Date(now).toLocaleTimeString('en-US', { hour12: false });

  let device = 'Master';
  if (/car\s*2|follower/i.test(text)) {
    device = 'Follower';
  } else if (/car\s*1|master/i.test(text)) {
    device = 'Master';
  }

  // Regex to extract X, Y, Z
  const match = text.match(/X:\s*([-\d.]+)[,\s]+Y:\s*([-\d.]+)[,\s]+Z:\s*([-\d.]+)/i);
  let gx = 0.0;
  let gy = 0.0;
  let gz = 0.0;

  if (match) {
    gx = parseFloat(match[1]) || 0;
    gy = parseFloat(match[2]) || 0;
    gz = parseFloat(match[3]) || 0;
  } else {
    // Fallback: check Z:
    const zMatch = text.match(/Z:\s*([-\d.]+)/i);
    if (zMatch) {
      gz = parseFloat(zMatch[1]) || 0;
    } else {
      return null;
    }
  }

  const gz_deg_s = (gz * 180.0) / Math.PI;

  // Integrate yaw
  if (device === 'Follower') {
    const dt = lastFollowerTime > 0 ? Math.min((now - lastFollowerTime) / 1000, 0.2) : 0.02;
    lastFollowerTime = now;
    if (Math.abs(gz_deg_s) > 0.05) {
      followerYawDeg += gz_deg_s * dt;
    }
  } else {
    const dt = lastMasterTime > 0 ? Math.min((now - lastMasterTime) / 1000, 0.2) : 0.02;
    lastMasterTime = now;
    if (Math.abs(gz_deg_s) > 0.05) {
      masterYawDeg += gz_deg_s * dt;
    }
  }

  const currentYaw = device === 'Follower' ? followerYawDeg : masterYawDeg;

  return {
    time: timeStr,
    device: device === 'Follower' ? 'Follower (Car 2)' : 'Master (Car 1)',
    raw: text,
    sender,
    gx: Math.round(gx * 10000) / 10000,
    gy: Math.round(gy * 10000) / 10000,
    gz: Math.round(gz * 10000) / 10000,
    gz_deg_s: Math.round(gz_deg_s * 100) / 100,
    yaw_deg: Math.round(currentYaw * 100) / 100,
  };
}

// 1. Health check & status
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'online',
    subscribers: sseClients.size,
    total_packets: recentPackets.length,
    master_yaw: Math.round(masterYawDeg * 10) / 10,
    follower_yaw: Math.round(followerYawDeg * 10) / 10,
  });
});

// 2. Receive live packets from Python main.py / forwarder
app.post('/api/stream', (req, res) => {
  const body = req.body || {};
  const raw =
    typeof body === 'string'
      ? body
      : body.packet || body.raw || body.text || `Gyro (rad/s) -> X: 0.0000, Y: 0.0000, Z: ${(body.gz ?? 0).toFixed(4)}`;

  let parsed = parseGyroPacket(raw, req.ip || 'laptop');
  if (!parsed && (typeof body.yaw_deg === 'number' || typeof body.angle_mod_360 === 'number')) {
    const isFollower = body.device && (body.device.includes('2') || body.device.includes('Follower'));
    parsed = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      device: isFollower ? 'Follower (Car 2)' : 'Master (Car 1)',
      raw: String(raw),
      sender: req.ip || 'laptop',
      gx: body.gx || 0,
      gy: body.gy || 0,
      gz: body.gz || 0,
      gz_deg_s: body.gz_deg_s || 0,
      yaw_deg: body.yaw_deg ?? body.angle_mod_360 ?? 0,
    };
  }

  if (parsed) {
    // If main.py sent explicit precomputed yaw_deg (mod 360), sync directly
    const explicitYaw = body.yaw_deg ?? body.angle_mod_360;
    if (typeof explicitYaw === 'number') {
      if (parsed.device.includes('Follower')) {
        followerYawDeg = explicitYaw;
      } else {
        masterYawDeg = explicitYaw;
      }
      parsed.yaw_deg = explicitYaw;
    }

    recentPackets.push(parsed);
    if (recentPackets.length > 50) recentPackets.shift();

    // Broadcast to all connected web clients via SSE
    const message = `data: ${JSON.stringify(parsed)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(message);
      } catch {
        sseClients.delete(client);
      }
    }

    res.json({
      status: 'ok',
      packet: parsed,
      master_yaw: masterYawDeg,
      follower_yaw: followerYawDeg
    });
  } else {
    res.status(422).json({ error: 'Could not parse gyro packet format', received: raw });
  }
});

// 3. Reset yaw calibration
const handleResetYaw = (_req: express.Request, res: express.Response) => {
  masterYawDeg = 0.0;
  followerYawDeg = 0.0;
  res.json({ status: 'reset', master_yaw: 0, follower_yaw: 0 });
};
app.post('/api/stream/reset', handleResetYaw);
app.post('/api/reset-yaw', handleResetYaw);

// 4. Server-Sent Events (SSE) stream for web frontend
app.get('/api/stream/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial backlog
  const initialPayload = {
    type: 'init',
    master_yaw: masterYawDeg,
    follower_yaw: followerYawDeg,
    recent: recentPackets.slice(-20),
  };
  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PlatoonCommand Server running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Cloud Gyro Stream Gateway ready at POST /api/stream`);
  });
}

startServer();
