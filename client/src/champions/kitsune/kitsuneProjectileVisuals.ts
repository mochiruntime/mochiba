import * as THREE from 'three';
import { ProjectileState } from '@mochiba/shared';
import { ProjectileRenderer } from '../../render/ProjectileRenderer.js';

// Shared unit geometries cached in memory to avoid GPU buffer reallocations
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

export function createEchoOrbMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(unitSphere16, echoOrbCoreMat);
  core.scale.setScalar(proj.radius);
  group.add(core);

  const aura = new THREE.Mesh(unitSphere12, echoOrbAuraMat);
  aura.scale.setScalar(proj.radius * 1.4);
  group.add(aura);
  return group;
}

export function createSpectralEmberMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(unitSphere12, spectralEmberMat);
  mesh.scale.setScalar(proj.radius);
  group.add(mesh);
  return group;
}

export function createCharmBoltMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const core = new THREE.Mesh(unitSphere16, charmCoreMat);
  core.scale.setScalar(proj.radius);
  group.add(core);

  const halo = new THREE.Mesh(unitRing, charmHaloMat);
  halo.scale.setScalar(proj.radius);
  group.add(halo);
  return group;
}

export function createAstralSurgeBoltMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(unitCone, astralSurgeMat);
  mesh.scale.setScalar(proj.radius);
  group.add(mesh);
  return group;
}

export function createBasicAttackMesh(proj: ProjectileState): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(unitSphere8, basicAttackMat);
  mesh.scale.setScalar(proj.radius);
  group.add(mesh);
  return group;
}

/**
 * Registers all Kitsune projectile visual factories into the pluggable ProjectileRenderer.
 */
export function registerKitsuneProjectileVisuals(renderer: ProjectileRenderer): void {
  renderer.registerFactory('ECHO_ORB_OUT', createEchoOrbMesh);
  renderer.registerFactory('ECHO_ORB_RETURN', createEchoOrbMesh);
  renderer.registerFactory('SPECTRAL_EMBER', createSpectralEmberMesh);
  renderer.registerFactory('CHARM_BOLT', createCharmBoltMesh);
  renderer.registerFactory('ASTRAL_SURGE_BOLT', createAstralSurgeBoltMesh);
  renderer.registerFactory('BASIC_ATTACK', createBasicAttackMesh);
}
