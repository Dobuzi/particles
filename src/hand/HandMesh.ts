// Hand mesh reconstruction from MediaPipe landmarks
// Provides palm surface triangulation and finger joint chains

import type { Vec3 } from '../types';

// Palm landmark indices form the palm boundary
// 0 = wrist, 5 = index MCP, 9 = middle MCP, 13 = ring MCP, 17 = pinky MCP
export const PALM_INDICES = [0, 5, 9, 13, 17] as const;

// Palm triangulation - triangles that cover the palm surface
// Each triangle is [a, b, c] indices into PALM_INDICES
export const PALM_TRIANGLES: [number, number, number][] = [
  [0, 1, 2], // Wrist -> Index MCP -> Middle MCP
  [0, 2, 3], // Wrist -> Middle MCP -> Ring MCP
  [0, 3, 4], // Wrist -> Ring MCP -> Pinky MCP
];

// Finger joint chains - ordered from MCP to tip
export const FINGER_CHAINS = {
  thumb:  [1, 2, 3, 4],       // CMC -> MCP -> IP -> Tip
  index:  [5, 6, 7, 8],       // MCP -> PIP -> DIP -> Tip
  middle: [9, 10, 11, 12],    // MCP -> PIP -> DIP -> Tip
  ring:   [13, 14, 15, 16],   // MCP -> PIP -> DIP -> Tip
  pinky:  [17, 18, 19, 20],   // MCP -> PIP -> DIP -> Tip
} as const;

export type FingerName = keyof typeof FINGER_CHAINS;
export const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// Triangle with precomputed data for fast barycentric interpolation
export type MeshTriangle = {
  indices: [number, number, number];  // Indices into landmarks array
  // These are computed at runtime from landmarks
};

// Palm mesh structure
export type PalmMesh = {
  triangles: MeshTriangle[];
  boundaryIndices: number[];  // Palm boundary for edge detection
};

// Finger chain structure
export type FingerChain = {
  name: FingerName;
  joints: number[];      // Landmark indices in order
  segmentCount: number;  // Number of bone segments (joints.length - 1)
};

// Complete hand mesh
export type HandMesh = {
  palm: PalmMesh;
  fingers: FingerChain[];
};

// Create the static hand mesh structure
export function createHandMesh(): HandMesh {
  const palm: PalmMesh = {
    triangles: PALM_TRIANGLES.map(([a, b, c]) => ({
      indices: [PALM_INDICES[a], PALM_INDICES[b], PALM_INDICES[c]] as [number, number, number],
    })),
    boundaryIndices: [...PALM_INDICES],
  };

  const fingers: FingerChain[] = FINGER_NAMES.map((name) => ({
    name,
    joints: [...FINGER_CHAINS[name]],
    segmentCount: FINGER_CHAINS[name].length - 1,
  }));

  return { palm, fingers };
}

// Singleton mesh structure
export const HAND_MESH = createHandMesh();

// === Geometric utilities ===

// Compute barycentric coordinates for a point within a triangle
// Returns [u, v, w] where u + v + w = 1
export function computeBarycentric(
  p: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3
): [number, number, number] {
  // Vectors from a
  const v0 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const v1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v2 = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };

  // Dot products
  const dot00 = v0.x * v0.x + v0.y * v0.y + v0.z * v0.z;
  const dot01 = v0.x * v1.x + v0.y * v1.y + v0.z * v1.z;
  const dot02 = v0.x * v2.x + v0.y * v2.y + v0.z * v2.z;
  const dot11 = v1.x * v1.x + v1.y * v1.y + v1.z * v1.z;
  const dot12 = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

  // Barycentric coordinates
  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  const w = 1 - u - v;

  return [w, v, u]; // [weight for a, weight for b, weight for c]
}

// Interpolate a point on a triangle using barycentric coordinates
export function barycentricInterpolate(
  bary: [number, number, number],
  a: Vec3,
  b: Vec3,
  c: Vec3
): Vec3 {
  return {
    x: bary[0] * a.x + bary[1] * b.x + bary[2] * c.x,
    y: bary[0] * a.y + bary[1] * b.y + bary[2] * c.y,
    z: bary[0] * a.z + bary[1] * b.z + bary[2] * c.z,
  };
}

// Compute triangle normal (unnormalized)
export function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };

  // Cross product
  return {
    x: ab.y * ac.z - ab.z * ac.y,
    y: ab.z * ac.x - ab.x * ac.z,
    z: ab.x * ac.y - ab.y * ac.x,
  };
}

// Normalize a vector
export function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 0.0001) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// Compute triangle area (for weighted sampling)
export function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const n = triangleNormal(a, b, c);
  return 0.5 * Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z);
}

// === Palm surface sampling ===

