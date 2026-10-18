import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LaneMap } from '../src/render/LaneMap.js';
import { EPFL_DIAGONALE_MAP } from '@mochiba/shared';

describe('Three.js LaneMap (Automated Scene Graph Test)', () => {
  it('instantiates scene hierarchy with ground mesh and buildings for EPFL Diagonale', () => {
    const map = new LaneMap(EPFL_DIAGONALE_MAP);

    expect(map.group).toBeInstanceOf(THREE.Group);
    expect(map.groundMesh).toBeInstanceOf(THREE.Mesh);
    expect(map.buildingMeshes.length).toBe(EPFL_DIAGONALE_MAP.buildings.length);
  });

  it('performs vertical raycast against ground mesh at origin', () => {
    const map = new LaneMap(EPFL_DIAGONALE_MAP);
    const raycaster = new THREE.Raycaster();

    // Raycast straight down from height 50m above origin
    raycaster.set(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(map.groundMesh);

    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].point.x).toBeCloseTo(0, 1);
    expect(hits[0].point.y).toBeCloseTo(0, 1);
    expect(hits[0].point.z).toBeCloseTo(0, 1);
  });

  it('verifies Rolex Learning Center building bounding box covers its metric coordinates', () => {
    const map = new LaneMap(EPFL_DIAGONALE_MAP);
    const rolex = map.buildingMeshes.find((m) => m.name === 'Rolex Learning Center');
    expect(rolex).toBeDefined();

    const box = new THREE.Box3().setFromObject(rolex!);
    const expected = EPFL_DIAGONALE_MAP.buildings.find((b) => b.name === 'Rolex Learning Center')!;

    expect(box.min.x).toBeLessThanOrEqual(expected.x);
    expect(box.max.x).toBeGreaterThanOrEqual(expected.x);
    expect(box.min.z).toBeLessThanOrEqual(expected.z);
    expect(box.max.z).toBeGreaterThanOrEqual(expected.z);
  });

  it('ensures no campus building intersects with the lane corridor', () => {
    const map = new LaneMap(EPFL_DIAGONALE_MAP);
    const halfLaneWidth = EPFL_DIAGONALE_MAP.laneWidth / 2;

    for (const b of EPFL_DIAGONALE_MAP.buildings) {
      // Distance across corridor to center: d = (x + z) / sqrt(2)
      const dCenter = (b.x + b.z) / Math.SQRT2;
      // Front facade distance from center
      const frontDist = Math.abs(dCenter) - b.depth / 2;
      // Must be strictly greater than half lane width (12m)
      expect(frontDist).toBeGreaterThan(halfLaneWidth);
    }
  });
});
