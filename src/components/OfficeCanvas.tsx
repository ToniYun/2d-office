import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { CAST } from '../data/cast';
import { SCENES, SCENES_BY_ID } from '../data/scenes';

// ── Virtual canvas dimensions (scale to fit actual screen) ──────
const VW = 960;
const VH = 580;

// ── Building layout (virtual pixel coords) ──────────────────────
const BLD_X   = 32;
const BLD_TOP = 50;
const BLD_W   = 890;
const ROOF_H  = 46;
const FLOOR_H = 148;
const SLAB_H  = 7;
const NUM_FL  = 3;
const DEPT_W  = 28;
const ELEV_W  = 50;
const ELEV_X  = BLD_X + BLD_W - ELEV_W; // = 872

function floorTop(f: number): number {
  return BLD_TOP + ROOF_H + (NUM_FL - 1 - f) * FLOOR_H;
}
function floorGround(f: number): number {
  return floorTop(f) + FLOOR_H;
}
function carpetY(f: number): number {
  return floorGround(f) - SLAB_H;
}

// ── Agent definitions ────────────────────────────────────────────
// Edit agents.config.json to add your own agents.
// These IDs must match the "id" fields in agents.config.json.
type AgentId =
  | 'ceo' | 'cto'
  | 'researcher' | 'engineer' | 'qa' | 'backend'
  | 'analyst' | 'ops' | 'intern';

interface AgentDef {
  id: AgentId;
  name: string;
  model: string;
  color: string;
  floor: number;
  deskX: number;
  rank: number;
}

// Desk positions are fixed layout slots — one per desk in the building.
// Change "model" strings here to match your actual model names.
const AGENTS: AgentDef[] = [
  { id: 'ceo',        name: 'ceo',        model: 'gpt-4o',              color: '#fbbf24', floor: 2, deskX: 128, rank: 1 },
  { id: 'cto',        name: 'cto',        model: 'claude-opus-4',       color: '#a78bfa', floor: 2, deskX: 315, rank: 2 },
  { id: 'researcher', name: 'researcher', model: 'your-research-model', color: '#38bdf8', floor: 1, deskX: 120, rank: 3 },
  { id: 'engineer',   name: 'engineer',   model: 'claude-sonnet-4',     color: '#60a5fa', floor: 1, deskX: 292, rank: 3 },
  { id: 'qa',         name: 'qa',         model: 'your-qa-model',       color: '#4ade80', floor: 1, deskX: 464, rank: 3 },
  { id: 'backend',    name: 'backend',    model: 'your-coding-model',   color: '#f97316', floor: 1, deskX: 636, rank: 3 },
  { id: 'analyst',    name: 'analyst',    model: 'your-light-model',    color: '#94a3b8', floor: 0, deskX: 148, rank: 4 },
  { id: 'ops',        name: 'ops',        model: 'your-ops-model',      color: '#fb923c', floor: 0, deskX: 328, rank: 4 },
  { id: 'intern',     name: 'intern',     model: 'your-small-model',    color: '#e879f9', floor: 0, deskX: 508, rank: 4 },
];

// Packet animations: when agentX becomes active, a packet flies from agentY to agentX.
const PACKET_FROM: Partial<Record<AgentId, AgentId>> = {
  'cto':        'ceo',
  'researcher': 'ceo',
  'engineer':   'ceo',
  'qa':         'engineer',
  'backend':    'engineer',
  'analyst':    'ceo',
  'ops':        'ceo',
  'intern':     'ceo',
};

const FLOOR_AMENITIES: Record<number, { waterX: number; bathroomX: number }> = {
  2: { waterX: 440, bathroomX: 378 },
  1: { waterX: 748, bathroomX: 686 },
  0: { waterX: 690, bathroomX: 628 },
};
const AWAY_MIN  = 4;
const AWAY_MAX  = 14;
const WALK_TIME = 2.0;

function carTopYForFloor(f: number): number {
  const y0 = floorTop(0) + SLAB_H + 2;
  const y1 = floorTop(1) + SLAB_H + 2;
  const y2 = floorTop(2) + SLAB_H + 2;
  if (f <= 1) return y0 + (y1 - y0) * f;
  return y1 + (y2 - y1) * (f - 1);
}

type Activity =
  | 'desk'
  | 'walking_away' | 'away' | 'walking_back'
  | 'walking_to_conv' | 'chatting';

interface NpcAnim {
  isActive: boolean;
  workTimer: number;
  idleTimer: number;
  activity: Activity;
  activityTarget: 'water' | 'bathroom' | null;
  walkProgress: number;
  walkFromX: number;
  awayTimer: number;
  personX: number;
  thirstMeter: number;
  bathroomMeter: number;
  thirstRate: number;
  bathroomRate: number;
  convMeetX?: number;
  convFacingLeft?: boolean;
}

interface Packet {
  fromX: number; fromY: number;
  toX: number;   toY: number;
  color: string;
  progress: number;
  burst: number;
}

function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

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

// Cast IDs match agents.config.json IDs directly.
const AGENT_TO_CAST: Partial<Record<AgentId, string>> = {
  'ceo':        'ceo',
  'cto':        'cto',
  'researcher': 'researcher',
  'engineer':   'engineer',
  'qa':         'qa',
  'backend':    'backend',
  'analyst':    'analyst',
  'ops':        'ops',
  'intern':     'intern',
};

const CAST_TO_AGENT: Partial<Record<string, AgentId>> = {
  'ceo':        'ceo',
  'cto':        'cto',
  'researcher': 'researcher',
  'engineer':   'engineer',
  'qa':         'qa',
  'backend':    'backend',
  'analyst':    'analyst',
  'ops':        'ops',
  'intern':     'intern',
};

interface ConvTemplate {
  sceneId: string;
  floor: number;
  participants: AgentId[];
  meetXs: Partial<Record<AgentId, number>>;
  castFilter: string[];
  initiatorId?: AgentId;
}