// Sample a random point on the palm surface using landmarks
export function samplePalmSurface(
  landmarks: Vec3[],
  mesh: PalmMesh = HAND_MESH.palm,
  random: () => number = Math.random
): { position: Vec3; normal: Vec3; triangleIdx: number } {
  // Compute triangle areas for weighted sampling
  const areas: number[] = mesh.triangles.map((tri) => {
    const [i, j, k] = tri.indices;
    return triangleArea(landmarks[i], landmarks[j], landmarks[k]);
  });

  const totalArea = areas.reduce((sum, a) => sum + a, 0);
  if (totalArea < 0.0001) {
    // Degenerate case - return wrist
    return {
      position: landmarks[0],
      normal: { x: 0, y: 0, z: 1 },
      triangleIdx: 0,
    };
  }

  // Weighted random triangle selection
  let r = random() * totalArea;
  let triangleIdx = 0;
  for (let i = 0; i < areas.length; i++) {
    r -= areas[i];
    if (r <= 0) {
      triangleIdx = i;
      break;
    }
  }

  const tri = mesh.triangles[triangleIdx];
  const a = landmarks[tri.indices[0]];
  const b = landmarks[tri.indices[1]];
  const c = landmarks[tri.indices[2]];

  // Random point in triangle using sqrt method
  const r1 = Math.sqrt(random());
  const r2 = random();
  const bary: [number, number, number] = [
    1 - r1,
    r1 * (1 - r2),
    r1 * r2,
  ];

  const position = barycentricInterpolate(bary, a, b, c);
  const normal = normalize(triangleNormal(a, b, c));

  return { position, normal, triangleIdx };
}

// === Finger chain utilities ===

// Get position along a finger at parameter t [0, 1]
// t=0 is MCP, t=1 is fingertip
export function getFingerPosition(
  landmarks: Vec3[],
  finger: FingerChain,
  t: number
): Vec3 {
  const clampedT = Math.max(0, Math.min(1, t));
  const segmentFloat = clampedT * finger.segmentCount;
  const segmentIdx = Math.min(Math.floor(segmentFloat), finger.segmentCount - 1);
  const localT = segmentFloat - segmentIdx;

  const startIdx = finger.joints[segmentIdx];
  const endIdx = finger.joints[segmentIdx + 1];
  const start = landmarks[startIdx];
  const end = landmarks[endIdx];

  return {
    x: start.x + (end.x - start.x) * localT,
    y: start.y + (end.y - start.y) * localT,
    z: start.z + (end.z - start.z) * localT,
  };
}

// Get tangent direction along a finger at parameter t
export function getFingerTangent(
  landmarks: Vec3[],
  finger: FingerChain,
  t: number
): Vec3 {
  const clampedT = Math.max(0, Math.min(1, t));
  const segmentFloat = clampedT * finger.segmentCount;
  const segmentIdx = Math.min(Math.floor(segmentFloat), finger.segmentCount - 1);

  const startIdx = finger.joints[segmentIdx];
  const endIdx = finger.joints[segmentIdx + 1];
  const start = landmarks[startIdx];
  const end = landmarks[endIdx];

  const tangent = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };

  return normalize(tangent);
}

// Get finger length from landmarks
export function getFingerLength(landmarks: Vec3[], finger: FingerChain): number {
  let length = 0;
  for (let i = 0; i < finger.segmentCount; i++) {
    const start = landmarks[finger.joints[i]];
    const end = landmarks[finger.joints[i + 1]];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    length += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return length;
}

// === Hand coordinate frame ===

// Compute a local coordinate frame for the hand
// Returns basis vectors: right, up, forward (palm normal)
export function computeHandFrame(landmarks: Vec3[]): {
  origin: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
} {
  // Origin at wrist
  const origin = landmarks[0];

  // Right direction: wrist to pinky MCP
  const pinkyMCP = landmarks[17];
  const toRight = {
    x: pinkyMCP.x - origin.x,
    y: pinkyMCP.y - origin.y,
    z: pinkyMCP.z - origin.z,
  };
  const right = normalize(toRight);

  // Up direction: wrist to middle MCP (roughly)
  const middleMCP = landmarks[9];
  const toMiddle = {
    x: middleMCP.x - origin.x,
    y: middleMCP.y - origin.y,
    z: middleMCP.z - origin.z,
  };

  // Forward: cross product of right and toMiddle
  const forward = normalize({
    x: right.y * toMiddle.z - right.z * toMiddle.y,
    y: right.z * toMiddle.x - right.x * toMiddle.z,
    z: right.x * toMiddle.y - right.y * toMiddle.x,
  });

  // Recompute up as cross of forward and right for orthogonality
  const up = normalize({
    x: forward.y * right.z - forward.z * right.y,
    y: forward.z * right.x - forward.x * right.z,
    z: forward.x * right.y - forward.y * right.x,
  });

  return { origin, right, up, forward };
}

// Project a world point to local hand coordinates
export function worldToHandLocal(
  point: Vec3,
  frame: { origin: Vec3; right: Vec3; up: Vec3; forward: Vec3 }
): Vec3 {
  const rel = {
    x: point.x - frame.origin.x,
    y: point.y - frame.origin.y,
    z: point.z - frame.origin.z,
  };

  return {
    x: rel.x * frame.right.x + rel.y * frame.right.y + rel.z * frame.right.z,
    y: rel.x * frame.up.x + rel.y * frame.up.y + rel.z * frame.up.z,
    z: rel.x * frame.forward.x + rel.y * frame.forward.y + rel.z * frame.forward.z,
  };
}

// Project local hand coordinates back to world
export function handLocalToWorld(
  local: Vec3,
  frame: { origin: Vec3; right: Vec3; up: Vec3; forward: Vec3 }
): Vec3 {
  return {
    x: frame.origin.x + local.x * frame.right.x + local.y * frame.up.x + local.z * frame.forward.x,
    y: frame.origin.y + local.x * frame.right.y + local.y * frame.up.y + local.z * frame.forward.y,
    z: frame.origin.z + local.x * frame.right.z + local.y * frame.up.z + local.z * frame.forward.z,
  };
}
