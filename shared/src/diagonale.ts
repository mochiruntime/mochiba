export interface LandmarkBuilding {
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  rotationY?: number;
}

export interface MapConfig {
  id: string;
  name: string;
  laneLength: number;
  laneWidth: number;
  blueNexus: { x: number; z: number };
  redNexus: { x: number; z: number };
  buildings: LandmarkBuilding[];
}

/**
 * Agnostic check to determine whether a given (x, z) coordinate is within lane boundaries.
 * The lane is oriented along the line connecting blueNexus to redNexus.
 */
export function isInsideLane(map: MapConfig, x: number, z: number): boolean {
  const halfLength = (map.laneLength / 2) + 2;
  const halfWidth = (map.laneWidth / 2) + 1;

  const distAlong = Math.abs((x - z) / Math.SQRT2);
  const distAcross = Math.abs((x + z) / Math.SQRT2);

  return distAlong <= halfLength && distAcross <= halfWidth;
}

/**
 * Clamps a target destination along the ray from origin (e.g. champion position)
 * towards the target pointer location, stopping at the lane boundary.
 * This preserves the exact heading/angle from the champion to the pointer.
 */
export function clampRayToLane(
  map: MapConfig,
  from: { x: number; z: number },
  target: { x: number; z: number }
): { x: number; z: number } {
  const halfLength = (map.laneLength / 2) - 0.5;
  const halfWidth = (map.laneWidth / 2) - 0.5;

  // Deconstruct origin and target into lane coordinates (t along, d across)
  let tFrom = (from.x - from.z) / Math.SQRT2;
  let dFrom = (from.x + from.z) / Math.SQRT2;

  // Clamp origin to valid range
  tFrom = Math.max(-halfLength, Math.min(halfLength, tFrom));
  dFrom = Math.max(-halfWidth, Math.min(halfWidth, dFrom));

  const tTarget = (target.x - target.z) / Math.SQRT2;
  const dTarget = (target.x + target.z) / Math.SQRT2;

  const deltaT = tTarget - tFrom;
  const deltaD = dTarget - dFrom;

  let maxS = 1;

  // Check corridor length boundaries
  if (deltaT > 0) {
    maxS = Math.min(maxS, (halfLength - tFrom) / deltaT);
  } else if (deltaT < 0) {
    maxS = Math.min(maxS, (-halfLength - tFrom) / deltaT);
  }

  // Check corridor width boundaries
  if (deltaD > 0) {
    maxS = Math.min(maxS, (halfWidth - dFrom) / deltaD);
  } else if (deltaD < 0) {
    maxS = Math.min(maxS, (-halfWidth - dFrom) / deltaD);
  }

  const s = Math.max(0, Math.min(1, maxS));

  return {
    x: from.x + s * (target.x - from.x),
    z: from.z + s * (target.z - from.z)
  };
}

/**
 * Agnostically clamps any (x, z) world coordinate to the nearest valid point on the lane corridor boundary.
 */
export function clampToLane(map: MapConfig, x: number, z: number): { x: number; z: number } {
  const halfLength = map.laneLength / 2;
  const halfWidth = (map.laneWidth / 2) - 0.5; // slight margin inside borders

  // Coordinate decomposition along lane (t) and across lane (d)
  const t = (x - z) / Math.SQRT2;
  const d = (x + z) / Math.SQRT2;

  const clampedT = Math.max(-halfLength, Math.min(halfLength, t));
  const clampedD = Math.max(-halfWidth, Math.min(halfWidth, d));

  return {
    x: (clampedT + clampedD) / Math.SQRT2,
    z: (-clampedT + clampedD) / Math.SQRT2
  };
}

/**
 * Specific EPFL Diagonale map configuration.
 */
export const EPFL_DIAGONALE_MAP: MapConfig = {
  id: 'epfl_diagonale',
  name: 'EPFL Diagonale',
  laneLength: 360,
  laneWidth: 24,

  // Standard single-lane MOBA orientation:
  // Blue Nexus at Bottom-Left (-X, +Z), Red Nexus at Top-Right (+X, -Z)
  blueNexus: { x: -125, z: 125 }, // Esplanade / Cosandey side (Bottom-Left)
  redNexus: { x: 125, z: -125 },   // BC / SG side (Top-Right)

  // Campus building footprints flanking the Diagonale (parallel to 45 deg corridor)
  // Set back 6m from the lane curb (d = +/-18m) so no building intersects the walkway
  buildings: [
    // Top-Left flank (CO, CE, BC)
    { name: 'CO (Chimie)', x: -80, z: 33, width: 55, depth: 30, rotationY: Math.PI / 4 },
    { name: 'CE (Centre d\'Enseignement)', x: -25, z: -25, width: 45, depth: 35, rotationY: Math.PI / 4 },
    { name: 'BC (Informatique)', x: 31, z: -82, width: 55, depth: 35, rotationY: Math.PI / 4 },

    // Bottom-Right flank (Rolex Learning Center, SG / IN)
    { name: 'Rolex Learning Center', x: -1, z: 55, width: 70, depth: 40, rotationY: Math.PI / 4 },
    { name: 'SG / IN', x: 60, z: -10, width: 50, depth: 35, rotationY: Math.PI / 4 }
  ]
};

// Backwards-compatible export alias for any legacy imports
export const DIAGONALE_METRICS = {
  LANE_LENGTH: EPFL_DIAGONALE_MAP.laneLength,
  LANE_WIDTH: EPFL_DIAGONALE_MAP.laneWidth,
  BLUE_NEXUS: EPFL_DIAGONALE_MAP.blueNexus,
  RED_NEXUS: EPFL_DIAGONALE_MAP.redNexus,
  BUILDINGS: EPFL_DIAGONALE_MAP.buildings
};
