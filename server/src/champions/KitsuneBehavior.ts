import {
  ChampionState,
  ChampionDefinition,
  KITSUNE_CHAMPION,
  Team,
  EPFL_DIAGONALE_MAP,
  clampRayToLane
} from '@mochiba/shared';
import { BaseChampionBehavior, ICombatContext } from './ChampionBehavior.js';

export class KitsuneBehavior extends BaseChampionBehavior {
  readonly definition: ChampionDefinition = KITSUNE_CHAMPION;
  private speedBoostTimers = new Map<string, number>();

  createInitialState(
    id: string,
    team: Team,
    spawnPos: { x: number; z: number },
    playerNumber: number
  ): ChampionState {
    return {
      id,
      championId: this.definition.id,
      name: team === 'BLUE' ? `Blue Kitsune #${playerNumber}` : `Red Kitsune #${playerNumber}`,
      team,
      position: { x: spawnPos.x, z: spawnPos.z },
      targetPosition: null,
      rotation: team === 'BLUE' ? -Math.PI / 4 : (3 * Math.PI) / 4,
      speed: this.definition.baseSpeed,
      health: this.definition.baseHealth,
      maxHealth: this.definition.baseHealth,
      mana: this.definition.baseMana,
      maxMana: this.definition.baseMana,
      isAlive: true,
      respawnTimer: 0,
      crowdControl: null,
      cooldowns: {
        q: 0,
        w: 0,
        e: 0,
        r: 0,
        basicAttack: 0
      },
      rCharges: 3,
      rWindowRemaining: 0
    };
  }

  onBasicAttack(champ: ChampionState, target: ChampionState, ctx: ICombatContext): void {
    if (champ.cooldowns.basicAttack > 0) return;

    const targetPos = target.position;
    const dist = Math.hypot(targetPos.x - champ.position.x, targetPos.z - champ.position.z);

    if (dist <= this.definition.attackRange) {
      champ.cooldowns.basicAttack = this.definition.attackCooldown;
      champ.targetPosition = null;
      champ.rotation = Math.atan2(targetPos.x - champ.position.x, targetPos.z - champ.position.z);

      ctx.spawnProjectile({
        ownerId: champ.id,
        team: champ.team,
        type: 'BASIC_ATTACK',
        trajectory: 'HOMING',
        visualId: 'BASIC_ATTACK',
        speed: 35,
        piercesUnits: false,
        position: { ...champ.position },
        velocity: { x: 0, z: 0 },
        targetId: target.id,
        damage: this.definition.attackDamage,
        radius: 0.6,
        maxDistance: 32,
        distanceTraveled: 0
      });
    }
  }

  // Q — Echo Orb (Boomerang Skillshot, calibrated range 44m ~ 900 units)
  protected onCastQ(champ: ChampionState, target: { x: number; z: number }, ctx: ICombatContext): void {
    champ.cooldowns.q = this.definition.skills.Q.cooldown;
    const dx = target.x - champ.position.x;
    const dz = target.z - champ.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = 75;

    champ.rotation = Math.atan2(dx, dz);

    ctx.spawnProjectile({
      ownerId: champ.id,
      team: champ.team,
      type: 'ECHO_ORB_OUT',
      trajectory: 'BOOMERANG',
      visualId: 'ECHO_ORB_OUT',
      speed,
      piercesUnits: true,
      position: { ...champ.position },
      velocity: { x: (dx / dist) * speed, z: (dz / dist) * speed },
      damage: 60,
      radius: 1.2,
      maxDistance: 44,
      distanceTraveled: 0
    });
  }

  // W — Spectral Embers (3 Orbiting Wisps that home sequentially + Speed Burst)
  protected onCastW(champ: ChampionState, _target: { x: number; z: number }, ctx: ICombatContext): void {
    champ.cooldowns.w = this.definition.skills.W.cooldown;
    champ.speed = this.definition.baseSpeed * 1.4; // +40% speed boost
    this.speedBoostTimers.set(champ.id, 2.0);

    const orbitRadius = 2.0;
    for (let i = 0; i < 3; i++) {
      const initialAngle = (i * 2 * Math.PI) / 3;
      ctx.spawnProjectile({
        ownerId: champ.id,
        team: champ.team,
        type: 'SPECTRAL_EMBER',
        trajectory: 'ORBITING',
        visualId: 'SPECTRAL_EMBER',
        speed: 55,
        piercesUnits: false,
        position: {
          x: champ.position.x + Math.cos(initialAngle) * orbitRadius,
          z: champ.position.z + Math.sin(initialAngle) * orbitRadius
        },
        velocity: { x: 0, z: 0 },
        damage: 40,
        radius: 0.7,
        maxDistance: 40,
        distanceTraveled: 0,
        isOrbiting: true,
        orbitAngle: initialAngle,
        orbitRadius: orbitRadius,
        orbitLifetime: 4.0,
        launchDelay: 0.25 + i * 0.2
      });
    }
  }

