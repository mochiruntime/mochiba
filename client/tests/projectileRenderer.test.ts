import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ProjectileRenderer } from '../src/render/ProjectileRenderer.js';
import { ProjectileState } from '@mochiba/shared';

describe('ProjectileRenderer', () => {
  it('creates and adds meshes for all projectile types', () => {
    const scene = new THREE.Scene();
    const renderer = new ProjectileRenderer(scene);

    const projs: ProjectileState[] = [
      {
        id: 'p1',
        type: 'ECHO_ORB_OUT',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 10, z: -10 },
        velocity: { x: 10, z: -10 },
        radius: 1.2,
        damage: 45,
        maxDistance: 22,
        distanceTraveled: 0
      },
      {
        id: 'p2',
        type: 'SPECTRAL_EMBER',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 5, z: -5 },
        velocity: { x: 0, z: 0 },
        radius: 0.7,
        damage: 40,
        maxDistance: 16,
        distanceTraveled: 0
      },
      {
        id: 'p3',
        type: 'CHARM_BOLT',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 0, z: 0 },
        velocity: { x: 1, z: -1 },
        radius: 0.9,
        damage: 60,
        maxDistance: 18,
        distanceTraveled: 0
      },
      {
        id: 'p4',
        type: 'ASTRAL_SURGE_BOLT',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: -10, z: 10 },
        velocity: { x: -1, z: 1 },
        radius: 0.6,
        damage: 50,
        maxDistance: 15,
        distanceTraveled: 0
      },
      {
        id: 'p5',
        type: 'BASIC_ATTACK',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 2, z: 2 },
        velocity: { x: 1, z: 1 },
        radius: 0.4,
        damage: 35,
        maxDistance: 20,
        distanceTraveled: 0
      }
    ];

    renderer.sync(projs);

    expect(renderer.meshes.size).toBe(5);
    expect(scene.children.length).toBe(5);

    for (const proj of projs) {
      const mesh = renderer.meshes.get(proj.id);
      expect(mesh).toBeDefined();
      expect(mesh!.position.x).toBe(proj.position.x);
      expect(mesh!.position.z).toBe(proj.position.z);
    }
  });

  it('updates projectile positions and removes expired ones', () => {
    const scene = new THREE.Scene();
    const renderer = new ProjectileRenderer(scene);

    const initial: ProjectileState[] = [
      {
        id: 'p1',
        type: 'ECHO_ORB_OUT',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 10, z: 0 },
        velocity: { x: 1, z: 0 },
        radius: 1.2,
        damage: 45,
        maxDistance: 22,
        distanceTraveled: 0
      },
      {
        id: 'p2',
        type: 'SPECTRAL_EMBER',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 0, z: 10 },
        velocity: { x: 0, z: 0 },
        radius: 0.7,
        damage: 40,
        maxDistance: 16,
        distanceTraveled: 0
      }
    ];

    renderer.sync(initial);
    expect(renderer.meshes.size).toBe(2);

    // Update p1 position, and expire p2
    const updated: ProjectileState[] = [
      {
        id: 'p1',
        type: 'ECHO_ORB_OUT',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 20, z: 5 },
        velocity: { x: 1, z: 0 },
        radius: 1.2,
        damage: 45,
        maxDistance: 22,
        distanceTraveled: 10
      }
    ];

    renderer.sync(updated);

    expect(renderer.meshes.size).toBe(1);
    expect(scene.children.length).toBe(1);

    const p1Mesh = renderer.meshes.get('p1');
    expect(p1Mesh).toBeDefined();
    expect(p1Mesh!.position.x).toBe(20);
    expect(p1Mesh!.position.z).toBe(5);

    expect(renderer.meshes.has('p2')).toBe(false);
  });

  it('cleans up all meshes on dispose', () => {
    const scene = new THREE.Scene();
    const renderer = new ProjectileRenderer(scene);

    renderer.sync([
      {
        id: 'p1',
        type: 'CHARM_BOLT',
        ownerId: 'player1',
        team: 'BLUE',
        position: { x: 0, z: 0 },
        velocity: { x: 0, z: 0 },
        radius: 0.9,
        damage: 60,
        maxDistance: 18,
        distanceTraveled: 0
      }
    ]);

    expect(scene.children.length).toBe(1);
    renderer.dispose();
    expect(renderer.meshes.size).toBe(0);
    expect(scene.children.length).toBe(0);
  });
});
