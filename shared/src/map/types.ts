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
