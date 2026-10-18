import {
  ClientMessage,
  ServerMessage,
  HelloMessage,
  WorldSnapshot
} from '@mochiba/shared';

export interface NetworkClientCallbacks {
  onHello: (msg: HelloMessage) => void;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onPong: (pingMs: number) => void;
  onDisconnect: (errorText: string) => void;
}

export class NetworkClient {
  private ws: WebSocket | null = null;
  private pingInterval: number | null = null;
  public currentPing = 0;
  public myPlayerId: string | null = null;

  constructor(private callbacks: NetworkClientCallbacks) {}

  public connect(requestedChampion = 'kitsune', customUrl?: string): void {
    let url = customUrl;
    if (!url) {
      const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost';
      url = `${wsProtocol}//${wsHost}:3001?champion=${encodeURIComponent(requestedChampion)}`;
    }

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // Ignore malformed packets
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      this.callbacks.onDisconnect('Disconnected from server.');
    };

    this.ws.onerror = () => {
      this.stopPing();
      this.callbacks.onDisconnect('Server connection error.');
    };
  }

  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.isOpen()) {
        this.send({ type: 'PING', clientTime: Date.now() });
      }
    }, 1000) as unknown as number;
  }

  private stopPing(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleMessage(msg: ServerMessage): void {
    if (msg.type === 'HELLO') {
      this.myPlayerId = msg.clientId;
      this.callbacks.onHello(msg);
    } else if (msg.type === 'SNAPSHOT') {
      this.callbacks.onSnapshot(msg.snapshot);
    } else if (msg.type === 'PONG') {
      this.currentPing = Date.now() - msg.clientTime;
      this.callbacks.onPong(this.currentPing);
    }
  }

  public isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  public send(msg: ClientMessage): void {
    if (this.isOpen()) {
      this.ws!.send(JSON.stringify(msg));
    }
  }

  public dispose(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
