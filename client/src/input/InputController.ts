import * as THREE from 'three';
import { Position, clampRayToLane, EPFL_DIAGONALE_MAP } from '@mochiba/shared';
import { ChampionRenderer } from '../render/ChampionRenderer.js';
import { ClickIndicator } from '../render/ClickIndicator.js';

export interface InputControllerCallbacks {
  onMove: (target: Position) => void;
  onAttack: (targetId: string) => void;
  onCastSpell: (slot: 'Q' | 'W' | 'E' | 'R', target: Position) => void;
  onToggleCameraLock: () => void;
  onZoom: (deltaY: number) => void;
  getMyPosition: () => Position;
  getMyPlayerId: () => string | null;
  isNetworkReady: () => boolean;
}

export interface IEventTargetLike {
  addEventListener: (type: string, listener: any, options?: any) => void;
  removeEventListener: (type: string, listener: any) => void;
  innerWidth?: number;
  innerHeight?: number;
}

export class InputController {
  // Pre-allocated scratch structures to eliminate GC allocations during raycasting
  private raycaster = new THREE.Raycaster();
  private mouseVec2 = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private groundIntersection = new THREE.Vector3();

  public currentMouseX = 960;
  public currentMouseY = 540;
  public viewportWidth = 1920;
  public viewportHeight = 1080;
  public clickIndicators: ClickIndicator[] = [];

  // Bound listener references for clean disposal
  private onContextMenuBound = (e: MouseEvent) => e.preventDefault();
  private onMouseMoveBound = (e: MouseEvent) => this.handleMouseMove(e.clientX, e.clientY);
  private onWheelBound = (e: WheelEvent) => this.callbacks.onZoom(e.deltaY);
  private onKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e.key);
  private onMouseDownBound = (e: MouseEvent) => this.handleMouseDown(e.button, e.clientX, e.clientY);

  constructor(
    private camera: THREE.Camera,
    private scene: THREE.Scene,
    private championRenderer: ChampionRenderer,
    private callbacks: InputControllerCallbacks,
    private targetWindow: IEventTargetLike | null = typeof window !== 'undefined' ? (window as any) : null
  ) {
    if (this.targetWindow) {
      this.viewportWidth = this.targetWindow.innerWidth || 1920;
      this.viewportHeight = this.targetWindow.innerHeight || 1080;
      this.currentMouseX = this.viewportWidth / 2;
      this.currentMouseY = this.viewportHeight / 2;
      this.attach();
    }
  }

  public attach(): void {
    if (!this.targetWindow) return;
    this.targetWindow.addEventListener('contextmenu', this.onContextMenuBound);
    this.targetWindow.addEventListener('mousemove', this.onMouseMoveBound);
    this.targetWindow.addEventListener('wheel', this.onWheelBound, { passive: true });
    this.targetWindow.addEventListener('keydown', this.onKeyDownBound);
    this.targetWindow.addEventListener('mousedown', this.onMouseDownBound);
  }

  public getMouseGroundPoint(
    mouseX = this.currentMouseX,
    mouseY = this.currentMouseY,
    width = this.viewportWidth,
    height = this.viewportHeight
  ): THREE.Vector3 | null {
    this.camera.updateMatrixWorld(true);
    this.mouseVec2.x = (mouseX / width) * 2 - 1;
    this.mouseVec2.y = -(mouseY / height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseVec2, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, this.groundIntersection);
  }

  public handleMouseMove(clientX: number, clientY: number): void {
    this.currentMouseX = clientX;
    this.currentMouseY = clientY;
  }

  public handleKeyDown(rawKey: string): void {
    const key = rawKey.toLowerCase();

    if (key === 'z') {
      this.callbacks.onToggleCameraLock();
      return;
    }

    if (['q', 'w', 'e', 'r'].includes(key) && this.callbacks.isNetworkReady()) {
      const spell = key.toUpperCase() as 'Q' | 'W' | 'E' | 'R';
      const hit = this.getMouseGroundPoint();
      if (hit) {
        this.callbacks.onCastSpell(spell, { x: hit.x, z: hit.z });
      }
    }
  }

  public handleMouseDown(button: number, clientX: number, clientY: number): void {
    if (button !== 2 || !this.callbacks.isNetworkReady()) return; // Right-click only

    this.camera.updateMatrixWorld(true);
    this.mouseVec2.x = (clientX / this.viewportWidth) * 2 - 1;
    this.mouseVec2.y = -(clientY / this.viewportHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.mouseVec2, this.camera);

    // 1. Raycast enemy champions for Basic Attack
    const champHits = this.raycaster.intersectObjects(this.championRenderer.getRaycastMeshes());
    if (champHits.length > 0) {
      const clickedMesh = champHits[0].object as THREE.Mesh;
      const targetChampId = this.championRenderer.getChampionIdByMesh(clickedMesh);
      const myId = this.callbacks.getMyPlayerId();
      const myChamp = myId ? this.championRenderer.getLatestState(myId) : undefined;
      const targetChamp = targetChampId ? this.championRenderer.getLatestState(targetChampId) : undefined;

      if (myChamp && targetChamp && targetChamp.team !== myChamp.team && targetChamp.isAlive) {
        this.clickIndicators.push(new ClickIndicator(targetChamp.position.x, targetChamp.position.z, this.scene));
        this.callbacks.onAttack(targetChamp.id);
        return;
      }
    }

    // 2. Otherwise, ground move command with lane corridor boundary clamping
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.groundIntersection);
    if (hit) {
      const from = this.callbacks.getMyPosition();
      const clamped = clampRayToLane(EPFL_DIAGONALE_MAP, from, { x: hit.x, z: hit.z });
      this.clickIndicators.push(new ClickIndicator(clamped.x, clamped.z, this.scene));
      this.callbacks.onMove(clamped);
    }
  }

  public update(dt: number): void {
    this.clickIndicators = this.clickIndicators.filter((ind) => ind.update(dt));
  }

  public dispose(): void {
    if (this.targetWindow) {
      this.targetWindow.removeEventListener('contextmenu', this.onContextMenuBound);
      this.targetWindow.removeEventListener('mousemove', this.onMouseMoveBound);
      this.targetWindow.removeEventListener('wheel', this.onWheelBound);
      this.targetWindow.removeEventListener('keydown', this.onKeyDownBound);
      this.targetWindow.removeEventListener('mousedown', this.onMouseDownBound);
    }
    for (const ind of this.clickIndicators) {
      ind.dispose();
    }
    this.clickIndicators = [];
  }
}
