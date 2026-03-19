import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { CAST } from '../data/cast';
import { SCENES, SCENES_BY_ID } from '../data/scenes';

// ── Virtual canvas dimensions (scale to fit actual screen) ──────
const VW = 960;
const VH = 580;

// ── Building layout (virtual pixel coords) ──────────────────────
const BLD_X   = 32;   // left wall X
const BLD_TOP = 50;   // roof peak Y
const BLD_W   = 890;  // total building width
const ROOF_H  = 46;   // roof section height
const FLOOR_H = 148;  // height of each floor (interior + slab)
const SLAB_H  = 7;    // floor slab thickness
const NUM_FL  = 3;
const DEPT_W  = 28;   // left dept tab width
const ELEV_W  = 50;   // elevator shaft width
const ELEV_X  = BLD_X + BLD_W - ELEV_W; // = 872

function floorTop(f: number): number {
  return BLD_TOP + ROOF_H + (NUM_FL - 1 - f) * FLOOR_H;
}
function floorGround(f: number): number {
  return floorTop(f) + FLOOR_H;
}
// Carpet surface Y (just above the floor slab)
function carpetY(f: number): number {
  return floorGround(f) - SLAB_H;
}

// ── Agent definitions ────────────────────────────────────────────
type AgentId =
  | 'main' | 'research' | 'claude-code' | 'claude-opus'
  | 'codex' | 'deepseek-coder' | 'mistral' | 'llama3' | 'qwen-mini';

interface AgentDef {
  id: AgentId;
  name: string;
  model: string;
  color: string;
  floor: number;   // 0 = bottom (support), 1 = middle (eng), 2 = top (exec)
  deskX: number;   // virtual X of the worker center within the building
}

const AGENTS: AgentDef[] = [
  // Floor 2: Executive suite
  { id: 'main',           name: 'main',        model: 'gpt-5',             color: '#fbbf24', floor: 2, deskX: 128 },
  { id: 'claude-opus',    name: 'claude-opus',  model: 'claude-opus-4-6',   color: '#a78bfa', floor: 2, deskX: 315 },
  // Floor 1: Engineering
  { id: 'research',       name: 'research',     model: 'kimi-k2.5',         color: '#38bdf8', floor: 1, deskX: 120 },
  { id: 'claude-code',    name: 'claude-code',  model: 'claude-sonnet-4-6', color: '#60a5fa', floor: 1, deskX: 292 },
  { id: 'codex',          name: 'codex',        model: 'gpt-5.1-codex',     color: '#4ade80', floor: 1, deskX: 464 },
  { id: 'deepseek-coder', name: 'deepseek',     model: 'deepseek-v2:16b',   color: '#f97316', floor: 1, deskX: 636 },
  // Floor 0: Support
  { id: 'mistral',        name: 'mistral',      model: 'mistral:latest',    color: '#94a3b8', floor: 0, deskX: 148 },
  { id: 'llama3',         name: 'llama3',       model: 'llama3:latest',     color: '#fb923c', floor: 0, deskX: 328 },
  { id: 'qwen-mini',      name: 'qwen-mini',    model: 'qwen2.5:1.5b',      color: '#e879f9', floor: 0, deskX: 508 },
];

const PACKET_FROM: Partial<Record<AgentId, AgentId>> = {
  'claude-code':    'main',
  'research':       'main',
  'claude-opus':    'main',
  'codex':          'claude-code',
  'deepseek-coder': 'claude-code',
  'mistral':        'main',
  'llama3':         'main',
  'qwen-mini':      'main',
};

// ── Activity / amenity constants ─────────────────────────────────
const FLOOR_AMENITIES: Record<number, { waterX: number; bathroomX: number }> = {
  2: { waterX: 440, bathroomX: 378 },
  1: { waterX: 748, bathroomX: 686 },
  0: { waterX: 690, bathroomX: 628 },
};
// Wander range [minX, maxX] per floor (stays within the occupied office area)
const FLOOR_WANDER: Record<number, [number, number]> = {
  2: [80, 460],
  1: [80, 740],
  0: [80, 680],
};
const AWAY_MIN  = 4;
const AWAY_MAX  = 14;
const NEXT_MIN  = 8;
const NEXT_MAX  = 28;
const WALK_TIME = 2.0;

const ELEVATOR_TIME = 1.8;  // seconds per floor traversed

// Compute elevator car top-Y for a fractional floor value (0=bottom, 2=top)
function carTopYForFloor(f: number): number {
  const y0 = floorTop(0) + SLAB_H + 2;
  const y1 = floorTop(1) + SLAB_H + 2;
  const y2 = floorTop(2) + SLAB_H + 2;
  if (f <= 1) return y0 + (y1 - y0) * f;
  return y1 + (y2 - y1) * (f - 1);
}

// ── Animation state ──────────────────────────────────────────────
type Activity =
  | 'desk'
  | 'walking_away' | 'away' | 'walking_back'           // desk-level activities
  | 'walking_to_elevator' | 'in_elevator'               // going to another floor
  | 'walking_from_elevator' | 'exploring'               // on foreign floor
  | 'walking_back_to_elevator' | 'in_elevator_return'   // returning home
  | 'walking_to_desk'                                   // last leg home
  | 'walking_to_conv' | 'chatting';                     // NPC conversation

interface NpcAnim {
  isActive: boolean;
  workTimer: number;
  idleTimer: number;
  activity: Activity;
  activityTarget: 'water' | 'bathroom' | 'wander' | 'elevator' | null;
  walkProgress: number;
  walkFromX: number;   // X where the current walk segment started
  awayTimer: number;
  nextActivityIn: number;
  personX: number;
  wanderX: number;
  currentFloor: number;        // floor agent is currently on (changes when elevator used)
  elevFromFloor: number;
  elevToFloor: number;
  elevProgress: number;        // 0→1 during elevator ride
  convMeetX?: number;          // target X when walking to a conversation spot
  convFacingLeft?: boolean;    // face left while chatting (rightmost participant)
}

interface Packet {
  fromX: number; fromY: number;
  toX: number;   toY: number;
  color: string;
  progress: number;
  burst: number;
}

// ── Helpers ──────────────────────────────────────────────────────
function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Chat bubble helpers ───────────────────────────────────────────
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars - 1) + '…' : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Map canvas AgentId → cast member id
const AGENT_TO_CAST: Partial<Record<AgentId, string>> = {
  'main':          'main',
  'claude-opus':   'opus',
  'research':      'kimi',
  'claude-code':   'claude_code',
  'codex':         'codex',
  'mistral':       'mistral',
  'llama3':        'llama',
  'qwen-mini':     'qwen',
};

// Reverse cast-id → AgentId (used when filtering scene dialogue)
const CAST_TO_AGENT: Partial<Record<string, AgentId>> = {
  'main':        'main',
  'opus':        'claude-opus',
  'kimi':        'research',
  'claude_code': 'claude-code',
  'codex':       'codex',
  'mistral':     'mistral',
  'llama':       'llama3',
  'qwen':        'qwen-mini',
};

interface ConvTemplate {
  sceneId: string;
  floor: number;
  participants: AgentId[];
  meetXs: Partial<Record<AgentId, number>>;
  castFilter: string[];  // which cast IDs to include from the scene dialogue
}

