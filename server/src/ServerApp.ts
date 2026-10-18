import { WebSocketServer, WebSocket } from 'ws';
import {
  NetworkMessage,
  ClientMessage,
  ServerMessage,
  ChampionState,
  ProjectileState,
  WorldSnapshot,
  Team,
  CrowdControlType,
  EPFL_DIAGONALE_MAP,
  isInsideLane,
  clampRayToLane
} from '@mochiba/shared';
import { ICombatContext } from './champions/ChampionBehavior.js';
import { championRegistry } from './champions/ChampionRegistry.js';
import { ProjectileManager, IProjectileTargetProvider } from './combat/ProjectileManager.js';

export interface PlayerSession {
  ws: { send: (data: string) => void; on: (event: string, cb: (data: any) => void) => void };
  state: ChampionState;
}

export class ServerApp implements ICombatContext, IProjectileTargetProvider {
  public wss: WebSocketServer | null = null;
  public readonly TICK_RATE = 60; // 60 Hz simulation tick
  public players = new Map<string, PlayerSession>();
  private projectileManager = new ProjectileManager();
  public get projectiles(): Map<string, ProjectileState> {
    return this.projectileManager.projectiles;
  }
  private intervalId: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private playerCounter = 0;

  start(port: number, host = '0.0.0.0'): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port, host }, () => {
        this.intervalId = setInterval(() => this.tick(), 1000 / this.TICK_RATE);
        resolve();
      });

      this.wss.on('connection', (ws: WebSocket, req) => {
        let champParam = 'kitsune';
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          champParam = url.searchParams.get('champion') || 'kitsune';
        } catch {
          // fallback
        }
        const clientId = this.handleConnection(ws, champParam);

        ws.on('close', () => {
          this.removePlayer(clientId);
        });
      });
    });

  }

  handleConnection(
    ws: { send: (data: string) => void; on: (event: string, cb: (data: any) => void) => void },
    requestedChampionId = 'kitsune'
  ): string {
    this.playerCounter++;
    const clientId = `client_${this.playerCounter}_${Math.random().toString(36).substring(2, 6)}`;
    const team: Team = this.players.size % 2 === 0 ? 'BLUE' : 'RED';
    const spawnPos = team === 'BLUE' ? EPFL_DIAGONALE_MAP.blueNexus : EPFL_DIAGONALE_MAP.redNexus;

    const behavior = championRegistry.get(requestedChampionId);
    const state: ChampionState = behavior.createInitialState(
      clientId,
      team,
      spawnPos,
      this.playerCounter
    );

    this.players.set(clientId, { ws, state });

    const hello: ServerMessage = {
      type: 'HELLO',
      clientId,
      serverTickRate: this.TICK_RATE,
      team,
      snapshot: this.createSnapshot()
    };
    ws.send(JSON.stringify(hello));

    ws.on('message', (data: any) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.handleMessage(clientId, msg);
      } catch {
        // Ignore malformed packets
      }
    });

    return clientId;
  }

  handleMessage(clientId: string, msg: ClientMessage) {
    const session = this.players.get(clientId);
    if (!session) return;
    const champ = session.state;

    if (msg.type === 'PING') {
      const pong: ServerMessage = {
        type: 'PONG',
        clientTime: msg.clientTime,
        serverTime: Date.now()
      };
      session.ws.send(JSON.stringify(pong));
    } else if (msg.type === 'MOVE_COMMAND') {
      // Ignore move commands while dead or under crowd control
      if (!champ.isAlive || champ.crowdControl) return;

      const from = champ.position;
      const clamped = clampRayToLane(EPFL_DIAGONALE_MAP, from, msg.target);
      champ.targetPosition = clamped;
    } else if (msg.type === 'ATTACK_TARGET') {
      if (!champ.isAlive || champ.crowdControl) return;
      const targetSession = this.players.get(msg.targetId);
      if (!targetSession || !targetSession.state.isAlive || targetSession.state.team === champ.team) {
        return;
      }
      const behavior = championRegistry.get(champ.championId);
      behavior.onBasicAttack(champ, targetSession.state, this);
    } else if (msg.type === 'CAST_SPELL') {
      if (!champ.isAlive || champ.crowdControl) return;
      const behavior = championRegistry.get(champ.championId);
      behavior.onCastSpell(champ, msg.spell, msg.target, this);
    } else if (msg.type === 'SELECT_CHAMPION') {
      if (!championRegistry.has(msg.championId)) return;
      const behavior = championRegistry.get(msg.championId);
      const spawnPos = champ.team === 'BLUE' ? EPFL_DIAGONALE_MAP.blueNexus : EPFL_DIAGONALE_MAP.redNexus;
      session.state = behavior.createInitialState(
        champ.id,
        champ.team,
        spawnPos,
        this.playerCounter
      );
    }
  }

  // --- ICombatContext Implementation ---

  spawnProjectile(data: Omit<ProjectileState, 'id'>): ProjectileState {
    return this.projectileManager.spawn(data);
  }

  getOpposingChampions(team: Team): ChampionState[] {
    const list: ChampionState[] = [];
    for (const [, { state }] of this.players) {
      if (state.team !== team && state.isAlive) {
        list.push(state);
      }
    }
    return list;
  }

  findNearestEnemy(champ: ChampionState, range: number): ChampionState | null {
    let nearest: ChampionState | null = null;
    let minDist = range;

    for (const [, { state }] of this.players) {
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
    for (const [, { state }] of this.players) {
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
    const target = this.players.get(targetId)?.state;
    if (!target || !target.isAlive) return;
    this.applyDamage(target, amount, sourceId);
  }

  applyCrowdControl(targetId: string, type: CrowdControlType, duration: number, sourceId: string): void {
    const target = this.players.get(targetId)?.state;
    if (!target || !target.isAlive) return;
    target.crowdControl = { type, remainingDuration: duration, sourceId };
    target.targetPosition = null;
  }

  isPlayerAlive(id: string): boolean {
    return this.players.get(id)?.state.isAlive ?? false;
  }

  getPlayerState(id: string): ChampionState | undefined {
    return this.players.get(id)?.state;
  }

  removePlayer(clientId: string) {
    this.players.delete(clientId);
    this.projectileManager.cleanupPlayer(clientId);
  }

  tick() {
    this.tickCount++;
    const dt = 1 / this.TICK_RATE;

    // 1. Tick cooldowns, behavior updates, crowd control & respawn timers for all champions
    for (const [, { state }] of this.players) {
      // Cooldowns
      if (state.cooldowns.q > 0) state.cooldowns.q = Math.max(0, state.cooldowns.q - dt);
      if (state.cooldowns.w > 0) state.cooldowns.w = Math.max(0, state.cooldowns.w - dt);
      if (state.cooldowns.e > 0) state.cooldowns.e = Math.max(0, state.cooldowns.e - dt);
      if (state.cooldowns.r > 0) state.cooldowns.r = Math.max(0, state.cooldowns.r - dt);
      if (state.cooldowns.basicAttack > 0) state.cooldowns.basicAttack = Math.max(0, state.cooldowns.basicAttack - dt);

      // Champion-specific behavioral tick
      const behavior = championRegistry.get(state.championId);
      behavior.onTick(state, dt, this);

      // Respawn timer
      if (!state.isAlive) {
        state.respawnTimer = Math.max(0, state.respawnTimer - dt);
        if (state.respawnTimer === 0) {
          // Respawn at team Nexus
          state.isAlive = true;
          state.health = state.maxHealth;
          state.mana = state.maxMana;
          state.crowdControl = null;
          state.targetPosition = null;
          const nexus = state.team === 'BLUE' ? EPFL_DIAGONALE_MAP.blueNexus : EPFL_DIAGONALE_MAP.redNexus;
          state.position = { x: nexus.x, z: nexus.z };
        }
        continue;
      }

      // Crowd control (Charm or Slow)
      if (state.crowdControl) {
        state.crowdControl.remainingDuration -= dt;
        if (state.crowdControl.remainingDuration <= 0) {
          state.crowdControl = null;
          state.targetPosition = null;
        } else if (state.crowdControl.type === 'CHARMED') {
          // Force walk toward the caster at 50% speed
          const source = this.players.get(state.crowdControl.sourceId)?.state;
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
          continue; // CC overrides standard movement
        }
      }

      // Standard movement along the lane
      if (state.targetPosition) {
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

          if (isInsideLane(EPFL_DIAGONALE_MAP, nextX, nextZ)) {
            state.position.x = nextX;
            state.position.z = nextZ;
            state.rotation = Math.atan2(dx, dz);
          } else {
            state.targetPosition = null;
          }
        }
      }
    }

    // 2. Advance projectiles & handle collisions via ProjectileManager
    this.projectileManager.tick(dt, this.tickCount, this, this);

    // 3. Broadcast 60Hz world snapshot with champions & projectiles
    const snapshotMsg: ServerMessage = {
      type: 'SNAPSHOT',
      snapshot: this.createSnapshot()
    };
    const payload = JSON.stringify(snapshotMsg);

    for (const [, { ws }] of this.players) {
      try {
        ws.send(payload);
      } catch {
        // Handle socket disconnect gracefully
      }
    }
  }

  private applyDamage(target: ChampionState, damage: number, _sourceId: string) {
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
      champions: Array.from(this.players.values()).map((p) => ({ ...p.state })),
      projectiles: Array.from(this.projectiles.values()).map((proj) => ({ ...proj }))
    };
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.intervalId) clearInterval(this.intervalId);
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  get currentTick(): number {
    return this.tickCount;
  }
}
