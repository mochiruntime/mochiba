import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ChampionRenderer } from '../src/render/ChampionRenderer.js';
import { ChampionState } from '@mochiba/shared';

describe('ChampionRenderer', () => {
  let scene: THREE.Scene;
  let renderer: ChampionRenderer;

  const mockChampion1: ChampionState = {
    id: 'c1',
    championId: 'kitsune',
    name: 'Blue Kitsune #1',
    team: 'BLUE',
    position: { x: -10, z: -10 },
    targetPosition: null,
    rotation: 0,
    speed: 16,
    health: 550,
    maxHealth: 550,
    mana: 400,
    maxMana: 400,
    isAlive: true,
    respawnTimer: 0,
    crowdControl: null,
    cooldowns: { q: 0, w: 0, e: 0, r: 0, basicAttack: 0 },
    rCharges: 3,
    rWindowRemaining: 0
  };

  const mockChampion2: ChampionState = {
    id: 'c2',
    championId: 'kitsune',
    name: 'Red Kitsune #2',
    team: 'RED',
    position: { x: 20, z: 20 },
    targetPosition: null,
    rotation: Math.PI,
    speed: 16,
    health: 550,
    maxHealth: 550,
    mana: 400,
    maxMana: 400,
    isAlive: true,
    respawnTimer: 0,
    crowdControl: null,
    cooldowns: { q: 0, w: 0, e: 0, r: 0, basicAttack: 0 },
    rCharges: 3,
    rWindowRemaining: 0
  };

  beforeEach(() => {
    scene = new THREE.Scene();
    renderer = new ChampionRenderer(scene);
  });

  it('syncs champions and registers meshes and health bars', () => {
    renderer.sync([mockChampion1, mockChampion2], 'c1');

    expect(renderer.championMeshes.size).toBe(2);
    expect(renderer.championHealthBars.size).toBe(2);
    expect(renderer.getRaycastMeshes().length).toBe(2);

    const firstMesh = renderer.getRaycastMeshes()[0];
    const id = renderer.getChampionIdByMesh(firstMesh);
    expect(['c1', 'c2']).toContain(id);
  });

  it('interpolates positions during update', () => {
    renderer.sync([mockChampion1], 'c1');
    const group = renderer.championMeshes.get('c1')!;
    expect(group.position.x).toBe(-10);

    // Update target state
    const movedState = { ...mockChampion1, position: { x: 0, z: 0 } };
    renderer.sync([movedState], 'c1');

    const camera = new THREE.PerspectiveCamera();
    renderer.update(0.1, camera);

    // Position moves towards 0
    expect(group.position.x).toBeGreaterThan(-10);
    expect(group.position.x).toBeLessThanOrEqual(0);
  });

  it('cleans up removed champions on sync', () => {
    renderer.sync([mockChampion1, mockChampion2], 'c1');
    expect(renderer.championMeshes.size).toBe(2);

    // Disconnect c2
    renderer.sync([mockChampion1], 'c1');
    expect(renderer.championMeshes.size).toBe(1);
    expect(renderer.championHealthBars.size).toBe(1);
    expect(renderer.getRaycastMeshes().length).toBe(1);
    expect(renderer.championMeshes.has('c2')).toBe(false);
  });

  it('fully disposes all resources on dispose', () => {
    renderer.sync([mockChampion1, mockChampion2], 'c1');
    renderer.dispose();

    expect(renderer.championMeshes.size).toBe(0);
    expect(renderer.championHealthBars.size).toBe(0);
    expect(renderer.getRaycastMeshes().length).toBe(0);
    expect(renderer.latestChampionStates.size).toBe(0);
  });
});
