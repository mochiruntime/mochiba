import * as THREE from 'three';
import { ChampionState } from '@mochiba/shared';
import { HealthBarRenderer } from './HealthBarRenderer.js';

export class ChampionRenderer {
  public championMeshes = new Map<string, THREE.Group>();
  public championHealthBars = new Map<string, HealthBarRenderer>();
  public latestChampionStates = new Map<string, ChampionState>();

  private bodyMeshToId = new Map<THREE.Mesh, string>();
  private cachedRaycastMeshes: THREE.Mesh[] = [];

  // Static shared geometries (allocated once on GPU, shared across all champion instances)
  private static readonly radius = 1.0;
  private static readonly height = 1.8;
  private static readonly bodyGeo = new THREE.CapsuleGeometry(
    ChampionRenderer.radius,
    ChampionRenderer.height,
    8,
    16
  );
  private static readonly visorGeo = new THREE.BoxGeometry(0.8, 0.4, 0.8);
  private static readonly ringGeo: THREE.RingGeometry = (() => {
    const geo = new THREE.RingGeometry(1.2, 1.35, 24);
    geo.rotateX(-Math.PI / 2);
    return geo;
  })();

  constructor(private scene: THREE.Scene) {}

  sync(champions: ChampionState[], myPlayerId: string | null): void {
    const seenIds = new Set<string>();
    const myChamp = myPlayerId ? champions.find((c) => c.id === myPlayerId) : undefined;
    const myTeam = myChamp?.team;

    for (const champ of champions) {
      seenIds.add(champ.id);
      this.latestChampionStates.set(champ.id, champ);

      let group = this.championMeshes.get(champ.id);
      let healthBar = this.championHealthBars.get(champ.id);

      if (!group || group.userData.championId !== champ.championId) {
        if (group) {
          this.removeChampion(champ.id);
        }
        group = this.createChampionMesh(champ);
        this.scene.add(group);
        this.championMeshes.set(champ.id, group);
      }

      if (!healthBar) {
        const isAllied = myTeam ? champ.team === myTeam : champ.id === myPlayerId;
        healthBar = new HealthBarRenderer(isAllied, champ.name);
        this.scene.add(healthBar.group);
        this.championHealthBars.set(champ.id, healthBar);
      }

      // Hide champion model if dead
      group.visible = champ.isAlive;

      // Health bar stays visible even during death to show respawn countdown
      healthBar.group.visible = true;
    }

    // Remove disconnected champions
    for (const [id] of this.championMeshes) {
      if (!seenIds.has(id)) {
        this.removeChampion(id);
      }
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    for (const [id, group] of this.championMeshes) {
      const state = this.latestChampionStates.get(id);
      if (state) {
        group.position.x = THREE.MathUtils.lerp(group.position.x, state.position.x, Math.min(1, dt * 25));
        group.position.z = THREE.MathUtils.lerp(group.position.z, state.position.z, Math.min(1, dt * 25));
        group.rotation.y = state.rotation;

        const hpBar = this.championHealthBars.get(id);
        if (hpBar) {
          hpBar.update(state, group.position, camera);
        }
      }
    }
  }

  getRaycastMeshes(): THREE.Mesh[] {
    return this.cachedRaycastMeshes;
  }

  getChampionIdByMesh(mesh: THREE.Mesh): string | undefined {
    return this.bodyMeshToId.get(mesh);
  }

  getLatestState(id: string): ChampionState | undefined {
    return this.latestChampionStates.get(id);
  }

  private createChampionMesh(champ: ChampionState): THREE.Group {
    const group = new THREE.Group();
    group.userData.championId = champ.championId;

    const isBlue = champ.team === 'BLUE';

    // 1. Capsule body (using static shared geometry)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isBlue ? 0x2288ff : 0xff3344,
      roughness: 0.3,
      metalness: 0.2
    });
    const bodyMesh = new THREE.Mesh(ChampionRenderer.bodyGeo, bodyMat);
    bodyMesh.position.y = (ChampionRenderer.height / 2) + ChampionRenderer.radius;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    group.add(bodyMesh);

    this.bodyMeshToId.set(bodyMesh, champ.id);
    this.cachedRaycastMeshes = Array.from(this.bodyMeshToId.keys());

    // 2. Visor / direction pointer (using static shared geometry)
    const visorMat = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.2 });
    const visorMesh = new THREE.Mesh(ChampionRenderer.visorGeo, visorMat);
    visorMesh.position.set(0, bodyMesh.position.y + 0.3, ChampionRenderer.radius * 0.9);
    group.add(visorMesh);

    // 3. Ground selection ring (using static shared geometry)
    const ringMat = new THREE.MeshBasicMaterial({
      color: isBlue ? 0x88ccff : 0xff8899,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ChampionRenderer.ringGeo, ringMat);
    ringMesh.position.y = 0.05;
    group.add(ringMesh);

    group.position.set(champ.position.x, 0, champ.position.z);
    return group;
  }

  private removeChampion(id: string): void {
    const group = this.championMeshes.get(id);
    if (group) {
      this.scene.remove(group);
      this.disposeHierarchy(group);
      this.championMeshes.delete(id);
      for (const [m, cId] of this.bodyMeshToId) {
        if (cId === id) this.bodyMeshToId.delete(m);
      }
      this.cachedRaycastMeshes = Array.from(this.bodyMeshToId.keys());
    }

    const hpBar = this.championHealthBars.get(id);
    if (hpBar) {
      this.scene.remove(hpBar.group);
      hpBar.dispose();
      this.championHealthBars.delete(id);
    }
    this.latestChampionStates.delete(id);
  }

  private disposeHierarchy(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Do not dispose static shared geometries! Only dispose per-instance materials.
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => mat.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
    });
  }

  dispose(): void {
    for (const [id] of this.championMeshes) {
      this.removeChampion(id);
    }
    this.championMeshes.clear();
    this.championHealthBars.clear();
    this.bodyMeshToId.clear();
    this.cachedRaycastMeshes = [];
    this.latestChampionStates.clear();
  }
}
