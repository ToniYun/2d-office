import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { networkInterfaces } from 'os';
import { readFileSync, existsSync, watch } from 'fs';
import { execFileSync } from 'child_process';
import { resolve } from 'path';

// ── Load agent config ──────────────────────────────────────────────────────────
const CONFIG_PATH = resolve('agents.config.json');
let config = { company: 'AI Corp.', agents: [], handoffRouting: {}, processWatchers: [] };
try {
  config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  console.log(`[config] Loaded ${config.agents.length} agents for "${config.company}"`);
} catch (e) {
  console.warn('[config] Could not load agents.config.json, using defaults:', e.message);
}

const HANDOFF_FROM = config.handoffRouting ?? {};
const agentIds = config.agents.map((a) => a.id);

// ── Express + Socket.io ────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
app.use(express.json());

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(express.static(resolve('dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io') || req.path.startsWith('/api')) return next();
  res.sendFile(resolve('dist/index.html'));
});

// ── Players ────────────────────────────────────────────────────────────────────
const players = new Map();

// ── Agent state ────────────────────────────────────────────────────────────────
const agentState = new Map(agentIds.map((id) => [id, false]));

function activateAgent(agentId) {
  if (!agentState.has(agentId)) {
    console.warn(`[agent] Unknown agentId: "${agentId}" — add it to agents.config.json`);
  }
  agentState.set(agentId, true);
  io.emit('agentActive', { agentId });
  console.log(`[agent] ${agentId} → active`);
}

function idleAgent(agentId) {
  agentState.set(agentId, false);
  io.emit('agentIdle', { agentId });
  console.log(`[agent] ${agentId} → idle`);
}

// ── REST API — integrate your AI models here ───────────────────────────────────
//
//   POST /api/agent/active   { "agentId": "engineer" }
//   POST /api/agent/idle     { "agentId": "engineer" }
//   GET  /api/agents         → returns agent config + current states
//
//   Optional: set API_KEY env var to require Authorization: Bearer <key>
//

const API_KEY = process.env.API_KEY ?? null;

function checkAuth(req, res) {
  if (!API_KEY) return true;
  const auth = req.headers['authorization'] ?? '';
  if (auth === `Bearer ${API_KEY}`) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

app.post('/api/agent/active', (req, res) => {
  if (!checkAuth(req, res)) return;
  const { agentId } = req.body ?? {};
  if (!agentId) return res.status(400).json({ error: 'agentId required' });
  activateAgent(String(agentId));
  res.json({ ok: true, agentId });
});

app.post('/api/agent/idle', (req, res) => {
  if (!checkAuth(req, res)) return;
  const { agentId } = req.body ?? {};
  if (!agentId) return res.status(400).json({ error: 'agentId required' });
  idleAgent(String(agentId));
  res.json({ ok: true, agentId });
});

app.post('/api/agent/handoff', (req, res) => {
  if (!checkAuth(req, res)) return;
  const { from, to } = req.body ?? {};
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  io.emit('agentHandoff', { from: String(from), to: String(to) });
  console.log(`[handoff] ${from} → ${to}`);
  res.json({ ok: true });
});

app.get('/api/agents', (_req, res) => {
  res.json({
    company: config.company,
    agents: config.agents.map((a) => ({
      ...a,
      active: agentState.get(a.id) ?? false,
    })),
  });
});

// ── Socket.io — multiplayer ────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.on('join', ({ name, color }) => {
    const player = {
      id: socket.id,
      name: String(name).slice(0, 20),
      color: String(color).slice(0, 9),
      position: [0, 1, 5],
      rotation: [0, 0],
    };
    players.set(socket.id, player);
    socket.emit('currentPlayers', Array.from(players.values()));

    // Send current active states to late-joining clients
    for (const [agentId, active] of agentState.entries()) {
      if (active) socket.emit('agentActive', { agentId });
    }

    socket.broadcast.emit('playerJoined', player);
    console.log(`  ${player.name} joined — ${players.size} online`);
  });

  socket.on('move', ({ position, rotation }) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (!Array.isArray(position) || position.length !== 3) return;
    if (!Array.isArray(rotation) || rotation.length !== 2) return;
    player.position = position;
    player.rotation = rotation;
    socket.broadcast.emit('playerMoved', { id: socket.id, position, rotation });
  });

  socket.on('disconnect', (reason) => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`[-] ${player.name} left (${reason}) — ${players.size - 1} online`);
      players.delete(socket.id);
      io.emit('playerLeft', socket.id);
    }
  });
});

// ── Optional: process-name watchers (configure in agents.config.json) ─────────
//
//   "processWatchers": [
//     { "agentId": "engineer", "processNames": ["claude"], "patterns": ["@anthropic-ai/claude-code"] }
//   ]
//
const processState = {};
const watchers = config.processWatchers ?? [];

function isProcessRunning(name) {
  try { execFileSync('pgrep', ['-x', name], { stdio: ['ignore','pipe','ignore'] }); return true; }
  catch { return false; }
}
function isPatternRunning(pattern) {
  try { execFileSync('pgrep', ['-f', pattern], { stdio: ['ignore','pipe','ignore'] }); return true; }
  catch { return false; }
}

if (watchers.length > 0) {
  function pollProcesses() {
    for (const { agentId, processNames = [], patterns = [] } of watchers) {
      const running = processNames.some(isProcessRunning) || patterns.some(isPatternRunning);
      const was = processState[agentId] ?? false;
      if (running && !was) { processState[agentId] = true; activateAgent(agentId); }
      else if (!running && was) { processState[agentId] = false; idleAgent(agentId); }
    }
  }
  setTimeout(pollProcesses, 2_000);
  setInterval(pollProcesses, 10_000);
  console.log(`[process] Watching ${watchers.length} process(es)`);
}

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT ?? 3002;

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   2D Office — Multiplayer Server       ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║   Port: ${PORT}                           ║`);
  console.log('║                                        ║');
  console.log('║   Trigger agent animations via HTTP:   ║');
  console.log(`║   POST http://localhost:${PORT}/api/agent/active ║`);
  console.log(`║   POST http://localhost:${PORT}/api/agent/idle   ║`);
  console.log('║                                        ║');
  if (ips.length > 0) {
    console.log('║   LAN:                                 ║');
    ips.forEach((ip) => console.log(`║     http://${ip}:${PORT}          ║`));
  }
  console.log('╚════════════════════════════════════════╝\n');
  console.log('  Edit agents.config.json to add your agents.\n');
});
