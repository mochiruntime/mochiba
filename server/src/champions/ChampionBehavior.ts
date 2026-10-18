import {
  ChampionState,
  ChampionDefinition,
  ProjectileState,
  Team,
  CrowdControlType
} from '@mochiba/shared';

export interface ICombatContext {
  spawnProjectile(data: Omit<ProjectileState, 'id'>): ProjectileState;
  findNearestEnemy(champ: ChampionState, range: number): ChampionState | null;
  findEnemiesInRange(champ: ChampionState, range: number, maxCount?: number): ChampionState[];
  dealDamage(sourceId: string, targetId: string, amount: number): void;
  applyCrowdControl(targetId: string, type: CrowdControlType, duration: number, sourceId: string): void;
  isPlayerAlive(id: string): boolean;
  getPlayerState(id: string): ChampionState | undefined;
}

export interface IChampionBehavior {
  readonly definition: ChampionDefinition;

  createInitialState(
    id: string,
    team: Team,
    spawnPos: { x: number; z: number },
    playerNumber: number
  ): ChampionState;

  onCastSpell(
    champ: ChampionState,
    spell: 'Q' | 'W' | 'E' | 'R',
    target: { x: number; z: number },
    ctx: ICombatContext
  ): void;

  onBasicAttack(
    champ: ChampionState,
    target: ChampionState,
    ctx: ICombatContext
  ): void;

  onTick(
    champ: ChampionState,
    dt: number,
    ctx: ICombatContext
  ): void;
}
