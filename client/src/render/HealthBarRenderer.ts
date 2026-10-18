import * as THREE from 'three';
import { ChampionState } from '@mochiba/shared';

export class HealthBarRenderer {
  public group = new THREE.Group();
  private hpFillMesh: THREE.Mesh;
  private manaFillMesh: THREE.Mesh;
  private statusCanvas?: HTMLCanvasElement;
  private statusTexture?: THREE.CanvasTexture;
  private statusSprite?: THREE.Sprite;

  public barWidth = 7.5;
  public barHeight = 0.72;
  public manaHeight = 0.22;
  public borderPad = 0.08;
  public characterHeight = 3.8;
  public baseOverheadDistance = 2.2;

  private currentText = '';
  private currentColor = '';

  constructor(public isAllied: boolean, public championName: string) {
    // 1. Dark Outlined Outer Background
    const frameWidth = this.barWidth + this.borderPad * 2;
    const frameHeight = this.barHeight + this.manaHeight + this.borderPad * 3;
    const bgGeo = new THREE.PlaneGeometry(frameWidth, frameHeight);
    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x070c12,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.renderOrder = 998;
    this.group.add(bgMesh);

    // 2. Dark Trough for Health Bar
    const hpBgGeo = new THREE.PlaneGeometry(this.barWidth, this.barHeight);
    const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x16202a, depthTest: false });
    const hpBgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
    hpBgMesh.position.set(0, (this.manaHeight + this.borderPad) / 2, 0.005);
    hpBgMesh.renderOrder = 999;
    this.group.add(hpBgMesh);

    // 3. Health Bar Fill
    const hpGeo = new THREE.PlaneGeometry(this.barWidth, this.barHeight);
    hpGeo.translate(this.barWidth / 2, 0, 0); // Anchor to left edge
    const hpMat = new THREE.MeshBasicMaterial({
      color: isAllied ? 0x2cd958 : 0xee3333,
      side: THREE.DoubleSide,
      depthTest: false
    });
    this.hpFillMesh = new THREE.Mesh(hpGeo, hpMat);
    this.hpFillMesh.position.set(-this.barWidth / 2, (this.manaHeight + this.borderPad) / 2, 0.01);
    this.hpFillMesh.renderOrder = 1000;
    this.group.add(this.hpFillMesh);

    // 4. Dark Trough for Mana Bar
    const manaBgGeo = new THREE.PlaneGeometry(this.barWidth, this.manaHeight);
    const manaBgMat = new THREE.MeshBasicMaterial({ color: 0x0f1a28, depthTest: false });
    const manaBgMesh = new THREE.Mesh(manaBgGeo, manaBgMat);
    manaBgMesh.position.set(0, -this.barHeight / 2, 0.005);
    manaBgMesh.renderOrder = 999;
    this.group.add(manaBgMesh);

    // 5. Mana Bar Fill
    const manaGeo = new THREE.PlaneGeometry(this.barWidth, this.manaHeight);
    manaGeo.translate(this.barWidth / 2, 0, 0); // Anchor to left edge
    const manaMat = new THREE.MeshBasicMaterial({
      color: 0x2b82ff,
      side: THREE.DoubleSide,
      depthTest: false
    });
    this.manaFillMesh = new THREE.Mesh(manaGeo, manaMat);
    this.manaFillMesh.position.set(-this.barWidth / 2, -this.barHeight / 2, 0.01);
    this.manaFillMesh.renderOrder = 1000;
    this.group.add(this.manaFillMesh);

    // 6. Billboard Status & Name Tag (Ultra High-DPI Canvas Sprite, initialized in browser DOM environments)
    if (typeof document !== 'undefined') {
      this.statusCanvas = document.createElement('canvas');
      this.statusCanvas.width = 1024;
      this.statusCanvas.height = 256;
      this.statusTexture = new THREE.CanvasTexture(this.statusCanvas);
      this.statusTexture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({
        map: this.statusTexture,
        transparent: true,
        depthTest: false
      });
      this.statusSprite = new THREE.Sprite(spriteMat);
      this.statusSprite.scale.set(11.0, 2.75, 1.0);
      this.statusSprite.position.set(0, frameHeight / 2 + 1.45, 0.02);
      this.statusSprite.renderOrder = 1001;
      this.group.add(this.statusSprite);

      this.updateStatusText(this.championName, '#ffffff');
    }
  }

  /**
   * Updates world position, billboarding orientation, zoom-invariant screen scale, and vitals.
   * @param state Authoritative champion state
   * @param championWorldPos World coordinates of the champion
   * @param camera Active perspective camera
   */
  update(
    state: ChampionState,
    championWorldPos: { x: number; y?: number; z: number },
    camera: THREE.Camera
  ) {
    const champY = championWorldPos.y ?? 0;

    // 1. Calculate optical distance to camera
    const dx = camera.position.x - championWorldPos.x;
    const dy = camera.position.y - champY;
    const dz = camera.position.z - championWorldPos.z;
    const distanceToCamera = Math.hypot(dx, dy, dz) || 100;

    // 2. Distance scale: keeps screen pixel size 100% constant regardless of zoom level
    // Reference distance = 100m
    const zoomScale = Math.max(0.4, distanceToCamera / 100);
    this.group.scale.set(zoomScale, zoomScale, zoomScale);

    // 3. Overhead distance between character and billboard scales inversely to zoom level
    const overheadDistance = this.baseOverheadDistance / zoomScale;
    this.group.position.set(
      championWorldPos.x,
      champY + this.characterHeight + overheadDistance,
      championWorldPos.z
    );

    // 4. True billboarding: copy camera orientation directly in world space
    this.group.quaternion.copy(camera.quaternion);

    // 5. Update health and mana percentages
    if (!state.isAlive) {
      this.hpFillMesh.scale.x = 0;
      this.manaFillMesh.scale.x = 0;
      this.updateStatusText(`RESPAWNING (${Math.ceil(state.respawnTimer)}s)`, '#ff5555');
      return;
    }

    const hpRatio = Math.max(0, Math.min(1, state.health / state.maxHealth));
    this.hpFillMesh.scale.x = hpRatio;

    const manaRatio = Math.max(0, Math.min(1, state.mana / state.maxMana));
    this.manaFillMesh.scale.x = manaRatio;

    // 6. Update text badge
    if (state.crowdControl?.type === 'CHARMED') {
      this.updateStatusText('♥ CHARMED ♥', '#ff33bb');
    } else {
      this.updateStatusText(this.championName, '#ffffff');
    }
  }

  private updateStatusText(text: string, color = '#ffffff') {
    if (!this.statusCanvas) return;
    if (text === this.currentText && color === this.currentColor) return;
    this.currentText = text;
    this.currentColor = color;

    const ctx = this.statusCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, 1024, 256);

    // Dynamic large font size filling the canvas prominently
    let fontSize = 110;
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const measuredWidth = ctx.measureText(text).width;
    const maxWidth = 960;
    if (measuredWidth > maxWidth) {
      fontSize = Math.floor(fontSize * (maxWidth / measuredWidth));
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Bold stroke outline for high readability against any campus terrain
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.lineWidth = Math.max(8, fontSize * 0.12);
    ctx.lineJoin = 'round';
    ctx.strokeText(text, 512, 128);

    ctx.fillStyle = color;
    ctx.fillText(text, 512, 128);

    if (this.statusTexture) {
      this.statusTexture.needsUpdate = true;
    }
  }

  dispose() {
    this.statusTexture?.dispose();
  }
}
