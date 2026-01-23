// Hand skeleton model with weighted bone structure
// Based on MediaPipe hand landmark topology

import type { Bone, BoneRegion, HandSkeleton } from '../types';

/*
MediaPipe Hand Landmark Indices:

        4 (thumb tip)
        │
    3 ──┤
        │
    2 ──┤           8 (index tip)
        │           │
    1 ──┤       7 ──┤       12 (middle tip)
        │           │       │
    0 ──┼───5 ──6 ──┤   11 ──┤       16 (ring tip)
  (wrist)           │       │       │
                9 ──┼──10 ──┤   15 ──┤       20 (pinky tip)
                    │       │       │       │
                13 ─┼──14 ──┤   19 ──┤
                    │       │       │
                17 ─┴──18 ──┴───────┘

Palm vertices: 0 (wrist), 5, 9, 13, 17
*/

// Bone weight multipliers by region
// Higher weight = more particles allocated
const REGION_WEIGHTS: Record<BoneRegion, number> = {
  palm: 1.6,         // Largest visual mass, needs density
  thumb: 1.0,        // Thumb varies by segment
  proximal: 1.3,     // Strong finger roots
  intermediate: 1.0, // Standard
  distal: 0.5,       // Taper toward fingertips
};

// Individual bone definitions
// Each bone connects two MediaPipe landmark indices
const BONE_DEFINITIONS: Array<{
  startIdx: number;
  endIdx: number;
  region: BoneRegion;
  finger: number;
  weightOverride?: number;
}> = [
  // === PALM (finger -1) ===
  // Forms a pentagonal shape around the palm
  { startIdx: 0, endIdx: 5, region: 'palm', finger: -1 },   // Wrist to index base
  { startIdx: 5, endIdx: 9, region: 'palm', finger: -1 },   // Index base to middle base
  { startIdx: 9, endIdx: 13, region: 'palm', finger: -1 },  // Middle base to ring base
  { startIdx: 13, endIdx: 17, region: 'palm', finger: -1 }, // Ring base to pinky base
  { startIdx: 17, endIdx: 0, region: 'palm', finger: -1 },  // Pinky base to wrist

  // === THUMB (finger 0) ===
  // Thumb has different anatomy: CMC, MCP, IP joints
  { startIdx: 0, endIdx: 1, region: 'thumb', finger: 0, weightOverride: 1.4 },  // CMC (thick base)
  { startIdx: 1, endIdx: 2, region: 'thumb', finger: 0, weightOverride: 1.1 },  // Proximal
  { startIdx: 2, endIdx: 3, region: 'thumb', finger: 0, weightOverride: 0.8 },  // Distal
  { startIdx: 3, endIdx: 4, region: 'thumb', finger: 0, weightOverride: 0.4 },  // Tip

  // === INDEX FINGER (finger 1) ===
  { startIdx: 5, endIdx: 6, region: 'proximal', finger: 1 },
  { startIdx: 6, endIdx: 7, region: 'intermediate', finger: 1 },
  { startIdx: 7, endIdx: 8, region: 'distal', finger: 1 },

  // === MIDDLE FINGER (finger 2) ===
  { startIdx: 9, endIdx: 10, region: 'proximal', finger: 2 },
  { startIdx: 10, endIdx: 11, region: 'intermediate', finger: 2 },
  { startIdx: 11, endIdx: 12, region: 'distal', finger: 2 },

  // === RING FINGER (finger 3) ===
  { startIdx: 13, endIdx: 14, region: 'proximal', finger: 3 },
  { startIdx: 14, endIdx: 15, region: 'intermediate', finger: 3 },
  { startIdx: 15, endIdx: 16, region: 'distal', finger: 3 },

  // === PINKY FINGER (finger 4) ===
  { startIdx: 17, endIdx: 18, region: 'proximal', finger: 4, weightOverride: 1.1 }, // Pinky base slightly higher
  { startIdx: 18, endIdx: 19, region: 'intermediate', finger: 4, weightOverride: 0.9 },
  { startIdx: 19, endIdx: 20, region: 'distal', finger: 4, weightOverride: 0.4 },
];

// Create the hand skeleton with computed weights
export function createHandSkeleton(): HandSkeleton {
  const bones: Bone[] = BONE_DEFINITIONS.map((def, id) => {
    const weight = def.weightOverride ?? REGION_WEIGHTS[def.region];
    return {
      id,
      startIdx: def.startIdx,
      endIdx: def.endIdx,
      region: def.region,
      weight,
      finger: def.finger,
    };
  });

  const totalWeight = bones.reduce((sum, bone) => sum + bone.weight, 0);

  return { bones, totalWeight };
}

// Singleton skeleton instance (same structure for all hands)
export const HAND_SKELETON = createHandSkeleton();

// Get bones by region for filtering
export function getBonesByRegion(skeleton: HandSkeleton, region: BoneRegion): Bone[] {
  return skeleton.bones.filter((bone) => bone.region === region);
}

// Get bones by finger (-1 = palm, 0-4 = thumb through pinky)
export function getBonesByFinger(skeleton: HandSkeleton, finger: number): Bone[] {
  return skeleton.bones.filter((bone) => bone.finger === finger);
}

// Get adjacent bones for constraint solving
// Returns bones that share a landmark with the given bone
export function getAdjacentBones(skeleton: HandSkeleton, boneId: number): number[] {
  const bone = skeleton.bones[boneId];
  const adjacent: number[] = [];

  for (const other of skeleton.bones) {
    if (other.id === boneId) continue;
    // Bones are adjacent if they share a landmark
    if (
      other.startIdx === bone.startIdx ||
      other.startIdx === bone.endIdx ||
      other.endIdx === bone.startIdx ||
      other.endIdx === bone.endIdx
    ) {
      adjacent.push(other.id);
    }
  }

  return adjacent;
}

// Precompute adjacency map for faster lookup during simulation
export function createAdjacencyMap(skeleton: HandSkeleton): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const bone of skeleton.bones) {
    map.set(bone.id, getAdjacentBones(skeleton, bone.id));
  }
  return map;
}

export const BONE_ADJACENCY = createAdjacencyMap(HAND_SKELETON);
