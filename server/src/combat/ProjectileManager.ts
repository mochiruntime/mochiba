import { ProjectileState, ChampionState, Team, ProjectileTrajectory } from '@mochiba/shared';
import { ICombatContext } from '../champions/ChampionBehavior.js';

export interface IProjectileTargetProvider {
  getPlayerState(id: string): ChampionState | undefined;
  findNearestEnemy(champ: ChampionState, range: number): ChampionState | null;
  getOpposingChampions(team: Team): ChampionState[];
}

export class ProjectileManager {
  public projectiles = new Map<string, ProjectileState>();
  private projectileHits = new Map<string, Set<string>>();
  private lastEmberLaunchTime = new Map<string, number>();
  private projectileCounter = 0;
  private toRemove = new Set<string>();

  spawn(data: Omit<ProjectileState, 'id'>): ProjectileState {
    this.projectileCounter++;
    const id = `proj_${this.projectileCounter}`;
    const projectile: ProjectileState = { id, ...data };
    this.projectiles.set(id, projectile);
    this.projectileHits.set(id, new Set<string>());
    return projectile;
  }

  clear() {
    this.projectiles.clear();
    this.projectileHits.clear();
    this.lastEmberLaunchTime.clear();
  }

  cleanupPlayer(playerId: string) {
    this.lastEmberLaunchTime.delete(playerId);
  }

  tick(dt: number, tickCount: number, targets: IProjectileTargetProvider, ctx: ICombatContext) {
    this.toRemove.clear();
    const opposingCache = new Map<Team, ChampionState[]>();
    const getOpposing = (team: Team) => {
      let list = opposingCache.get(team);
      if (!list) {
        list = targets.getOpposingChampions(team);
        opposingCache.set(team, list);
      }
      return list;
    };

    for (const [id, proj] of this.projectiles) {
      const trajectory = proj.trajectory ?? this.inferTrajectory(proj);

      switch (trajectory) {
        case 'ORBITING':
          this.updateOrbiting(id, proj, dt, tickCount, targets);
          continue;
        case 'BOOMERANG':
          this.updateBoomerang(id, proj, dt, targets);
          break;
        case 'HOMING':
          this.updateHoming(id, proj, dt, targets, ctx);
          continue;
        case 'LINEAR':
        default:
          this.updateLinear(id, proj, dt);
          break;
      }

      // Check collision against opposing champions for skillshots (linear / boomerang)
      this.checkCollisions(id, proj, getOpposing(proj.team), ctx);
    }

    for (const id of this.toRemove) {
      this.projectiles.delete(id);
      this.projectileHits.delete(id);
    }
  }

  private inferTrajectory(proj: ProjectileState): ProjectileTrajectory {
    if (proj.isOrbiting) return 'ORBITING';
    if (proj.type === 'ECHO_ORB_OUT' || proj.type === 'ECHO_ORB_RETURN') return 'BOOMERANG';
    if (proj.targetId) return 'HOMING';
    return 'LINEAR';
  }

  private updateOrbiting(
    id: string,
    proj: ProjectileState,
    dt: number,
    tickCount: number,
    targets: IProjectileTargetProvider
  ): void {
    const owner = targets.getPlayerState(proj.ownerId);
    if (!owner || !owner.isAlive) {
      this.toRemove.add(id);
      return;
    }

    const orbitSpeed = 4.5;
    proj.orbitAngle = (proj.orbitAngle ?? 0) + orbitSpeed * dt;
    const r = proj.orbitRadius ?? 2.0;
    proj.position.x = owner.position.x + Math.cos(proj.orbitAngle) * r;
    proj.position.z = owner.position.z + Math.sin(proj.orbitAngle) * r;

    if (proj.orbitLifetime !== undefined) {
      proj.orbitLifetime -= dt;
      if (proj.orbitLifetime <= 0) {
        this.toRemove.add(id);
        return;
      }
    }

    if (proj.launchDelay !== undefined && proj.launchDelay > 0) {
      proj.launchDelay -= dt;
    }

    // Target acquisition: check if enemy is in acquisition range (35m)
    if ((proj.launchDelay ?? 0) <= 0) {
      const target = targets.findNearestEnemy(owner, 35);
      if (target) {
        const now = tickCount * dt;
        const lastLaunch = this.lastEmberLaunchTime.get(owner.id) ?? -1;
        if (now - lastLaunch >= 0.18) {
          this.lastEmberLaunchTime.set(owner.id, now);
          proj.isOrbiting = false;
          proj.trajectory = 'HOMING';
          proj.targetId = target.id;
          const dx = target.position.x - proj.position.x;
          const dz = target.position.z - proj.position.z;
          const dist = Math.hypot(dx, dz) || 1;
          const speed = proj.speed ?? 55;
          proj.velocity = { x: (dx / dist) * speed, z: (dz / dist) * speed };
        }
      }
    }
  }

