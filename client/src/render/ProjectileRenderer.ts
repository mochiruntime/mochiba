import * as THREE from 'three';
import { ProjectileState } from '@mochiba/shared';

export class ProjectileRenderer {
  public meshes = new Map<string, THREE.Group>();

  constructor(private scene: THREE.Scene) {}

  sync(projectiles: ProjectileState[]) {
    const seenIds = new Set<string>();

    for (const proj of projectiles) {
      seenIds.add(proj.id);
      let mesh = this.meshes.get(proj.id);

      if (!mesh) {
        mesh = this.createProjectileMesh(proj);
        this.scene.add(mesh);
        this.meshes.set(proj.id, mesh);
      }

      mesh.position.set(proj.position.x, 1.4, proj.position.z);
    }

    // Cleanup expired projectiles
    for (const [id, mesh] of this.meshes) {
      if (!seenIds.has(id)) {
        this.scene.remove(mesh);
        this.meshes.delete(id);
      }
    }
  }

  private createProjectileMesh(proj: ProjectileState): THREE.Group {
    const group = new THREE.Group();

    if (proj.type === 'ECHO_ORB_OUT' || proj.type === 'ECHO_ORB_RETURN') {
      // Q — Echo Orb (Glowing Cyan Energy Sphere)
      const coreGeo = new THREE.SphereGeometry(proj.radius, 16, 16);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      // Outer aura
      const auraGeo = new THREE.SphereGeometry(proj.radius * 1.4, 12, 12);
      const auraMat = new THREE.MeshBasicMaterial({
        color: 0x66ffff,
        transparent: true,
        opacity: 0.4,
        wireframe: true
      });
      group.add(new THREE.Mesh(auraGeo, auraMat));
    } else if (proj.type === 'SPECTRAL_EMBER') {
      // W — Spectral Ember (Blue/Teal Spirit Flame)
      const geo = new THREE.SphereGeometry(proj.radius, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0x33eeff });
      group.add(new THREE.Mesh(geo, mat));
    } else if (proj.type === 'CHARM_BOLT') {
      // E — Charm Bolt (Vibrant Magenta Heart/Energy Orb)
      const geo = new THREE.SphereGeometry(proj.radius, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff33bb });
      group.add(new THREE.Mesh(geo, mat));

      // Glow halo
      const haloGeo = new THREE.RingGeometry(proj.radius * 0.8, proj.radius * 1.6, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xff66cc,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      const haloMesh = new THREE.Mesh(haloGeo, haloMat);
      group.add(haloMesh);
    } else if (proj.type === 'ASTRAL_SURGE_BOLT') {
      // R — Astral Surge Bolt (Royal Blue Dash Bolt)
      const geo = new THREE.ConeGeometry(proj.radius, 1.6, 8);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4466ff });
      group.add(new THREE.Mesh(geo, mat));
    } else {
      // Basic Attack: Magic Golden Spark
      const geo = new THREE.SphereGeometry(proj.radius, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
      group.add(new THREE.Mesh(geo, mat));
    }

    group.position.set(proj.position.x, 1.4, proj.position.z);
    return group;
  }

  dispose() {
    for (const [, mesh] of this.meshes) {
      this.scene.remove(mesh);
    }
    this.meshes.clear();
  }
}
