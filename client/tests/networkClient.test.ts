import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NetworkClient, NetworkClientCallbacks } from '../src/net/NetworkClient.js';
import { HelloMessage, WorldSnapshot, ServerMessage } from '@mochiba/shared';

// Mock WebSocket class for client-side testing
class MockBrowserWebSocket {
  public static instances: MockBrowserWebSocket[] = [];
  public readyState = 1; // OPEN
  public sentData: string[] = [];
  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(public url: string) {
    MockBrowserWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(data: string) {
    this.sentData.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }

  simulateServerMessage(msg: ServerMessage) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(msg) });
    }
  }
}

describe('NetworkClient', () => {
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    MockBrowserWebSocket.instances = [];
    (global as any).WebSocket = MockBrowserWebSocket;
  });

  afterEach(() => {
    global.WebSocket = originalWebSocket;
  });

  function createClient(customCallbacks: Partial<NetworkClientCallbacks> = {}) {
    const callbacks: NetworkClientCallbacks = {
      onHello: vi.fn(),
      onSnapshot: vi.fn(),
      onPong: vi.fn(),
      onDisconnect: vi.fn(),
      ...customCallbacks
    };

    const client = new NetworkClient(callbacks);
    return { client, callbacks };
  }

  it('connects to websocket server and starts ping interval', async () => {
    const { client } = createClient();
    client.connect('kitsune');

    expect(MockBrowserWebSocket.instances.length).toBe(1);
    expect(MockBrowserWebSocket.instances[0].url).toContain('champion=kitsune');
    expect(client.isOpen()).toBe(true);

    client.dispose();
  });

  it('handles HELLO packet and stores myPlayerId', () => {
    const { client, callbacks } = createClient();
    client.connect();
    const ws = MockBrowserWebSocket.instances[0];

    const helloMsg: HelloMessage = {
      type: 'HELLO',
      clientId: 'client_123',
      serverTickRate: 60,
      team: 'BLUE',
      snapshot: {
        tick: 1,
        timestamp: Date.now(),
        champions: [],
        projectiles: []
      }
    };

    ws.simulateServerMessage(helloMsg);

    expect(client.myPlayerId).toBe('client_123');
    expect(callbacks.onHello).toHaveBeenCalledWith(helloMsg);

    client.dispose();
  });

  it('handles SNAPSHOT packet and dispatches to onSnapshot callback', () => {
    const { client, callbacks } = createClient();
    client.connect();
    const ws = MockBrowserWebSocket.instances[0];

    const snapshot: WorldSnapshot = {
      tick: 42,
      timestamp: Date.now(),
      champions: [],
      projectiles: []
    };

    ws.simulateServerMessage({ type: 'SNAPSHOT', snapshot });

    expect(callbacks.onSnapshot).toHaveBeenCalledWith(snapshot);

    client.dispose();
  });

  it('handles PONG packet and computes round-trip ping latency', () => {
    const { client, callbacks } = createClient();
    client.connect();
    const ws = MockBrowserWebSocket.instances[0];

    const now = Date.now();
    ws.simulateServerMessage({
      type: 'PONG',
      clientTime: now - 35,
      serverTime: now
    });

    expect(client.currentPing).toBeGreaterThanOrEqual(30);
    expect(callbacks.onPong).toHaveBeenCalledWith(expect.any(Number));

    client.dispose();
  });

  it('sends ClientMessage payload as JSON string over open socket', () => {
    const { client } = createClient();
    client.connect();
    const ws = MockBrowserWebSocket.instances[0];

    client.send({ type: 'MOVE_COMMAND', target: { x: 10, z: -10 } });

    expect(ws.sentData.length).toBe(1);
    const sent = JSON.parse(ws.sentData[0]);
    expect(sent.type).toBe('MOVE_COMMAND');
    expect(sent.target).toEqual({ x: 10, z: -10 });

    client.dispose();
  });

  it('handles server disconnection and cleans up ping timer on dispose', () => {
    const { client, callbacks } = createClient();
    client.connect();
    const ws = MockBrowserWebSocket.instances[0];

    ws.close();

    expect(callbacks.onDisconnect).toHaveBeenCalledWith('Disconnected from server.');
    expect(client.isOpen()).toBe(false);

    client.dispose();
  });
});
