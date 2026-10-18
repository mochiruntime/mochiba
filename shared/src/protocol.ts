export type Team = 'BLUE' | 'RED';

export type CrowdControlType = 'CHARMED' | 'SLOWED' | 'STUNNED';

export interface CrowdControlState {
  type: CrowdControlType;
  remainingDuration: number;
  sourceId: string;
}

export type ProjectileType =
  | 'BASIC_ATTACK'
  | 'ECHO_ORB_OUT'
  | 'ECHO_ORB_RETURN'
  | 'SPECTRAL_EMBER'
  | 'CHARM_BOLT'
  | 'ASTRAL_SURGE_BOLT';

export interface ProjectileState {
  id: string;
  ownerId: string;
  team: Team;
  type: ProjectileType;
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  targetId?: string; // For homing attacks (Basic, W, R)
  damage: number;
  radius: number;
  maxDistance: number;
  distanceTraveled: number;
  isOrbiting?: boolean;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitLifetime?: number;
  launchDelay?: number;
}

export interface ChampionState {
  id: string;
  championId: string;
  name: string;
  team: Team;
  position: { x: number; z: number };
  targetPosition: { x: number; z: number } | null;
  rotation: number;
  speed: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  isAlive: boolean;
  respawnTimer: number;
  crowdControl: CrowdControlState | null;
  cooldowns: {
    q: number;
    w: number;
    e: number;
    r: number;
    basicAttack: number;
  };
  rCharges: number;
  rWindowRemaining: number;
}

export interface WorldSnapshot {
  tick: number;
  timestamp: number;
  champions: ChampionState[];
  projectiles: ProjectileState[];
}

export type ClientMessage =
  | { type: 'PING'; clientTime: number }
  | { type: 'MOVE_COMMAND'; target: { x: number; z: number } }
  | { type: 'ATTACK_TARGET'; targetId: string }
  | { type: 'CAST_SPELL'; spell: 'Q' | 'W' | 'E' | 'R'; target: { x: number; z: number } }
  | { type: 'SELECT_CHAMPION'; championId: string };

export type ServerMessage =
  | { type: 'PONG'; clientTime: number; serverTime: number }
  | { type: 'HELLO'; clientId: string; serverTickRate: number; team: Team; snapshot: WorldSnapshot }
  | { type: 'SNAPSHOT'; snapshot: WorldSnapshot };

export type NetworkMessage = ClientMessage | ServerMessage;