// Conversation setups: pairs/groups that will walk together and do a scene
const CONV_TEMPLATES: ConvTemplate[] = [
  // Floor 2: main ↔ claude-opus
  { sceneId: 'kimi_overbooked', floor: 2, participants: ['main', 'claude-opus'],
    meetXs: { 'main': 185, 'claude-opus': 255 }, castFilter: ['main', 'opus'] },
  { sceneId: 'new_ticket',      floor: 2, participants: ['main', 'claude-opus'],
    meetXs: { 'main': 185, 'claude-opus': 255 }, castFilter: ['main', 'opus'] },
  { sceneId: 'budget_meeting',  floor: 2, participants: ['main', 'claude-opus'],
    meetXs: { 'main': 185, 'claude-opus': 255 }, castFilter: ['main', 'opus'] },
  // Floor 1: claude-code ↔ codex
  { sceneId: 'code_review',     floor: 1, participants: ['claude-code', 'codex'],
    meetXs: { 'claude-code': 370, 'codex': 440 }, castFilter: ['claude_code', 'codex'] },
  { sceneId: 'cron_broke',      floor: 1, participants: ['claude-code', 'codex'],
    meetXs: { 'claude-code': 370, 'codex': 440 }, castFilter: ['claude_code', 'codex'] },
  // Floor 1: research ↔ claude-code
  { sceneId: 'kimi_overbooked', floor: 1, participants: ['research', 'claude-code'],
    meetXs: { 'research': 185, 'claude-code': 255 }, castFilter: ['kimi', 'claude_code'] },
  { sceneId: 'budget_meeting',  floor: 1, participants: ['research', 'claude-code'],
    meetXs: { 'research': 185, 'claude-code': 255 }, castFilter: ['kimi', 'claude_code'] },
  // Floor 0: all three support agents
  { sceneId: 'morning_standup', floor: 0, participants: ['mistral', 'llama3', 'qwen-mini'],
    meetXs: { 'mistral': 230, 'llama3': 330, 'qwen-mini': 420 }, castFilter: ['mistral', 'llama', 'qwen'] },
  { sceneId: 'cron_broke',      floor: 0, participants: ['qwen-mini', 'llama3', 'mistral'],
    meetXs: { 'qwen-mini': 230, 'llama3': 330, 'mistral': 420 }, castFilter: ['qwen', 'llama', 'mistral'] },
  // Floor 0: mistral + llama
  { sceneId: 'budget_meeting',  floor: 0, participants: ['mistral', 'llama3'],
    meetXs: { 'mistral': 240, 'llama3': 320 }, castFilter: ['mistral', 'llama'] },
];

interface ConvGroup {
  template: ConvTemplate;
  lines: Array<{ agentId: AgentId; text: string }>;
  lineIndex: number;
  lineTimer: number;
  phase: 'walking' | 'chatting' | 'returning';
}

const DEEPSEEK_LINES = [
  'Running inference.',
  'Context window: nominal.',
  'Diff generated.',
  'Compilation done.',
  'Throughput steady.',
  'Output finalized.',
  'Checking edge cases.',
  'Model loaded.',
];

// Build dialogue pool from scenes + cast example lines (IIFE so it runs once)
const DIALOGUE_POOL: Record<string, string[]> = (() => {
  const pool: Record<string, string[]> = {};
  for (const scene of SCENES) {
    for (const line of scene.dialogue) {
      if (!pool[line.speaker]) pool[line.speaker] = [];
      pool[line.speaker].push(line.text);
    }
  }
  for (const cast of CAST) {
    if (!pool[cast.id]) pool[cast.id] = [];
    if (!pool[cast.id].includes(cast.exampleLine)) {
      pool[cast.id].unshift(cast.exampleLine);
    }
  }
  return pool;
})();

function getAgentLines(agentId: AgentId): string[] {
  if (agentId === 'deepseek-coder') return DEEPSEEK_LINES;
  const castId = AGENT_TO_CAST[agentId];
  if (!castId) return [];
  return DIALOGUE_POOL[castId] ?? [];
}

interface ChatBubble {
  lines: string[];
  text: string;
  displayTimer: number;
  displayDuration: number;
  pauseTimer: number;
  alpha: number;
}

// Draw one seated worker + their workstation (side-view, Corp Inc. style)
// cx = virtual X center of worker, ground = carpet surface Y
function drawWorkstation(
  ctx: CanvasRenderingContext2D,
  def: AgentDef,
  isActive: boolean,
  clockTime: number,
  idleTimer: number,
  showPerson = true,
): void {
  const cx     = def.deskX;
  const ground = carpetY(def.floor);
  const color  = def.color;

  // ── Chair (drawn first, behind worker) ─────────────────────────
  ctx.fillStyle = '#3A6A98';
  ctx.fillRect(cx + 10, ground - 84, 8, 48);          // back
  ctx.fillStyle = '#4A7AAA';
  ctx.fillRect(cx - 16, ground - 38, 30, 8);           // seat
  ctx.fillStyle = '#6A9ABB';
  ctx.fillRect(cx - 14, ground - 50, 6, 14);           // left arm rest
  ctx.fillStyle = '#7AAABB';
  ctx.fillRect(cx - 12, ground - 30, 5, 22);           // front leg
  ctx.fillRect(cx + 14, ground - 30, 5, 22);           // back leg

  // ── Desk (to the left of worker, side-view) ─────────────────────
  // Pedestal/cabinet
  ctx.fillStyle = '#7A9AB5';
  ctx.fillRect(cx - 74, ground - 62, 22, 52);
  ctx.strokeStyle = '#5A7A95';
  ctx.lineWidth = 0.8;
  // Drawer lines
  ctx.beginPath(); ctx.moveTo(cx - 74, ground - 44); ctx.lineTo(cx - 52, ground - 44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 74, ground - 28); ctx.lineTo(cx - 52, ground - 28); ctx.stroke();
  // Drawer handle nubs
  ctx.fillStyle = '#C0D4E4';
  ctx.fillRect(cx - 65, ground - 36, 6, 3);
  ctx.fillRect(cx - 65, ground - 20, 6, 3);
  // Desk surface
  ctx.fillStyle = '#B8D0E4';
  ctx.fillRect(cx - 76, ground - 68, 82, 8);
  ctx.fillStyle = '#88A8C0';
  ctx.fillRect(cx - 76, ground - 68, 82, 2);          // top edge shadow

  // ── Monitor ────────────────────────────────────────────────────
  const monX = cx - 64;
  const monY = ground - 98;
  ctx.fillStyle = '#1A2A40';
  ctx.fillRect(monX, monY, 34, 30);                    // body
  ctx.fillStyle = isActive ? '#1B5AA0' : '#0A1525';
  ctx.fillRect(monX + 2, monY + 2, 30, 23);            // screen
  if (isActive) {
    ctx.globalAlpha = 0.2 + Math.sin(clockTime * 2.5) * 0.08;
    ctx.fillStyle = '#4A98E8';
    ctx.fillRect(monX + 2, monY + 2, 30, 23);
    ctx.globalAlpha = 1;
    // Scroll lines on screen
    ctx.strokeStyle = rgba('#88C8FF', 0.4);
    ctx.lineWidth = 1;
    for (let li = 0; li < 4; li++) {
      const ly = monY + 5 + li * 5;
      ctx.beginPath(); ctx.moveTo(monX + 4, ly); ctx.lineTo(monX + 28, ly); ctx.stroke();
    }
  }
  // Stand
  ctx.fillStyle = '#304A60';
  ctx.fillRect(monX + 13, ground - 68, 8, 4);
  ctx.fillRect(monX + 8,  ground - 66, 18, 2);

  // ── Keyboard ───────────────────────────────────────────────────
  ctx.fillStyle = '#283848';
  ctx.fillRect(cx - 52, ground - 62, 38, 5);
  // Key rows hint
  ctx.fillStyle = rgba('#88A8C0', 0.4);
  ctx.fillRect(cx - 50, ground - 61, 34, 1);
  ctx.fillRect(cx - 50, ground - 59, 30, 1);

  // ── Coffee mug (idle only) ─────────────────────────────────────
  if (!isActive) {
    ctx.fillStyle = '#6A3818';
    ctx.fillRect(cx + 4, ground - 70, 10, 11);         // mug body
    ctx.fillStyle = '#F8F0E0';
    ctx.beginPath();
    ctx.arc(cx + 9, ground - 66, 4, Math.PI, 0);      // coffee surface
    ctx.fill();
    // Handle
    ctx.strokeStyle = '#6A3818';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx + 15, ground - 64, 4, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  }

  // ── Person (seated, side-profile, facing left toward monitor) ──
  if (showPerson) {
  const headBob = isActive ? Math.sin(clockTime * 7) * 1.2 : 0;
  const headCX  = cx + 2;
  const headCY  = ground - 90 + headBob;

  // Legs
  ctx.fillStyle = '#252535';
  ctx.fillRect(cx - 10, ground - 36, 8, 28);
  ctx.fillRect(cx + 2,  ground - 36, 8, 28);
  // Shoes
  ctx.fillStyle = '#151525';
  ctx.fillRect(cx - 14, ground - 9,  12, 6);
  ctx.fillRect(cx + 2,  ground - 9,  12, 6);

  // Torso
  ctx.fillStyle = color;
  ctx.fillRect(cx - 13, ground - 72, 21, 34);
  // Shirt detail (collar stripe)
  ctx.fillStyle = rgba(color, 0.45);
  ctx.fillRect(cx - 2, ground - 72, 5, 10);

  // Arms
  if (isActive) {
    // Typing: arms reaching forward (left) to keyboard
    ctx.fillStyle = color;
    ctx.fillRect(cx - 32, ground - 63, 21, 7);         // arm reaching
    ctx.fillStyle = '#F5CBA7';
    ctx.fillRect(cx - 38, ground - 63, 8, 6);          // hand on keyboard
    ctx.fillStyle = color;
    ctx.fillRect(cx + 8,  ground - 70, 7, 18);         // right arm at side
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(cx - 22, ground - 70, 9, 22);         // left arm relaxed
    ctx.fillRect(cx + 8,  ground - 70, 9, 22);         // right arm relaxed
  }

  // Head
  ctx.fillStyle = '#F5CBA7';
  ctx.beginPath();
  ctx.ellipse(headCX, headCY, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hair (agent color)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(headCX - 1, headCY - 7, 11, 8, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // Eye (side profile — one eye visible)
  ctx.fillStyle = '#1A1A28';
  ctx.beginPath();
  ctx.arc(headCX + 7, headCY, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Eyebrow
  ctx.strokeStyle = rgba('#2A2A38', 0.7);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(headCX + 3, headCY - 5);
  ctx.lineTo(headCX + 11, headCY - 6);
  ctx.stroke();
  } // end showPerson (body)

  // ── Productivity bar (above monitor) ───────────────────────────
  const barX    = cx - 75;
  const barY    = monY - 18;
  const barW    = 68;
  const barFill = isActive
    ? 0.68 + Math.sin(clockTime * 2.2) * 0.14
    : 0.04 + Math.sin(idleTimer * 0.4) * 0.02;
  const barColor = isActive ? '#4ADE80' : '#3A4A5A';

  ctx.fillStyle = '#8A9AAA';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PRODUCTIVITY', barX + barW / 2, barY - 2);

  ctx.fillStyle = '#0F1E2E';
  ctx.fillRect(barX - 1, barY, barW + 2, 10);
  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY + 1, Math.round(barW * barFill), 8);
  ctx.fillStyle = '#EEF';
  ctx.font = '6px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    isActive ? `${Math.round(barFill * 100)}%` : 'IDLE',
    barX + barW / 2,
    barY + 5,
  );

  // ── Status indicator above head ─────────────────────────────────
  if (showPerson) {
  const headCX2 = cx + 2;
  const headCY2 = (isActive ? ground - 90 + Math.sin(clockTime * 7) * 1.2 : ground - 90);
  if (isActive) {
    // Typing dots
    for (let i = 0; i < 3; i++) {
      const phase = (clockTime * 5 + i * 0.7) % (Math.PI * 2);
      const dy    = -Math.abs(Math.sin(phase)) * 7;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(headCX2 - 6 + i * 7, headCY2 - 22 + dy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    // Zzz
    const alpha = 0.45 + Math.sin(idleTimer * 1.1) * 0.25;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('z',  headCX2 + 12, headCY2 - 14 - Math.sin(idleTimer) * 2);
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText('z',  headCX2 + 18, headCY2 - 20 - Math.sin(idleTimer) * 2);
    ctx.globalAlpha = 1;
  }
  } // end showPerson (status)

  // ── Name tag + model below desk ─────────────────────────────────
  const nameStr = def.name;
  ctx.font = 'bold 10px monospace';
  const nw = ctx.measureText(nameStr).width + 8;
  ctx.fillStyle = '#0D1A28';
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.roundRect(cx - nw / 2, ground + 5, nw, 14, 3);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = isActive ? color : '#B0C8DC';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nameStr, cx, ground + 12);

  ctx.font = '7px monospace';
  ctx.fillStyle = rgba(color, 0.65);
  ctx.fillText(def.model, cx, ground + 23);
  ctx.textBaseline = 'alphabetic';
}

// ── Water cooler fixture ─────────────────────────────────────────
function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, floor: number): void {
  const ground = carpetY(floor);
  ctx.fillStyle = '#3A7ABB';
  ctx.fillRect(x - 10, ground - 10, 20, 10);           // base
  ctx.fillStyle = '#4A90D9';
  ctx.fillRect(x - 8, ground - 50, 16, 40);            // body
  ctx.fillStyle = '#E84040';
  ctx.fillRect(x - 5, ground - 28, 4, 5);              // hot spigot
  ctx.fillStyle = '#4040E8';
  ctx.fillRect(x + 1,  ground - 28, 4, 5);             // cold spigot
  ctx.fillStyle = rgba('#A8D8F8', 0.75);
  ctx.fillRect(x - 6, ground - 84, 12, 36);            // water bottle
  ctx.fillStyle = '#1A5A9A';
  ctx.fillRect(x - 4, ground - 86, 8, 4);              // bottle cap
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '5px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H₂O', x, ground - 38);
}

