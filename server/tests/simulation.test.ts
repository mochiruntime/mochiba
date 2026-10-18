import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../src/simulation/GameSimulation.js';
import { EPFL_DIAGONALE_MAP } from '@mochiba/shared';

describe('GameSimulation Combat & Physics (Kitsune Kit)', () => {
  it('casts Q (Echo Orb) and spawns an outbound boomerang projectile', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);

    sim.handleCastSpell('p1', 'Q', { x: 50, z: -50 });

    expect(sim.projectiles.size).toBe(1);
    const orb = Array.from(sim.projectiles.values())[0];
    expect(orb.type).toBe('ECHO_ORB_OUT');
    expect(orb.damage).toBe(60);
    expect(p1.cooldowns.q).toBe(5.0);
  });

  it('deals damage and inflicts CHARMED crowd control when E (Charm) hits an enemy champion', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);
    const p2 = sim.addChampion('p2', 'kitsune', 'RED', { x: 10, z: 0 }, 2);

    sim.handleCastSpell('p1', 'E', { x: 10, z: 0 });

    expect(sim.projectiles.size).toBe(1);
    const charm = Array.from(sim.projectiles.values())[0];
    expect(charm.type).toBe('CHARM_BOLT');
    expect(p1.cooldowns.e).toBe(8.0);

    // Simulate projectile advancing to hit p2
    charm.position = { x: 9.8, z: 0 };
    sim.tick(1 / 60);

    expect(p2.health).toBe(550 - 50);
    expect(p2.crowdControl).toBeDefined();
    expect(p2.crowdControl!.type).toBe('CHARMED');
    expect(p2.crowdControl!.remainingDuration).toBeCloseTo(1.4, 1);
  });

  it('launches homing embers at nearest enemy within range and grants speed boost on W', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);
    const p2 = sim.addChampion('p2', 'kitsune', 'RED', { x: 10, z: 0 }, 2);

    const baseSpeed = p1.speed;
    sim.handleCastSpell('p1', 'W');

    expect(sim.projectiles.size).toBe(3);
    const ember = Array.from(sim.projectiles.values())[0];
    expect(ember.type).toBe('SPECTRAL_EMBER');
    expect(p1.speed).toBeGreaterThan(baseSpeed);
    expect(p1.cooldowns.w).toBe(6.0);

    // Advance 0.5 seconds so embers acquire target and launch
    for (let i = 0; i < 30; i++) sim.tick(1 / 60);

    const activeEmbers = Array.from(sim.projectiles.values()).filter((p) => p.targetId === 'p2');
    expect(activeEmbers.length).toBeGreaterThan(0);
  });

  it('does not target enemies beyond max targeting range on W', () => {
    const sim = new GameSimulation();
    sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);
    sim.addChampion('p2', 'kitsune', 'RED', { x: 80, z: 0 }, 2); // 80m away > 28m range

    sim.handleCastSpell('p1', 'W');

    // Advance 0.5s
    for (let i = 0; i < 30; i++) sim.tick(1 / 60);

    const targeted = Array.from(sim.projectiles.values()).filter((p) => p.targetId === 'p2');
    expect(targeted.length).toBe(0);
  });

  it('dashes forward up to 3 times on R, spending 1 charge each cast', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);

    expect(p1.rCharges).toBe(3);

    // Cast 1
    sim.handleCastSpell('p1', 'R', { x: 20, z: 0 });
    expect(p1.position.x).toBeGreaterThan(10);
    expect(p1.rCharges).toBe(2);
    expect(p1.rWindowRemaining).toBe(10.0);
    expect(p1.cooldowns.r).toBe(0);

    // Advance 1s
    for (let i = 0; i < 60; i++) sim.tick(1 / 60);
    expect(p1.rWindowRemaining).toBeCloseTo(9.0, 1);

    // Cast 2
    sim.handleCastSpell('p1', 'R', { x: 35, z: 0 });
    expect(p1.rCharges).toBe(1);

    // Cast 3
    sim.handleCastSpell('p1', 'R', { x: 50, z: 0 });
    expect(p1.rCharges).toBe(0);
    expect(p1.rWindowRemaining).toBe(0);
    expect(p1.cooldowns.r).toBe(18.0);
  });

  it('damages target and triggers cooldown on basic attack', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);
    const p2 = sim.addChampion('p2', 'kitsune', 'RED', { x: 15, z: 0 }, 2);

    sim.handleAttackCommand('p1', 'p2');

    expect(sim.projectiles.size).toBe(1);
    const attackProj = Array.from(sim.projectiles.values())[0];
    expect(attackProj.type).toBe('BASIC_ATTACK');
    expect(attackProj.targetId).toBe('p2');
    expect(attackProj.damage).toBe(35);
    expect(p1.cooldowns.basicAttack).toBe(0.8);
  });

  it('rejects basic attack when target is out of range', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);
    sim.addChampion('p2', 'kitsune', 'RED', { x: 40, z: 0 }, 2); // 40m > 26m attack range

    sim.handleAttackCommand('p1', 'p2');
    expect(sim.projectiles.size).toBe(0);
    expect(p1.cooldowns.basicAttack).toBe(0);
  });

  it('clamps movement within lane boundaries', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);

    // Attempt to move far outside the lane corridor
    sim.handleMoveCommand('p1', { x: 200, z: 200 });

    expect(p1.targetPosition).toBeDefined();
    // Distance from corridor center (x + z) / sqrt(2) must not exceed half lane width (12m)
    const perpDist = Math.abs(p1.targetPosition!.x + p1.targetPosition!.z) / Math.SQRT2;
    expect(perpDist).toBeLessThanOrEqual(EPFL_DIAGONALE_MAP.laneWidth / 2 + 0.001);
  });

  it('triggers R cooldown when recast window expires with unused charges', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);

    sim.handleCastSpell('p1', 'R', { x: 5, z: 0 });
    expect(p1.rCharges).toBe(2);

    // Advance 10.5 seconds (630 ticks)
    for (let i = 0; i < 630; i++) sim.tick(1 / 60);

    expect(p1.rWindowRemaining).toBe(0);
    expect(p1.rCharges).toBe(0);
    expect(p1.cooldowns.r).toBeGreaterThan(0);

    // Advance remaining cooldown (30 seconds = 1800 ticks)
    for (let i = 0; i < 1800; i++) sim.tick(1 / 60);

    expect(p1.cooldowns.r).toBe(0);
    expect(p1.rCharges).toBe(3);
  });

  it('respawns fallen champion at team Nexus after 8 seconds', () => {
    const sim = new GameSimulation();
    const p1 = sim.addChampion('p1', 'kitsune', 'BLUE', { x: 0, z: 0 }, 1);

    sim.dealDamage('enemy', 'p1', 1000);

    expect(p1.isAlive).toBe(false);
    expect(p1.health).toBe(0);
    expect(p1.respawnTimer).toBe(8.0);

    // Advance 8.1 seconds (486 ticks)
    for (let i = 0; i < 486; i++) sim.tick(1 / 60);

    expect(p1.isAlive).toBe(true);
    expect(p1.health).toBe(p1.maxHealth);
    expect(p1.position.x).toBe(EPFL_DIAGONALE_MAP.blueNexus.x);
    expect(p1.position.z).toBe(EPFL_DIAGONALE_MAP.blueNexus.z);
  });
});
