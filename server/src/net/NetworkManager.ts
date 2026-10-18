import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessage, ServerMessage, WorldSnapshot } from '@mochiba/shared';

export interface ISocketLike {
  send: (data: string) => void;
  on: (event: string, cb: (data: any) => void) => void;
}

export interface ClientSession {
  id: string;
  ws: ISocketLike;
}

export type ConnectCallback = (clientId: string, requestedChampion: string, ws: ISocketLike) => void;
export type CommandCallback = (clientId: string, msg: ClientMessage) => void;
export type DisconnectCallback = (clientId: string) => void;

export class NetworkManager {
  public wss: WebSocketServer | null = null;
  public sessions = new Map<string, ClientSession>();
  private playerCounter = 0;

  constructor(
    private onConnect: ConnectCallback,
    private onCommand: CommandCallback,
    private onDisconnect: DisconnectCallback
  ) {}

  listen(port: number, host = '0.0.0.0'): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port, host }, () => resolve());

      this.wss.on('connection', (ws: WebSocket, req) => {
        let requestedChamp = 'kitsune';
        try {
          const url = new URL(req.url || '/', 'http://localhost');
          requestedChamp = url.searchParams.get('champion') || 'kitsune';
        } catch {
          // fallback to kitsune
        }
        this.registerClient(ws, requestedChamp);
      });
    });
  }

  registerClient(ws: ISocketLike, requestedChampion = 'kitsune'): string {
    this.playerCounter++;
    const clientId = `client_${this.playerCounter}_${Math.random().toString(36).substring(2, 6)}`;
    const session: ClientSession = { id: clientId, ws };
    this.sessions.set(clientId, session);

    ws.on('message', (data: any) => {
      try {
        const msg: ClientMessage = JSON.parse(data.toString());
        this.onCommand(clientId, msg);
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      this.sessions.delete(clientId);
      this.onDisconnect(clientId);
    });

    this.onConnect(clientId, requestedChampion, ws);
    return clientId;
  }

  send(clientId: string, msg: ServerMessage): void {
    const session = this.sessions.get(clientId);
    if (!session) return;
    try {
      session.ws.send(JSON.stringify(msg));
    } catch {
      // Socket write failure
    }
  }

  broadcastSnapshot(snapshot: WorldSnapshot): void {
    const snapshotMsg: ServerMessage = {
      type: 'SNAPSHOT',
      snapshot
    };
    const payload = JSON.stringify(snapshotMsg);

    for (const session of this.sessions.values()) {
      try {
        session.ws.send(payload);
      } catch {
        // Handle socket disconnect gracefully
      }
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
