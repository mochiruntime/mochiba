import * as THREE from 'three';

export class ClickIndicator {
  public mesh: THREE.Mesh;
  private life = 0;
  private maxLife = 0.35; // 350ms duration
  private material: THREE.MeshBasicMaterial;

  // Shared unit ring geometry allocated once in memory
  private static sharedRingGeo: THREE.RingGeometry = (() => {
    const geo = new THREE.RingGeometry(0.4, 0.9, 24);
    geo.rotateX(-Math.PI / 2);
    return geo;
  })();

  constructor(x: number, z: number, scene: THREE.Scene) {
    this.material = new THREE.MeshBasicMaterial({
      color: 0x44ff88,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(ClickIndicator.sharedRingGeo, this.material);
    this.mesh.position.set(x, 0.08, z);
    scene.add(this.mesh);
  }

  update(dt: number): boolean {
    this.life += dt;
    const progress = this.life / this.maxLife;

    if (progress >= 1) {
      if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
      }
      // Dispose only per-instance material, preserving shared static geometry
      this.material.dispose();
      return false; // Finished
    }

    // Expand slightly and fade out
    const scale = 1 + progress * 0.8;
    this.mesh.scale.set(scale, 1, scale);
    this.material.opacity = Math.max(0, 1 - progress);
    return true; // Still active
  }

  dispose(): void {
    if (this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
    this.material.dispose();
  }
}
