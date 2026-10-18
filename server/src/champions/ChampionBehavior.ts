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

/**
 * Base template implementation providing centralized spell validation & dispatch.
 */
export abstract class BaseChampionBehavior implements IChampionBehavior {
  abstract readonly definition: ChampionDefinition;

  abstract createInitialState(
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
  ): void {
    if (!champ.isAlive || champ.crowdControl?.type === 'CHARMED' || champ.crowdControl?.type === 'STUNNED') {
      return;
    }

    switch (spell) {
      case 'Q':
        if (champ.cooldowns.q <= 0) this.onCastQ(champ, target, ctx);
        break;
      case 'W':
        if (champ.cooldowns.w <= 0) this.onCastW(champ, target, ctx);
        break;
      case 'E':
        if (champ.cooldowns.e <= 0) this.onCastE(champ, target, ctx);
        break;
      case 'R':
        this.onCastR(champ, target, ctx);
        break;
    }
  }

  protected abstract onCastQ(champ: ChampionState, target: { x: number; z: number }, ctx: ICombatContext): void;
  protected abstract onCastW(champ: ChampionState, target: { x: number; z: number }, ctx: ICombatContext): void;
  protected abstract onCastE(champ: ChampionState, target: { x: number; z: number }, ctx: ICombatContext): void;
  protected abstract onCastR(champ: ChampionState, target: { x: number; z: number }, ctx: ICombatContext): void;

  abstract onBasicAttack(
    champ: ChampionState,
    target: ChampionState,
    ctx: ICombatContext
  ): void;

  onTick(
    _champ: ChampionState,
    _dt: number,
    _ctx: ICombatContext
  ): void {}
}
