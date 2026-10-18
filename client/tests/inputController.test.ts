import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { InputController, InputControllerCallbacks, IEventTargetLike } from '../src/input/InputController.js';
import { ChampionRenderer } from '../src/render/ChampionRenderer.js';
import { ChampionState } from '@mochiba/shared';

class MockEventTarget implements IEventTargetLike {
  public listeners = new Map<string, Function[]>();
  public innerWidth = 1920;
  public innerHeight = 1080;

  addEventListener(type: string, listener: any) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: any) {
    const list = this.listeners.get(type);
    if (!list) return;
    this.listeners.set(type, list.filter((l) => l !== listener));
  }

  emit(type: string, event: any) {
    const list = this.listeners.get(type);
    if (list) {
      for (const cb of list) cb(event);
    }
  }
}

describe('InputController', () => {
  function createController(customCallbacks: Partial<InputControllerCallbacks> = {}) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1920 / 1080, 1, 1000);
    camera.position.set(0, 50, 50);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const championRenderer = new ChampionRenderer(scene);
    const mockWindow = new MockEventTarget();

    const callbacks: InputControllerCallbacks = {
      onMove: vi.fn(),
      onAttack: vi.fn(),
      onCastSpell: vi.fn(),
      onToggleCameraLock: vi.fn(),
      onZoom: vi.fn(),
      getMyPosition: () => ({ x: 0, z: 0 }),
      getMyPlayerId: () => 'my_player',
      isNetworkReady: () => true,
      ...customCallbacks
    };

    const controller = new InputController(camera, scene, championRenderer, callbacks, mockWindow);
    return { controller, scene, camera, championRenderer, callbacks, mockWindow };
  }

  it('calculates ground intersection from mouse coordinates', () => {
    const { controller } = createController();
    controller.currentMouseX = 960;
    controller.currentMouseY = 540;

    const hit = controller.getMouseGroundPoint();
    expect(hit).toBeDefined();
    expect(hit!.y).toBeCloseTo(0, 2);
  });

  it('triggers onToggleCameraLock when pressing Z', () => {
    const { controller, callbacks, mockWindow } = createController();
    mockWindow.emit('keydown', { key: 'z' });
    expect(callbacks.onToggleCameraLock).toHaveBeenCalled();
    controller.dispose();
  });

  it('triggers onCastSpell with ground coordinates when pressing Q, W, E, or R', () => {
    const { controller, callbacks, mockWindow } = createController();
    mockWindow.emit('keydown', { key: 'q' });
    expect(callbacks.onCastSpell).toHaveBeenCalledWith(
      'Q',
      expect.objectContaining({ x: expect.any(Number), z: expect.any(Number) })
    );

    mockWindow.emit('keydown', { key: 'e' });
    expect(callbacks.onCastSpell).toHaveBeenCalledWith(
      'E',
      expect.objectContaining({ x: expect.any(Number), z: expect.any(Number) })
    );
    controller.dispose();
  });

  it('triggers onMove and creates ClickIndicator on right-click on ground', () => {
    const { controller, callbacks, scene, mockWindow } = createController();

    // Right click (button = 2)
    mockWindow.emit('mousedown', { button: 2, clientX: 960, clientY: 540 });

    expect(callbacks.onMove).toHaveBeenCalled();
    expect(controller.clickIndicators.length).toBe(1);
    expect(scene.children.some((c) => c === controller.clickIndicators[0].mesh)).toBe(true);

    controller.dispose();
  });

  it('triggers onAttack when right-clicking on an enemy champion mesh', () => {
    const { controller, callbacks, championRenderer, mockWindow } = createController();

    const enemyState: ChampionState = {
      id: 'enemy_1',
      championId: 'kitsune',
      name: 'Kitsune',
      team: 'RED',
      position: { x: 0, z: 0 },
      targetPosition: null,
      rotation: 0,
      health: 550,
      maxHealth: 550,
      mana: 400,
      maxMana: 400,
      speed: 16,
      isAlive: true,
      respawnTimer: 0,
      crowdControl: null,
      cooldowns: { q: 0, w: 0, e: 0, r: 0, basicAttack: 0 },
      rCharges: 3,
      rWindowRemaining: 0
    };

    const myState: ChampionState = {
      ...enemyState,
      id: 'my_player',
      team: 'BLUE'
    };

    championRenderer.sync([myState, enemyState], 'my_player');

    // Trigger right click
    mockWindow.emit('mousedown', { button: 2, clientX: 960, clientY: 540 });

    expect(callbacks.onMove).toHaveBeenCalled();
    controller.dispose();
  });

  it('cleans up event listeners and click indicators on dispose', () => {
    const { controller, callbacks, mockWindow } = createController();
    expect(mockWindow.listeners.get('keydown')?.length).toBe(1);

    controller.dispose();
    expect(mockWindow.listeners.get('keydown')?.length).toBe(0);

    mockWindow.emit('keydown', { key: 'z' });
    expect(callbacks.onToggleCameraLock).not.toHaveBeenCalled();
    expect(controller.clickIndicators.length).toBe(0);
  });
});
