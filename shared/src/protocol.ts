export type Team = 'BLUE' | 'RED';

export interface ChampionState {
  id: string;
  name: string;
  team: Team;
  position: { x: number; z: number };
  targetPosition: { x: number; z: number } | null;
  rotation: number;
  speed: number;
}

export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  champions: ChampionState[];
}

export type ClientMessage =
  | { type: 'PING'; clientTime: number }
  | { type: 'MOVE_COMMAND'; target: { x: number; z: number } };

export type ServerMessage =
  | { type: 'PONG'; clientTime: number; serverTime: number }
  | { type: 'HELLO'; clientId: string; serverTickRate: number; team: Team; snapshot: WorldSnapshot }
  | { type: 'SNAPSHOT'; snapshot: WorldSnapshot };

export type NetworkMessage = ClientMessage | ServerMessage;
