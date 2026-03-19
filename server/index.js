import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { networkInterfaces } from 'os';
import { readFileSync, readdirSync, watch, existsSync } from 'fs';
import { execFileSync } from 'child_process';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

/** @type {Map<string, {id:string, name:string, color:string, position:[number,number,number], rotation:[number,number]}>} */
const players = new Map();

// ── Discord channel resolution ─────────────────────────────────────────────
let discordChannels = [];

async function resolveDiscordChannels() {
  try {
    const cfg   = JSON.parse(readFileSync(`${OPENCLAW_DIR}/openclaw.json`, 'utf-8'));
    const token = cfg?.channels?.discord?.token;
    if (!token) return;
    const guilds = cfg?.channels?.discord?.guilds ?? {};
    for (const [guildId, guild] of Object.entries(guilds)) {
      for (const [channelId, opts] of Object.entries(guild?.channels ?? {})) {
        if (!opts?.allow) continue;
        try {
          const res  = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
            headers: { Authorization: `Bot ${token}` },
          });
          const data = await res.json();
          discordChannels.push({ id: channelId, name: data.name ?? channelId, guildId });
        } catch { discordChannels.push({ id: channelId, name: channelId, guildId }); }
      }
    }
    console.log(`[discord] resolved ${discordChannels.length} channels`);
  } catch (e) {
    console.warn('[discord] channel resolution failed:', e.message);
  }
}

function getLocalIPs() {
  const nets = networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  return results;
}

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

    // Send all existing players to the newcomer (including themselves)
    socket.emit('currentPlayers', Array.from(players.values()));

    // Send Discord channel list
    socket.emit('discordChannels', discordChannels);

    // Send current agent active states so late-joining clients aren't stale
    for (const [npcId, t] of agentTracking.entries()) {
      if (t.isActive) socket.emit('agentActive', { agentId: npcId });
    }
    for (const [agentId, running] of Object.entries(cliProcessState)) {
      if (running) socket.emit('agentActive', { agentId });
    }

    // Notify everyone else
    socket.broadcast.emit('playerJoined', player);

    console.log(`  ${player.name} joined — ${players.size} online`);
  });

  socket.on('move', ({ position, rotation }) => {
    const player = players.get(socket.id);
    if (!player) return;

    // Basic sanity check
    if (!Array.isArray(position) || position.length !== 3) return;
    if (!Array.isArray(rotation) || rotation.length !== 2) return;

    player.position = position;
    player.rotation = rotation;

    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position,
      rotation,
    });
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

// ── Openclaw agent session watchers ───────────────────────────────────────
// When an agent's sessions.json updatedAt increases → that agent has a job.
// We emit agentActive / agentIdle over socket so the 3D NPCs react.

const OPENCLAW_DIR = '/home/openclaw/.openclaw';
const EMIT_COOLDOWN  = 25_000;   // ms — min gap between agentActive for same agent
const IDLE_AFTER     = 300_000;  // ms fallback → agentIdle (5 min for long-running tasks)
const IDLE_AFTER_NOACP = 180_000; // ms for non-ACP sessions (3 min — keep NPC at desk until Discord output)

// ── Discord handoff notifications ─────────────────────────────────────────
// Read the first allowed Discord channel from openclaw.json to post handoffs.
function resolveDiscordChannel() {
  try {
    const cfg = JSON.parse(readFileSync(`${OPENCLAW_DIR}/openclaw.json`, 'utf-8'));
    const guilds = cfg?.channels?.discord?.guilds ?? {};
    for (const guild of Object.values(guilds)) {
      const channels = guild?.channels ?? {};
      for (const [id, opts] of Object.entries(channels)) {
        if (opts?.allow) return id;
      }
    }
  } catch {}
  return null;
}

const DISCORD_CHANNEL_ID = resolveDiscordChannel();

/** Post a handoff notification to Discord. Fire-and-forget, never throws. */
function notifyHandoff(from, to, label) {
  if (!DISCORD_CHANNEL_ID) return;
  const agentLabel = label ? `${to} (${label})` : to;
  const msg = `🔀 Delegating to **${agentLabel}**: handed off from **${from}**`;
  try {
    execFileSync('openclaw', [
      'message', 'send',
      '--channel=discord',
      `--target=${DISCORD_CHANNEL_ID}`,
      `--message=${msg}`,
    ], { timeout: 8000 });
  } catch (err) {
    console.warn(`[handoff] Discord notify failed: ${err.message}`);
  }
}

// All known openclaw agent dir names → the NPC agentId we emit on the socket.
// Multiple dir names can map to the same NPC (aliases for the same role).
const AGENT_DIR_MAP = {
  'main':                        'main',           // CEO / router (GPT-5)
  'claude-code':                 'claude-code',
  'claude':                      'claude-code',    // alias
  'anthropic-claude-sonnet-4-6': 'claude-code',    // alias
  'codex':                       'codex',
  'openai-codex':                'codex',           // alias
  'claude-opus':                 'claude-opus',
  'research':                    'research',
  'deepseek-coder':              'deepseek-coder',
  'mistral':                     'mistral',
  'llama3':                      'llama3',
  'qwen-mini':                   'qwen-mini',
};