// ── Bathroom door ────────────────────────────────────────────────
function drawBathroomDoor(ctx: CanvasRenderingContext2D, x: number, floor: number): void {
  const ground = carpetY(floor);
  const doorH = 84;
  const doorW = 22;
  ctx.fillStyle = '#4A6A88';
  ctx.fillRect(x - doorW / 2 - 2, ground - doorH - 2, doorW + 4, doorH + 2); // frame
  ctx.fillStyle = '#7A9AB5';
  ctx.fillRect(x - doorW / 2, ground - doorH, doorW, doorH);                  // door
  ctx.fillStyle = '#6A8AA5';
  ctx.fillRect(x - doorW / 2 + 3, ground - doorH + 5, doorW - 6, doorH - 18); // inset panel
  ctx.fillStyle = '#C8D8E4';
  ctx.beginPath();
  ctx.arc(x + doorW / 2 - 5, ground - 40, 3, 0, Math.PI * 2);
  ctx.fill();                                                                   // handle
  ctx.fillStyle = '#1A3A5A';
  ctx.fillRect(x - 10, ground - doorH - 14, 20, 12);                          // WC plaque bg
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WC', x, ground - doorH - 8);
}

// ── Standing / walking person (away from desk) ───────────────────
function drawStandingPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  floor: number,
  color: string,
  clockTime: number,
  activity: 'walking_away' | 'away' | 'walking_back',
  activityTarget: 'water' | 'bathroom' | null,
  facingLeft = false,
): void {
  const ground = carpetY(floor);
  const isWalking = activity === 'walking_away' || activity === 'walking_back';
  const legSwing  = isWalking ? Math.sin(clockTime * 9) * 7 : 0;
  const headBob   = isWalking ? Math.abs(Math.sin(clockTime * 9)) * 1.5 : 0;
  const drinking  = activity === 'away' && activityTarget === 'water';

  // Legs
  ctx.fillStyle = '#252535';
  ctx.fillRect(x - 6, ground - 32 + legSwing,  6, 28);
  ctx.fillRect(x + 1, ground - 32 - legSwing,  6, 28);
  // Shoes
  ctx.fillStyle = '#151525';
  ctx.fillRect(x - 9, ground - 7, 10, 5);
  ctx.fillRect(x + 1, ground - 7, 10, 5);
  // Torso
  ctx.fillStyle = color;
  ctx.fillRect(x - 8, ground - 64, 16, 32);
  // Arms
  if (drinking) {
    ctx.fillStyle = color;
    ctx.fillRect(x - 8, ground - 62, 6, 14);            // left arm down
    ctx.fillRect(x + 3, ground - 68, 6, 20);            // right arm raised
    ctx.fillStyle = '#F5CBA7';
    ctx.fillRect(x + 8,  ground - 70, 6, 5);            // hand holding cup
    ctx.fillStyle = '#A8D8F8';
    ctx.fillRect(x + 9,  ground - 74, 5, 6);            // cup
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x - 13, ground - 62, 6, 18);
    ctx.fillRect(x + 8,  ground - 62, 6, 18);
  }
  // Head
  const hx = facingLeft ? x - 2 : x + (activity === 'walking_back' ? -2 : 2);
  ctx.fillStyle = '#F5CBA7';
  ctx.beginPath();
  ctx.ellipse(hx, ground - 78 + headBob, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hair
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(hx - 1, ground - 85 + headBob, 9, 7, 0, Math.PI, Math.PI * 2);
  ctx.fill();
}

