import * as THREE from 'three';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class CameraController {
  public isLocked = false; // Default: Free Look (MOBA style)
  public panSpeed = 75; // meters per second
  public edgeMargin = 25; // pixels from border to trigger edge pan
  public focus = new THREE.Vector3(0, 0, 0); // Ground target point {x, 0, z}

  // MOBA tactical zoom limits
  public minZoom = 50;  // Close-up inspect
  public maxZoom = 160; // Max tactical overview
  public currentZoom = 135;
  public targetZoom = 135;
  public zoomSensitivity = 0.08;

  public bounds: CameraBounds = { minX: -160, maxX: 160, minZ: -160, maxZ: 160 };

  constructor(public camera: THREE.PerspectiveCamera) {
    this.updateCameraTransform();
  }

  toggleLock(): boolean {
    this.isLocked = !this.isLocked;
    return this.isLocked;
  }

  handleWheel(deltaY: number) {
    this.targetZoom = THREE.MathUtils.clamp(
      this.targetZoom + deltaY * this.zoomSensitivity,
      this.minZoom,
      this.maxZoom
    );
  }

  update(
    dt: number,
    mouseX: number,
    mouseY: number,
    viewportWidth: number,
    viewportHeight: number,
    playerPos?: { x: number; z: number }
  ) {
    // Smooth zoom interpolation (dt * 10 gives responsive fluid easing)
    this.currentZoom = THREE.MathUtils.lerp(
      this.currentZoom,
      this.targetZoom,
      Math.min(1, dt * 10)
    );

    if (this.isLocked && playerPos) {
      // Locked mode: Rigidly follow player's character coordinate
      this.focus.x = playerPos.x;
      this.focus.z = playerPos.z;
    } else if (!this.isLocked) {
      // Free Look mode: Edge pan when cursor is near viewport borders
      let moveX = 0;
      let moveZ = 0;

      // Left / Right edge
      if (mouseX <= this.edgeMargin) moveX -= 1;
      else if (mouseX >= viewportWidth - this.edgeMargin) moveX += 1;

      // Top / Bottom edge (Top is screen -Z, Bottom is screen +Z)
      if (mouseY <= this.edgeMargin) moveZ -= 1;
      else if (mouseY >= viewportHeight - this.edgeMargin) moveZ += 1;

      if (moveX !== 0 || moveZ !== 0) {
        const length = Math.hypot(moveX, moveZ);
        const step = (this.panSpeed * dt) / length;
        this.focus.x = THREE.MathUtils.clamp(
          this.focus.x + moveX * step,
          this.bounds.minX,
          this.bounds.maxX
        );
        this.focus.z = THREE.MathUtils.clamp(
          this.focus.z + moveZ * step,
          this.bounds.minZ,
          this.bounds.maxZ
        );
      }
    }

    this.updateCameraTransform();
  }

  private updateCameraTransform() {
    // 45 degree isometric projection: camera is offset in Y and Z by currentZoom
    this.camera.position.set(
      this.focus.x,
      this.currentZoom,
      this.focus.z + this.currentZoom
    );
    this.camera.lookAt(this.focus.x, 0, this.focus.z);
  }
}
