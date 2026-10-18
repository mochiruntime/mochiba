import {
  ChampionState,
  ProjectileState,
  WorldSnapshot,
  Team,
  CrowdControlType,
  MapConfig,
  EPFL_DIAGONALE_MAP,
  isInsideLane,
  clampRayToLane,
  Position
} from '@mochiba/shared';
import { ICombatContext } from '../champions/ChampionBehavior.js';
import { championRegistry } from '../champions/ChampionRegistry.js';
import { ProjectileManager, IProjectileTargetProvider } from '../combat/ProjectileManager.js';

export class GameSimulation implements ICombatContext, IProjectileTargetProvider {
  public champions = new Map<string, ChampionState>();
  public projectileManager = new ProjectileManager();
  public tickCount = 0;

  constructor(public readonly mapConfig: MapConfig = EPFL_DIAGONALE_MAP) {}

  public get projectiles(): Map<string, ProjectileState> {
    return this.projectileManager.projectiles;
  }

  addChampion(
    id: string,
    championId: string,
    team: Team,
    spawnPos: Position,
    playerNumber: number
  ): ChampionState {
    const behavior = championRegistry.get(championId);
    const state = behavior.createInitialState(id, team, spawnPos, playerNumber);
    this.champions.set(id, state);
    return state;
  }

  removeChampion(id: string): void {
    this.champions.delete(id);
    this.projectileManager.cleanupPlayer(id);
  }

  handleMoveCommand(id: string, target: Position): void {
    const champ = this.champions.get(id);
    if (!champ || !champ.isAlive || champ.crowdControl) return;

    champ.targetPosition = clampRayToLane(this.mapConfig, champ.position, target);
  }

  handleAttackCommand(id: string, targetId: string): void {
    const champ = this.champions.get(id);
    if (!champ || !champ.isAlive || champ.crowdControl) return;

    const target = this.champions.get(targetId);
    if (!target || !target.isAlive || target.team === champ.team) return;

    const behavior = championRegistry.get(champ.championId);
    behavior.onBasicAttack(champ, target, this);
  }

  handleCastSpell(id: string, spell: 'Q' | 'W' | 'E' | 'R', target?: Position): void {
    const champ = this.champions.get(id);
    if (!champ || !champ.isAlive || champ.crowdControl) return;

    const behavior = championRegistry.get(champ.championId);
    const spellTarget = target ?? champ.position;
    behavior.onCastSpell(champ, spell, spellTarget, this);
  }

  handleSelectChampion(
    id: string,
    newChampionId: string,
    spawnPos: Position,
    playerNumber: number
  ): ChampionState | undefined {
    if (!championRegistry.has(newChampionId)) return undefined;

    const champ = this.champions.get(id);
    if (!champ) return undefined;

    const behavior = championRegistry.get(newChampionId);
    const newState = behavior.createInitialState(champ.id, champ.team, spawnPos, playerNumber);
    this.champions.set(id, newState);
    return newState;
  }

  tick(dt: number): void {
    this.tickCount++;

    // 1. Tick cooldowns, behavior updates, crowd control & respawn timers for all champions
    for (const state of this.champions.values()) {
      this.tickCooldowns(state, dt);

      // Champion-specific behavioral tick
      const behavior = championRegistry.get(state.championId);
      behavior.onTick(state, dt, this);

      if (!state.isAlive) {
        this.tickRespawn(state, dt);
        continue;
      }

      const isUnderCC = this.tickCrowdControl(state, dt);
      if (!isUnderCC) {
        this.tickMovement(state, dt);
      }
    }

    // 2. Advance projectiles & handle collisions via ProjectileManager
    this.projectileManager.tick(dt, this.tickCount, this, this);
  }

  private tickCooldowns(state: ChampionState, dt: number): void {
    if (state.cooldowns.q > 0) state.cooldowns.q = Math.max(0, state.cooldowns.q - dt);
    if (state.cooldowns.w > 0) state.cooldowns.w = Math.max(0, state.cooldowns.w - dt);
    if (state.cooldowns.e > 0) state.cooldowns.e = Math.max(0, state.cooldowns.e - dt);
    if (state.cooldowns.r > 0) state.cooldowns.r = Math.max(0, state.cooldowns.r - dt);
    if (state.cooldowns.basicAttack > 0) state.cooldowns.basicAttack = Math.max(0, state.cooldowns.basicAttack - dt);
  }

  private tickRespawn(state: ChampionState, dt: number): void {
    state.respawnTimer = Math.max(0, state.respawnTimer - dt);
    if (state.respawnTimer === 0) {
      // Respawn at team Nexus
      state.isAlive = true;
      state.health = state.maxHealth;
      state.mana = state.maxMana;
      state.crowdControl = null;
      state.targetPosition = null;
      const nexus = state.team === 'BLUE' ? this.mapConfig.blueNexus : this.mapConfig.redNexus;
      state.position = { x: nexus.x, z: nexus.z };
    }
  }

