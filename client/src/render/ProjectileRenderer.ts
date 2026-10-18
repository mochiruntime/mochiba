import * as THREE from 'three';
import { ProjectileState, ProjectileType } from '@mochiba/shared';

export type ProjectileMeshFactory = (proj: ProjectileState) => THREE.Group;

// Shared unit geometries cached in memory to avoid GPU buffer reallocations on every projectile spawn
const unitSphere16 = new THREE.SphereGeometry(1, 16, 16);
const unitSphere12 = new THREE.SphereGeometry(1, 12, 12);
const unitSphere8 = new THREE.SphereGeometry(1, 8, 8);
const unitRing = new THREE.RingGeometry(0.8, 1.6, 16);
const unitCone = new THREE.ConeGeometry(1, 2.0, 8);
unitCone.rotateX(Math.PI / 2);

// Shared materials cached in memory to avoid shader re-compilations & GPU churn
const echoOrbCoreMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
const echoOrbAuraMat = new THREE.MeshBasicMaterial({
  color: 0x66ffff,
  transparent: true,
  opacity: 0.4,
  wireframe: true
});
const spectralEmberMat = new THREE.MeshBasicMaterial({ color: 0x33eeff });
const charmCoreMat = new THREE.MeshBasicMaterial({ color: 0xff33bb });
const charmHaloMat = new THREE.MeshBasicMaterial({
  color: 0xff66cc,
  transparent: true,
  opacity: 0.6,
  side: THREE.DoubleSide
});
const astralSurgeMat = new THREE.MeshBasicMaterial({ color: 0x4466ff });
const basicAttackMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });

function createEchoOrbMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(unitSphere16, echoOrbCoreMat);
  core.scale.setScalar(proj.radius);
  group.add(core);

  const aura = new THREE.Mesh(unitSphere12, echoOrbAuraMat);
  aura.scale.setScalar(proj.radius * 1.4);
  group.add(aura);
  return group;
}

function createSpectralEmberMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(unitSphere12, spectralEmberMat);
  mesh.scale.setScalar(proj.radius);
  group.add(mesh);
  return group;
}

function createCharmBoltMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(unitSphere16, charmCoreMat);
  core.scale.setScalar(proj.radius);
  group.add(core);

  const halo = new THREE.Mesh(unitRing, charmHaloMat);
  halo.scale.setScalar(proj.radius);
  group.add(halo);
  return group;
}

function createAstralSurgeBoltMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(unitCone, astralSurgeMat);
  mesh.scale.setScalar(proj.radius);
  group.add(mesh);
  return group;
}

function createBasicAttackMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(unitSphere8, basicAttackMat);
  mesh.scale.setScalar(proj.radius);
  group.add(mesh);
  return group;
}

export const PROJECTILE_VISUAL_FACTORIES: Record<ProjectileType, ProjectileMeshFactory> = {
  ECHO_ORB_OUT: createEchoOrbMesh,
  ECHO_ORB_RETURN: createEchoOrbMesh,
  SPECTRAL_EMBER: createSpectralEmberMesh,
  CHARM_BOLT: createCharmBoltMesh,
  ASTRAL_SURGE_BOLT: createAstralSurgeBoltMesh,
  BASIC_ATTACK: createBasicAttackMesh
};

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
    const factory = PROJECTILE_VISUAL_FACTORIES[proj.type] ?? createBasicAttackMesh;
    const group = factory(proj);
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
