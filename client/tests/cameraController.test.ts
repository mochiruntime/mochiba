import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraController } from '../src/camera/CameraController.js';

describe('CameraController (Edge Pan, Z-Lock, and Wheel Zoom)', () => {
  it('starts in Free Look mode by default and toggles with toggleLock()', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    const controller = new CameraController(camera);

    expect(controller.isLocked).toBe(false);

    controller.toggleLock();
    expect(controller.isLocked).toBe(true);

    controller.toggleLock();
    expect(controller.isLocked).toBe(false);
  });

  it('translates camera focus when cursor is near viewport edges in Free Look mode', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    const controller = new CameraController(camera);
    controller.focus.set(0, 0, 0);

    const vpW = 1000;
    const vpH = 1000;
    const dt = 0.1; // 100ms

    // Cursor at right border (1000, 500) -> should pan +X
    controller.update(dt, 995, 500, vpW, vpH);
    expect(controller.focus.x).toBeGreaterThan(0);
    expect(controller.focus.z).toBeCloseTo(0, 1);

    // Cursor at top border (500, 5) -> should pan -Z (towards screen top)
    controller.focus.set(0, 0, 0);
    controller.update(dt, 500, 5, vpW, vpH);
    expect(controller.focus.z).toBeLessThan(0);
    expect(controller.focus.x).toBeCloseTo(0, 1);
  });

  it('does NOT pan on edges when camera is Locked, rigidly tracking player', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    const controller = new CameraController(camera);
    controller.isLocked = true;

    const vpW = 1000;
    const vpH = 1000;
    const playerPos = { x: 42, z: -88 };

    // Move cursor to bottom-right corner while locked
    controller.update(0.1, 999, 999, vpW, vpH, playerPos);

    expect(controller.focus.x).toBe(playerPos.x);
    expect(controller.focus.z).toBe(playerPos.z);
  });

  it('clamps scroll wheel zoom within MOBA tactical bounds [50, 160]', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    const controller = new CameraController(camera);

    // Zoom out aggressively
    controller.handleWheel(5000);
    expect(controller.targetZoom).toBe(controller.maxZoom);
    expect(controller.targetZoom).toBe(160);

    // Zoom in aggressively
    controller.handleWheel(-10000);
    expect(controller.targetZoom).toBe(controller.minZoom);
    expect(controller.targetZoom).toBe(50);
  });
});
