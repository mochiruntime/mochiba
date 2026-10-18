import { describe, it, expect } from 'vitest';
import { EPFL_DIAGONALE_MAP, isInsideLane, clampToLane, clampRayToLane } from '../src/diagonale.js';

describe('MapConfig & Lane Validation (EPFL Diagonale)', () => {
  it('has consistent lane length and width in metric scale', () => {
    expect(EPFL_DIAGONALE_MAP.laneLength).toBe(360);
    expect(EPFL_DIAGONALE_MAP.laneWidth).toBe(24);
  });

  it('places Blue and Red nexus at opposite ends of the lane', () => {
    const { blueNexus, redNexus } = EPFL_DIAGONALE_MAP;
    expect(blueNexus.x).toBe(-redNexus.x);
    expect(blueNexus.z).toBe(-redNexus.z);
  });

  it('correctly validates positions inside and outside the lane corridor', () => {
    // Center of lane is inside
    expect(isInsideLane(EPFL_DIAGONALE_MAP, 0, 0)).toBe(true);

    // Blue and Red nexus are inside
    expect(isInsideLane(EPFL_DIAGONALE_MAP, EPFL_DIAGONALE_MAP.blueNexus.x, EPFL_DIAGONALE_MAP.blueNexus.z)).toBe(true);
    expect(isInsideLane(EPFL_DIAGONALE_MAP, EPFL_DIAGONALE_MAP.redNexus.x, EPFL_DIAGONALE_MAP.redNexus.z)).toBe(true);

    // Far outside lane bounds (e.g. far off to the side)
    expect(isInsideLane(EPFL_DIAGONALE_MAP, 100, 100)).toBe(false);
    expect(isInsideLane(EPFL_DIAGONALE_MAP, -100, -100)).toBe(false);
  });

  it('clamps coordinates outside the corridor to the nearest lane boundary in that direction', () => {
    // Point already inside remains unchanged
    const inside = clampToLane(EPFL_DIAGONALE_MAP, 0, 0);
    expect(inside.x).toBeCloseTo(0, 1);
    expect(inside.z).toBeCloseTo(0, 1);

    // Point far out to the side (perpendicular to corridor)
    const farSide = clampToLane(EPFL_DIAGONALE_MAP, 60, 60);
    expect(isInsideLane(EPFL_DIAGONALE_MAP, farSide.x, farSide.z)).toBe(true);
    // Boundary coordinate maintains direction (x == z along perpendicular)
    expect(farSide.x).toBeCloseTo(farSide.z, 1);

    // Point far beyond Red Nexus along the lane
    const farEnd = clampToLane(EPFL_DIAGONALE_MAP, 250, -250);
    expect(isInsideLane(EPFL_DIAGONALE_MAP, farEnd.x, farEnd.z)).toBe(true);
    expect(farEnd.x).toBeLessThan(200);
    expect(farEnd.z).toBeGreaterThan(-200);
  });

  it('clampRayToLane preserves the exact direction angle from the champion to the target pointer', () => {
    const championPos = { x: 0, z: 0 };
    const pointerPos = { x: 80, z: 30 }; // Far outside the corridor at an angle

    const clamped = clampRayToLane(EPFL_DIAGONALE_MAP, championPos, pointerPos);

    // Must be inside the corridor
    expect(isInsideLane(EPFL_DIAGONALE_MAP, clamped.x, clamped.z)).toBe(true);

    // Angle from champion to clamped destination must match angle from champion to pointer!
    const pointerAngle = Math.atan2(pointerPos.z - championPos.z, pointerPos.x - championPos.x);
    const clampedAngle = Math.atan2(clamped.z - championPos.z, clamped.x - championPos.x);
    expect(clampedAngle).toBeCloseTo(pointerAngle, 4);

    // Clamped distance should be shorter than original target distance
    const pointerDist = Math.hypot(pointerPos.x, pointerPos.z);
    const clampedDist = Math.hypot(clamped.x, clamped.z);
    expect(clampedDist).toBeLessThan(pointerDist);
  });
});
