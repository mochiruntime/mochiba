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

  simulateClose() {
    this.emit('close');
  }
}

describe('ServerApp & Network Integration', () => {
  it('sends HELLO packet with initial champion stats and zero cooldowns on connection', () => {
    const server = new ServerApp();
    const socket = new MockSocket();
    const clientId = server.network.registerClient(socket, 'kitsune');

    expect(server.network.sessions.has(clientId)).toBe(true);
    expect(server.simulation.champions.has(clientId)).toBe(true);

    const hello: HelloMessage = JSON.parse(socket.sentMessages[0]);
    expect(hello.type).toBe('HELLO');
    expect(hello.clientId).toBe(clientId);
    expect(hello.team).toBe('BLUE');
    expect(hello.snapshot.champions[0].health).toBe(550);
    expect(hello.snapshot.champions[0].mana).toBe(400);
    expect(hello.snapshot.champions[0].cooldowns.q).toBe(0);
  });

  it('assigns alternating teams to connecting clients', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const s2 = new MockSocket();

    const c1 = server.network.registerClient(s1);
    const c2 = server.network.registerClient(s2);

    expect(server.simulation.champions.get(c1)!.team).toBe('BLUE');
    expect(server.simulation.champions.get(c2)!.team).toBe('RED');
  });

  it('replies to client PING with PONG packet containing serverTime and matching clientTime', () => {
    const server = new ServerApp();
    const socket = new MockSocket();
    server.network.registerClient(socket);

    const clientNow = 123456789;
    socket.simulateMessage({ type: 'PING', clientTime: clientNow });

    const pong: PongMessage = JSON.parse(socket.sentMessages[1]);
    expect(pong.type).toBe('PONG');
    expect(pong.clientTime).toBe(clientNow);
    expect(pong.serverTime).toBeGreaterThanOrEqual(1000);
  });

  it('cleans up session and champion state when client socket closes', () => {
    const server = new ServerApp();
    const socket = new MockSocket();
    const clientId = server.network.registerClient(socket);

    expect(server.network.sessions.has(clientId)).toBe(true);
    expect(server.simulation.champions.has(clientId)).toBe(true);

    socket.simulateClose();

    expect(server.network.sessions.has(clientId)).toBe(false);
    expect(server.simulation.champions.has(clientId)).toBe(false);
  });

  it('broadcasts snapshot packet to all connected clients on server tick', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const s2 = new MockSocket();

    server.network.registerClient(s1);
    server.network.registerClient(s2);

    // Initial HELLO messages sent
    expect(s1.sentMessages.length).toBe(1);
    expect(s2.sentMessages.length).toBe(1);

    // Advance 1 tick
    server.tick();

    expect(s1.sentMessages.length).toBe(2);
    expect(s2.sentMessages.length).toBe(2);

    const snapshotMsg: ServerMessage = JSON.parse(s1.sentMessages[1]);
    expect(snapshotMsg.type).toBe('SNAPSHOT');
    expect((snapshotMsg as any).snapshot.champions.length).toBe(2);
  });
});