// Who delegates to each NPC — mirrors JOB_ROUTING in AgentNPCs.tsx
const HANDOFF_FROM = {
  'claude-code':    'main',
  'research':       'main',
  'claude-opus':    'main',
  'codex':          'claude-code',   // QA comes from claude-code
  'deepseek-coder': 'claude-code',   // deepseek is spawned by claude-code
  'mistral':        'main',
  'llama3':         'main',
  'qwen-mini':      'main',
};

/**
 * Read sessions.json and return:
 *  - maxUpdatedAt:   largest updatedAt across all sessions
 *  - hasActiveAcp:   true if any session has acp.state !== 'idle'
 *  - hasActiveLocks: true if any .lock file exists (session mid-inference)
 *  - sessionKeys:    Set of all session keys (for handoff detection)
 */
function getSessionInfo(sessionsJsonPath, sessionsDir) {
  try {
    const data = JSON.parse(readFileSync(sessionsJsonPath, 'utf-8'));
    const vals = Object.values(data);
    const keys = new Set(Object.keys(data));
    const maxUpdatedAt = vals.length ? Math.max(...vals.map((s) => s.updatedAt ?? 0)) : 0;
    const hasActiveAcp = vals.some(
      (s) => s.acp?.state && s.acp.state !== 'idle' && s.acp.state !== 'pending'
    );
    // Lock files exist while an agent is mid-inference — ground truth for "still running"
    const hasActiveLocks = readdirSync(sessionsDir).some((f) => f.endsWith('.lock'));
    return { maxUpdatedAt, hasActiveAcp, hasActiveLocks, sessionKeys: keys };
  } catch {
    return { maxUpdatedAt: 0, hasActiveAcp: false, hasActiveLocks: false, sessionKeys: new Set() };
  }
}

// One tracking entry per NPC id (not per dir — aliases share a tracker)
const npcIds = [...new Set(Object.values(AGENT_DIR_MAP))];
const agentTracking = new Map(
  npcIds.map((id) => [id, {
    lastUpdatedAt: 0,
    lastEmitMs:    0,
    isActive:      false,
    idleTimer:     null,
    pollTimer:     null,
  }])
);

// Track session keys per NPC to detect new sessions (handoffs / subagent spawns)
const sessionKeysCache = new Map(npcIds.map((id) => [id, new Set()]));

// Track which dir names are already being watched to avoid double-watching aliases
const watchedDirs = new Set();

/** Emit idle for npcId and clear its timers */
function emitIdle(npcId, reason) {
  const t = agentTracking.get(npcId);
  if (!t?.isActive) return;
  t.isActive = false;
  clearTimeout(t.idleTimer);
  clearInterval(t.pollTimer);
  t.idleTimer = null;
  t.pollTimer = null;
  console.log(`[agent] ${npcId} idle (${reason})`);
  io.emit('agentIdle', { agentId: npcId });
}

/** Poll every 10s while agent is active — wait for both ACP idle AND no lock files */
function startIdlePoll(npcId, sessionsJson, sessionsDir) {
  const t = agentTracking.get(npcId);
  clearInterval(t.pollTimer);
  t.pollTimer = setInterval(() => {
    if (!t.isActive) { clearInterval(t.pollTimer); return; }
    const { hasActiveAcp, hasActiveLocks } = getSessionInfo(sessionsJson, sessionsDir);
    if (!hasActiveAcp && !hasActiveLocks) {
      clearInterval(t.pollTimer);
      t.pollTimer = null;
      clearTimeout(t.idleTimer);
      t.idleTimer = setTimeout(() => emitIdle(npcId, 'complete'), 5_000);
    }
  }, 10_000);
}

