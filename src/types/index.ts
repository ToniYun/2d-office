export interface PlayerData {
  id: string;
  name: string;
  color: string;
  position: [number, number, number];
  rotation: [number, number];
}

export interface LocalPlayerState {
  name: string;
  color: string;
}

export type GamePhase = 'landing' | 'playing';
