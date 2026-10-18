import { ProjectileState, ChampionState, Team } from '@mochiba/shared';
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
      if (proj.isOrbiting) {
        // Orbiting around owner (e.g., Spectral Embers)
        const owner = targets.getPlayerState(proj.ownerId);
        if (!owner || !owner.isAlive) {
          this.toRemove.add(id);
          continue;
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
            continue;
          }
        }

        if (proj.launchDelay !== undefined && proj.launchDelay > 0) {
          proj.launchDelay -= dt;
        }

        // Target acquisition when ready: check if enemy is in acquisition range (35m ~ 725 units)
        if ((proj.launchDelay ?? 0) <= 0) {
          const target = targets.findNearestEnemy(owner, 35);
          if (target) {
            const now = tickCount * dt;
            const lastLaunch = this.lastEmberLaunchTime.get(owner.id) ?? -1;
            if (now - lastLaunch >= 0.18) {
              this.lastEmberLaunchTime.set(owner.id, now);
              proj.isOrbiting = false;
              proj.targetId = target.id;
              const dx = target.position.x - proj.position.x;
              const dz = target.position.z - proj.position.z;
              const dist = Math.hypot(dx, dz) || 1;
              const speed = 55;
              proj.velocity = { x: (dx / dist) * speed, z: (dz / dist) * speed };
            }
          }
        }
        continue;
      } else if (proj.type === 'ECHO_ORB_OUT') {
        const speed = 75;
        const velMag = Math.hypot(proj.velocity.x, proj.velocity.z) || speed;
        const step = speed * dt;
        proj.position.x += (proj.velocity.x / velMag) * step;
        proj.position.z += (proj.velocity.z / velMag) * step;
        proj.distanceTraveled += step;

        if (proj.distanceTraveled >= proj.maxDistance) {
          proj.type = 'ECHO_ORB_RETURN';
          this.projectileHits.get(id)?.clear();
        }
      } else if (proj.type === 'ECHO_ORB_RETURN') {
        const owner = targets.getPlayerState(proj.ownerId);
        if (!owner || !owner.isAlive) {
          this.toRemove.add(id);
          continue;
        }
        const dx = owner.position.x - proj.position.x;
        const dz = owner.position.z - proj.position.z;
        const dist = Math.hypot(dx, dz);
        const speed = 90;

        if (dist <= speed * dt || dist < 1.2) {
          this.toRemove.add(id);
          continue;
        } else {
          proj.position.x += (dx / dist) * speed * dt;
          proj.position.z += (dz / dist) * speed * dt;
        }
      } else if (proj.targetId) {
        const target = targets.getPlayerState(proj.targetId);
        if (!target || !target.isAlive) {
          this.toRemove.add(id);
          continue;
        }
        const dx = target.position.x - proj.position.x;
        const dz = target.position.z - proj.position.z;
        const dist = Math.hypot(dx, dz);
        let speed = 28;
        if (proj.type === 'SPECTRAL_EMBER') speed = 55;
        else if (proj.type === 'ASTRAL_SURGE_BOLT') speed = 60;
        else if (proj.type === 'BASIC_ATTACK') speed = 35;

        if (dist <= speed * dt || dist < 0.8) {
          ctx.dealDamage(proj.ownerId, target.id, proj.damage);
          this.toRemove.add(id);
          continue;
        } else {
          proj.position.x += (dx / dist) * speed * dt;
          proj.position.z += (dz / dist) * speed * dt;
          proj.distanceTraveled += speed * dt;
          if (proj.distanceTraveled >= proj.maxDistance) {
            this.toRemove.add(id);
            continue;
          }
        }
      } else {
        const speed = Math.hypot(proj.velocity.x, proj.velocity.z) || 75;
        const step = speed * dt;
        proj.position.x += (proj.velocity.x / speed) * step;
        proj.position.z += (proj.velocity.z / speed) * step;
        proj.distanceTraveled += step;

        if (proj.distanceTraveled >= proj.maxDistance) {
          this.toRemove.add(id);
          continue;
        }
      }

      // Check collision against opposing champions for skillshots
      if (proj.type === 'ECHO_ORB_OUT' || proj.type === 'ECHO_ORB_RETURN' || proj.type === 'CHARM_BOLT') {
        const hits = this.projectileHits.get(id);
        const enemies = getOpposing(proj.team);
        for (const enemy of enemies) {
          if (enemy.isAlive && !hits?.has(enemy.id)) {
            const d = Math.hypot(enemy.position.x - proj.position.x, enemy.position.z - proj.position.z);
            if (d <= proj.radius + 1.0) {
              hits?.add(enemy.id);
              ctx.dealDamage(proj.ownerId, enemy.id, proj.damage);

              if (proj.type === 'CHARM_BOLT') {
                ctx.applyCrowdControl(enemy.id, 'CHARMED', 1.4, proj.ownerId);
                this.toRemove.add(id);
                break;
              }
            }
          }
        }
      }
    }

    for (const id of this.toRemove) {
      this.projectiles.delete(id);
      this.projectileHits.delete(id);
    }
  }
}