  private tickCrowdControl(state: ChampionState, dt: number): boolean {
    if (!state.crowdControl) return false;

    state.crowdControl.remainingDuration -= dt;
    if (state.crowdControl.remainingDuration <= 0) {
      state.crowdControl = null;
      state.targetPosition = null;
      return false;
    }

    if (state.crowdControl.type === 'CHARMED') {
      // Force walk toward the caster at 50% speed
      const source = this.champions.get(state.crowdControl.sourceId);
      if (source && source.isAlive) {
        const dx = source.position.x - state.position.x;
        const dz = source.position.z - state.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1) {
          const step = (state.speed * 0.5) * dt;
          state.position.x += (dx / dist) * step;
          state.position.z += (dz / dist) * step;
          state.rotation = Math.atan2(dx, dz);
        }
      }
    }
    return true; // CC overrides standard movement
  }

  private tickMovement(state: ChampionState, dt: number): void {
    if (!state.targetPosition) return;

    const dx = state.targetPosition.x - state.position.x;
    const dz = state.targetPosition.z - state.position.z;
    const dist = Math.hypot(dx, dz);
    const step = state.speed * dt;

    if (dist <= step || dist < 0.2) {
      state.position.x = state.targetPosition.x;
      state.position.z = state.targetPosition.z;
      state.targetPosition = null;
    } else {
      const nextX = state.position.x + (dx / dist) * step;
      const nextZ = state.position.z + (dz / dist) * step;

      if (isInsideLane(this.mapConfig, nextX, nextZ)) {
        state.position.x = nextX;
        state.position.z = nextZ;
        state.rotation = Math.atan2(dx, dz);
      } else {
        state.targetPosition = null;
      }
    }
  }

  public applyDamage(target: ChampionState, damage: number, _sourceId: string): void {
    if (!target.isAlive) return;

    target.health = Math.max(0, target.health - damage);

    if (target.health === 0) {
      target.isAlive = false;
      target.respawnTimer = 8.0;
      target.targetPosition = null;
      target.crowdControl = null;
    }
  }

  createSnapshot(): WorldSnapshot {
    return {
      tick: this.tickCount,
      timestamp: Date.now(),
      champions: Array.from(this.champions.values()),
      projectiles: Array.from(this.projectileManager.projectiles.values())
    };
  }

  // --- ICombatContext & IProjectileTargetProvider Implementation ---

  spawnProjectile(data: Omit<ProjectileState, 'id'>): ProjectileState {
    return this.projectileManager.spawn(data);
  }

  getOpposingChampions(team: Team): ChampionState[] {
    const list: ChampionState[] = [];
    for (const state of this.champions.values()) {
      if (state.team !== team && state.isAlive) {
        list.push(state);
      }
    }
    return list;
  }

  findNearestEnemy(champ: ChampionState, range: number): ChampionState | null {
    let nearest: ChampionState | null = null;
    let minDist = range;

    for (const state of this.champions.values()) {
      if (state.id !== champ.id && state.team !== champ.team && state.isAlive) {
        const d = Math.hypot(state.position.x - champ.position.x, state.position.z - champ.position.z);
        if (d < minDist) {
          minDist = d;
          nearest = state;
        }
      }
    }
    return nearest;
  }

  findEnemiesInRange(champ: ChampionState, range: number, maxCount = 3): ChampionState[] {
    const enemies: { enemy: ChampionState; dist: number }[] = [];
    for (const state of this.champions.values()) {
      if (state.id !== champ.id && state.team !== champ.team && state.isAlive) {
        const d = Math.hypot(state.position.x - champ.position.x, state.position.z - champ.position.z);
        if (d <= range) {
          enemies.push({ enemy: state, dist: d });
        }
      }
    }
    enemies.sort((a, b) => a.dist - b.dist);
    return enemies.slice(0, maxCount).map((e) => e.enemy);
  }

  dealDamage(sourceId: string, targetId: string, amount: number): void {
    const target = this.champions.get(targetId);
    if (!target || !target.isAlive) return;
    this.applyDamage(target, amount, sourceId);
  }

  applyCrowdControl(targetId: string, type: CrowdControlType, duration: number, sourceId: string): void {
    const target = this.champions.get(targetId);
    if (!target || !target.isAlive) return;
    target.crowdControl = { type, remainingDuration: duration, sourceId };
    target.targetPosition = null;
  }

  isPlayerAlive(id: string): boolean {
    return this.champions.get(id)?.isAlive ?? false;
  }

  getPlayerState(id: string): ChampionState | undefined {
    return this.champions.get(id);
  }
}