  // E — Charm (Crowd-Control Skillshot, calibrated range 48m ~ 1000 units)
  protected onCastE(champ: ChampionState, target: { x: number; z: number }, ctx: ICombatContext): void {
    champ.cooldowns.e = this.definition.skills.E.cooldown;
    const dx = target.x - champ.position.x;
    const dz = target.z - champ.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = 75;

    champ.rotation = Math.atan2(dx, dz);

    ctx.spawnProjectile({
      ownerId: champ.id,
      team: champ.team,
      type: 'CHARM_BOLT',
      trajectory: 'LINEAR',
      visualId: 'CHARM_BOLT',
      speed,
      piercesUnits: false,
      crowdControlOnHit: {
        type: 'CHARMED',
        duration: 1.4
      },
      position: { ...champ.position },
      velocity: { x: (dx / dist) * speed, z: (dz / dist) * speed },
      damage: 50,
      radius: 1.0,
      maxDistance: 48,
      distanceTraveled: 0
    });
  }

  // R — Astral Surge (Tri-Dash Mobility + Homing Essence Bolts)
  protected onCastR(champ: ChampionState, target: { x: number; z: number }, ctx: ICombatContext): void {
    // Replenish charges if off cooldown and not in an active window
    if (champ.cooldowns.r <= 0 && champ.rWindowRemaining <= 0) {
      champ.rCharges = 3;
    }

    // If on cooldown and not in an active window, cannot cast
    if (champ.cooldowns.r > 0 && champ.rWindowRemaining <= 0) return;
    if (champ.rCharges <= 0) return;

    // First dash of the 3 opens the 10.0s window
    if (champ.rWindowRemaining <= 0) {
      champ.rWindowRemaining = 10.0;
    }

    champ.rCharges--;
    const dx = target.x - champ.position.x;
    const dz = target.z - champ.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dashDist = Math.min(24, dist); // Calibrated reference dash range (500 units ~ 24m)

    // Instant dash clamped to lane
    const desiredPos = {
      x: champ.position.x + (dx / dist) * dashDist,
      z: champ.position.z + (dz / dist) * dashDist
    };
    const clamped = clampRayToLane(EPFL_DIAGONALE_MAP, champ.position, desiredPos);
    champ.position.x = clamped.x;
    champ.position.z = clamped.z;
    champ.targetPosition = null;
    champ.rotation = Math.atan2(dx, dz);

    // Fire homing essence bolts at up to 3 nearby enemies within 32m
    const enemies = ctx.findEnemiesInRange(champ, 32, 3);
    for (const enemy of enemies) {
      ctx.spawnProjectile({
        ownerId: champ.id,
        team: champ.team,
        type: 'ASTRAL_SURGE_BOLT',
        trajectory: 'HOMING',
        visualId: 'ASTRAL_SURGE_BOLT',
        speed: 60,
        piercesUnits: false,
        position: { ...champ.position },
        velocity: { x: 0, z: 0 },
        targetId: enemy.id,
        damage: 55,
        radius: 0.8,
        maxDistance: 38,
        distanceTraveled: 0
      });
    }

    if (champ.rCharges === 0) {
      champ.cooldowns.r = this.definition.skills.R.cooldown;
      champ.rWindowRemaining = 0;
    }
  }

  override onTick(champ: ChampionState, dt: number, _ctx: ICombatContext): void {
    // Tick speed boost duration deterministically
    const remainingBoost = this.speedBoostTimers.get(champ.id);
    if (remainingBoost !== undefined) {
      const next = remainingBoost - dt;
      if (next <= 0 || !champ.isAlive) {
        this.speedBoostTimers.delete(champ.id);
        champ.speed = this.definition.baseSpeed;
      } else {
        this.speedBoostTimers.set(champ.id, next);
      }
    }

    if (champ.rWindowRemaining > 0) {
      champ.rWindowRemaining -= dt;
      if (champ.rWindowRemaining <= 0) {
        champ.rWindowRemaining = 0;
        champ.rCharges = 0;
        champ.cooldowns.r = this.definition.skills.R.cooldown;
      }
    }

    // Automatically replenish full charges when cooldown finishes and no window is active
    if (champ.cooldowns.r <= 0 && champ.rWindowRemaining <= 0 && champ.rCharges < 3) {
      champ.rCharges = 3;
    }
  }
}