const CONV_TEMPLATES: ConvTemplate[] = [
  { sceneId: 'overloaded',    floor: 2, participants: ['ceo', 'cto'],
    meetXs: { 'ceo': 185, 'cto': 255 }, castFilter: ['ceo', 'cto'], initiatorId: 'ceo' },
  { sceneId: 'new_ticket',    floor: 2, participants: ['ceo', 'cto'],
    meetXs: { 'ceo': 185, 'cto': 255 }, castFilter: ['ceo', 'cto'], initiatorId: 'ceo' },
  { sceneId: 'budget_meeting',floor: 2, participants: ['ceo', 'cto'],
    meetXs: { 'ceo': 185, 'cto': 255 }, castFilter: ['ceo', 'cto'], initiatorId: 'ceo' },
  { sceneId: 'code_review',   floor: 1, participants: ['engineer', 'qa'],
    meetXs: { 'engineer': 370, 'qa': 440 }, castFilter: ['engineer', 'qa'] },
  { sceneId: 'incident',      floor: 1, participants: ['engineer', 'qa'],
    meetXs: { 'engineer': 370, 'qa': 440 }, castFilter: ['engineer', 'qa'] },
  { sceneId: 'overloaded',    floor: 1, participants: ['researcher', 'engineer'],
    meetXs: { 'researcher': 185, 'engineer': 255 }, castFilter: ['researcher', 'engineer'] },
  { sceneId: 'budget_meeting',floor: 1, participants: ['researcher', 'engineer'],
    meetXs: { 'researcher': 185, 'engineer': 255 }, castFilter: ['researcher', 'engineer'] },
  { sceneId: 'standup',       floor: 0, participants: ['analyst', 'ops', 'intern'],
    meetXs: { 'analyst': 230, 'ops': 330, 'intern': 420 }, castFilter: ['analyst', 'ops', 'intern'] },
  { sceneId: 'incident',      floor: 0, participants: ['intern', 'ops', 'analyst'],
    meetXs: { 'intern': 230, 'ops': 330, 'analyst': 420 }, castFilter: ['intern', 'ops', 'analyst'] },
  { sceneId: 'budget_meeting',floor: 0, participants: ['analyst', 'ops'],
    meetXs: { 'analyst': 240, 'ops': 320 }, castFilter: ['analyst', 'ops'] },
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
  if (agentId === 'backend') return DEEPSEEK_LINES;
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

// ── Draw one seated worker + workstation ─────────────────────────
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

  // ── Active agent glow aura ──────────────────────────────────────
  if (isActive && showPerson) {
    const glowR = ctx.createRadialGradient(cx, ground - 60, 0, cx, ground - 60, 70);
    glowR.addColorStop(0, rgba(color, 0.12));
    glowR.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glowR;
    ctx.beginPath();
    ctx.ellipse(cx, ground - 60, 70, 70, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Chair ───────────────────────────────────────────────────────
  ctx.fillStyle = '#1C3050';
  ctx.fillRect(cx + 10, ground - 84, 8, 48);
  ctx.fillStyle = '#243C62';
  ctx.fillRect(cx - 16, ground - 38, 30, 8);
  ctx.fillStyle = '#2C4870';
  ctx.fillRect(cx - 14, ground - 50, 6, 14);
  ctx.fillStyle = '#1A2840';
  ctx.fillRect(cx - 12, ground - 30, 5, 22);
  ctx.fillRect(cx + 14, ground - 30, 5, 22);

  // ── Desk pedestal ───────────────────────────────────────────────
  ctx.fillStyle = '#1A2E48';
  ctx.fillRect(cx - 74, ground - 62, 22, 52);
  ctx.strokeStyle = '#243A58';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx - 74, ground - 44); ctx.lineTo(cx - 52, ground - 44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 74, ground - 28); ctx.lineTo(cx - 52, ground - 28); ctx.stroke();
  ctx.fillStyle = '#3A5878';
  ctx.fillRect(cx - 65, ground - 36, 6, 3);
  ctx.fillRect(cx - 65, ground - 20, 6, 3);

  // ── Desk surface ────────────────────────────────────────────────
  ctx.fillStyle = '#203448';
  ctx.fillRect(cx - 76, ground - 68, 82, 8);
  ctx.fillStyle = '#2A4460';
  ctx.fillRect(cx - 76, ground - 68, 82, 2);

  // ── Monitor glow on desk when active ───────────────────────────
  if (isActive) {
    const monGlow = ctx.createRadialGradient(cx - 49, ground - 76, 0, cx - 49, ground - 76, 40);
    monGlow.addColorStop(0, rgba(color, 0.12));
    monGlow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = monGlow;
    ctx.fillRect(cx - 90, ground - 110, 80, 60);
  }

  // ── Monitor ────────────────────────────────────────────────────
  const monX = cx - 64;
  const monY = ground - 98;
  ctx.fillStyle = '#0C1828';
  ctx.fillRect(monX - 1, monY - 1, 36, 32);
  ctx.fillStyle = '#101E30';
  ctx.fillRect(monX, monY, 34, 30);
  ctx.fillStyle = isActive ? '#0A2A56' : '#040810';
  ctx.fillRect(monX + 2, monY + 2, 30, 23);
  if (isActive) {
    const pulse = 0.15 + Math.sin(clockTime * 2.5) * 0.07;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = color;
    ctx.fillRect(monX + 2, monY + 2, 30, 23);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(color, 0.35);
    ctx.lineWidth = 1;
    for (let li = 0; li < 5; li++) {
      const ly = monY + 4 + li * 4;
      const lw = 20 + (li % 3) * 5;
      ctx.beginPath(); ctx.moveTo(monX + 4, ly); ctx.lineTo(monX + 4 + lw, ly); ctx.stroke();
    }
  } else {
    // Idle: dim screen with faint cursor blink
    ctx.globalAlpha = 0.4 + Math.sin(idleTimer * 1.5) * 0.2;
    ctx.fillStyle = '#1A3060';
    ctx.fillRect(monX + 4, monY + 12, 6, 1);
    ctx.globalAlpha = 1;
  }
  // Monitor stand
  ctx.fillStyle = '#182438';
  ctx.fillRect(monX + 13, ground - 68, 8, 4);
  ctx.fillRect(monX + 8,  ground - 66, 18, 2);

  // ── Keyboard ───────────────────────────────────────────────────
  ctx.fillStyle = '#182030';
  ctx.fillRect(cx - 52, ground - 62, 38, 5);
  ctx.strokeStyle = rgba('#4A7A9A', 0.3);
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx - 50, ground - 61); ctx.lineTo(cx - 16, ground - 61); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 50, ground - 59); ctx.lineTo(cx - 20, ground - 59); ctx.stroke();

  // ── Desk lamp (active state) ────────────────────────────────────
  if (isActive) {
    // Lamp base + arm
    ctx.fillStyle = '#2A3A4A';
    ctx.fillRect(cx + 2, ground - 72, 4, 10);
    ctx.fillStyle = '#3A4A5A';
    ctx.beginPath();
    ctx.moveTo(cx + 4, ground - 72);
    ctx.lineTo(cx - 4, ground - 88);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3A4A5A';
    ctx.stroke();
    // Lamp head
    ctx.fillStyle = '#4A6070';
    ctx.beginPath();
    ctx.ellipse(cx - 4, ground - 90, 8, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Light cone
    const lampGlow = ctx.createLinearGradient(cx - 4, ground - 86, cx - 4, ground - 64);
    lampGlow.addColorStop(0, 'rgba(255,240,200,0.18)');
    lampGlow.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = lampGlow;
    ctx.beginPath();
    ctx.moveTo(cx - 10, ground - 86);
    ctx.lineTo(cx + 2, ground - 86);
    ctx.lineTo(cx + 22, ground - 64);
    ctx.lineTo(cx - 30, ground - 64);
    ctx.closePath();
    ctx.fill();
  }

  // ── Coffee mug (idle) ──────────────────────────────────────────
  if (!isActive) {
    ctx.fillStyle = '#3A2010';
    ctx.fillRect(cx + 4, ground - 70, 10, 11);
    ctx.fillStyle = '#F0E8D8';
    ctx.beginPath();
    ctx.arc(cx + 9, ground - 66, 4, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#3A2010';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx + 15, ground - 64, 4, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // Steam
    ctx.globalAlpha = 0.25 + Math.sin(idleTimer * 0.8) * 0.15;
    ctx.strokeStyle = '#C8A880';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 7, ground - 72);
    ctx.quadraticCurveTo(cx + 5, ground - 76, cx + 7, ground - 80);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── Person (seated) ────────────────────────────────────────────
  if (showPerson) {
    const headBob = isActive ? Math.sin(clockTime * 7) * 1.2 : 0;
    const SKIN    = '#F0C090';
    // Facing LEFT (toward monitor). flip = -1 so ear on right side, cheek shadow on right.
    const eOff    = -0.8;

    ctx.save();

    // Ground shadow
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(cx, ground, 13, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Shoes ───────────────────────────────────────────────────
    ctx.fillStyle = '#0B0B1B';
    ctx.beginPath();
    ctx.roundRect(cx - 15, ground - 9, 12, 6, [4, 2, 2, 2]);
    ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', 0.06);
    ctx.beginPath();
    ctx.ellipse(cx - 10, ground - 7, 3, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0B0B1B';
    ctx.beginPath();
    ctx.roundRect(cx + 2, ground - 9, 12, 6, [4, 2, 2, 2]);
    ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', 0.06);
    ctx.beginPath();
    ctx.ellipse(cx + 8, ground - 7, 3, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Lower legs ──────────────────────────────────────────────
    const PANT = '#151727';
    ctx.fillStyle = PANT;
    ctx.beginPath();
    ctx.roundRect(cx - 12, ground - 36, 7, 27, 2);
    ctx.fill();
    ctx.strokeStyle = rgba('#2A2E4A', 0.5);
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(cx - 9, ground - 32); ctx.lineTo(cx - 9, ground - 11); ctx.stroke();

    ctx.fillStyle = PANT;
    ctx.beginPath();
    ctx.roundRect(cx + 3, ground - 36, 7, 27, 2);
    ctx.fill();
    ctx.strokeStyle = rgba('#2A2E4A', 0.5);
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(cx + 7, ground - 32); ctx.lineTo(cx + 7, ground - 11); ctx.stroke();

    // Thighs (horizontal, going slightly left toward desk)
    ctx.fillStyle = PANT;
    ctx.beginPath();
    ctx.roundRect(cx - 16, ground - 44, 30, 10, 2);
    ctx.fill();

    // Belt
    ctx.fillStyle = '#0D0E1A';
    ctx.beginPath();
    ctx.roundRect(cx - 14, ground - 52, 22, 5, 1);
    ctx.fill();
    ctx.fillStyle = rgba('#C0A050', 0.6);
    ctx.beginPath();
    ctx.roundRect(cx - 3, ground - 51.5, 5, 4, 1);
    ctx.fill();

    // ── Torso / jacket ──────────────────────────────────────────
    const torsoTop = ground - 72;
    const torsoBot = ground - 47;
    const shW = 11;
    const wstW = 8;

    ctx.fillStyle = rgba(color, 0.88);
    ctx.beginPath();
    ctx.moveTo(cx - shW + 1, torsoTop);
    ctx.bezierCurveTo(cx - shW - 1, torsoTop + 8, cx - wstW, torsoBot - 5, cx - wstW, torsoBot);
    ctx.lineTo(cx + wstW + 1, torsoBot);
    ctx.bezierCurveTo(cx + wstW + 1, torsoBot - 5, cx + shW + 2, torsoTop + 8, cx + shW, torsoTop);
    ctx.closePath();
    ctx.fill();

    // Side shadow (left/darker side since facing left)
    ctx.fillStyle = rgba('#000000', 0.13);
    ctx.beginPath();
    ctx.moveTo(cx - shW + 1, torsoTop);
    ctx.bezierCurveTo(cx - shW - 1, torsoTop + 8, cx - wstW, torsoBot - 5, cx - wstW, torsoBot);
    ctx.lineTo(cx - wstW + 3, torsoBot);
    ctx.bezierCurveTo(cx - wstW + 3, torsoBot - 5, cx - shW + 3, torsoTop + 8, cx - shW + 3, torsoTop);
    ctx.closePath();
    ctx.fill();

    // Shirt collar V (character faces left so V opens left)
    ctx.strokeStyle = rgba('#F0EDE8', 0.85);
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + 2, torsoTop + 2);
    ctx.lineTo(cx - 2, torsoTop + 11);
    ctx.lineTo(cx - 7, torsoTop + 2);
    ctx.stroke();

    // Tie
    ctx.fillStyle = rgba('#1A2C44', 0.9);
    ctx.beginPath();
    ctx.moveTo(cx + 1, torsoTop + 4);
    ctx.lineTo(cx + 2, torsoBot - 5);
    ctx.lineTo(cx - 1, torsoBot - 2);
    ctx.lineTo(cx - 4, torsoBot - 5);
    ctx.lineTo(cx - 2, torsoTop + 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba('#223344', 0.95);
    ctx.beginPath();
    ctx.roundRect(cx - 2, torsoTop + 3, 4, 5, 1);
    ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', 0.1);
    ctx.beginPath();
    ctx.moveTo(cx - 0.5, torsoTop + 5); ctx.lineTo(cx - 1, torsoTop + 12); ctx.lineTo(cx + 0.5, torsoTop + 5);
    ctx.closePath();
    ctx.fill();

    // Lapels (facing left)
    ctx.fillStyle = rgba(color, 0.72);
    ctx.beginPath();
    ctx.moveTo(cx + 2, torsoTop + 2);
    ctx.lineTo(cx + shW - 1, torsoTop + 7);
    ctx.lineTo(cx + 3, torsoTop + 13);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 7, torsoTop + 2);
    ctx.lineTo(cx - shW + 1, torsoTop + 7);
    ctx.lineTo(cx - 5, torsoTop + 13);
    ctx.closePath();
    ctx.fill();

    // Pocket square
    ctx.fillStyle = rgba('#FFFFFF', 0.22);
    ctx.beginPath();
    ctx.roundRect(cx + shW - 6, torsoTop + 10, 5, 3, 1);
    ctx.fill();

    // ── Arms ────────────────────────────────────────────────────
    const SLEEVE = rgba(color, 0.82);
    const shoulderY = torsoTop + 5;

    if (isActive) {
      // Both arms reaching forward (left) toward keyboard
      ctx.fillStyle = SLEEVE;
      ctx.beginPath();
      ctx.roundRect(cx - shW - 14, ground - 64, 18, 7, 3);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(cx - shW - 14, ground - 60, 4.5, 3.5, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = SLEEVE;
      ctx.beginPath();
      ctx.roundRect(cx - shW - 7, ground - 71, 16, 7, 3);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(cx - shW - 7, ground - 67, 4, 3.5, -0.15, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Arms relaxed at sides
      ctx.fillStyle = SLEEVE;
      ctx.beginPath();
      ctx.roundRect(cx - shW - 1, shoulderY, 7, 22, 3);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(cx - shW + 2, shoulderY + 24, 3.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = SLEEVE;
      ctx.beginPath();
      ctx.roundRect(cx + shW - 4, shoulderY, 7, 22, 3);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.ellipse(cx + shW, shoulderY + 24, 3.5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Neck ────────────────────────────────────────────────────
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.roundRect(cx - 3, torsoTop - 6, 6, 8, 2);
    ctx.fill();

    // ── Head ────────────────────────────────────────────────────
    const hx = cx - 1;
    const hy = torsoTop - 15 + headBob;

    ctx.fillStyle = rgba('#000000', 0.1);
    ctx.beginPath();
    ctx.ellipse(hx, hy + 3, 8.5, 10.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.ellipse(hx, hy, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cheek shading (right side darker, facing left)
    ctx.fillStyle = rgba('#C88060', 0.18);
    ctx.beginPath();
    ctx.ellipse(hx + 4, hy + 2, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight (left side lit by monitor glow)
    ctx.fillStyle = rgba('#FFFFFF', 0.16);
    ctx.beginPath();
    ctx.ellipse(hx - 3, hy - 3, 3.5, 4.5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    const eyeY = hy - 2;
    ctx.fillStyle = rgba('#F8F2EC', 0.92);
    ctx.beginPath();
    ctx.ellipse(hx - 3.2 + eOff, eyeY, 2.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + 2.8 + eOff, eyeY, 2.4, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba('#2A1A0A', 0.9);
    ctx.beginPath();
    ctx.ellipse(hx - 3.6 + eOff * 1.3, eyeY, 1.5, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + 2.4 + eOff * 0.5, eyeY, 1.5, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = rgba('#FFFFFF', 0.72);
    ctx.beginPath();
    ctx.ellipse(hx - 3 + eOff * 1.3, eyeY - 0.6, 0.7, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + 2.9 + eOff * 0.5, eyeY - 0.6, 0.7, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyelid lines
    ctx.strokeStyle = rgba('#401808', 0.45);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(hx - 5.8 + eOff, eyeY - 1.2);
    ctx.quadraticCurveTo(hx - 3.2 + eOff, eyeY - 3, hx - 0.8 + eOff, eyeY - 1.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + 0.4 + eOff, eyeY - 1.2);
    ctx.quadraticCurveTo(hx + 2.8 + eOff, eyeY - 3, hx + 5.2 + eOff, eyeY - 1.2);
    ctx.stroke();

    // Eyebrows
    ctx.strokeStyle = rgba('#4A2808', 0.72);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - 6 + eOff, eyeY - 4.5);
    ctx.quadraticCurveTo(hx - 3.2 + eOff, eyeY - 5.8, hx - 0.5 + eOff, eyeY - 4.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + 0.5 + eOff, eyeY - 4.5);
    ctx.quadraticCurveTo(hx + 2.8 + eOff, eyeY - 5.8, hx + 5.5 + eOff, eyeY - 4.5);
    ctx.stroke();

    // Nose
    ctx.fillStyle = rgba('#B07050', 0.5);
    ctx.beginPath();
    ctx.ellipse(hx + eOff * 0.3 - 0.5, hy + 3.5, 1.2, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#804030', 0.35);
    ctx.beginPath();
    ctx.ellipse(hx - 1.5 + eOff * 0.3, hy + 5, 0.8, 0.6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + 0.5 + eOff * 0.3, hy + 5, 0.8, 0.6, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = rgba('#904030', 0.6);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(hx - 3.2 + eOff * 0.4, hy + 6.8);
    ctx.quadraticCurveTo(hx + eOff * 0.4, hy + 8.5, hx + 3.2 + eOff * 0.4, hy + 6.8);
    ctx.stroke();
    ctx.strokeStyle = rgba('#C07060', 0.22);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(hx - 2.2 + eOff * 0.4, hy + 7.6);
    ctx.quadraticCurveTo(hx + eOff * 0.4, hy + 8.8, hx + 2.2 + eOff * 0.4, hy + 7.6);
    ctx.stroke();

    // Ear (right ear visible since facing left)
    ctx.fillStyle = rgba(SKIN, 0.85);
    ctx.beginPath();
    ctx.ellipse(hx + 8.5, hy, 2.5, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#C08060', 0.3);
    ctx.beginPath();
    ctx.ellipse(hx + 8.5, hy, 1.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hair
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(hx - 0.5, hy - 4.5, 9.5, 9, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(color, 0.55);
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy - 7, 5.5, 5, 0.15, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', 0.14);
    ctx.beginPath();
    ctx.ellipse(hx + 1.5, hy - 9.5, 4.5, 3, -0.25, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(color, 0.35);
    ctx.beginPath();
    ctx.ellipse(hx - 7, hy - 2, 2.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Productivity bar ────────────────────────────────────────────
  const barX    = cx - 75;
  const barY    = ground - 98 - 18;
  const barW    = 68;
  const barFill = isActive
    ? 0.68 + Math.sin(clockTime * 2.2) * 0.14
    : 0.04 + Math.sin(idleTimer * 0.4) * 0.02;

  ctx.fillStyle = rgba('#8AA4BE', 0.6);
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PRODUCTIVITY', barX + barW / 2, barY - 2);

  // Bar bg
  ctx.fillStyle = '#08111C';
  ctx.fillRect(barX - 1, barY, barW + 2, 10);
  // Bar fill with gradient
  if (isActive) {
    const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    barGrad.addColorStop(0, rgba(color, 0.7));
    barGrad.addColorStop(1, color);
    ctx.fillStyle = barGrad;
  } else {
    ctx.fillStyle = '#1E2A3A';
  }
  ctx.fillRect(barX, barY + 1, Math.round(barW * barFill), 8);
  // Bar sheen
  if (isActive) {
    ctx.fillStyle = rgba('#FFFFFF', 0.15);
    ctx.fillRect(barX, barY + 1, Math.round(barW * barFill), 3);
  }
  ctx.fillStyle = isActive ? '#FFFFFF' : rgba('#6A8AA8', 0.7);
  ctx.font = '6px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    isActive ? `${Math.round(barFill * 100)}%` : 'IDLE',
    barX + barW / 2,
    barY + 5,
  );

  // ── Status indicator ────────────────────────────────────────────
  if (showPerson) {
    const headCX2 = cx - 1;
    const torsoTop2 = ground - 72;
    const headCY2 = (isActive ? torsoTop2 - 15 + Math.sin(clockTime * 7) * 1.2 : torsoTop2 - 15);
    if (isActive) {
      for (let i = 0; i < 3; i++) {
        const phase = (clockTime * 5 + i * 0.7) % (Math.PI * 2);
        const dy    = -Math.abs(Math.sin(phase)) * 7;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(headCX2 - 6 + i * 7, headCY2 - 24 + dy, 3, 0, Math.PI * 2);
        ctx.fill();
        // Dot glow
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(headCX2 - 6 + i * 7, headCY2 - 24 + dy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      const alpha = 0.35 + Math.sin(idleTimer * 1.1) * 0.2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#6A8AA8';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('z',  headCX2 + 12, headCY2 - 14 - Math.sin(idleTimer) * 2);
      ctx.font = 'bold 7px sans-serif';
      ctx.fillText('z',  headCX2 + 18, headCY2 - 20 - Math.sin(idleTimer) * 2);
      ctx.globalAlpha = 1;
    }
  }

  // ── Name tag ────────────────────────────────────────────────────
  const nameStr = def.name;
  ctx.font = 'bold 10px monospace';
  const nw = ctx.measureText(nameStr).width + 10;
  ctx.fillStyle = isActive ? rgba(color, 0.2) : 'rgba(6,12,20,0.85)';
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.roundRect(cx - nw / 2, ground + 5, nw, 14, 3);
  ctx.fill();
  if (isActive) {
    ctx.strokeStyle = rgba(color, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(cx - nw / 2, ground + 5, nw, 14, 3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = isActive ? color : '#7A9AB8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nameStr, cx, ground + 12);

  ctx.font = '7px monospace';
  ctx.fillStyle = rgba(color, 0.5);
  ctx.fillText(def.model, cx, ground + 23);
  ctx.textBaseline = 'alphabetic';
}

// ── Water cooler ─────────────────────────────────────────────────
function drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, floor: number): void {
  const ground = carpetY(floor);
  // Base
  ctx.fillStyle = '#1A2C3C';
  ctx.fillRect(x - 10, ground - 10, 20, 10);
  // Body
  ctx.fillStyle = '#243848';
  ctx.fillRect(x - 8, ground - 50, 16, 40);
  // Front panel sheen
  ctx.fillStyle = rgba('#4A8AB8', 0.15);
  ctx.fillRect(x - 6, ground - 48, 12, 36);
  // Spigots
  ctx.fillStyle = '#C83030';
  ctx.fillRect(x - 5, ground - 28, 4, 5);
  ctx.fillStyle = '#3050C8';
  ctx.fillRect(x + 1,  ground - 28, 4, 5);
  // Water bottle
  ctx.fillStyle = rgba('#5AAAD8', 0.65);
  ctx.fillRect(x - 6, ground - 84, 12, 36);
  // Bottle label
  ctx.fillStyle = rgba('#FFFFFF', 0.12);
  ctx.fillRect(x - 4, ground - 68, 8, 14);
  // Bottle cap
  ctx.fillStyle = '#1A4A78';
  ctx.fillRect(x - 4, ground - 86, 8, 4);
  // Logo text
  ctx.fillStyle = rgba('#FFFFFF', 0.35);
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
  // Frame
  ctx.fillStyle = '#1A2A38';
  ctx.fillRect(x - doorW / 2 - 2, ground - doorH - 2, doorW + 4, doorH + 2);
  // Door
  ctx.fillStyle = '#243444';
  ctx.fillRect(x - doorW / 2, ground - doorH, doorW, doorH);
  // Door panel inset
  ctx.fillStyle = rgba('#2A3E52', 0.8);
  ctx.fillRect(x - doorW / 2 + 3, ground - doorH + 5, doorW - 6, doorH - 18);
  // Door sheen
  ctx.fillStyle = rgba('#4A6A88', 0.12);
  ctx.fillRect(x - doorW / 2, ground - doorH, 4, doorH);
  // Handle
  ctx.fillStyle = '#7A9AB8';
  ctx.beginPath();
  ctx.arc(x + doorW / 2 - 5, ground - 40, 3, 0, Math.PI * 2);
  ctx.fill();
  // WC plaque
  ctx.fillStyle = '#0C1A28';
  ctx.fillRect(x - 10, ground - doorH - 14, 20, 12);
  ctx.strokeStyle = rgba('#3A6A9A', 0.6);
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 10, ground - doorH - 14, 20, 12);
  ctx.fillStyle = '#5A8AB8';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WC', x, ground - doorH - 8);
}

// ── Standing / walking person ────────────────────────────────────
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
  const t        = clockTime * 9;
  const legSwing = isWalking ? Math.sin(t) * 9 : 0;
  const armSwing = isWalking ? Math.sin(t) * 5 : 0;
  const headBob  = isWalking ? Math.abs(Math.sin(t)) * 1.5 : 0;
  const drinking = activity === 'away' && activityTarget === 'water';
  const flip     = (facingLeft || activity === 'walking_back') ? -1 : 1;
  const SKIN     = '#F0C090';

  ctx.save();

  // ── Ground shadow ─────────────────────────────────────────────
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(x, ground, 10, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── Shoes ─────────────────────────────────────────────────────
  const shoeY = ground - 5;
  const leftFY  = shoeY + legSwing * 0.25;
  const rightFY = shoeY - legSwing * 0.25;

  // Left shoe
  ctx.fillStyle = '#0B0B1B';
  ctx.beginPath();
  ctx.roundRect(x - 10, leftFY - 3, 11, 6, [3, 5, 2, 2]);
  ctx.fill();
  ctx.fillStyle = rgba('#FFFFFF', 0.07);
  ctx.beginPath();
  ctx.ellipse(x - 6, leftFY - 2, 3, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Right shoe
  ctx.fillStyle = '#0B0B1B';
  ctx.beginPath();
  ctx.roundRect(x + 1, rightFY - 3, 11, 6, [5, 3, 2, 2]);
  ctx.fill();
  ctx.fillStyle = rgba('#FFFFFF', 0.07);
  ctx.beginPath();
  ctx.ellipse(x + 6, rightFY - 2, 3, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Pants / legs ──────────────────────────────────────────────
  const PANT = '#151727';
  const legTop = ground - 38;

  // Left leg
  ctx.fillStyle = PANT;
  ctx.beginPath();
  ctx.roundRect(x - 8.5, legTop + legSwing, 6, (ground - 5) - (legTop + legSwing), 2);
  ctx.fill();
  // Crease highlight
  ctx.strokeStyle = rgba('#2A2E4A', 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - 6, legTop + legSwing + 4);
  ctx.lineTo(x - 6, ground - 7);
  ctx.stroke();

  // Right leg
  ctx.fillStyle = PANT;
  ctx.beginPath();
  ctx.roundRect(x + 2.5, legTop - legSwing, 6, (ground - 5) - (legTop - legSwing), 2);
  ctx.fill();
  ctx.strokeStyle = rgba('#2A2E4A', 0.55);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x + 6, legTop - legSwing + 4);
  ctx.lineTo(x + 6, ground - 7);
  ctx.stroke();

  // Belt
  ctx.fillStyle = '#0D0E1A';
  ctx.beginPath();
  ctx.roundRect(x - 9, legTop - 4, 18, 5, 1);
  ctx.fill();
  // Belt buckle
  ctx.fillStyle = rgba('#C0A050', 0.65);
  ctx.beginPath();
  ctx.roundRect(x - 2.5, legTop - 3.5, 5, 4, 1);
  ctx.fill();

  // ── Torso / jacket ────────────────────────────────────────────
  const torsoTop = ground - 70;
  const torsoBot = ground - 40;
  const shW = 10;
  const wstW = 7;

  // Jacket body (trapezoid with curves)
  ctx.fillStyle = rgba(color, 0.88);
  ctx.beginPath();
  ctx.moveTo(x - shW, torsoTop);
  ctx.bezierCurveTo(x - shW - 2, torsoTop + 8, x - wstW - 1, torsoBot - 6, x - wstW, torsoBot);
  ctx.lineTo(x + wstW, torsoBot);
  ctx.bezierCurveTo(x + wstW + 1, torsoBot - 6, x + shW + 2, torsoTop + 8, x + shW, torsoTop);
  ctx.closePath();
  ctx.fill();

  // Jacket shadow side (depth)
  ctx.fillStyle = rgba('#000000', 0.14);
  ctx.beginPath();
  ctx.moveTo(x - shW, torsoTop);
  ctx.bezierCurveTo(x - shW - 2, torsoTop + 8, x - wstW - 1, torsoBot - 6, x - wstW, torsoBot);
  ctx.lineTo(x - wstW + 2.5, torsoBot);
  ctx.bezierCurveTo(x - wstW + 2.5, torsoBot - 6, x - shW + 2, torsoTop + 9, x - shW + 2, torsoTop);
  ctx.closePath();
  ctx.fill();

  // Jacket highlight edge (opposite side)
  ctx.fillStyle = rgba('#FFFFFF', 0.07);
  ctx.beginPath();
  ctx.moveTo(x + shW, torsoTop);
  ctx.bezierCurveTo(x + shW + 2, torsoTop + 8, x + wstW + 1, torsoBot - 6, x + wstW, torsoBot);
  ctx.lineTo(x + wstW - 2, torsoBot);
  ctx.bezierCurveTo(x + wstW - 2, torsoBot - 6, x + shW, torsoTop + 8, x + shW - 2, torsoTop);
  ctx.closePath();
  ctx.fill();

  // White shirt collar (V)
  ctx.strokeStyle = rgba('#F0EDE8', 0.85);
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 4 * flip, torsoTop + 2);
  ctx.lineTo(x, torsoTop + 10);
  ctx.lineTo(x + 4 * flip, torsoTop + 2);
  ctx.stroke();

  // Tie
  ctx.fillStyle = rgba('#1A2C44', 0.9);
  ctx.beginPath();
  ctx.moveTo(x - 1.5, torsoTop + 4);
  ctx.lineTo(x - 3, torsoBot - 5);
  ctx.lineTo(x, torsoBot - 2);
  ctx.lineTo(x + 3, torsoBot - 5);
  ctx.lineTo(x + 1.5, torsoTop + 4);
  ctx.closePath();
  ctx.fill();
  // Tie knot
  ctx.fillStyle = rgba('#223344', 0.95);
  ctx.beginPath();
  ctx.roundRect(x - 2, torsoTop + 3, 4, 5, 1);
  ctx.fill();
  // Tie sheen
  ctx.fillStyle = rgba('#FFFFFF', 0.1);
  ctx.beginPath();
  ctx.moveTo(x - 0.5, torsoTop + 5);
  ctx.lineTo(x - 1, torsoTop + 12);
  ctx.lineTo(x + 0.5, torsoTop + 5);
  ctx.closePath();
  ctx.fill();

  // Jacket lapels
  ctx.fillStyle = rgba(color, 0.72);
  // Left lapel
  ctx.beginPath();
  ctx.moveTo(x - 4 * flip, torsoTop + 2);
  ctx.lineTo(x - (shW - 2), torsoTop + 7);
  ctx.lineTo(x - 3, torsoTop + 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#000000', 0.12);
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Right lapel
  ctx.beginPath();
  ctx.moveTo(x + 4 * flip, torsoTop + 2);
  ctx.lineTo(x + (shW - 2), torsoTop + 7);
  ctx.lineTo(x + 3, torsoTop + 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pocket square (tiny detail on chest)
  ctx.fillStyle = rgba('#FFFFFF', 0.25);
  ctx.beginPath();
  ctx.roundRect(x + (shW - 6) * flip, torsoTop + 9, 5, 3, 1);
  ctx.fill();

  // ── Arms ──────────────────────────────────────────────────────
  const SLEEVE = rgba(color, 0.82);
  const HAND   = SKIN;
  const shoulderY = torsoTop + 5;

  if (drinking) {
    // Left arm hanging
    ctx.fillStyle = SLEEVE;
    ctx.beginPath();
    ctx.roundRect(x - shW - 1, shoulderY, 6, 20, 3);
    ctx.fill();
    ctx.fillStyle = HAND;
    ctx.beginPath();
    ctx.ellipse(x - shW + 1, shoulderY + 22, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Right arm raised (holding cup)
    ctx.fillStyle = SLEEVE;
    ctx.beginPath();
    ctx.roundRect(x + shW - 4, shoulderY - 10, 6, 22, 3);
    ctx.fill();
    ctx.fillStyle = HAND;
    ctx.beginPath();
    ctx.ellipse(x + shW - 1, shoulderY + 10, 3.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cup
    ctx.fillStyle = rgba('#5AAAD8', 0.88);
    ctx.beginPath();
    ctx.roundRect(x + shW - 1, shoulderY - 2, 8, 10, [2, 2, 3, 3]);
    ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', 0.35);
    ctx.beginPath();
    ctx.roundRect(x + shW - 1, shoulderY - 2, 8, 3, [2, 2, 0, 0]);
    ctx.fill();
  } else {
    // Left arm (swings with walking)
    ctx.fillStyle = SLEEVE;
    ctx.beginPath();
    ctx.roundRect(x - shW - 1, shoulderY + armSwing, 6, 20, 3);
    ctx.fill();
    ctx.fillStyle = HAND;
    ctx.beginPath();
    ctx.ellipse(x - shW + 2, shoulderY + 22 + armSwing, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Right arm (opposite swing)
    ctx.fillStyle = SLEEVE;
    ctx.beginPath();
    ctx.roundRect(x + shW - 4, shoulderY - armSwing, 6, 20, 3);
    ctx.fill();
    ctx.fillStyle = HAND;
    ctx.beginPath();
    ctx.ellipse(x + shW - 1, shoulderY + 22 - armSwing, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Neck ──────────────────────────────────────────────────────
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.roundRect(x - 3, torsoTop - 6, 6, 8, 2);
  ctx.fill();

  // ── Head ──────────────────────────────────────────────────────
  const hx = x + flip * 1.5;
  const hy = ground - 82 + headBob;

  // Jaw / head shadow (subtle depth)
  ctx.fillStyle = rgba('#000000', 0.1);
  ctx.beginPath();
  ctx.ellipse(hx, hy + 3, 8.5, 10.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head base
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cheek shading (subtle)
  ctx.fillStyle = rgba('#C88060', 0.18);
  ctx.beginPath();
  ctx.ellipse(hx + flip * 4, hy + 2, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Skin highlight
  ctx.fillStyle = rgba('#FFFFFF', 0.16);
  ctx.beginPath();
  ctx.ellipse(hx - flip * 2.5, hy - 3, 3.5, 4.5, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // ── Eyes ──────────────────────────────────────────────────────
  const eyeY = hy - 2;
  const eOff = flip * 0.8;

  // Eye whites
  ctx.fillStyle = rgba('#F8F2EC', 0.92);
  ctx.beginPath();
  ctx.ellipse(hx - 2.8 + eOff, eyeY, 2.4, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx + 2.8 + eOff, eyeY, 2.4, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Irises
  ctx.fillStyle = rgba('#2A1A0A', 0.9);
  ctx.beginPath();
  ctx.ellipse(hx - 2.5 + eOff * 1.4, eyeY, 1.5, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx + 3.1 + eOff * 0.4, eyeY, 1.5, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine
  ctx.fillStyle = rgba('#FFFFFF', 0.72);
  ctx.beginPath();
  ctx.ellipse(hx - 2 + eOff * 1.4, eyeY - 0.6, 0.7, 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx + 3.6 + eOff * 0.4, eyeY - 0.6, 0.7, 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyelid line (top lid)
  ctx.strokeStyle = rgba('#401808', 0.45);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(hx - 5 + eOff, eyeY - 1.2);
  ctx.quadraticCurveTo(hx - 2.5 + eOff, eyeY - 3, hx - 0.5 + eOff, eyeY - 1.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx + 0.5 + eOff, eyeY - 1.2);
  ctx.quadraticCurveTo(hx + 3 + eOff, eyeY - 3, hx + 5.5 + eOff, eyeY - 1.2);
  ctx.stroke();

  // Eyebrows
  ctx.strokeStyle = rgba('#4A2808', 0.72);
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - 5.5 + eOff, eyeY - 4.5);
  ctx.quadraticCurveTo(hx - 2.5 + eOff, eyeY - 5.8, hx - 0.2 + eOff, eyeY - 4.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx + 0.5 + eOff, eyeY - 4.5);
  ctx.quadraticCurveTo(hx + 3 + eOff, eyeY - 5.8, hx + 5.8 + eOff, eyeY - 4.5);
  ctx.stroke();

  // Nose
  ctx.fillStyle = rgba('#B07050', 0.5);
  ctx.beginPath();
  ctx.ellipse(hx + eOff * 0.3, hy + 3.5, 1.2, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nostrils
  ctx.fillStyle = rgba('#804030', 0.35);
  ctx.beginPath();
  ctx.ellipse(hx - 1.2 + eOff * 0.3, hy + 5, 0.8, 0.6, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(hx + 1.2 + eOff * 0.3, hy + 5, 0.8, 0.6, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = rgba('#904030', 0.6);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(hx - 3.2 + eOff * 0.4, hy + 6.8);
  ctx.quadraticCurveTo(hx + eOff * 0.4, hy + 8.5, hx + 3.2 + eOff * 0.4, hy + 6.8);
  ctx.stroke();
  // Lower lip hint
  ctx.strokeStyle = rgba('#C07060', 0.25);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx - 2.2 + eOff * 0.4, hy + 7.5);
  ctx.quadraticCurveTo(hx + eOff * 0.4, hy + 8.8, hx + 2.2 + eOff * 0.4, hy + 7.5);
  ctx.stroke();

  // ── Ear ───────────────────────────────────────────────────────
  const earX = hx - flip * 8.5;
  ctx.fillStyle = rgba(SKIN, 0.85);
  ctx.beginPath();
  ctx.ellipse(earX, hy, 2.5, 3.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgba('#C08060', 0.3);
  ctx.beginPath();
  ctx.ellipse(earX, hy, 1.2, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Hair ──────────────────────────────────────────────────────
  // Main hair (covers top of head)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(hx - 0.5, hy - 4.5, 9.5, 9, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  // Hair volume / side detail
  ctx.fillStyle = rgba(color, 0.55);
  ctx.beginPath();
  ctx.ellipse(hx + flip * 2, hy - 7, 5.5, 5, 0.15, Math.PI, Math.PI * 2);
  ctx.fill();

  // Hair sheen (light catch)
  ctx.fillStyle = rgba('#FFFFFF', 0.14);
  ctx.beginPath();
  ctx.ellipse(hx - flip * 1.5, hy - 9.5, 4.5, 3, -0.25, Math.PI, Math.PI * 2);
  ctx.fill();

  // Sideburn / temple fade
  ctx.fillStyle = rgba(color, 0.35);
  ctx.beginPath();
  ctx.ellipse(hx + flip * 7, hy - 2, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
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
  const elevCarFloor = useRef<number>(0);
  const convGroup    = useRef<ConvGroup | null>(null);
  const nextConvIn   = useRef<number>(20 + Math.random() * 30);

  if (chatBubbles.current.size === 0) {
    for (const a of AGENTS) {
      const lines = getAgentLines(a.id);
      if (lines.length === 0) continue;
      chatBubbles.current.set(a.id, {
        lines,
        text: '',
        displayTimer: 0,
        displayDuration: 0,
        pauseTimer: 3 + Math.random() * 20,
        alpha: 0,
      });
    }
  }

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
        personX: a.deskX,
        walkFromX: a.deskX,
        thirstMeter: Math.random() * 0.6,
        bathroomMeter: Math.random() * 0.5,
        thirstRate: 1 / (60 + Math.random() * 60),
        bathroomRate: 1 / (90 + Math.random() * 90),
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
        if (anim.activity !== 'desk') {
          anim.activity       = 'desk';
          anim.activityTarget = null;
          anim.walkProgress   = 0;
          anim.personX        = def.deskX;
        }
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
        if (agentId === 'engineer') {
          for (const dep of ['qa', 'backend'] as AgentId[]) {
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

    // ── Night sky gradient ───────────────────────────────────────────
    const sky = ctx.createLinearGradient(0, 0, 0, actualH);
    sky.addColorStop(0,   '#03060E');
    sky.addColorStop(0.4, '#070D1C');
    sky.addColorStop(1,   '#0C1628');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, actualW, actualH);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    const buildingBottom = BLD_TOP + ROOF_H + NUM_FL * FLOOR_H;

    // ── Stars ────────────────────────────────────────────────────────
    const starPositions: [number, number, number, number][] = [
      [45,8,1.2,0],[120,15,0.8,0.5],[200,5,1.4,1],[310,18,0.9,1.5],[420,7,1.1,0.8],
      [540,12,0.7,2],[650,4,1.3,0.3],[720,16,0.9,1.8],[820,9,1.1,1.2],[880,6,0.8,2.5],
      [75,22,0.6,0.7],[250,10,1.0,1.4],[490,20,0.7,0.9],[760,14,1.2,0.2],[900,18,0.9,1.7],
    ];
    for (const [sx, sy, sr, sphase] of starPositions) {
      const alpha = 0.4 + Math.sin(clock.current * 0.8 + sphase) * 0.3;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Distant city silhouette ──────────────────────────────────────
    ctx.fillStyle = '#0A1220';
    const cityBuildings: [number, number, number][] = [
      [0,28,40],[38,35,25],[62,22,18],[79,30,30],[108,18,22],[129,35,20],
      [148,25,35],[182,18,28],[209,32,22],[230,20,18],[820,30,40],[858,20,30],
      [887,35,25],[911,22,20],[930,28,30],[959,15,22],
    ];
    for (const [bx, bh, bw] of cityBuildings) {
      ctx.fillRect(bx, BLD_TOP - bh, bw, bh);
      // Window lights on distant buildings
      ctx.fillStyle = rgba('#FFF8C0', 0.35);
      for (let wi = 0; wi < Math.floor(bw / 6); wi++) {
        for (let wj = 0; wj < Math.floor(bh / 10); wj++) {
          if ((wi + wj) % 3 !== 0) continue;
          ctx.fillRect(bx + wi * 6 + 1, BLD_TOP - bh + wj * 10 + 2, 3, 4);
        }
      }
      ctx.fillStyle = '#0A1220';
    }

    // ── Ground + pavement ────────────────────────────────────────────
    ctx.fillStyle = '#0E1620';
    ctx.fillRect(0, buildingBottom + 14, VW, VH - buildingBottom - 14);
    // Pavement
    ctx.fillStyle = '#161E2C';
    ctx.fillRect(BLD_X - 24, buildingBottom, BLD_W + 48, 16);
    // Pavement sheen
    const pavSheen = ctx.createLinearGradient(0, buildingBottom, 0, buildingBottom + 16);
    pavSheen.addColorStop(0, 'rgba(80,120,200,0.08)');
    pavSheen.addColorStop(1, 'rgba(80,120,200,0)');
    ctx.fillStyle = pavSheen;
    ctx.fillRect(BLD_X - 24, buildingBottom, BLD_W + 48, 16);
    // Tile lines
    ctx.strokeStyle = rgba('#2A3A50', 0.6);
    ctx.lineWidth = 0.5;
    for (let sx = BLD_X - 24; sx < BLD_X + BLD_W + 24; sx += 40) {
      ctx.beginPath(); ctx.moveTo(sx, buildingBottom); ctx.lineTo(sx, buildingBottom + 16); ctx.stroke();
    }
    // Entry steps
    ctx.fillStyle = '#1E2A3C';
    ctx.fillRect(BLD_X + 108, buildingBottom + 16, 84, 8);
    ctx.fillRect(BLD_X + 116, buildingBottom + 24, 68, 6);
    // Step highlight
    ctx.fillStyle = rgba('#3A5070', 0.4);
    ctx.fillRect(BLD_X + 108, buildingBottom + 16, 84, 2);
    ctx.fillRect(BLD_X + 116, buildingBottom + 24, 68, 2);

    // ── Building outer shell ─────────────────────────────────────────
    // Shadow outline
    ctx.fillStyle = '#050A14';
    ctx.fillRect(BLD_X - 8, BLD_TOP - 6, BLD_W + 16, buildingBottom - BLD_TOP + 8);
    // Main body
    const bldGrad = ctx.createLinearGradient(BLD_X, 0, BLD_X + BLD_W, 0);
    bldGrad.addColorStop(0, '#0D1828');
    bldGrad.addColorStop(0.5, '#111F30');
    bldGrad.addColorStop(1, '#0A1520');
    ctx.fillStyle = bldGrad;
    ctx.fillRect(BLD_X, BLD_TOP, BLD_W, buildingBottom - BLD_TOP);

    // Floor slabs
    for (let f = 0; f <= NUM_FL; f++) {
      const fy = BLD_TOP + ROOF_H + f * FLOOR_H;
      ctx.fillStyle = '#060C16';
      ctx.fillRect(BLD_X, fy - 1, BLD_W, SLAB_H + 1);
      // Slab edge highlight
      ctx.fillStyle = rgba('#2A4060', 0.5);
      ctx.fillRect(BLD_X, fy - 1, BLD_W, 1);
    }

    // ── Floor interiors ──────────────────────────────────────────────
    const floorCfg = [
      { f: 2, label: 'EXECUTIVE',   wall: '#0C1B30', carpet: '#0E2040', dept: '#0E2A60', deptText: '#4A80D8' },
      { f: 1, label: 'ENGINEERING', wall: '#0A1820', carpet: '#0A2030', dept: '#083C30', deptText: '#3AAA88' },
      { f: 0, label: 'SUPPORT',     wall: '#160E0A', carpet: '#1C1208', dept: '#401C08', deptText: '#C07840' },
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

      // Subtle wall texture — vertical grid lines
      ctx.strokeStyle = rgba('#FFFFFF', 0.022);
      ctx.lineWidth = 0.5;
      for (let wlx = BLD_X + DEPT_W + 80; wlx < iRight; wlx += 80) {
        ctx.beginPath(); ctx.moveTo(wlx, iTop); ctx.lineTo(wlx, iTop + iH - 24); ctx.stroke();
      }

      // Carpet strip
      ctx.fillStyle = fc.carpet;
      ctx.fillRect(BLD_X + DEPT_W, iTop + iH - 24, iW, 24);
      // Carpet sheen
      ctx.fillStyle = rgba('#FFFFFF', 0.04);
      ctx.fillRect(BLD_X + DEPT_W, iTop + iH - 24, iW, 4);

      // Baseboard
      ctx.fillStyle = rgba('#FFFFFF', 0.06);
      ctx.fillRect(BLD_X + DEPT_W, iTop + iH - SLAB_H, iW, SLAB_H);

      // Department tab
      ctx.fillStyle = fc.dept;
      ctx.fillRect(BLD_X, iTop, DEPT_W, iH);
      // Dept tab edge highlight
      ctx.fillStyle = rgba('#FFFFFF', 0.1);
      ctx.fillRect(BLD_X + DEPT_W - 1, iTop, 1, iH);

      // Department label (rotated)
      ctx.save();
      ctx.translate(BLD_X + 14, iTop + iH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = fc.deptText;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fc.label, 0, 0);
      ctx.restore();

      // Floor number badge
      ctx.fillStyle = rgba('#000000', 0.5);
      ctx.beginPath();
      ctx.roundRect(iRight - 29, iTop + 6, 24, 15, 3);
      ctx.fill();
      ctx.fillStyle = fc.deptText;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`F${NUM_FL - fc.f}`, iRight - 17, iTop + 14);

      // ── Ceiling lights ────────────────────────────────────────────
      for (let lx = BLD_X + DEPT_W + 80; lx < iRight - 70; lx += 160) {
        // Fixture
        ctx.fillStyle = '#1A2A3A';
        ctx.fillRect(lx - 28, iTop + SLAB_H, 56, 5);
        ctx.fillStyle = '#E8F0FF';
        ctx.globalAlpha = 0.7 + Math.sin(clock.current * 0.3 + lx) * 0.05;
        ctx.fillRect(lx - 25, iTop + SLAB_H + 1, 50, 3);
        ctx.globalAlpha = 1;
        // Light cone — wider and softer
        const lgr = ctx.createLinearGradient(lx, iTop + SLAB_H + 5, lx, iTop + iH - 20);
        lgr.addColorStop(0, 'rgba(200,220,255,0.12)');
        lgr.addColorStop(0.6, 'rgba(200,220,255,0.04)');
        lgr.addColorStop(1, 'rgba(200,220,255,0)');
        ctx.fillStyle = lgr;
        ctx.beginPath();
        ctx.moveTo(lx - 25, iTop + SLAB_H + 5);
        ctx.lineTo(lx + 25, iTop + SLAB_H + 5);
        ctx.lineTo(lx + 70, iTop + iH - 20);
        ctx.lineTo(lx - 70, iTop + iH - 20);
        ctx.closePath();
        ctx.fill();
      }

      // ── Window (right side) ───────────────────────────────────────
      const winX = iRight - 62;
      const winY = iTop + 16;
      const winW = 48;
      const winH = iH - 34;
      // Window frame
      ctx.fillStyle = '#0A1828';
      ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);
      // Night sky through window
      const winSky = ctx.createLinearGradient(winX, winY, winX, winY + winH);
      winSky.addColorStop(0, '#03060E');
      winSky.addColorStop(1, '#0A1828');
      ctx.fillStyle = winSky;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(winX, winY, winW, winH);
      ctx.globalAlpha = 1;
      // City lights through window
      ctx.fillStyle = rgba('#FFD070', 0.15);
      ctx.fillRect(winX, winY + winH * 0.6, winW, winH * 0.4);
      // Window frame dividers
      ctx.strokeStyle = rgba('#2A4060', 0.7);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(winX, winY, winW, winH);
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2); ctx.stroke();
      // Window reflection
      ctx.fillStyle = rgba('#FFFFFF', 0.04);
      ctx.fillRect(winX, winY, 6, winH);

      // ── Plant ─────────────────────────────────────────────────────
      const px2  = iRight - 88;
      const pg   = carpetY(fc.f);
      ctx.fillStyle = '#1A2810';
      ctx.fillRect(px2 - 7, pg - 24, 14, 18);
      // Pot rim
      ctx.fillStyle = '#243818';
      ctx.fillRect(px2 - 8, pg - 26, 16, 3);
      ctx.fillStyle = '#1A3010';
      ctx.beginPath(); ctx.arc(px2, pg - 36, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#122208';
      ctx.beginPath(); ctx.arc(px2 - 9, pg - 40, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1C3A12';
      ctx.beginPath(); ctx.arc(px2 + 8, pg - 42, 8, 0, Math.PI * 2); ctx.fill();
      // Leaf sheen
      ctx.fillStyle = rgba('#40FF80', 0.06);
      ctx.beginPath(); ctx.arc(px2 - 2, pg - 42, 6, 0, Math.PI * 2); ctx.fill();

      // ── Amenities ─────────────────────────────────────────────────
      const am = FLOOR_AMENITIES[fc.f];
      drawBathroomDoor(ctx, am.bathroomX, fc.f);
      drawWaterCooler(ctx, am.waterX, fc.f);

      // ── Executive floor: offices + boardroom ──────────────────────
      if (fc.f === 2) {
        const mrX = BLD_X + DEPT_W + 420;
        const mrW = iRight - (BLD_X + DEPT_W + 420) - 70;
        const divX = BLD_X + DEPT_W + 172;
        const wallTop = iTop + SLAB_H;
        const doorH   = 22;

        // Office divider
        ctx.fillStyle = '#1A2A3A';
        ctx.fillRect(divX, wallTop, 3, iH - SLAB_H - doorH);
        ctx.fillStyle = '#243848';
        ctx.fillRect(divX - 2, wallTop + iH - SLAB_H - doorH, 7, 3);

        // Office labels
        ctx.fillStyle = rgba('#4A7AB8', 0.45);
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('CEO', BLD_X + DEPT_W + 86, wallTop + 12);
        ctx.fillText('CTO', (divX + mrX) / 2, wallTop + 12);

        ctx.fillStyle = '#243848';
        ctx.fillRect(divX - doorH, wallTop + iH - SLAB_H - doorH, doorH, 2);

        // Boardroom glass partition
        ctx.strokeStyle = rgba('#3A6A9A', 0.4);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(mrX, iTop + 10);
        ctx.lineTo(mrX, iTop + iH - SLAB_H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = rgba('#3A6A9A', 0.3);
        ctx.font = '7px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('BOARDROOM', mrX + 6, iTop + 20);

        // Conference table
        const tY = carpetY(2) - 52;
        ctx.fillStyle = '#1C2E42';
        ctx.fillRect(mrX + 14, tY, mrW - 28, 10);
        ctx.fillStyle = '#162438';
        ctx.fillRect(mrX + 14, tY + 10, 16, 40);
        ctx.fillRect(mrX + mrW - 28 - 2, tY + 10, 16, 40);
        // Table sheen
        ctx.fillStyle = rgba('#4A8AB8', 0.08);
        ctx.fillRect(mrX + 14, tY, mrW - 28, 4);

        for (let ci = 0; ci < 3; ci++) {
          const cx3 = mrX + 30 + ci * 38;
          ctx.fillStyle = '#1C3050';
          ctx.fillRect(cx3 - 8, tY - 30, 16, 28);
          ctx.fillStyle = '#243C62';
          ctx.fillRect(cx3 - 10, tY - 4, 20, 6);
        }
        // Boardroom screen
        ctx.fillStyle = '#080E18';
        ctx.fillRect(mrX + 16, iTop + 30, 60, 40);
        ctx.fillStyle = rgba('#1A3A6A', 0.8);
        ctx.fillRect(mrX + 18, iTop + 32, 56, 36);
        // Screen glow
        ctx.fillStyle = rgba('#3A7AC8', 0.12);
        ctx.fillRect(mrX + 18, iTop + 32, 56, 36);
      }
    }

    // ── Elevator shaft ────────────────────────────────────────────────
    const elTopY = BLD_TOP + ROOF_H;
    const elBotY = buildingBottom;
    ctx.fillStyle = '#060C16';
    ctx.fillRect(ELEV_X, elTopY, ELEV_W, elBotY - elTopY);
    // Guide rails
    ctx.strokeStyle = '#1A2A3A';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ELEV_X + 8, elTopY); ctx.lineTo(ELEV_X + 8, elBotY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ELEV_X + ELEV_W - 8, elTopY); ctx.lineTo(ELEV_X + ELEV_W - 8, elBotY); ctx.stroke();
    // Rail highlights
    ctx.strokeStyle = rgba('#2A4060', 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ELEV_X + 9, elTopY); ctx.lineTo(ELEV_X + 9, elBotY); ctx.stroke();

    // Elevator car
    const carTopY = carTopYForFloor(elevCarFloor.current);
    const carH2   = FLOOR_H - SLAB_H - 6;
    ctx.fillStyle = '#1A2A3A';
    ctx.fillRect(ELEV_X + 4, carTopY, ELEV_W - 8, carH2);
    // Car door line
    ctx.strokeStyle = '#243848';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ELEV_X + ELEV_W / 2, carTopY + 4); ctx.lineTo(ELEV_X + ELEV_W / 2, carTopY + carH2 - 4); ctx.stroke();
    // Car sheen
    ctx.fillStyle = rgba('#4A7AA8', 0.08);
    ctx.fillRect(ELEV_X + 4, carTopY, 6, carH2);
    ctx.fillStyle = '#5A8AB8';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIFT', ELEV_X + ELEV_W / 2, carTopY + carH2 / 2);

    ctx.fillStyle = '#2A4A6A';
    ctx.font = '10px sans-serif';
    ctx.fillText('▲', ELEV_X + ELEV_W / 2, elTopY + 14);
    ctx.fillText('▼', ELEV_X + ELEV_W / 2, elBotY - 8);

    // ── Roof ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#060C16';
    ctx.fillRect(BLD_X - 8, BLD_TOP - 6, BLD_W + 16, ROOF_H + 6);
    ctx.fillStyle = '#0C1828';
    ctx.fillRect(BLD_X, BLD_TOP, BLD_W, ROOF_H - 2);
    // Roof edge highlight
    ctx.fillStyle = rgba('#2A4060', 0.5);
    ctx.fillRect(BLD_X, BLD_TOP, BLD_W, 2);

    // Rooftop HVAC units
    for (const [rx, rw, rh] of [[BLD_X + 60, 42, 28],[BLD_X + 180, 36, 22],[BLD_X + 640, 40, 26]] as [number,number,number][]) {
      ctx.fillStyle = '#0E1C2C';
      ctx.fillRect(rx, BLD_TOP + 6, rw, rh);
      ctx.fillStyle = '#162438';
      ctx.fillRect(rx, BLD_TOP + 6, rw, 3);
      ctx.strokeStyle = rgba('#1A3050', 0.6);
      ctx.lineWidth = 0.8;
      for (let vl = 0; vl < 3; vl++) {
        ctx.beginPath();
        ctx.moveTo(rx + 4, BLD_TOP + 10 + vl * 6);
        ctx.lineTo(rx + rw - 4, BLD_TOP + 10 + vl * 6);
        ctx.stroke();
      }
    }

    // Antenna
    ctx.strokeStyle = '#162438';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(BLD_X + BLD_W - 110, BLD_TOP);
    ctx.lineTo(BLD_X + BLD_W - 110, BLD_TOP - 32);
    ctx.stroke();
    // Antenna blink
    const blinkAlpha = 0.5 + Math.sin(clock.current * 3) * 0.5;
    ctx.globalAlpha = blinkAlpha;
    ctx.fillStyle = '#FF3030';
    ctx.beginPath();
    ctx.arc(BLD_X + BLD_W - 110, BLD_TOP - 32, 4, 0, Math.PI * 2);
    ctx.fill();
    // Blink glow
    ctx.globalAlpha = blinkAlpha * 0.3;
    ctx.fillStyle = '#FF3030';
    ctx.beginPath();
    ctx.arc(BLD_X + BLD_W - 110, BLD_TOP - 32, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Company sign ──────────────────────────────────────────────────
    const signW = 270;
    const signX = BLD_X + (BLD_W - signW) / 2;
    const signY = BLD_TOP + 7;
    // Sign bg with glow
    ctx.fillStyle = '#04081A';
    ctx.fillRect(signX - 2, signY - 2, signW + 4, 38);
    ctx.fillStyle = '#080E28';
    ctx.fillRect(signX, signY, signW, 34);
    // Sign border glow
    const signGlow = ctx.createLinearGradient(signX, signY, signX + signW, signY);
    signGlow.addColorStop(0, 'rgba(60,100,220,0.4)');
    signGlow.addColorStop(0.5, 'rgba(100,140,255,0.7)');
    signGlow.addColorStop(1, 'rgba(60,100,220,0.4)');
    ctx.strokeStyle = signGlow;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(signX + 1, signY + 1, signW - 2, 32);
    // Sign text with glow
    ctx.shadowColor = '#4A80FF';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OPENCLAW CORP.', signX + signW / 2, signY + 17);
    ctx.shadowBlur = 0;
    // Subtle underline
    ctx.strokeStyle = rgba('#4A80FF', 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(signX + 20, signY + 28);
    ctx.lineTo(signX + signW - 20, signY + 28);
    ctx.stroke();

    // ── Workstations ──────────────────────────────────────────────────
    const activeAgents = useGameStore.getState().activeAgents;
    for (const def of AGENTS) {
      const anim = npcAnims.current.get(def.id);
      if (!anim) continue;
      const isActive = anim.isActive || activeAgents.has(def.id);
      const showPerson = !anim.activity || anim.activity === 'desk';
      drawWorkstation(ctx, def, isActive, clock.current, anim.idleTimer, showPerson);
    }

    // ── Away / walking persons ─────────────────────────────────────
    for (const def of AGENTS) {
      const anim = npcAnims.current.get(def.id);
      if (!anim || anim.activity === 'desk') continue;
      if (anim.activity === 'away' && anim.activityTarget === 'bathroom') continue;
      const isChatting = anim.activity === 'chatting';
      const drawAct = anim.activity === 'walking_to_conv' ? 'walking_away' : isChatting ? 'away' : anim.activity;
      drawStandingPerson(
        ctx, anim.personX, def.floor, def.color, clock.current,
        drawAct as 'walking_away' | 'away' | 'walking_back',
        anim.activityTarget,
        isChatting && anim.convFacingLeft === true,
      );
    }

    // ── Chat bubbles ──────────────────────────────────────────────────
    {
      const BUBBLE_W  = 158;
      const PAD       = 8;
      const LINE_H    = 13;
      const TAIL_H    = 8;
      const TAIL_BASE = 10;
      const MAX_CHARS = 26;
      const RADIUS    = 8;

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
        if (anim?.activity === 'away' && anim.activityTarget === 'bathroom') continue;

        const floor  = def.floor;
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
        const rawBubX = headX - BUBBLE_W / 2;
        const bubX    = Math.max(BLD_X + DEPT_W + 4, Math.min(ELEV_X - BUBBLE_W - 4, rawBubX));
        toDraw.push({ wrappedLines, alpha: bubble.alpha, color: def.color, headX, tailTipY, bubH, bubX, top: defaultTop });
      }

      toDraw.sort((a, b) => b.tailTipY - a.tailTipY);
      for (let i = 0; i < toDraw.length; i++) {
        const b  = toDraw[i];
        const bX1 = b.bubX, bX2 = b.bubX + BUBBLE_W;
        for (let j = 0; j < i; j++) {
          const p  = toDraw[j];
          const pX1 = p.bubX, pX2 = p.bubX + BUBBLE_W;
          if (bX1 >= pX2 || bX2 <= pX1) continue;
          const bBot = b.top + b.bubH;
          const pBot = p.top + p.bubH;
          if (b.top < pBot && bBot > p.top) b.top = p.top - b.bubH - 6;
        }
      }

      for (const b of toDraw) {
        const { wrappedLines, alpha, color, headX, tailTipY, bubH, bubX, top } = b;

        // Tail
        ctx.globalAlpha = alpha * 0.92;
        ctx.fillStyle   = rgba('#060E1A', 0.92);
        ctx.beginPath();
        ctx.moveTo(headX - TAIL_BASE / 2, top + bubH);
        ctx.lineTo(headX + TAIL_BASE / 2, top + bubH);
        ctx.lineTo(headX, tailTipY);
        ctx.closePath();
        ctx.fill();

        // Bubble bg — glassmorphism dark
        ctx.fillStyle = rgba('#060E1A', 0.88);
        ctx.beginPath();
        ctx.roundRect(bubX, top, BUBBLE_W, bubH, RADIUS);
        ctx.fill();

        // Subtle inner highlight
        ctx.fillStyle = rgba('#FFFFFF', 0.03);
        ctx.beginPath();
        ctx.roundRect(bubX + 1, top + 1, BUBBLE_W - 2, 12, RADIUS);
        ctx.fill();

        // Colored border glow
        ctx.strokeStyle = rgba(color, 0.5);
        ctx.lineWidth   = 1;
        ctx.globalAlpha = alpha * 0.7;
        ctx.beginPath();
        ctx.roundRect(bubX, top, BUBBLE_W, bubH, RADIUS);
        ctx.stroke();

        // Color accent dot
        ctx.fillStyle   = color;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(bubX + PAD - 1, top + PAD + LINE_H / 2 - 1, 3, 0, Math.PI * 2);
        ctx.fill();
        // Dot glow
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.arc(bubX + PAD - 1, top + PAD + LINE_H / 2 - 1, 6, 0, Math.PI * 2);
        ctx.fill();

        // Text
        ctx.globalAlpha   = alpha;
        ctx.fillStyle     = '#D8E8F8';
        ctx.font          = '8.5px monospace';
        ctx.textAlign     = 'left';
        ctx.textBaseline  = 'top';
        for (let li = 0; li < wrappedLines.length; li++) {
          ctx.fillText(wrappedLines[li], bubX + PAD + 7, top + PAD + li * LINE_H);
        }

        ctx.globalAlpha  = 1;
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── Packet animations ─────────────────────────────────────────────
    for (const pkt of packets.current) {
      if (pkt.burst > 0) {
        // Burst rings
        for (let ring = 0; ring < 2; ring++) {
          const rb = (24 + ring * 12) * pkt.burst;
          const ra = Math.max(0, (1 - pkt.burst * (1 + ring * 0.3)));
          ctx.globalAlpha = ra * 0.6;
          ctx.strokeStyle = pkt.color;
          ctx.lineWidth   = 2 - ring * 0.5;
          ctx.beginPath();
          ctx.arc(pkt.toX, pkt.toY, rb, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Burst sparks
        if (pkt.burst < 0.4) {
          for (let sp = 0; sp < 5; sp++) {
            const angle = (sp / 5) * Math.PI * 2;
            const dist = 15 * pkt.burst * 3;
            const sx2 = pkt.toX + Math.cos(angle) * dist;
            const sy2 = pkt.toY + Math.sin(angle) * dist;
            ctx.globalAlpha = (0.4 - pkt.burst) / 0.4 * 0.8;
            ctx.fillStyle = pkt.color;
            ctx.beginPath();
            ctx.arc(sx2, sy2, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      } else {
        const t2   = pkt.progress;
        const px3  = pkt.fromX + (pkt.toX - pkt.fromX) * t2;
        const py3  = pkt.fromY + (pkt.toY - pkt.fromY) * t2;
        const arc  = -70 * Math.sin(Math.PI * t2);

        // Trail — 4 fading particles
        for (let i = 1; i <= 4; i++) {
          const tp  = Math.max(0, t2 - i * 0.055);
          const tx3 = pkt.fromX + (pkt.toX - pkt.fromX) * tp;
          const ty3 = pkt.fromY + (pkt.toY - pkt.fromY) * tp;
          const ta  = -70 * Math.sin(Math.PI * tp);
          ctx.globalAlpha = 0.08 * (5 - i) / 4;
          ctx.fillStyle = pkt.color;
          ctx.beginPath();
          ctx.arc(tx3, ty3 + ta, 6 - i, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Outer glow
        const gr2 = ctx.createRadialGradient(px3, py3 + arc, 0, px3, py3 + arc, 22);
        gr2.addColorStop(0, rgba(pkt.color, 0.5));
        gr2.addColorStop(0.4, rgba(pkt.color, 0.2));
        gr2.addColorStop(1, rgba(pkt.color, 0));
        ctx.fillStyle = gr2;
        ctx.beginPath();
        ctx.arc(px3, py3 + arc, 22, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px3, py3 + arc, 5, 0, Math.PI * 2);
        ctx.fill();
        // Inner color
        ctx.fillStyle = pkt.color;
        ctx.beginPath();
        ctx.arc(px3, py3 + arc, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── Remote players ────────────────────────────────────────────────
    const players = useGameStore.getState().players;
    const localId = useGameStore.getState().localPlayerId;
    let visX = BLD_X + 100;
    for (const pl of Object.values(players)) {
      if (pl.id === localId) continue;
      const vGround = buildingBottom - 4;
      // Visitor glow
      const vgr = ctx.createRadialGradient(visX, vGround - 28, 0, visX, vGround - 28, 20);
      vgr.addColorStop(0, rgba(pl.color, 0.25));
      vgr.addColorStop(1, rgba(pl.color, 0));
      ctx.fillStyle = vgr;
      ctx.beginPath();
      ctx.arc(visX, vGround - 28, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pl.color;
      ctx.beginPath();
      ctx.arc(visX, vGround - 28, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pl.name.charAt(0).toUpperCase(), visX, vGround - 28);
      ctx.fillStyle = '#C85000';
      ctx.fillRect(visX - 16, vGround - 14, 32, 10);
      ctx.fillStyle = '#FFF';
      ctx.font = '6px monospace';
      ctx.fillText('VISITOR', visX, vGround - 9);
      ctx.fillStyle = '#8AA8C8';
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

    const activeAgents = useGameStore.getState().activeAgents;
    for (const def of AGENTS) {
      const anim = npcAnims.current.get(def.id);
      if (!anim) continue;
      const am = FLOOR_AMENITIES[def.floor];

      if (!anim.activity) {
        anim.activity         = 'desk';
        anim.activityTarget   = null;
        anim.walkProgress     = 0;
        anim.awayTimer        = 0;
        if (anim.personX   == null) anim.personX   = def.deskX;
        if (anim.walkFromX == null) anim.walkFromX = def.deskX;
        if (anim.thirstMeter   == null) anim.thirstMeter   = Math.random() * 0.5;
        if (anim.bathroomMeter == null) anim.bathroomMeter = Math.random() * 0.5;
        if (anim.thirstRate    == null) anim.thirstRate    = 1 / (60 + Math.random() * 60);
        if (anim.bathroomRate  == null) anim.bathroomRate  = 1 / (90 + Math.random() * 90);
      }

      const isWorking = anim.isActive || activeAgents.has(def.id);
      if (isWorking) {
        if (anim.activity !== 'desk') {
          anim.activity       = 'desk';
          anim.activityTarget = null;
          anim.walkProgress   = 0;
          anim.personX        = def.deskX;
        } else {
          anim.personX = def.deskX;
        }
        continue;
      }

      const getAmenityX = (): number => {
        if (anim.activityTarget === 'water')    return am.waterX;
        if (anim.activityTarget === 'bathroom') return am.bathroomX;
        return def.deskX;
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
        anim.personX = def.deskX;
        anim.thirstMeter   = Math.min(1, anim.thirstMeter   + delta * anim.thirstRate);
        anim.bathroomMeter = Math.min(1, anim.bathroomMeter + delta * anim.bathroomRate);
        if (anim.thirstMeter >= 1) {
          anim.thirstMeter    = 0;
          anim.activityTarget = 'water';
          anim.walkFromX = anim.personX; anim.activity = 'walking_away'; anim.walkProgress = 0;
        } else if (anim.bathroomMeter >= 1) {
          anim.bathroomMeter  = 0;
          anim.activityTarget = 'bathroom';
          anim.walkFromX = anim.personX; anim.activity = 'walking_away'; anim.walkProgress = 0;
        }
      } else if (anim.activity === 'walking_away') {
        walkTo(getAmenityX(), 'away', WALK_TIME, () => {
          anim.awayTimer = AWAY_MIN + Math.random() * (AWAY_MAX - AWAY_MIN);
        });
      } else if (anim.activity === 'away') {
        anim.personX    = getAmenityX();
        anim.awayTimer -= delta;
        if (anim.awayTimer <= 0) {
          anim.walkFromX = anim.personX; anim.walkProgress = 0; anim.activity = 'walking_back';
        }
      } else if (anim.activity === 'walking_back') {
        walkTo(def.deskX, 'desk', WALK_TIME, () => {
          anim.activityTarget = null; anim.personX = def.deskX;
        });
      } else if (anim.activity === 'walking_to_conv') {
        const meetX = anim.convMeetX ?? def.deskX;
        walkTo(meetX, 'chatting');
      } else if (anim.activity === 'chatting') {
        anim.personX = anim.convMeetX ?? anim.personX;
      }
    }

    {
      const cg = convGroup.current;
      const activeAgentsNow = useGameStore.getState().activeAgents;

      if (cg) {
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
          const allArrived = cg.template.participants.every(
            id => npcAnims.current.get(id)?.activity === 'chatting'
          );
          if (allArrived) { cg.phase = 'chatting'; cg.lineIndex = -1; cg.lineTimer = 0; }
        } else if (cg.phase === 'chatting') {
          cg.lineTimer -= delta;
          if (cg.lineTimer <= 0) {
            cg.lineIndex++;
            if (cg.lineIndex >= cg.lines.length) {
              cg.phase = 'returning';
              for (const id of cg.template.participants) {
                const a = npcAnims.current.get(id);
                if (a) { a.activity = 'walking_back'; a.walkFromX = a.personX; a.walkProgress = 0; a.activityTarget = null; }
                const b = chatBubbles.current.get(id);
                if (b) b.pauseTimer = 8 + Math.random() * 15;
              }
            } else {
              const line = cg.lines[cg.lineIndex];
              const displayTime = 3 + line.text.length * 0.025;
              cg.lineTimer = displayTime;
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
          const allBack = cg.template.participants.every(id => npcAnims.current.get(id)?.activity === 'desk');
          if (allBack) { convGroup.current = null; nextConvIn.current = 30 + Math.random() * 45; }
        }
      } else {
        nextConvIn.current -= delta;
        if (nextConvIn.current <= 0) {
          const eligible = CONV_TEMPLATES.filter(t => {
            if (!t.participants.every(id => {
              const a = npcAnims.current.get(id);
              return a?.activity === 'desk' && !a.isActive && !activeAgentsNow.has(id);
            })) return false;
            const initiatorId   = t.initiatorId ?? t.participants[0];
            const initiatorDef  = AGENTS.find(a => a.id === initiatorId);
            const initiatorRank = initiatorDef?.rank ?? 99;
            return t.participants.every(id => {
              const d = AGENTS.find(a => a.id === id);
              return (d?.rank ?? 99) >= initiatorRank;
            });
          });
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

    // Animate elevator
    const targetFloor = Math.floor(clock.current / 8) % 3;
    const diff = targetFloor - elevCarFloor.current;
    elevCarFloor.current += diff * delta * 0.8;

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
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId.current);
    };
  }, [loop]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', cursor: 'default' }}
    />
  );
};
