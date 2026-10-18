import { describe, it, expect } from 'vitest';
import { ServerApp } from '../src/ServerApp.js';
import { EventEmitter } from 'node:events';
import { HelloMessage, PongMessage, ServerMessage } from '@mochiba/shared';

class MockSocket extends EventEmitter {
  public sentMessages: string[] = [];

  send(data: string) {
    this.sentMessages.push(data);
  }

  simulateMessage(data: object) {
    this.emit('message', JSON.stringify(data));
  }
}

describe('ServerApp WebSocket Logic (60Hz Tick, Movement & Sync)', () => {
  it('sends HELLO packet with team and initial snapshot upon connection', () => {
    const server = new ServerApp();
    const socket = new MockSocket();

    const clientId = server.handleConnection(socket);

    expect(clientId).toMatch(/^client_/);
    expect(socket.sentMessages.length).toBe(1);

    const hello: HelloMessage = JSON.parse(socket.sentMessages[0]);
    expect(hello.type).toBe('HELLO');
    expect(hello.serverTickRate).toBe(60);
    expect(hello.team).toBe('BLUE');
    expect(hello.snapshot.champions.length).toBe(1);
    expect(hello.snapshot.champions[0].id).toBe(clientId);
  });

  it('alternates teams for subsequent connecting players', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const s2 = new MockSocket();

    server.handleConnection(s1);
    server.handleConnection(s2);

    const hello1: HelloMessage = JSON.parse(s1.sentMessages[0]);
    const hello2: HelloMessage = JSON.parse(s2.sentMessages[0]);

    expect(hello1.team).toBe('BLUE');
    expect(hello2.team).toBe('RED');
  });

  it('updates targetPosition and moves champion upon MOVE_COMMAND', () => {
    const server = new ServerApp();
    const socket = new MockSocket();
    const clientId = server.handleConnection(socket);

    const initialPos = { ...server.players.get(clientId)!.state.position };

    // Issue move command towards center (0, 0) which is inside the lane
    socket.simulateMessage({
      type: 'MOVE_COMMAND',
      target: { x: 0, z: 0 }
    });

    const session = server.players.get(clientId)!;
    expect(session.state.targetPosition).toEqual({ x: 0, z: 0 });

    // Advance 10 ticks (1/6 second)
    for (let i = 0; i < 10; i++) {
      server.tick();
    }

    const newPos = session.state.position;
    // Champion should have moved closer to (0, 0)
    const initialDist = Math.hypot(initialPos.x, initialPos.z);
    const newDist = Math.hypot(newPos.x, newPos.z);
    expect(newDist).toBeLessThan(initialDist);
  });

  it('responds with PONG to client PING', () => {
    const server = new ServerApp();
    const socket = new MockSocket();
    server.handleConnection(socket);

    const pingTime = Date.now();
    socket.simulateMessage({ type: 'PING', clientTime: pingTime });

    const pong = socket.sentMessages
      .map((msg) => JSON.parse(msg) as ServerMessage)
      .find((m) => m.type === 'PONG') as PongMessage | undefined;

    expect(pong).toBeDefined();
    expect(pong!.clientTime).toBe(pingTime);
  });
});