  private updateBoomerang(
    id: string,
    proj: ProjectileState,
    dt: number,
    targets: IProjectileTargetProvider
  ): void {
    const isReturning = proj.type === 'ECHO_ORB_RETURN';

    if (!isReturning) {
      // Outbound phase
      const speed = proj.speed ?? 75;
      const velMag = Math.hypot(proj.velocity.x, proj.velocity.z) || speed;
      const step = speed * dt;
      proj.position.x += (proj.velocity.x / velMag) * step;
      proj.position.z += (proj.velocity.z / velMag) * step;
      proj.distanceTraveled += step;

      if (proj.distanceTraveled >= proj.maxDistance) {
        proj.type = 'ECHO_ORB_RETURN';
        this.projectileHits.get(id)?.clear();
      }
    } else {
      // Returning phase: homing back to owner
      const owner = targets.getPlayerState(proj.ownerId);
      if (!owner || !owner.isAlive) {
        this.toRemove.add(id);
        return;
      }

      const dx = owner.position.x - proj.position.x;
      const dz = owner.position.z - proj.position.z;
      const dist = Math.hypot(dx, dz);
      const returnSpeed = proj.speed ? proj.speed * 1.2 : 90;

      if (dist <= returnSpeed * dt || dist < 1.2) {
        this.toRemove.add(id);
      } else {
        proj.position.x += (dx / dist) * returnSpeed * dt;
        proj.position.z += (dz / dist) * returnSpeed * dt;
      }
    }
  }

  private updateHoming(
    id: string,
    proj: ProjectileState,
    dt: number,
    targets: IProjectileTargetProvider,
    ctx: ICombatContext
  ): void {
    if (!proj.targetId) {
      this.toRemove.add(id);
      return;
    }

    const target = targets.getPlayerState(proj.targetId);
    if (!target || !target.isAlive) {
      this.toRemove.add(id);
      return;
    }

    const dx = target.position.x - proj.position.x;
    const dz = target.position.z - proj.position.z;
    const dist = Math.hypot(dx, dz);
    let speed = proj.speed;
    if (speed === undefined) {
      if (proj.type === 'SPECTRAL_EMBER') speed = 55;
      else if (proj.type === 'ASTRAL_SURGE_BOLT') speed = 60;
      else if (proj.type === 'BASIC_ATTACK') speed = 35;
      else speed = 28;
    }

    if (dist <= speed * dt || dist < 0.8) {
      ctx.dealDamage(proj.ownerId, target.id, proj.damage);
      if (proj.crowdControlOnHit) {
        ctx.applyCrowdControl(
          target.id,
          proj.crowdControlOnHit.type,
          proj.crowdControlOnHit.duration,
          proj.ownerId
        );
      }
      this.toRemove.add(id);
    } else {
      proj.position.x += (dx / dist) * speed * dt;
      proj.position.z += (dz / dist) * speed * dt;
      proj.distanceTraveled += speed * dt;
      if (proj.distanceTraveled >= proj.maxDistance) {
        this.toRemove.add(id);
      }
    }
  }

  private updateLinear(id: string, proj: ProjectileState, dt: number): void {
    const speed = proj.speed ?? (Math.hypot(proj.velocity.x, proj.velocity.z) || 75);
    const velMag = Math.hypot(proj.velocity.x, proj.velocity.z) || speed;
    const step = speed * dt;
    proj.position.x += (proj.velocity.x / velMag) * step;
    proj.position.z += (proj.velocity.z / velMag) * step;
    proj.distanceTraveled += step;

    if (proj.distanceTraveled >= proj.maxDistance) {
      this.toRemove.add(id);
    }
  }

  private checkCollisions(
    id: string,
    proj: ProjectileState,
    enemies: ChampionState[],
    ctx: ICombatContext
  ): void {
    const hits = this.projectileHits.get(id);
    const hitRadius = proj.radius + 1.0;
    const hitRadiusSq = hitRadius * hitRadius;

    for (const enemy of enemies) {
      if (enemy.isAlive && !hits?.has(enemy.id)) {
        const dx = enemy.position.x - proj.position.x;
        const dz = enemy.position.z - proj.position.z;
        // Optimized squared-distance check: eliminates Math.sqrt on non-hitting entities
        if (dx * dx + dz * dz <= hitRadiusSq) {
          hits?.add(enemy.id);
          ctx.dealDamage(proj.ownerId, enemy.id, proj.damage);

          if (proj.crowdControlOnHit) {
            ctx.applyCrowdControl(
              enemy.id,
              proj.crowdControlOnHit.type,
              proj.crowdControlOnHit.duration,
              proj.ownerId
            );
          } else if (proj.type === 'CHARM_BOLT') {
            // Fallback for backwards compatibility
            ctx.applyCrowdControl(enemy.id, 'CHARMED', 1.4, proj.ownerId);
          }

          const pierces = proj.piercesUnits ?? (proj.type === 'ECHO_ORB_OUT' || proj.type === 'ECHO_ORB_RETURN');
          if (!pierces) {
            this.toRemove.add(id);
            break;
          }
        }
      }
    }
  }
}
