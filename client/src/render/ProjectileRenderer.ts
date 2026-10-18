import * as THREE from 'three';
import { ProjectileState } from '@mochiba/shared';

export type ProjectileMeshFactory = (proj: ProjectileState) => THREE.Group;

// Shared unit geometry and fallback material for unknown/default projectiles
const defaultUnitSphere = new THREE.SphereGeometry(1, 8, 8);
const defaultBoltMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

export function createDefaultBoltMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(defaultUnitSphere, defaultBoltMat);
  mesh.scale.setScalar(proj.radius);
  group.add(mesh);
  return group;
}

export class ProjectileRenderer {
  public meshes = new Map<string, THREE.Group>();
  private factories = new Map<string, ProjectileMeshFactory>();

  constructor(private scene: THREE.Scene) {
    this.registerFactory('DEFAULT', createDefaultBoltMesh);
  }

  registerFactory(visualId: string, factory: ProjectileMeshFactory): void {
    this.factories.set(visualId, factory);
  }

  hasFactory(visualId: string): boolean {
    return this.factories.has(visualId);
  }

  sync(projectiles: ProjectileState[]): void {
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
    const key = proj.visualId ?? proj.type;
    const factory = this.factories.get(key) ?? this.factories.get('DEFAULT')!;
    const group = factory(proj);
    group.position.set(proj.position.x, 1.4, proj.position.z);
    return group;
  }

  dispose(): void {
    for (const [, mesh] of this.meshes) {
      this.scene.remove(mesh);
    }
    this.meshes.clear();
  }
}
