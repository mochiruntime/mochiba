import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HealthBarRenderer } from '../src/render/HealthBarRenderer.js';
import { ChampionState } from '@mochiba/shared';

describe('HealthBarRenderer', () => {
  const dummyState: ChampionState = {
    id: 'champ_1',
    championId: 'kitsune',
    name: 'Blue Kitsune #1',
    team: 'BLUE',
    position: { x: 10, z: 20 },
    targetPosition: null,
    rotation: Math.PI / 4,
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

  it('initializes prominent MOBA dimensions and billboard components', () => {
    const healthBar = new HealthBarRenderer(true, 'Blue Kitsune #1');

    expect(healthBar.group).toBeInstanceOf(THREE.Group);
    expect(healthBar.barWidth).toBeGreaterThan(6.0); // Noticeably larger bar
    expect(healthBar.barHeight).toBeGreaterThan(0.5);
    expect(healthBar.group.children.length).toBeGreaterThanOrEqual(4);
  });

  it('applies true billboarding matching camera quaternion in world space', () => {
    const healthBar = new HealthBarRenderer(true, 'Blue Kitsune #1');
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    camera.position.set(50, 100, 150);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const champPos = { x: 5, y: 0, z: -5 };
    healthBar.update(dummyState, champPos, camera);

    expect(healthBar.group.quaternion.x).toBeCloseTo(camera.quaternion.x, 3);
    expect(healthBar.group.quaternion.y).toBeCloseTo(camera.quaternion.y, 3);
    expect(healthBar.group.quaternion.z).toBeCloseTo(camera.quaternion.z, 3);
    expect(healthBar.group.quaternion.w).toBeCloseTo(camera.quaternion.w, 3);
  });

  it('scales linearly with camera distance to preserve constant screen-space size', () => {
    const healthBar = new HealthBarRenderer(true, 'Blue Kitsune #1');
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);

    const champPos = { x: 0, y: 0, z: 0 };

    // At distance 100m (reference distance)
    camera.position.set(0, 100, 0);
    healthBar.update(dummyState, champPos, camera);
    const scaleAt100 = healthBar.group.scale.x;
    expect(scaleAt100).toBeCloseTo(1.0, 2);

    // At distance 200m (zoomed out)
    camera.position.set(0, 200, 0);
    healthBar.update(dummyState, champPos, camera);
    const scaleAt200 = healthBar.group.scale.x;
    expect(scaleAt200).toBeCloseTo(2.0, 2);

    // At distance 50m (zoomed in)
    camera.position.set(0, 50, 0);
    healthBar.update(dummyState, champPos, camera);
    const scaleAt50 = healthBar.group.scale.x;
    expect(scaleAt50).toBeCloseTo(0.5, 2);

    // Ratio scale/dist is completely invariant
    expect(scaleAt200 / 200).toBeCloseTo(scaleAt50 / 50, 4);
  });

  it('correctly tracks position overhead without rotating with character heading', () => {
    const healthBar = new HealthBarRenderer(true, 'Blue Kitsune #1');
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    camera.position.set(0, 100, 100);
    camera.lookAt(0, 0, 0);

    const champPos = { x: 25, y: 0, z: -40 };

    // Update with champion facing one direction
    const stateA = { ...dummyState, rotation: 0 };
    healthBar.update(stateA, champPos, camera);
    const quatA = healthBar.group.quaternion.clone();

    // Update with champion facing opposite direction (rotation = Math.PI)
    const stateB = { ...dummyState, rotation: Math.PI };
    healthBar.update(stateB, champPos, camera);
    const quatB = healthBar.group.quaternion.clone();

    // Billboard orientation is unaffected by character rotation
    expect(quatB.x).toBeCloseTo(quatA.x, 4);
    expect(quatB.y).toBeCloseTo(quatA.y, 4);
    expect(quatB.z).toBeCloseTo(quatA.z, 4);
    expect(quatB.w).toBeCloseTo(quatA.w, 4);
  });

  it('scales distance between character and billboard inversely to zoom level', () => {
    const healthBar = new HealthBarRenderer(true, 'Blue Kitsune #1');
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    const champPos = { x: 0, y: 0, z: 0 };

    // Zoomed in (50m distance to camera)
    camera.position.set(0, 50, 0);
    healthBar.update(dummyState, champPos, camera);
    const gapAtZoom50 = healthBar.group.position.y - champPos.y - healthBar.characterHeight;

    // Zoomed out (200m distance to camera)
    camera.position.set(0, 200, 0);
    healthBar.update(dummyState, champPos, camera);
    const gapAtZoom200 = healthBar.group.position.y - champPos.y - healthBar.characterHeight;

    // The gap when zoomed in (50m) must be strictly greater than when zoomed out (200m)
    expect(gapAtZoom50).toBeGreaterThan(gapAtZoom200);

    // Specifically inversely proportional (50m is 1/4 of 200m, so gap is 4x larger)
    expect(gapAtZoom50 / gapAtZoom200).toBeCloseTo(4.0, 2);
  });
});

