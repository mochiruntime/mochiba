import * as THREE from 'three';
import { MapConfig, EPFL_DIAGONALE_MAP } from '@mochiba/shared';

export class LaneMap {
  public group = new THREE.Group();
  public groundMesh!: THREE.Mesh;
  public buildingMeshes: THREE.Mesh[] = [];

  constructor(public mapConfig: MapConfig = EPFL_DIAGONALE_MAP) {
    this.buildCampusGround();
    this.buildLane();
    this.buildCampusBuildings();
    this.buildNexusPlatforms();
    this.group.updateMatrixWorld(true);
  }

  private buildCampusGround() {
    // Large lawn surrounding the lane corridor
    const lawnGeo = new THREE.PlaneGeometry(500, 500);
    lawnGeo.rotateX(-Math.PI / 2);
    const lawnMat = new THREE.MeshStandardMaterial({
      color: 0x3d6639, // Campus grass green
      roughness: 0.9,
      metalness: 0.05
    });
    const lawnMesh = new THREE.Mesh(lawnGeo, lawnMat);
    lawnMesh.position.y = -0.1;
    lawnMesh.receiveShadow = true;
    this.group.add(lawnMesh);
  }

  private buildLane() {
    const dx = this.mapConfig.redNexus.x - this.mapConfig.blueNexus.x;
    const dz = this.mapConfig.redNexus.z - this.mapConfig.blueNexus.z;
    const laneAngle = Math.atan2(dx, dz);
    const centerX = (this.mapConfig.blueNexus.x + this.mapConfig.redNexus.x) / 2;
    const centerZ = (this.mapConfig.blueNexus.z + this.mapConfig.redNexus.z) / 2;

    // The main lane stone corridor
    const laneGeo = new THREE.PlaneGeometry(
      this.mapConfig.laneWidth,
      this.mapConfig.laneLength
    );
    laneGeo.rotateX(-Math.PI / 2);
    laneGeo.rotateY(laneAngle);

    const laneMat = new THREE.MeshStandardMaterial({
      color: 0xc4ccd3, // Clean light concrete / sandstone paving
      roughness: 0.6,
      metalness: 0.1
    });
    this.groundMesh = new THREE.Mesh(laneGeo, laneMat);
    this.groundMesh.position.set(centerX, 0, centerZ);
    this.groundMesh.receiveShadow = true;
    this.group.add(this.groundMesh);

    // Decorative edge borders along the lane
    const borderGeo = new THREE.PlaneGeometry(
      this.mapConfig.laneWidth + 2,
      this.mapConfig.laneLength
    );
    borderGeo.rotateX(-Math.PI / 2);
    borderGeo.rotateY(laneAngle);
    const borderMat = new THREE.MeshStandardMaterial({
      color: 0x8a95a1, // Granite border trim
      roughness: 0.8
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.set(centerX, -0.05, centerZ);
    borderMesh.receiveShadow = true;
    this.group.add(borderMesh);

    // Metric lane markings (grid)
    const grid = new THREE.GridHelper(360, 36, 0x4a5a68, 0x9fb0c0);
    grid.position.y = 0.02;
    this.group.add(grid);
  }

  private buildCampusBuildings() {
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0xd8dfe6, // White / aluminum concrete facades
      roughness: 0.5,
      metalness: 0.15
    });

    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x7c8a99, // Rooftop gravel / mechanical tone
      roughness: 0.7
    });

    for (const b of this.mapConfig.buildings) {
      const buildingGroup = new THREE.Group();
      buildingGroup.name = b.name;

      // Main structure
      const geo = new THREE.BoxGeometry(b.width, 16, b.depth);
      const mesh = new THREE.Mesh(geo, buildingMat);
      mesh.name = b.name;
      mesh.position.y = 8;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      buildingGroup.add(mesh);

      // Rooftop ledge detail
      const roofGeo = new THREE.BoxGeometry(b.width - 2, 1, b.depth - 2);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.position.y = 16.5;
      roofMesh.castShadow = true;
      buildingGroup.add(roofMesh);

      buildingGroup.position.set(b.x, 0, b.z);
      if (b.rotationY) {
        buildingGroup.rotation.y = b.rotationY;
      }
      this.buildingMeshes.push(mesh);
      this.group.add(buildingGroup);
    }
  }

  private buildNexusPlatforms() {
    const nexusGeo = new THREE.CylinderGeometry(11, 12, 1.2, 24);

    // Blue Nexus Platform
    const blueMat = new THREE.MeshStandardMaterial({
      color: 0x1d78d6,
      roughness: 0.3,
      metalness: 0.2
    });
    const blueNexus = new THREE.Mesh(nexusGeo, blueMat);
    blueNexus.position.set(this.mapConfig.blueNexus.x, 0.6, this.mapConfig.blueNexus.z);
    blueNexus.receiveShadow = true;
    this.group.add(blueNexus);

    // Red Nexus Platform
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xd62b1d,
      roughness: 0.3,
      metalness: 0.2
    });
    const redNexus = new THREE.Mesh(nexusGeo, redMat);
    redNexus.position.set(this.mapConfig.redNexus.x, 0.6, this.mapConfig.redNexus.z);
    redNexus.receiveShadow = true;
    this.group.add(redNexus);
  }
}
