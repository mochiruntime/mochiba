import { MapConfig } from './types.js';

/**
 * Computes the normalized 2D coordinate frame along and across the lane corridor.
 * Works for any straight lane connecting blueNexus to redNexus at any orientation.
 */
function getLaneCoordinateFrame(map: MapConfig) {
  const cx = (map.blueNexus.x + map.redNexus.x) / 2;
  const cz = (map.blueNexus.z + map.redNexus.z) / 2;
  const dx = map.redNexus.x - map.blueNexus.x;
  const dz = map.redNexus.z - map.blueNexus.z;
  const len = Math.hypot(dx, dz) || 1;

  // Unit vector along the lane (from blue nexus toward red nexus)
  const ux = dx / len;
  const uz = dz / len;

  // Unit vector perpendicular to lane (rotated 90 degrees counterclockwise)
  const vx = -uz;
  const vz = ux;

  return { cx, cz, ux, uz, vx, vz };
}

/**
 * Validates whether a given (x, z) world coordinate is within the lane corridor.
 * Works for any straight lane connecting blueNexus to redNexus at any orientation.
 */
export function isInsideLane(map: MapConfig, x: number, z: number): boolean {
  const { cx, cz, ux, uz, vx, vz } = getLaneCoordinateFrame(map);
  const halfLength = (map.laneLength / 2) + 2;
  const halfWidth = (map.laneWidth / 2) + 1;

  const dx = x - cx;
  const dz = z - cz;

  const distAlong = Math.abs(dx * ux + dz * uz);
  const distAcross = Math.abs(dx * vx + dz * vz);

  return distAlong <= halfLength && distAcross <= halfWidth;
}

/**
 * Clamps a target destination along the ray from origin (e.g. champion position)
 * towards the target pointer location, stopping at the lane boundary.
 * Preserves the exact heading/angle from origin to pointer across any map angle.
 */
export function clampRayToLane(
  map: MapConfig,
  from: { x: number; z: number },
  target: { x: number; z: number }
): { x: number; z: number } {
  const { cx, cz, ux, uz, vx, vz } = getLaneCoordinateFrame(map);
  const halfLength = (map.laneLength / 2) - 0.5;
  const halfWidth = (map.laneWidth / 2) - 0.5;

  const fromDx = from.x - cx;
  const fromDz = from.z - cz;
  let tFrom = fromDx * ux + fromDz * uz;
  let dFrom = fromDx * vx + fromDz * vz;

  // Clamp origin to valid range
  tFrom = Math.max(-halfLength, Math.min(halfLength, tFrom));
  dFrom = Math.max(-halfWidth, Math.min(halfWidth, dFrom));

  const targetDx = target.x - cx;
  const targetDz = target.z - cz;
  const tTarget = targetDx * ux + targetDz * uz;
  const dTarget = targetDx * vx + targetDz * vz;

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
 * @deprecated Prefer clampRayToLane which preserves pointer direction.
 * Clamps any (x, z) world coordinate to the nearest boundary of the lane corridor.
 */
export function clampToLane(map: MapConfig, x: number, z: number): { x: number; z: number } {
  const { cx, cz, ux, uz, vx, vz } = getLaneCoordinateFrame(map);
  const halfLength = map.laneLength / 2;
  const halfWidth = (map.laneWidth / 2) - 0.5;

  const dx = x - cx;
  const dz = z - cz;

  const t = dx * ux + dz * uz;
  const d = dx * vx + dz * vz;

  const clampedT = Math.max(-halfLength, Math.min(halfLength, t));
  const clampedD = Math.max(-halfWidth, Math.min(halfWidth, d));

  return {
    x: cx + clampedT * ux + clampedD * vx,
    z: cz + clampedT * uz + clampedD * vz
  };
}
