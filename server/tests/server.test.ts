import { describe, it, expect } from 'vitest';
import { ServerApp } from '../src/ServerApp.js';
import { championRegistry } from '../src/champions/ChampionRegistry.js';
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

describe('ServerApp Combat & Abilities (Kitsune Kit)', () => {
  it('sends HELLO packet with initial champion stats and zero cooldowns', () => {
    const server = new ServerApp();
    const socket = new MockSocket();
    const clientId = server.handleConnection(socket);

    const hello: HelloMessage = JSON.parse(socket.sentMessages[0]);
    expect(hello.type).toBe('HELLO');
    expect(hello.snapshot.champions[0].health).toBe(550);
    expect(hello.snapshot.champions[0].mana).toBe(400);
    expect(hello.snapshot.champions[0].cooldowns.q).toBe(0);
  });

  it('casts Q (Echo Orb) and spawns an outbound boomerang projectile', () => {
    const server = new ServerApp();
    const socket = new MockSocket();
    const clientId = server.handleConnection(socket);

    socket.simulateMessage({
      type: 'CAST_SPELL',
      spell: 'Q',
      target: { x: 50, z: -50 }
    });

    expect(server.projectiles.size).toBe(1);
    const orb = Array.from(server.projectiles.values())[0];
    expect(orb.type).toBe('ECHO_ORB_OUT');
    expect(orb.damage).toBe(60);
    expect(server.players.get(clientId)!.state.cooldowns.q).toBe(5.0);
  });

  it('deals damage and inflicts CHARMED crowd control when E (Charm) hits an enemy champion', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const s2 = new MockSocket();

    const p1Id = server.handleConnection(s1); // Blue
    const p2Id = server.handleConnection(s2); // Red

    const p1 = server.players.get(p1Id)!.state;
    const p2 = server.players.get(p2Id)!.state;

    // Place them 10m apart on the lane
    p1.position = { x: 0, z: 0 };
    p2.position = { x: 10, z: -10 };

    // P1 casts E toward P2
    s1.simulateMessage({
      type: 'CAST_SPELL',
      spell: 'E',
      target: { x: p2.position.x, z: p2.position.z }
    });

    const initialHp = p2.health;

    // Advance simulation ticks for Charm bolt to travel and collide
    for (let i = 0; i < 40; i++) {
      server.tick();
    }

    // P2 should have taken damage and be charmed
    expect(p2.health).toBeLessThan(initialHp);
    expect(p2.crowdControl).toBeDefined();
    expect(p2.crowdControl?.type).toBe('CHARMED');
    expect(p2.crowdControl?.sourceId).toBe(p1Id);
  });

  it('triggers death and respawn loop when champion HP reaches 0', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const s2 = new MockSocket();

    const p1Id = server.handleConnection(s1);
    const p2Id = server.handleConnection(s2);

    const p2 = server.players.get(p2Id)!.state;
    p2.health = 20; // 20 HP remaining

    // P1 basic attacks P2 (deals 35 damage)
    p2.position = { x: 5, z: -5 };
    server.players.get(p1Id)!.state.position = { x: 0, z: 0 };

    s1.simulateMessage({
      type: 'ATTACK_TARGET',
      targetId: p2Id
    });

    // Advance ticks for attack impact
    for (let i = 0; i < 30; i++) {
      server.tick();
    }

    // P2 should be dead with 8s respawn timer
    expect(p2.isAlive).toBe(false);
    expect(p2.health).toBe(0);
    expect(p2.respawnTimer).toBeGreaterThan(0);
  });

  it('supports registering and selecting custom champion behaviors seamlessly', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();

    const mockBehavior = {
      definition: {
        id: 'duelist',
        name: 'Duelist',
        title: 'Master of the Blade',
        role: 'FIGHTER' as const,
        baseHealth: 600,
        baseMana: 250,
        baseSpeed: 17,
        attackRange: 5,
        attackCooldown: 0.7,
        attackDamage: 40,
        attackProjectileType: 'BASIC_ATTACK' as const,
        skills: {
          Q: { slot: 'Q' as const, name: 'Lunge', description: '', color: '#fff', cooldown: 3, manaCost: 0 },
          W: { slot: 'W' as const, name: 'Parry', description: '', color: '#fff', cooldown: 8, manaCost: 0 },
          E: { slot: 'E' as const, name: 'Riposte', description: '', color: '#fff', cooldown: 6, manaCost: 0 },
          R: { slot: 'R' as const, name: 'Grand Duel', description: '', color: '#fff', cooldown: 30, manaCost: 0 }
        }
      },
      createInitialState: (id: string, team: any, spawnPos: any) => ({
        id,
        championId: 'duelist',
        name: 'Test Duelist',
        team,
        position: { ...spawnPos },
        targetPosition: null,
        rotation: 0,
        speed: 17,
        health: 600,
        maxHealth: 600,
        mana: 250,
        maxMana: 250,
        isAlive: true,
        respawnTimer: 0,
        crowdControl: null,
        cooldowns: { q: 0, w: 0, e: 0, r: 0, basicAttack: 0 },
        rCharges: 0,
        rWindowRemaining: 0
      }),
      onBasicAttack: () => {},
      onCastSpell: () => {},
      onTick: () => {}
    };

    championRegistry.register(mockBehavior);
    const duelistId = server.handleConnection(s1, 'duelist');
    const duelist = server.players.get(duelistId)!.state;

    expect(duelist.championId).toBe('duelist');
    expect(duelist.health).toBe(600);
    expect(duelist.speed).toBe(17);
  });

  it('calibrates Q and E projectile velocities to 75 m/s', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const p1Id = server.handleConnection(s1);

    // Cast Q
    s1.simulateMessage({
      type: 'CAST_SPELL',
      spell: 'Q',
      target: { x: 50, z: 0 }
    });

    const qOrb = Array.from(server.projectiles.values()).find((p) => p.type === 'ECHO_ORB_OUT');
    expect(qOrb).toBeDefined();
    const qSpeed = Math.hypot(qOrb!.velocity.x, qOrb!.velocity.z);
    expect(Math.round(qSpeed)).toBe(75);

    // Cast E
    s1.simulateMessage({
      type: 'CAST_SPELL',
      spell: 'E',
      target: { x: 50, z: 0 }
    });

    const eBolt = Array.from(server.projectiles.values()).find((p) => p.type === 'CHARM_BOLT');
    expect(eBolt).toBeDefined();
    const eSpeed = Math.hypot(eBolt!.velocity.x, eBolt!.velocity.z);
    expect(Math.round(eSpeed)).toBe(75);
  });

  it('spawns 3 orbiting W wisps that orbit and sequentially peel off toward enemy', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const s2 = new MockSocket();

    const p1Id = server.handleConnection(s1); // Blue Kitsune
    const p2Id = server.handleConnection(s2); // Red Kitsune

    const p1 = server.players.get(p1Id)!.state;
    const p2 = server.players.get(p2Id)!.state;
    p1.position = { x: 0, z: 0 };
    p2.position = { x: 8, z: 0 }; // In acquisition range (8m < 15m)

    // Cast W
    s1.simulateMessage({
      type: 'CAST_SPELL',
      spell: 'W',
      target: { x: 0, z: 0 }
    });

    // 3 embers should be spawned in orbit
    const embers = Array.from(server.projectiles.values()).filter((p) => p.type === 'SPECTRAL_EMBER');
    expect(embers.length).toBe(3);
    expect(embers.every((e) => e.isOrbiting)).toBe(true);

    // Advance 20 ticks (0.33s) — first ember should have armed and peeled off out of orbit
    for (let i = 0; i < 20; i++) server.tick();

    const orbitingCount1 = Array.from(server.projectiles.values()).filter(
      (p) => p.type === 'SPECTRAL_EMBER' && p.isOrbiting
    ).length;
    // At least 1 ember left orbit
    expect(orbitingCount1).toBeLessThan(3);

    // Advance another 60 ticks (1.0s) — all embers should have sequentially launched and connected
    for (let i = 0; i < 60; i++) server.tick();

    // p2 took damage from the sequential embers
    expect(p2.health).toBeLessThan(550);
  });

  it('confirms R Astral Surge dashes spawn homing essence bolts when enemy is in range', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const s2 = new MockSocket();

    const p1Id = server.handleConnection(s1);
    const p2Id = server.handleConnection(s2);

    const p1 = server.players.get(p1Id)!.state;
    const p2 = server.players.get(p2Id)!.state;
    p1.position = { x: 0, z: 0 };
    p2.position = { x: 10, z: -10 }; // enemy nearby (dist ~14.1m <= 15m)

    // Cast R dash
    s1.simulateMessage({
      type: 'CAST_SPELL',
      spell: 'R',
      target: { x: 5, z: -5 }
    });

    // Should spawn an ASTRAL_SURGE_BOLT homing onto p2
    const rBolts = Array.from(server.projectiles.values()).filter((p) => p.type === 'ASTRAL_SURGE_BOLT');
    expect(rBolts.length).toBe(1);
    expect(rBolts[0].targetId).toBe(p2Id);
    expect(rBolts[0].damage).toBe(55);

    // If no enemy in range, R dash only dashes without firing bolts
    p2.position = { x: 100, z: 100 }; // far away out of range
    server.projectiles.clear();

    s1.simulateMessage({
      type: 'CAST_SPELL',
      spell: 'R',
      target: { x: 8, z: -8 }
    });

    const farBolts = Array.from(server.projectiles.values()).filter((p) => p.type === 'ASTRAL_SURGE_BOLT');
    expect(farBolts.length).toBe(0); // Pure mobility dash!
  });

  it('allows R to be recast cleanly after full cooldown expires', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const p1Id = server.handleConnection(s1);
    const p1 = server.players.get(p1Id)!.state;

    // Cast 1st charge
    s1.simulateMessage({ type: 'CAST_SPELL', spell: 'R', target: { x: 5, z: 0 } });
    expect(p1.rCharges).toBe(2);
    expect(p1.rWindowRemaining).toBeGreaterThan(0);

    // Cast 2nd charge
    s1.simulateMessage({ type: 'CAST_SPELL', spell: 'R', target: { x: 10, z: 0 } });
    expect(p1.rCharges).toBe(1);

    // Cast 3rd charge
    s1.simulateMessage({ type: 'CAST_SPELL', spell: 'R', target: { x: 15, z: 0 } });
    expect(p1.rCharges).toBe(0);
    expect(p1.rWindowRemaining).toBe(0);
    expect(p1.cooldowns.r).toBe(18.0);

    // Cannot cast while on cooldown
    s1.simulateMessage({ type: 'CAST_SPELL', spell: 'R', target: { x: 20, z: 0 } });
    expect(p1.rCharges).toBe(0);

    // Advance ticks for full 18s cooldown (18 * 60 = 1080 ticks)
    for (let i = 0; i < 1100; i++) {
      server.tick();
    }

    // Cooldown is 0, charges should be replenished to 3!
    expect(p1.cooldowns.r).toBe(0);
    expect(p1.rCharges).toBe(3);

    // Cast R again!
    s1.simulateMessage({ type: 'CAST_SPELL', spell: 'R', target: { x: 25, z: 0 } });
    expect(p1.rCharges).toBe(2);
    expect(p1.rWindowRemaining).toBeGreaterThan(0);
  });

  it('triggers R cooldown when recast window expires with unused charges and replenishes on cooldown finish', () => {
    const server = new ServerApp();
    const s1 = new MockSocket();
    const p1Id = server.handleConnection(s1);
    const p1 = server.players.get(p1Id)!.state;

    // Cast only 1 charge
    s1.simulateMessage({ type: 'CAST_SPELL', spell: 'R', target: { x: 5, z: 0 } });
    expect(p1.rCharges).toBe(2);

    // Advance 10.5 seconds (630 ticks) so the window expires
    for (let i = 0; i < 630; i++) server.tick();

    // Window expired: charges 0, cooldown active
    expect(p1.rWindowRemaining).toBe(0);
    expect(p1.rCharges).toBe(0);
    expect(p1.cooldowns.r).toBeGreaterThan(0);

    // Advance remaining cooldown
    for (let i = 0; i < 1800; i++) server.tick();

    expect(p1.cooldowns.r).toBe(0);
    expect(p1.rCharges).toBe(3);
  });
});


