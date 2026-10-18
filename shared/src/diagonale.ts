import { MapConfig, LandmarkBuilding } from './map/types.js';
export { MapConfig, LandmarkBuilding } from './map/types.js';
export { isInsideLane, clampRayToLane, clampToLane } from './map/laneGeometry.js';

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

// Backwards-compatible export alias for legacy imports
export const DIAGONALE_METRICS = {
  LANE_LENGTH: EPFL_DIAGONALE_MAP.laneLength,
  LANE_WIDTH: EPFL_DIAGONALE_MAP.laneWidth,
  BLUE_NEXUS: EPFL_DIAGONALE_MAP.blueNexus,
  RED_NEXUS: EPFL_DIAGONALE_MAP.redNexus,
  BUILDINGS: EPFL_DIAGONALE_MAP.buildings
};