function startAgentWatcher(dirName) {
  if (watchedDirs.has(dirName)) return;

  const npcId       = AGENT_DIR_MAP[dirName];
  const sessionsDir = `${OPENCLAW_DIR}/agents/${dirName}/sessions`;
  const sessionsJson= `${sessionsDir}/sessions.json`;

  if (!existsSync(sessionsDir)) {
    // Retry every 30s in case sessions dir gets created later
    setTimeout(() => startAgentWatcher(dirName), 30_000);
    console.log(`[agent] ${dirName}: sessions dir missing — will retry`);
    return;
  }

  watchedDirs.add(dirName);

  // Seed startup state
  const track = agentTracking.get(npcId);
  const seed  = getSessionInfo(sessionsJson, sessionsDir);
  track.lastUpdatedAt = Math.max(track.lastUpdatedAt, seed.maxUpdatedAt);
  sessionKeysCache.set(npcId, seed.sessionKeys);

  // If a session is already running at startup, activate the NPC immediately
  if (seed.hasActiveLocks || seed.hasActiveAcp) {
    const now = Date.now();
    track.lastEmitMs = now;
    track.isActive   = true;
    console.log(`[agent] ${dirName} → ${npcId} active (already running at startup)`);
    io.emit('agentActive', { agentId: npcId });
    startIdlePoll(npcId, sessionsJson, sessionsDir);
    track.idleTimer = setTimeout(() => emitIdle(npcId, 'timeout'), IDLE_AFTER);
  }

  let debounce = null;

  try {
    watch(sessionsDir, (_, filename) => {
      if (!filename) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const { maxUpdatedAt, hasActiveAcp, hasActiveLocks, sessionKeys } = getSessionInfo(sessionsJson, sessionsDir);
        const t = agentTracking.get(npcId);

        // ── Handoff / subagent detection ─────────────────────────────────
        const prevKeys = sessionKeysCache.get(npcId) ?? new Set();
        const newKeys  = [...sessionKeys].filter((k) => !prevKeys.has(k));
        sessionKeysCache.set(npcId, sessionKeys);

        if (newKeys.length > 0) {
          const from = HANDOFF_FROM[npcId] ?? 'main';
          console.log(`[handoff] ${from} → ${npcId} (new session: ${newKeys.join(', ')})`);
          io.emit('agentHandoff', { from, to: npcId });
          notifyHandoff(from, npcId);
        }

        // ── Activity detection ────────────────────────────────────────────
        const isRunning = hasActiveAcp || hasActiveLocks;

        if (maxUpdatedAt <= t.lastUpdatedAt) {
          // No newer session data — but check if running state changed
          if (t.isActive && !isRunning) {
            clearTimeout(t.idleTimer);
            t.idleTimer = setTimeout(() => emitIdle(npcId, 'lock-released'), 5_000);
          }
          return;
        }
        t.lastUpdatedAt = maxUpdatedAt;

        const now = Date.now();
        if (now - t.lastEmitMs >= EMIT_COOLDOWN) {
          t.lastEmitMs = now;
          t.isActive   = true;
          console.log(`[agent] ${dirName} → ${npcId} active`);
          io.emit('agentActive', { agentId: npcId });
        }

        // ── Idle scheduling: poll while running, fallback timer ───────────
        clearTimeout(t.idleTimer);
        clearInterval(t.pollTimer);

        if (isRunning) {
          // Lock file or ACP active — poll every 10s until done
          startIdlePoll(npcId, sessionsJson, sessionsDir);
          t.idleTimer = setTimeout(() => emitIdle(npcId, 'timeout'), IDLE_AFTER);
        } else {
          t.idleTimer = setTimeout(() => emitIdle(npcId, 'timeout-noacp'), IDLE_AFTER_NOACP);
        }
      }, 300);
    });
    console.log(`[agent] Watching ${dirName} → ${npcId}`);
  } catch (err) {
    console.warn(`[agent] Cannot watch ${dirName}: ${err.message}`);
  }
}

// ── System CLI process watcher (claude-code / codex binaries) ─────────────────
function isProcessNameRunning(name) {
  // -x = exact process name match (fastest, most reliable)
  try {
    execFileSync('pgrep', ['-x', name], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch { return false; }
}

function isCliRunning(pattern) {
  try {
    execFileSync('pgrep', ['-f', pattern], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch { return false; }
}

const cliProcessState = { 'claude-code': false, 'codex': false };

function pollCliProcesses() {
  const checks = [
    // 'claude' is the exact binary name when running `claude` CLI
    { agentId: 'claude-code', names: ['claude'], patterns: ['@anthropic-ai/claude-code', 'claude-code/dist'] },
    { agentId: 'codex',       names: ['codex'],  patterns: ['@openai/codex', 'codex/dist'] },
  ];
  for (const { agentId, names, patterns } of checks) {
    const running = names.some((n) => isProcessNameRunning(n)) || patterns.some((p) => isCliRunning(p));
    const was = cliProcessState[agentId];
    if (running && !was) {
      cliProcessState[agentId] = true;
      console.log(`[cli] ${agentId} process detected`);
      io.emit('agentActive', { agentId });
    } else if (!running && was) {
      cliProcessState[agentId] = false;
      console.log(`[cli] ${agentId} process gone`);
      io.emit('agentIdle', { agentId });
    }
  }
}

const PORT = process.env.PORT ?? 3002;

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  const ips = getLocalIPs();

  console.log('\n====================================');
  console.log('  2D Office — Multiplayer Server');
  console.log('====================================');
  console.log(`\n  Socket.io listening on port ${PORT}`);
  console.log('\n  LAN access (share one of these):');
  if (ips.length === 0) {
    console.log('    (no external interfaces found)');
  } else {
    ips.forEach((ip) => console.log(`    http://${ip}:5174`));
  }
  console.log('\n  Vite dev server: npm run dev');
  console.log('====================================\n');

  // Start watchers for all known agent directories
  Object.keys(AGENT_DIR_MAP).forEach(startAgentWatcher);
  resolveDiscordChannels();

  // Start CLI process polling (claude-code / codex running anywhere on system)
  setTimeout(pollCliProcesses, 2_000);
  setInterval(pollCliProcesses, 10_000);
});
