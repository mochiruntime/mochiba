import { WebSocketServer, WebSocket } from 'ws';
import {
  NetworkMessage,
  ClientMessage,
  ServerMessage,
  ChampionState,
  WorldSnapshot,
  Team,
  EPFL_DIAGONALE_MAP,
  isInsideLane,
  clampToLane,
  clampRayToLane
} from '@mochiba/shared';

export interface PlayerSession {
  ws: { send: (data: string) => void; on: (event: string, cb: (data: any) => void) => void };
  state: ChampionState;
}

export class ServerApp {
  public wss: WebSocketServer | null = null;
  public readonly TICK_RATE = 60; // 60 Hz simulation tick
  public players = new Map<string, PlayerSession>();
  private intervalId: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private playerCounter = 0;

  start(port: number, host = '0.0.0.0'): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port, host }, () => {
        this.intervalId = setInterval(() => this.tick(), 1000 / this.TICK_RATE);
        resolve();
      });

      this.wss.on('connection', (ws: WebSocket) => {
        const clientId = this.handleConnection(ws);

        ws.on('close', () => {
          this.removePlayer(clientId);
        });
      });
    });
  }

  handleConnection(ws: { send: (data: string) => void; on: (event: string, cb: (data: any) => void) => void }): string {
    this.playerCounter++;
    const clientId = `client_${this.playerCounter}_${Math.random().toString(36).substring(2, 6)}`;
    const team: Team = this.players.size % 2 === 0 ? 'BLUE' : 'RED';
    const spawnPos = team === 'BLUE' ? EPFL_DIAGONALE_MAP.blueNexus : EPFL_DIAGONALE_MAP.redNexus;

    const state: ChampionState = {
      id: clientId,
      name: team === 'BLUE' ? `Blue Student #${this.playerCounter}` : `Red Student #${this.playerCounter}`,
      team,
      position: { x: spawnPos.x, z: spawnPos.z },
      targetPosition: null,
      rotation: team === 'BLUE' ? -Math.PI / 4 : (3 * Math.PI) / 4,
      speed: 16 // 16 meters/second MOBA hero speed
    };

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

    if (msg.type === 'PING') {
      const pong: ServerMessage = {
        type: 'PONG',
        clientTime: msg.clientTime,
        serverTime: Date.now()
      };
      session.ws.send(JSON.stringify(pong));
    } else if (msg.type === 'MOVE_COMMAND') {
      const from = session.state.position;
      const clamped = clampRayToLane(EPFL_DIAGONALE_MAP, from, msg.target);
      session.state.targetPosition = clamped;
    }
  }

  removePlayer(clientId: string) {
    this.players.delete(clientId);
  }

  tick() {
    this.tickCount++;
    const dt = 1 / this.TICK_RATE;

    // Advance champion movements along the lane
    for (const [, { state }] of this.players) {
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
            // Reached lane boundary
            state.targetPosition = null;
          }
        }
      }
    }

    // Broadcast 60Hz world snapshot to all connected clients
    const snapshotMsg: ServerMessage = {
      type: 'SNAPSHOT',
      snapshot: this.createSnapshot()
    };
    const payload = JSON.stringify(snapshotMsg);

    for (const [, { ws }] of this.players) {
      try {
        ws.send(payload);
      } catch {
        // Handle socket errors gracefully
      }
    }
  }

  createSnapshot(): WorldSnapshot {
    return {
      tick: this.tickCount,
      timestamp: Date.now(),
      champions: Array.from(this.players.values()).map((p) => ({ ...p.state }))
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
