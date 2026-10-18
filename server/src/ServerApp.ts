import {
  ClientMessage,
  ServerMessage,
  Team,
  MapConfig,
  EPFL_DIAGONALE_MAP
} from '@mochiba/shared';
import { GameSimulation } from './simulation/GameSimulation.js';
import { NetworkManager, ISocketLike } from './net/NetworkManager.js';

export class ServerApp {
  public readonly TICK_RATE = 60; // 60 Hz simulation tick
  public readonly simulation: GameSimulation;
  public readonly network: NetworkManager;
  private intervalId: NodeJS.Timeout | null = null;
  private playerCounter = 0;

  constructor(public readonly mapConfig: MapConfig = EPFL_DIAGONALE_MAP) {
    this.simulation = new GameSimulation(this.mapConfig);
    this.network = new NetworkManager(
      (clientId, champ, ws) => this.handleClientConnect(clientId, champ, ws),
      (clientId, msg) => this.handleClientCommand(clientId, msg),
      (clientId) => this.handleClientDisconnect(clientId)
    );
  }

  async start(port: number, host = '0.0.0.0'): Promise<void> {
    await this.network.listen(port, host);
    this.intervalId = setInterval(() => this.tick(), 1000 / this.TICK_RATE);
  }

  tick(): void {
    const dt = 1 / this.TICK_RATE;
    this.simulation.tick(dt);
    this.network.broadcastSnapshot(this.simulation.createSnapshot());
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await this.network.close();
  }

  private handleClientConnect(clientId: string, requestedChampion: string, _ws: ISocketLike): void {
    this.playerCounter++;
    const team: Team = this.simulation.champions.size % 2 === 0 ? 'BLUE' : 'RED';
    const spawnPos = team === 'BLUE' ? this.mapConfig.blueNexus : this.mapConfig.redNexus;

    this.simulation.addChampion(
      clientId,
      requestedChampion,
      team,
      spawnPos,
      this.playerCounter
    );

    const hello: ServerMessage = {
      type: 'HELLO',
      clientId,
      serverTickRate: this.TICK_RATE,
      team,
      snapshot: this.simulation.createSnapshot()
    };
    this.network.send(clientId, hello);
  }

  private handleClientCommand(clientId: string, msg: ClientMessage): void {
    if (msg.type === 'PING') {
      const pong: ServerMessage = {
        type: 'PONG',
        clientTime: msg.clientTime,
        serverTime: Date.now()
      };
      this.network.send(clientId, pong);
    } else if (msg.type === 'MOVE_COMMAND') {
      this.simulation.handleMoveCommand(clientId, msg.target);
    } else if (msg.type === 'ATTACK_TARGET') {
      this.simulation.handleAttackCommand(clientId, msg.targetId);
    } else if (msg.type === 'CAST_SPELL') {
      this.simulation.handleCastSpell(clientId, msg.spell, msg.target);
    } else if (msg.type === 'SELECT_CHAMPION') {
      const champ = this.simulation.champions.get(clientId);
      if (!champ) return;
      const spawnPos = champ.team === 'BLUE' ? this.mapConfig.blueNexus : this.mapConfig.redNexus;
      this.simulation.handleSelectChampion(clientId, msg.championId, spawnPos, this.playerCounter);
    }
  }

  private handleClientDisconnect(clientId: string): void {
    this.simulation.removeChampion(clientId);
  }
}
