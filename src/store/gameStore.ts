import { create } from 'zustand';
import type { PlayerData, GamePhase, LocalPlayerState } from '../types';

export interface HandoffEntry {
  from: string;
  to: string;
  at: number;
}

interface GameStore {
  phase: GamePhase;
  localPlayer: LocalPlayerState;
  localPlayerId: string | null;
  players: Record<string, PlayerData>;
  agentJobQueue: string[];
  agentIdleQueue: string[];
  activeAgents: Set<string>;
  handoffLog: HandoffEntry[];
  roleplayOpen: boolean;

  setPhase: (phase: GamePhase) => void;
  pushAgentJob: (agentId: string) => void;
  pushAgentIdle: (agentId: string) => void;
  pushHandoff: (entry: HandoffEntry) => void;
  setLocalPlayer: (player: LocalPlayerState) => void;
  setLocalPlayerId: (id: string) => void;
  addPlayer: (player: PlayerData) => void;
  removePlayer: (id: string) => void;
  updatePlayer: (id: string, data: Partial<PlayerData>) => void;
  setPlayers: (players: PlayerData[]) => void;
  toggleRoleplay: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  phase: 'landing',
  localPlayer: { name: '', color: '#4A90D9' },
  localPlayerId: null,
  players: {},
  agentJobQueue: [],
  agentIdleQueue: [],
  activeAgents: new Set<string>(),
  handoffLog: [],
  roleplayOpen: false,

  setPhase: (phase) => set({ phase }),
  pushAgentJob: (agentId) => set((s) => {
    const next = new Set(s.activeAgents);
    next.add(agentId);
    return { agentJobQueue: [...s.agentJobQueue, agentId], activeAgents: next };
  }),
  pushAgentIdle: (agentId) => set((s) => {
    const next = new Set(s.activeAgents);
    next.delete(agentId);
    return { agentIdleQueue: [...s.agentIdleQueue, agentId], activeAgents: next };
  }),
  pushHandoff: (entry) => set((s) => ({
    handoffLog: [entry, ...s.handoffLog].slice(0, 6),
  })),
  setLocalPlayer: (player) => set({ localPlayer: player }),
  setLocalPlayerId: (id) => set({ localPlayerId: id }),
  addPlayer: (player) => set((state) => ({ players: { ...state.players, [player.id]: player } })),
  removePlayer: (id) => set((state) => {
    const players = { ...state.players };
    delete players[id];
    return { players };
  }),
  updatePlayer: (id, data) => set((state) => ({
    players: { ...state.players, [id]: { ...state.players[id], ...data } },
  })),
  setPlayers: (players) => set({
    players: players.reduce<Record<string, PlayerData>>((acc, p) => ({ ...acc, [p.id]: p }), {}),
  }),
  toggleRoleplay: () => set((s) => ({ roleplayOpen: !s.roleplayOpen })),
}));