// ── Component ─────────────────────────────────────────────────────
export const OfficeCanvas = () => {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const npcAnims     = useRef<Map<AgentId, NpcAnim>>(new Map());
  const packets      = useRef<Packet[]>([]);
  const chatBubbles  = useRef<Map<AgentId, ChatBubble>>(new Map());
  const rafId        = useRef<number>(0);
  const lastTime     = useRef<number>(0);
  const clock        = useRef<number>(0);
  const elevCarFloor = useRef<number>(0);  // animated elevator car position (float floor)
  const convGroup    = useRef<ConvGroup | null>(null);
  const nextConvIn   = useRef<number>(20 + Math.random() * 30);

  // Init chat bubble state once
  if (chatBubbles.current.size === 0) {
    for (const a of AGENTS) {
      const lines = getAgentLines(a.id);
      if (lines.length === 0) continue;
      chatBubbles.current.set(a.id, {
        lines,
        text: '',
        displayTimer: 0,
        displayDuration: 0,
        pauseTimer: 3 + Math.random() * 20,  // stagger initial appearances
        alpha: 0,
      });
    }
  }

  // Init NPC animation state once
  if (npcAnims.current.size === 0) {
    for (const a of AGENTS) {
      npcAnims.current.set(a.id, {
        isActive: false,
        workTimer: 0,
        idleTimer: Math.random() * 100,
        activity: 'desk',
        activityTarget: null,
        walkProgress: 0,
        awayTimer: 0,
        nextActivityIn: 2 + Math.random() * 20,
        personX: a.deskX,
        walkFromX: a.deskX,
        wanderX: a.deskX,
        currentFloor: a.floor,
        elevFromFloor: a.floor,
        elevToFloor: a.floor,
        elevProgress: 0,
      });
    }
  }

  const processStoreEvents = useCallback(() => {
    const store = useGameStore.getState();

    if (store.agentJobQueue.length > 0) {
      useGameStore.setState({ agentJobQueue: [] });
      for (const agentId of store.agentJobQueue) {
        const def  = AGENTS.find((a) => a.id === agentId);
        const anim = npcAnims.current.get(agentId as AgentId);
        if (!def || !anim) continue;
        anim.isActive = true;
        // Snap back to desk immediately if away (even if on another floor)
        if (anim.activity !== 'desk') {
          anim.activity     = 'desk';
          anim.activityTarget = null;
          anim.walkProgress = 0;
          anim.currentFloor = def.floor;
          anim.personX      = def.deskX;
          anim.nextActivityIn = NEXT_MIN + Math.random() * (NEXT_MAX - NEXT_MIN);
        }
        // Spawn packet from sender's head
        const fromId = PACKET_FROM[agentId as AgentId];
        if (fromId) {
          const fromDef = AGENTS.find((a) => a.id === fromId);
          if (fromDef) {
            packets.current.push({
              fromX: fromDef.deskX,
              fromY: carpetY(fromDef.floor) - 90,
              toX:   def.deskX,
              toY:   carpetY(def.floor) - 90,
              color: def.color,
              progress: 0,
              burst: 0,
            });
          }
        }
      }
    }

    if (store.agentIdleQueue.length > 0) {
      useGameStore.setState({ agentIdleQueue: [] });
      for (const agentId of store.agentIdleQueue) {
        const anim = npcAnims.current.get(agentId as AgentId);
        if (!anim) continue;
        anim.isActive = false;
        // Give them a full desk cooldown before wandering again
        anim.nextActivityIn = NEXT_MIN + Math.random() * (NEXT_MAX - NEXT_MIN);
        if (agentId === 'claude-code') {
          for (const dep of ['codex', 'deepseek-coder'] as AgentId[]) {
            const da = npcAnims.current.get(dep);
            if (da) da.isActive = false;
          }
        }
      }
    }
  }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D, actualW: number, actualH: number) => {
    const scale = Math.min(actualW / VW, actualH / VH);
    const offX  = (actualW - VW * scale) / 2;
    const offY  = (actualH - VH * scale) / 2;

    ctx.clearRect(0, 0, actualW, actualH);

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, actualH);
    sky.addColorStop(0, '#7EB0E0');
    sky.addColorStop(1, '#C5DCF5');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, actualW, actualH);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    const buildingBottom = BLD_TOP + ROOF_H + NUM_FL * FLOOR_H; // = 540

    // ── Clouds ──────────────────────────────────────────────────────
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#FFFFFF';
    for (const [cx2, cy2, r] of [[90,22,26],[220,14,18],[710,20,30],[870,12,16]] as [number,number,number][]) {
      ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx2 + r * 0.7, cy2 + 4, r * 0.65, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx2 - r * 0.5, cy2 + 5, r * 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Ground + sidewalk ────────────────────────────────────────────
    ctx.fillStyle = '#5A8A48';
    ctx.fillRect(0, buildingBottom + 14, VW, VH - buildingBottom - 14);
    ctx.fillStyle = '#A8B4BC';
    ctx.fillRect(BLD_X - 24, buildingBottom, BLD_W + 48, 16);
    // Sidewalk tile lines
    ctx.strokeStyle = '#909CA4';
    ctx.lineWidth = 0.6;
    for (let sx = BLD_X - 24; sx < BLD_X + BLD_W + 24; sx += 40) {
      ctx.beginPath(); ctx.moveTo(sx, buildingBottom); ctx.lineTo(sx, buildingBottom + 16); ctx.stroke();
    }
    // Entry steps
    ctx.fillStyle = '#98A4AC';
    ctx.fillRect(BLD_X + 108, buildingBottom + 16, 84, 8);
    ctx.fillRect(BLD_X + 116, buildingBottom + 24, 68, 6);

    // ── Building outer shell ─────────────────────────────────────────
    ctx.fillStyle = '#5A6878';
    ctx.fillRect(BLD_X - 6, BLD_TOP - 4, BLD_W + 12, buildingBottom - BLD_TOP + 6);
    ctx.fillStyle = '#7A8E9E';
    ctx.fillRect(BLD_X, BLD_TOP, BLD_W, buildingBottom - BLD_TOP);

    // Horizontal floor separator lines (exterior view)
    for (let f = 0; f <= NUM_FL; f++) {
      const fy = BLD_TOP + ROOF_H + f * FLOOR_H;
      ctx.fillStyle = '#4A5A68';
      ctx.fillRect(BLD_X, fy - 1, BLD_W, SLAB_H + 1);
    }

    // ── Floor interiors ──────────────────────────────────────────────
    const floorCfg = [
      { f: 2, label: 'EXECUTIVE',   carpet: '#C8DFF2', dept: '#1E4E8A', wall: '#EAF2FA' },
      { f: 1, label: 'ENGINEERING', carpet: '#C2E8CC', dept: '#1E6A3E', wall: '#EAFAF0' },
      { f: 0, label: 'SUPPORT',     carpet: '#F0E0C8', dept: '#7A4010', wall: '#FAF4EA' },
    ];

    for (const fc of floorCfg) {
      const fy    = floorTop(fc.f);
      const iTop  = fy + SLAB_H;
      const iH    = FLOOR_H - SLAB_H;
      const iRight = ELEV_X;
      const iW    = iRight - BLD_X - DEPT_W;

      // Interior back wall
      ctx.fillStyle = fc.wall;
      ctx.fillRect(BLD_X + DEPT_W, iTop, iW, iH);

      // Carpet strip
      ctx.fillStyle = fc.carpet;
      ctx.fillRect(BLD_X + DEPT_W, iTop + iH - 24, iW, 24);

      // Baseboard
      ctx.fillStyle = '#6A7A88';
      ctx.fillRect(BLD_X + DEPT_W, iTop + iH - SLAB_H, iW, SLAB_H);

      // Skirting on left dept wall
      ctx.fillStyle = '#7A8A98';
      ctx.fillRect(BLD_X + DEPT_W, iTop + iH - SLAB_H, 2, SLAB_H);

      // Department tab (left strip)
      ctx.fillStyle = fc.dept;
      ctx.fillRect(BLD_X, iTop, DEPT_W, iH);
      ctx.save();
      ctx.translate(BLD_X + 14, iTop + iH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fc.label, 0, 0);
      ctx.restore();

      // Floor number badge (top-right of interior)
      ctx.fillStyle = '#2A3A4A';
      ctx.fillRect(iRight - 28, iTop + 6, 24, 15);
      ctx.fillStyle = '#AABBCC';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`F${NUM_FL - fc.f}`, iRight - 16, iTop + 14);

      // Ceiling light fixtures
      for (let lx = BLD_X + DEPT_W + 80; lx < iRight - 70; lx += 170) {
        ctx.fillStyle = '#C0D0DC';
        ctx.fillRect(lx - 28, iTop + SLAB_H, 56, 5);
        ctx.fillStyle = '#FFFDE8';
        ctx.fillRect(lx - 26, iTop + SLAB_H + 1, 52, 3);
        // Light cone
        const lgr = ctx.createLinearGradient(lx, iTop + SLAB_H + 5, lx, iTop + iH - 24);
        lgr.addColorStop(0, 'rgba(255,252,220,0.24)');
        lgr.addColorStop(1, 'rgba(255,252,220,0)');
        ctx.fillStyle = lgr;
        ctx.beginPath();
        ctx.moveTo(lx - 26, iTop + SLAB_H + 5);
        ctx.lineTo(lx + 26, iTop + SLAB_H + 5);
        ctx.lineTo(lx + 60, iTop + iH - 24);
        ctx.lineTo(lx - 60, iTop + iH - 24);
        ctx.closePath();
        ctx.fill();
      }

      // Window (right side, before elevator)
      const winX = iRight - 62;
      const winY = iTop + 16;
      const winW = 48;
      const winH = iH - 34;
      ctx.fillStyle = '#A8D0F8';
      ctx.globalAlpha = 0.7;
      ctx.fillRect(winX, winY, winW, winH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#608AAA';
      ctx.lineWidth = 2;
      ctx.strokeRect(winX, winY, winW, winH);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2); ctx.stroke();

      // Plant (corner before window)
      const px2  = iRight - 88;
      const pg   = carpetY(fc.f);
      ctx.fillStyle = '#5A7048';
      ctx.fillRect(px2 - 7, pg - 24, 14, 18);           // pot
      ctx.fillStyle = '#2E7828';
      ctx.beginPath(); ctx.arc(px2, pg - 34, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#246020';
      ctx.beginPath(); ctx.arc(px2 - 9, pg - 38, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#38922A';
      ctx.beginPath(); ctx.arc(px2 + 9, pg - 40, 9, 0, Math.PI * 2); ctx.fill();

      // ── Amenities: water cooler + bathroom door ──────────────────
      const am = FLOOR_AMENITIES[fc.f];
      drawBathroomDoor(ctx, am.bathroomX, fc.f);
      drawWaterCooler(ctx, am.waterX, fc.f);

      // ── Executive floor: meeting room (right half) ───────────────
      if (fc.f === 2) {
        const mrX = BLD_X + DEPT_W + 420;
        const mrW = iRight - (BLD_X + DEPT_W + 420) - 70;
        // Glass partition wall
        ctx.strokeStyle = '#90B8D8';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(mrX, iTop + 10);
        ctx.lineTo(mrX, iTop + iH - SLAB_H);
        ctx.stroke();
        ctx.setLineDash([]);
        // "BOARDROOM" label on glass
        ctx.fillStyle = rgba('#2A5A8A', 0.5);
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('BOARDROOM', mrX + 6, iTop + 22);
        // Conference table (side view)
        const tY = carpetY(2) - 52;
        ctx.fillStyle = '#B0C8DC';
        ctx.fillRect(mrX + 14, tY, mrW - 28, 10);     // table top
        ctx.fillStyle = '#88A8C0';
        ctx.fillRect(mrX + 14, tY + 10, 16, 40);       // left leg
        ctx.fillRect(mrX + mrW - 28 - 2, tY + 10, 16, 40); // right leg
        // Chairs at table
        for (let ci = 0; ci < 3; ci++) {
          const cx3 = mrX + 30 + ci * 38;
          ctx.fillStyle = '#3A6A98';
          ctx.fillRect(cx3 - 8, tY - 30, 16, 28);     // chair back
          ctx.fillStyle = '#4A7AAA';
          ctx.fillRect(cx3 - 10, tY - 4, 20, 6);      // seat
        }
        // Screen/whiteboard on wall
        ctx.fillStyle = '#1A2A3A';
        ctx.fillRect(mrX + 16, iTop + 30, 60, 40);
        ctx.fillStyle = '#1E4A7A';
        ctx.fillRect(mrX + 18, iTop + 32, 56, 36);
      }
    }

    // ── Elevator shaft ───────────────────────────────────────────────
    const elTopY = BLD_TOP + ROOF_H;
    const elBotY = buildingBottom;
    ctx.fillStyle = '#2E3E4E';
    ctx.fillRect(ELEV_X, elTopY, ELEV_W, elBotY - elTopY);
    // Guide rails
    ctx.strokeStyle = '#5A6A7A';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ELEV_X + 8, elTopY); ctx.lineTo(ELEV_X + 8, elBotY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ELEV_X + ELEV_W - 8, elTopY); ctx.lineTo(ELEV_X + ELEV_W - 8, elBotY); ctx.stroke();
    // Elevator car (animated position)
    const carTopY = carTopYForFloor(elevCarFloor.current);
    const carH2   = FLOOR_H - SLAB_H - 6;
    ctx.fillStyle = '#6A7A8A';
    ctx.fillRect(ELEV_X + 4, carTopY, ELEV_W - 8, carH2);
    ctx.fillStyle = '#3A4A5A';
    ctx.fillRect(ELEV_X + ELEV_W / 2 - 1, carTopY + 4, 2, carH2 - 8);
    ctx.fillStyle = '#AABBCC';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIFT', ELEV_X + ELEV_W / 2, carTopY + carH2 / 2);
    // Draw any agents currently riding the elevator
    for (const def of AGENTS) {
      const anim = npcAnims.current.get(def.id);
      if (!anim) continue;
      if (anim.activity !== 'in_elevator' && anim.activity !== 'in_elevator_return') continue;
      const px = ELEV_X + ELEV_W / 2;
      const ground = carTopY + carH2;
      ctx.fillStyle = '#252535';
      ctx.fillRect(px - 5, ground - 30, 5, 26); ctx.fillRect(px + 1, ground - 30, 5, 26);
      ctx.fillStyle = def.color;
      ctx.fillRect(px - 7, ground - 62, 15, 32);
      ctx.fillStyle = '#F5CBA7';
      ctx.beginPath(); ctx.ellipse(px + 1, ground - 75, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(px, ground - 82, 8, 6, 0, Math.PI, Math.PI * 2); ctx.fill();
    }
    // Up/down arrows on shaft
    ctx.fillStyle = '#7A8A9A';
    ctx.font = '10px sans-serif';
    ctx.fillText('▲', ELEV_X + ELEV_W / 2, elTopY + 14);
    ctx.fillText('▼', ELEV_X + ELEV_W / 2, elBotY - 8);

    // ── Roof ─────────────────────────────────────────────────────────
    // Parapet wall
    ctx.fillStyle = '#5A6878';
    ctx.fillRect(BLD_X - 8, BLD_TOP - 6, BLD_W + 16, ROOF_H + 6);
    // Roof surface
    ctx.fillStyle = '#4A5868';
    ctx.fillRect(BLD_X, BLD_TOP, BLD_W, ROOF_H - 2);
    // Rooftop details
    for (const [rx, rw, rh] of [[BLD_X + 60, 42, 28],[BLD_X + 180, 36, 22],[BLD_X + 640, 40, 26]] as [number,number,number][]) {
      ctx.fillStyle = '#3A4858';
      ctx.fillRect(rx, BLD_TOP + 6, rw, rh);
      // Vent grill lines
      ctx.strokeStyle = '#2A3848';
      ctx.lineWidth = 0.8;
      for (let vl = 0; vl < 3; vl++) {
        ctx.beginPath();
        ctx.moveTo(rx + 4, BLD_TOP + 10 + vl * 6);
        ctx.lineTo(rx + rw - 4, BLD_TOP + 10 + vl * 6);
        ctx.stroke();
      }
    }
    // Antenna
    ctx.strokeStyle = '#3A4858';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(BLD_X + BLD_W - 110, BLD_TOP);
    ctx.lineTo(BLD_X + BLD_W - 110, BLD_TOP - 30);
    ctx.stroke();
    ctx.fillStyle = '#E83030';
    ctx.beginPath();
    ctx.arc(BLD_X + BLD_W - 110, BLD_TOP - 30, 4, 0, Math.PI * 2);
    ctx.fill();

    // ── Company sign (Corp Inc. dark purple) ──────────────────────────
    const signW = 270;
    const signX = BLD_X + (BLD_W - signW) / 2;
    const signY = BLD_TOP + 7;
    ctx.fillStyle = '#0C073D';                           // Corp Inc. signature dark purple
    ctx.fillRect(signX, signY, signW, 34);
    ctx.fillStyle = '#1A2AD0';
    ctx.fillRect(signX + 2, signY + 2, signW - 4, 30);
    // Sign border
    ctx.strokeStyle = '#4A5AE8';
    ctx.lineWidth = 1;
    ctx.strokeRect(signX + 2, signY + 2, signW - 4, 30);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OPENCLAW CORP.', signX + signW / 2, signY + 17);

    // ── Workstations ─────────────────────────────────────────────────
    const activeAgents = useGameStore.getState().activeAgents;
    for (const def of AGENTS) {
      const anim = npcAnims.current.get(def.id);
      if (!anim) continue;
      const isActive = anim.isActive || activeAgents.has(def.id);
      const showPerson = !anim.activity || anim.activity === 'desk';
      drawWorkstation(ctx, def, isActive, clock.current, anim.idleTimer, showPerson);
    }

    // ── Away / walking persons ────────────────────────────────────
    for (const def of AGENTS) {
      const anim = npcAnims.current.get(def.id);
      if (!anim || anim.activity === 'desk') continue;
      // Inside elevator car — drawn above with the car
      if (anim.activity === 'in_elevator' || anim.activity === 'in_elevator_return') continue;
      // Inside bathroom — not visible
      if (anim.activity === 'away' && anim.activityTarget === 'bathroom') continue;
      // Use currentFloor so explorer shows on the correct floor
      const drawFloor = anim.currentFloor ?? def.floor;
      const isChatting = anim.activity === 'chatting';
      const drawAct = (
        anim.activity === 'exploring' ||
        anim.activity === 'walking_from_elevator' ||
        anim.activity === 'walking_back_to_elevator' ||
        anim.activity === 'walking_to_desk' ||
        anim.activity === 'walking_to_conv'
      ) ? 'walking_away' : isChatting ? 'away' : anim.activity;
      drawStandingPerson(
        ctx, anim.personX, drawFloor, def.color, clock.current,
        drawAct as 'walking_away' | 'away' | 'walking_back',
        anim.activityTarget === 'wander' || anim.activityTarget === 'elevator' ? null : anim.activityTarget,
        isChatting && anim.convFacingLeft === true,
      );
    }

    // ── Chat bubbles ──────────────────────────────────────────────────
    {
      const BUBBLE_W  = 152;
      const PAD       = 7;
      const LINE_H    = 12;
      const TAIL_H    = 7;
      const TAIL_BASE = 10;
      const MAX_CHARS = 25;
      const RADIUS    = 5;

      type BubbleToDraw = {
        wrappedLines: string[];
        alpha: number;
        color: string;
        headX: number;
        tailTipY: number;
        bubH: number;
        bubX: number;
        top: number;
      };

      const toDraw: BubbleToDraw[] = [];

      for (const def of AGENTS) {
        const bubble = chatBubbles.current.get(def.id);
        if (!bubble || bubble.alpha <= 0 || !bubble.text) continue;
        const anim = npcAnims.current.get(def.id);
        // Skip agents not visible
        if (anim?.activity === 'in_elevator' || anim?.activity === 'in_elevator_return') continue;
        if (anim?.activity === 'away' && anim.activityTarget === 'bathroom') continue;

        const floor  = anim?.currentFloor ?? def.floor;
        const ground = carpetY(floor);

        let headX: number, headY: number;
        if (!anim || anim.activity === 'desk') {
          const bob = anim?.isActive ? Math.sin(clock.current * 7) * 1.2 : 0;
          headX = def.deskX + 2;
          headY = ground - 90 + bob;
        } else {
          headX = anim.personX;
          headY = ground - 78;
        }

        const wrappedLines = wrapText(bubble.text, MAX_CHARS);
        const bubH         = PAD * 2 + wrappedLines.length * LINE_H;
        const tailTipY     = headY - 18;
        const defaultTop   = tailTipY - TAIL_H - bubH - 2;
        // Clamp X so bubble stays within building interior
        const rawBubX = headX - BUBBLE_W / 2;
        const bubX    = Math.max(BLD_X + DEPT_W + 4, Math.min(ELEV_X - BUBBLE_W - 4, rawBubX));

        toDraw.push({ wrappedLines, alpha: bubble.alpha, color: def.color, headX, tailTipY, bubH, bubX, top: defaultTop });
      }

      // Overlap resolution: process bottom-of-screen first, push overlapping bubbles upward
      toDraw.sort((a, b) => b.tailTipY - a.tailTipY);
      for (let i = 0; i < toDraw.length; i++) {
        const b  = toDraw[i];
        const bX1 = b.bubX, bX2 = b.bubX + BUBBLE_W;
        for (let j = 0; j < i; j++) {
          const p  = toDraw[j];
          const pX1 = p.bubX, pX2 = p.bubX + BUBBLE_W;
          if (bX1 >= pX2 || bX2 <= pX1) continue; // no X overlap
          const bBot = b.top + b.bubH;
          const pBot = p.top + p.bubH;
          if (b.top < pBot && bBot > p.top) {
            b.top = p.top - b.bubH - 6;  // push b above p
          }
        }
      }

      // Render each bubble
      for (const b of toDraw) {
        const { wrappedLines, alpha, color, headX, tailTipY, bubH, bubX, top } = b;

        // Tail (triangle pointing down to agent's head area)
        ctx.globalAlpha = alpha * 0.88;
        ctx.fillStyle   = '#0D1A28';
        ctx.beginPath();
        ctx.moveTo(headX - TAIL_BASE / 2, top + bubH);
        ctx.lineTo(headX + TAIL_BASE / 2, top + bubH);
        ctx.lineTo(headX, tailTipY);
        ctx.closePath();
        ctx.fill();

        // Bubble background
        ctx.fillStyle   = '#0D1A28';
        ctx.globalAlpha = alpha * 0.88;
        ctx.beginPath();
        ctx.roundRect(bubX, top, BUBBLE_W, bubH, RADIUS);
        ctx.fill();

        // Colored border
        ctx.strokeStyle = color;
        ctx.lineWidth   = 1;
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.roundRect(bubX, top, BUBBLE_W, bubH, RADIUS);
        ctx.stroke();

        // Color accent dot (left edge)
        ctx.fillStyle   = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(bubX + PAD - 1, top + PAD + LINE_H / 2 - 1, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Text
        ctx.fillStyle     = '#DCE8F5';
        ctx.font          = '8px monospace';
        ctx.textAlign     = 'left';
        ctx.textBaseline  = 'top';
        for (let li = 0; li < wrappedLines.length; li++) {
          ctx.fillText(wrappedLines[li], bubX + PAD + 6, top + PAD + li * LINE_H);
        }

        ctx.globalAlpha  = 1;
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── Packet animations ─────────────────────────────────────────────
    for (const pkt of packets.current) {
      if (pkt.burst > 0) {
        const br = 24 * pkt.burst;
        ctx.globalAlpha = Math.max(0, 1 - pkt.burst) * 0.75;
        ctx.strokeStyle = pkt.color;
        ctx.lineWidth   = 2.5;
        ctx.beginPath();
        ctx.arc(pkt.toX, pkt.toY, br, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        const t2   = pkt.progress;
        const px3  = pkt.fromX + (pkt.toX - pkt.fromX) * t2;
        const py3  = pkt.fromY + (pkt.toY - pkt.fromY) * t2;
        const arc  = -60 * Math.sin(Math.PI * t2);

        // Trail
        for (let i = 1; i <= 3; i++) {
          const tp  = Math.max(0, t2 - i * 0.06);
          const tx3 = pkt.fromX + (pkt.toX - pkt.fromX) * tp;
          const ty3 = pkt.fromY + (pkt.toY - pkt.fromY) * tp;
          const ta  = -60 * Math.sin(Math.PI * tp);
          ctx.globalAlpha = 0.1 * (4 - i) / 3;
          ctx.fillStyle = pkt.color;
          ctx.beginPath();
          ctx.arc(tx3, ty3 + ta, 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Glow
        const gr2 = ctx.createRadialGradient(px3, py3 + arc, 0, px3, py3 + arc, 16);
        gr2.addColorStop(0, rgba(pkt.color, 0.9));
        gr2.addColorStop(1, rgba(pkt.color, 0));
        ctx.fillStyle = gr2;
        ctx.beginPath();
        ctx.arc(px3, py3 + arc, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px3, py3 + arc, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Remote players (visitor badges near entrance) ─────────────────
    const players = useGameStore.getState().players;
    const localId = useGameStore.getState().localPlayerId;
    let visX = BLD_X + 100;
    for (const pl of Object.values(players)) {
      if (pl.id === localId) continue;
      const vGround = buildingBottom - 4;
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(visX, vGround - 28, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pl.name.charAt(0).toUpperCase(), visX, vGround - 28);
      ctx.fillStyle = '#E87000';
      ctx.fillRect(visX - 16, vGround - 14, 32, 10);
      ctx.fillStyle = '#FFF';
      ctx.font = '6px monospace';
      ctx.fillText('VISITOR', visX, vGround - 9);
      ctx.fillStyle = '#2A3A4A';
      ctx.font = '8px sans-serif';
      ctx.fillText(pl.name, visX, vGround + 2);
      visX += 44;
    }

    ctx.restore();
  }, []);

  const loop = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const delta = Math.min(0.05, (ts - (lastTime.current || ts)) / 1000);
    lastTime.current = ts;
    clock.current += delta;

    processStoreEvents();

    for (const anim of npcAnims.current.values()) {
      anim.idleTimer += delta;
      if (anim.isActive) anim.workTimer += delta;
    }

    // ── Chat bubble timers ────────────────────────────────────────
    const BUBBLE_FADE = 0.6;
    for (const bubble of chatBubbles.current.values()) {
      if (bubble.pauseTimer > 0) {
        bubble.pauseTimer -= delta;
        bubble.alpha = 0;
        if (bubble.pauseTimer <= 0) {
          bubble.text = bubble.lines[Math.floor(Math.random() * bubble.lines.length)];
          bubble.displayDuration = 5 + Math.random() * 4;
          bubble.displayTimer    = bubble.displayDuration;
        }
      } else if (bubble.displayTimer > 0) {
        bubble.displayTimer -= delta;
        const elapsed = bubble.displayDuration - bubble.displayTimer;
        if (elapsed < BUBBLE_FADE) {
          bubble.alpha = elapsed / BUBBLE_FADE;
        } else if (bubble.displayTimer < BUBBLE_FADE) {
          bubble.alpha = bubble.displayTimer / BUBBLE_FADE;
        } else {
          bubble.alpha = 1;
        }
        if (bubble.displayTimer <= 0) {
          bubble.alpha      = 0;
          bubble.pauseTimer = 8 + Math.random() * 12;
        }
      }
    }

    // ── Activity state machine ────────────────────────────────────
    const activeAgents = useGameStore.getState().activeAgents;
    for (const def of AGENTS) {
      const anim = npcAnims.current.get(def.id);
      if (!anim) continue;
      const am = FLOOR_AMENITIES[def.floor];

      // Defensive re-init (handles HMR without component remount)
      if (!anim.activity) {
        anim.activity       = 'desk';
        anim.activityTarget = null;
        anim.walkProgress   = 0;
        anim.awayTimer      = 0;
        if (anim.nextActivityIn == null) anim.nextActivityIn = NEXT_MIN + Math.random() * (NEXT_MAX - NEXT_MIN);
        if (anim.personX       == null) anim.personX        = def.deskX;
        if (anim.walkFromX     == null) anim.walkFromX      = def.deskX;
        if (anim.wanderX       == null) anim.wanderX        = def.deskX;
        if (anim.currentFloor  == null) anim.currentFloor   = def.floor;
        if (anim.elevFromFloor == null) anim.elevFromFloor  = def.floor;
        if (anim.elevToFloor   == null) anim.elevToFloor    = def.floor;
        if (anim.elevProgress  == null) anim.elevProgress   = 0;
      }

      const isWorking = anim.isActive || activeAgents.has(def.id);
      if (isWorking) {
        // Recall to desk from anywhere — including elevator / foreign floor
        if (anim.activity !== 'desk') {
          anim.activity       = 'desk';
          anim.activityTarget = null;
          anim.walkProgress   = 0;
          anim.currentFloor   = def.floor;
          anim.personX        = def.deskX;
        } else {
          anim.personX = def.deskX;
        }
        continue;
      }

      const floorAm = FLOOR_AMENITIES[anim.currentFloor] ?? am;
      const floorWr = FLOOR_WANDER[anim.currentFloor] ?? FLOOR_WANDER[def.floor];

      const getTargetX = (): number => {
        if (anim.activityTarget === 'water')    return floorAm.waterX;
        if (anim.activityTarget === 'bathroom') return floorAm.bathroomX;
        if (anim.activityTarget === 'elevator') return ELEV_X;
        return anim.wanderX ?? def.deskX;
      };

      const walkTo = (toX: number, next: Activity, speed = WALK_TIME, onArrive?: () => void) => {
        anim.walkProgress = Math.min(1, anim.walkProgress + delta / speed);
        anim.personX = anim.walkFromX + (toX - anim.walkFromX) * anim.walkProgress;
        if (anim.walkProgress >= 1) {
          anim.personX = toX; anim.activity = next; anim.walkProgress = 0;
          onArrive?.();
        }
      };

      if (anim.activity === 'desk') {
        anim.personX      = def.deskX;
        anim.currentFloor = def.floor;
        anim.nextActivityIn -= delta;
        if (anim.nextActivityIn <= 0) {
          const roll = Math.random();
          if (roll < 0.22) {
            anim.activityTarget = 'water';
            anim.walkFromX = anim.personX; anim.activity = 'walking_away'; anim.walkProgress = 0;
          } else if (roll < 0.35) {
            anim.activityTarget = 'bathroom';
            anim.walkFromX = anim.personX; anim.activity = 'walking_away'; anim.walkProgress = 0;
          } else if (roll < 0.60) {
            anim.activityTarget = 'wander';
            const [minX, maxX] = FLOOR_WANDER[def.floor];
            anim.wanderX = minX + Math.random() * (maxX - minX);
            anim.walkFromX = anim.personX; anim.activity = 'walking_away'; anim.walkProgress = 0;
          } else {
            anim.activityTarget = 'elevator';
            const others = [0, 1, 2].filter(f => f !== def.floor);
            anim.elevToFloor   = others[Math.floor(Math.random() * others.length)];
            anim.elevFromFloor = def.floor;
            anim.walkFromX = anim.personX; anim.activity = 'walking_to_elevator'; anim.walkProgress = 0;
          }
        }

      } else if (anim.activity === 'walking_away') {
        walkTo(getTargetX(), 'away', WALK_TIME, () => { anim.awayTimer = AWAY_MIN + Math.random() * (AWAY_MAX - AWAY_MIN); });

      } else if (anim.activity === 'away') {
        anim.personX    = getTargetX();
        anim.awayTimer -= delta;
        if (anim.awayTimer <= 0) {
          if (anim.activityTarget === 'wander' && Math.random() < 0.5) {
            const [minX, maxX] = floorWr;
            anim.wanderX   = minX + Math.random() * (maxX - minX);
            anim.walkFromX = anim.personX; anim.walkProgress = 0; anim.activity = 'walking_away';
          } else {
            anim.walkFromX = anim.personX; anim.walkProgress = 0; anim.activity = 'walking_back';
          }
        }

      } else if (anim.activity === 'walking_back') {
        walkTo(def.deskX, 'desk', WALK_TIME, () => {
          anim.activityTarget = null; anim.personX = def.deskX;
          anim.nextActivityIn = NEXT_MIN + Math.random() * (NEXT_MAX - NEXT_MIN);
        });

      // ── Elevator outbound ──────────────────────────────────────────
      } else if (anim.activity === 'walking_to_elevator') {
        walkTo(ELEV_X, 'in_elevator', WALK_TIME * 1.3, () => { anim.elevProgress = 0; anim.personX = ELEV_X; });

      } else if (anim.activity === 'in_elevator') {
        const floors = Math.max(1, Math.abs(anim.elevToFloor - anim.elevFromFloor));
        anim.elevProgress = Math.min(1, anim.elevProgress + delta / (ELEVATOR_TIME * floors));
        elevCarFloor.current = anim.elevFromFloor + (anim.elevToFloor - anim.elevFromFloor) * anim.elevProgress;
        if (anim.elevProgress >= 1) {
          anim.currentFloor = anim.elevToFloor;
          const [minX, maxX] = FLOOR_WANDER[anim.currentFloor];
          anim.wanderX = minX + Math.random() * (maxX - minX);
          anim.walkFromX = ELEV_X; anim.walkProgress = 0; anim.activity = 'walking_from_elevator';
        }

      } else if (anim.activity === 'walking_from_elevator') {
        walkTo(anim.wanderX, 'exploring', WALK_TIME, () => { anim.awayTimer = (AWAY_MIN + Math.random() * AWAY_MAX) * 2.5; });

      } else if (anim.activity === 'exploring') {
        anim.personX    = anim.wanderX;
        anim.awayTimer -= delta;
        if (anim.awayTimer <= 0) {
          if (Math.random() < 0.55) {
            const [minX, maxX] = FLOOR_WANDER[anim.currentFloor];
            anim.wanderX   = minX + Math.random() * (maxX - minX);
            anim.walkFromX = anim.personX; anim.walkProgress = 0;
            anim.activity  = 'walking_from_elevator';
            anim.awayTimer = (AWAY_MIN + Math.random() * AWAY_MAX) * 1.5;
          } else {
            anim.walkFromX = anim.personX; anim.walkProgress = 0;
            anim.activity  = 'walking_back_to_elevator';
          }
        }

      // ── Elevator return ────────────────────────────────────────────
      } else if (anim.activity === 'walking_back_to_elevator') {
        walkTo(ELEV_X, 'in_elevator_return', WALK_TIME * 1.3, () => {
          anim.elevFromFloor = anim.currentFloor; anim.elevToFloor = def.floor;
          anim.elevProgress = 0; anim.personX = ELEV_X;
        });

      } else if (anim.activity === 'in_elevator_return') {
        const floors = Math.max(1, Math.abs(anim.elevToFloor - anim.elevFromFloor));
        anim.elevProgress = Math.min(1, anim.elevProgress + delta / (ELEVATOR_TIME * floors));
        elevCarFloor.current = anim.elevFromFloor + (anim.elevToFloor - anim.elevFromFloor) * anim.elevProgress;
        if (anim.elevProgress >= 1) {
          anim.currentFloor = def.floor;
          anim.walkFromX = ELEV_X; anim.walkProgress = 0; anim.activity = 'walking_to_desk';
        }

      } else if (anim.activity === 'walking_to_desk') {
        walkTo(def.deskX, 'desk', WALK_TIME, () => {
          anim.activityTarget = null; anim.personX = def.deskX;
          anim.nextActivityIn = NEXT_MIN + Math.random() * (NEXT_MAX - NEXT_MIN);
        });

      // ── Conversation activities ────────────────────────────────────
      } else if (anim.activity === 'walking_to_conv') {
        const meetX = anim.convMeetX ?? def.deskX;
        walkTo(meetX, 'chatting');

      } else if (anim.activity === 'chatting') {
        anim.personX = anim.convMeetX ?? anim.personX;
      }
    }

    // ── Conversation group management ─────────────────────────────────
    {
      const cg = convGroup.current;
      const activeAgentsNow = useGameStore.getState().activeAgents;

      if (cg) {
        // If any participant became actively working, interrupt the conversation
        const anyWorking = cg.template.participants.some(id => {
          const a = npcAnims.current.get(id);
          return a && (a.isActive || activeAgentsNow.has(id));
        });
        if (anyWorking) {
          for (const id of cg.template.participants) {
            const a = npcAnims.current.get(id);
            if (a && (a.activity === 'chatting' || a.activity === 'walking_to_conv')) {
              a.activity = 'walking_back';
              a.walkFromX = a.personX;
              a.walkProgress = 0;
              a.activityTarget = null;
            }
            const b = chatBubbles.current.get(id);
            if (b) b.pauseTimer = 5 + Math.random() * 10;
          }
          convGroup.current = null;
          nextConvIn.current = 20 + Math.random() * 30;

        } else if (cg.phase === 'walking') {
          // Wait for all participants to arrive at their meeting spots
          const allArrived = cg.template.participants.every(
            id => npcAnims.current.get(id)?.activity === 'chatting'
          );
          if (allArrived) {
            cg.phase = 'chatting';
            cg.lineIndex = -1;
            cg.lineTimer = 0;
          }

        } else if (cg.phase === 'chatting') {
          cg.lineTimer -= delta;
          if (cg.lineTimer <= 0) {
            cg.lineIndex++;
            if (cg.lineIndex >= cg.lines.length) {
              // Scene complete — send everyone back to their desks
              cg.phase = 'returning';
              for (const id of cg.template.participants) {
                const a = npcAnims.current.get(id);
                if (a) {
                  a.activity = 'walking_back';
                  a.walkFromX = a.personX;
                  a.walkProgress = 0;
                  a.activityTarget = null;
                }
                const b = chatBubbles.current.get(id);
                if (b) b.pauseTimer = 8 + Math.random() * 15;
              }
            } else {
              const line = cg.lines[cg.lineIndex];
              const displayTime = 3 + line.text.length * 0.025;
              cg.lineTimer = displayTime;
              // Inject this line into the speaker's chat bubble
              const bubble = chatBubbles.current.get(line.agentId);
              if (bubble) {
                bubble.text = line.text;
                bubble.displayDuration = displayTime;
                bubble.displayTimer = displayTime;
                bubble.alpha = 1;
                bubble.pauseTimer = 0;
              }
            }
          }

        } else if (cg.phase === 'returning') {
          // Wait for all participants to reach their desks
          const allBack = cg.template.participants.every(
            id => npcAnims.current.get(id)?.activity === 'desk'
          );
          if (allBack) {
            convGroup.current = null;
            nextConvIn.current = 30 + Math.random() * 45;
          }
        }

      } else {
        // Countdown to the next spontaneous conversation
        nextConvIn.current -= delta;
        if (nextConvIn.current <= 0) {
          const eligible = CONV_TEMPLATES.filter(t =>
            t.participants.every(id => {
              const a = npcAnims.current.get(id);
              return a?.activity === 'desk' && !a.isActive && !activeAgentsNow.has(id);
            })
          );
          if (eligible.length === 0) {
            nextConvIn.current = 10 + Math.random() * 15;
          } else {
            const template = eligible[Math.floor(Math.random() * eligible.length)];
            const scene = SCENES_BY_ID[template.sceneId];
            const lines = scene.dialogue
              .filter(l => template.castFilter.includes(l.speaker))
              .map(l => ({ agentId: CAST_TO_AGENT[l.speaker]!, text: l.text }))
              .filter(l => l.agentId != null);

            if (lines.length === 0) {
              nextConvIn.current = 10 + Math.random() * 15;
            } else {
              convGroup.current = { template, lines, lineIndex: -1, lineTimer: 0, phase: 'walking' };

              // Sort by meetX to determine facing direction (rightmost faces left)
              const sorted = [...template.participants].sort(
                (a, b) => (template.meetXs[a] ?? 0) - (template.meetXs[b] ?? 0)
              );
              for (let pi = 0; pi < sorted.length; pi++) {
                const id = sorted[pi];
                const a = npcAnims.current.get(id);
                if (!a) continue;
                a.convMeetX = template.meetXs[id] ?? a.personX;
                a.convFacingLeft = pi === sorted.length - 1;
                a.activity = 'walking_to_conv';
                a.walkFromX = a.personX;
                a.walkProgress = 0;
                a.activityTarget = null;
                // Suppress random chatter while in a scene conversation
                const b = chatBubbles.current.get(id);
                if (b) { b.pauseTimer = 999; b.alpha = 0; b.text = ''; }
              }
            }
          }
        }
      }
    }

    packets.current = packets.current.filter((pkt) => {
      if (pkt.burst > 0) {
        pkt.burst += delta * 2.5;
        return pkt.burst < 1;
      }
      pkt.progress += delta / 0.7;
      if (pkt.progress >= 1) { pkt.progress = 1; pkt.burst = 0.01; }
      return true;
    });

    draw(ctx, canvas.width, canvas.height);
    rafId.current = requestAnimationFrame(loop);
  }, [draw, processStoreEvents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    lastTime.current = performance.now();
    rafId.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('resize', resize);      cancelAnimationFrame(rafId.current);
    };
  }, [loop]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', cursor: 'default' }}
    />
  );
};
