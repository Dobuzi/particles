// Particle distribution across hand skeleton and mesh
// Allocates particles proportionally based on bone weights
// Supports both bone-based and mesh-based distribution

import type {
  Vec3,
  ParticleAssignment,
  HandSkeleton,
  Bone,
  UnifiedParticleAssignment,
  MeshParticleAssignment,
  ChainParticleAssignment,
  BoneRegion,
} from '../types';
import { HAND_SKELETON } from './HandSkeleton';
import { HAND_MESH, PALM_TRIANGLES, FINGER_NAMES } from './HandMesh';

// Configuration for distribution behavior
export type DistributionConfig = {
  jitterAmount: number;     // Random offset along t [0, 1] - default 0.1
  palmFillRatio: number;    // How much to fill palm interior vs edges [0, 1] - default 0.3
};

const DEFAULT_CONFIG: DistributionConfig = {
  jitterAmount: 0.1,
  palmFillRatio: 0.3,
};

// Distribute N particles across bones based on weights
export function distributeParticles(
  particleCount: number,
  skeleton: HandSkeleton = HAND_SKELETON,
  config: DistributionConfig = DEFAULT_CONFIG
): ParticleAssignment[] {
  const assignments: ParticleAssignment[] = [];

  // Calculate particles per bone based on weight
  const particlesPerBone = allocateParticlesToBones(particleCount, skeleton);

  // Generate assignments for each bone
  for (const bone of skeleton.bones) {
    const count = particlesPerBone.get(bone.id) || 0;
    if (count === 0) continue;

    const boneAssignments = generateBoneParticles(bone, count, config);
    assignments.push(...boneAssignments);
  }

  return assignments;
}

// Allocate particle counts to bones proportionally by weight
function allocateParticlesToBones(
  totalParticles: number,
  skeleton: HandSkeleton
): Map<number, number> {
  const allocation = new Map<number, number>();

  // First pass: fractional allocation
  const fractional: Array<{ boneId: number; fraction: number }> = [];
  let allocated = 0;

  for (const bone of skeleton.bones) {
    const fraction = (bone.weight / skeleton.totalWeight) * totalParticles;
    const whole = Math.floor(fraction);
    allocation.set(bone.id, whole);
    allocated += whole;
    fractional.push({ boneId: bone.id, fraction: fraction - whole });
  }

  // Second pass: distribute remaining particles to bones with highest fractional parts
  fractional.sort((a, b) => b.fraction - a.fraction);
  let remaining = totalParticles - allocated;

  for (const { boneId } of fractional) {
    if (remaining <= 0) break;
    allocation.set(boneId, (allocation.get(boneId) || 0) + 1);
    remaining--;
  }

  return allocation;
}

// Generate particle assignments for a single bone
function generateBoneParticles(
  bone: Bone,
  count: number,
  config: DistributionConfig
): ParticleAssignment[] {
  const assignments: ParticleAssignment[] = [];

  for (let i = 0; i < count; i++) {
    // Distribute evenly along bone with jitter
    const baseT = (i + 0.5) / count;
    const jitter = (Math.random() - 0.5) * config.jitterAmount;
    const t = Math.max(0, Math.min(1, baseT + jitter));

    // Calculate perpendicular offset
    // Palm bones get more spread, finger bones stay tight
    const offset = calculateOffset(bone, t, config);

    assignments.push({
      boneId: bone.id,
      t,
      offset,
      region: bone.region,
      finger: bone.finger,
    });
  }

  return assignments;
}

// Calculate perpendicular offset for a particle
// This gives palm region more volume and fingers stay linear
function calculateOffset(
  bone: Bone,
  t: number,
  config: DistributionConfig
): Vec3 {
  // Finger bones: minimal offset (tight along bone)
  if (bone.region !== 'palm') {
    const fingerSpread = 0.02; // Very small random offset
    return {
      x: (Math.random() - 0.5) * fingerSpread,
      y: (Math.random() - 0.5) * fingerSpread,
      z: (Math.random() - 0.5) * fingerSpread,
    };
  }

  // Palm bones: larger offset toward center to fill palm
  // Use polar-ish coordinates for natural distribution
  const fillAmount = Math.random() < config.palmFillRatio ? 1 : 0;
  const spreadAmount = 0.08 * fillAmount;
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * spreadAmount;

  // Offset perpendicular to bone (primarily in X-Y plane toward palm center)
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.5, // Less vertical spread
    z: (Math.random() - 0.5) * 0.03,   // Slight depth variation
  };
}

// Create a stable distribution that doesn't change on re-render
// Uses seeded random for deterministic results
export function createStableDistribution(
  particleCount: number,
  seed: number = 42,
  skeleton: HandSkeleton = HAND_SKELETON,
  config: DistributionConfig = DEFAULT_CONFIG
): ParticleAssignment[] {
  // Simple seeded PRNG (mulberry32)
  const random = createSeededRandom(seed);

  const assignments: ParticleAssignment[] = [];
  const particlesPerBone = allocateParticlesToBones(particleCount, skeleton);

  for (const bone of skeleton.bones) {
    const count = particlesPerBone.get(bone.id) || 0;
    if (count === 0) continue;

    for (let i = 0; i < count; i++) {
      const baseT = (i + 0.5) / count;
      const jitter = (random() - 0.5) * config.jitterAmount;
      const t = Math.max(0, Math.min(1, baseT + jitter));

      let offset: Vec3;
      if (bone.region !== 'palm') {
        const fingerSpread = 0.02;
        offset = {
          x: (random() - 0.5) * fingerSpread,
          y: (random() - 0.5) * fingerSpread,
          z: (random() - 0.5) * fingerSpread,
        };
      } else {
        const fillAmount = random() < config.palmFillRatio ? 1 : 0;
        const spreadAmount = 0.08 * fillAmount;
        const angle = random() * Math.PI * 2;
        const radius = random() * spreadAmount;
        offset = {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius * 0.5,
          z: (random() - 0.5) * 0.03,
        };
      }

      assignments.push({
        boneId: bone.id,
        t,
        offset,
        region: bone.region,
        finger: bone.finger,
      });
    }
  }

  return assignments;
}

// Mulberry32 seeded PRNG
function createSeededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Utility: Get particle count per region for debugging/UI
export function getDistributionStats(
  assignments: ParticleAssignment[]
): Record<string, number> {
  const stats: Record<string, number> = {
    total: assignments.length,
    palm: 0,
    thumb: 0,
    proximal: 0,
    intermediate: 0,
    distal: 0,
  };

  for (const a of assignments) {
    stats[a.region]++;
  }

  return stats;
}

// === Mesh-Based Distribution ===

// Configuration for mesh-based distribution
export type MeshDistributionConfig = {
  palmRatio: number;      // Fraction of particles on palm surface [0, 1]
  fingerTaper: number;    // How much to taper finger particle density toward tips [0, 1]
  normalOffset: number;   // Max normal offset from surface
  radialSpread: number;   // Spread around finger chains
};

const DEFAULT_MESH_CONFIG: MeshDistributionConfig = {
  palmRatio: 0.35,        // 35% on palm
  fingerTaper: 0.6,       // Significant tapering toward tips
  normalOffset: 0.02,     // Small normal offset
  radialSpread: 0.015,    // Tight around fingers
};

// Region weights for finger chain distribution
const FINGER_REGION_WEIGHTS: Record<BoneRegion, number> = {
  palm: 0,          // Palm handled separately
  thumb: 1.2,       // Thumb is prominent
  proximal: 1.3,    // Knuckles are visually important
  intermediate: 1.0,
  distal: 0.5,      // Taper toward tips
};

// Create a unified distribution using mesh + chains
export function createMeshBasedDistribution(
  particleCount: number,
  seed: number = 42,
  config: MeshDistributionConfig = DEFAULT_MESH_CONFIG
): UnifiedParticleAssignment[] {
  const random = createSeededRandom(seed);
  const assignments: UnifiedParticleAssignment[] = [];

  // Split particles between palm and fingers
  const palmCount = Math.floor(particleCount * config.palmRatio);
  const fingerCount = particleCount - palmCount;

  // Generate palm surface particles
  const palmAssignments = generatePalmMeshParticles(palmCount, config, random);
  assignments.push(...palmAssignments);

  // Generate finger chain particles
  const fingerAssignments = generateFingerChainParticles(fingerCount, config, random);
  assignments.push(...fingerAssignments);

  return assignments;
}

// Generate particles distributed on palm triangular mesh
function generatePalmMeshParticles(
  count: number,
  config: MeshDistributionConfig,
  random: () => number
): MeshParticleAssignment[] {
  const assignments: MeshParticleAssignment[] = [];

  // Roughly equal distribution across triangles (could weight by area later)
  const triangleCount = PALM_TRIANGLES.length;
  const particlesPerTriangle = Math.floor(count / triangleCount);
  let remaining = count - particlesPerTriangle * triangleCount;

  for (let triIdx = 0; triIdx < triangleCount; triIdx++) {
    let triParticles = particlesPerTriangle;
    if (remaining > 0) {
      triParticles++;
      remaining--;
    }

    for (let i = 0; i < triParticles; i++) {
      // Random point in triangle using sqrt method for uniform distribution
      const r1 = Math.sqrt(random());
      const r2 = random();
      const barycentricCoords: [number, number, number] = [
        1 - r1,
        r1 * (1 - r2),
        r1 * r2,
      ];

      // Small offset along normal for depth variation
      const normalOffset = (random() - 0.5) * config.normalOffset * 2;

      assignments.push({
        type: 'mesh',
        triangleIdx: triIdx,
        barycentricCoords,
        normalOffset,
        region: 'palm',
      });
    }
  }

  return assignments;
}

// Generate particles along finger chains
function generateFingerChainParticles(
  count: number,
  config: MeshDistributionConfig,
  random: () => number
): ChainParticleAssignment[] {
  const assignments: ChainParticleAssignment[] = [];

  // Calculate total weight for all fingers
  // Each finger has 3 segments with different weights
  const fingerWeights = FINGER_NAMES.map((name, fingerIdx) => {
    // Thumb has different structure (no intermediate in same sense)
    const isThumb = fingerIdx === 0;
    const segments = isThumb
      ? [FINGER_REGION_WEIGHTS.thumb * 1.2, FINGER_REGION_WEIGHTS.thumb, FINGER_REGION_WEIGHTS.distal]
      : [FINGER_REGION_WEIGHTS.proximal, FINGER_REGION_WEIGHTS.intermediate, FINGER_REGION_WEIGHTS.distal];
    return segments.reduce((sum, w) => sum + w, 0);
  });

  const totalWeight = fingerWeights.reduce((sum, w) => sum + w, 0);

  // Distribute particles across fingers
  let allocated = 0;
  const particlesPerFinger: number[] = [];

  for (let i = 0; i < FINGER_NAMES.length; i++) {
    const fraction = (fingerWeights[i] / totalWeight) * count;
    const whole = Math.floor(fraction);
    particlesPerFinger.push(whole);
    allocated += whole;
  }

  // Distribute remaining
  let remaining = count - allocated;
  for (let i = 0; remaining > 0 && i < FINGER_NAMES.length; i++) {
    particlesPerFinger[i]++;
    remaining--;
  }

  // Generate particles for each finger
  for (let fingerIdx = 0; fingerIdx < FINGER_NAMES.length; fingerIdx++) {
    const fingerParticleCount = particlesPerFinger[fingerIdx];

    for (let i = 0; i < fingerParticleCount; i++) {
      // Distribute along finger with taper (more particles near base)
      // Use power distribution for natural tapering
      const rawT = (i + 0.5) / fingerParticleCount;
      const t = Math.pow(rawT, 1 - config.fingerTaper * 0.5); // Bias toward base

      // Add jitter
      const jitter = (random() - 0.5) * 0.15;
      const finalT = Math.max(0, Math.min(1, t + jitter));

      // Radial offset around the chain
      const angle = random() * Math.PI * 2;
      const radius = random() * config.radialSpread;
      const radialOffset: Vec3 = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.7, // Flattened for finger shape
        z: (random() - 0.5) * config.radialSpread * 0.5,
      };

      // Determine region based on t
      let region: BoneRegion;
      if (fingerIdx === 0) {
        // Thumb: different regions
        region = finalT < 0.33 ? 'thumb' : finalT < 0.66 ? 'thumb' : 'distal';
      } else {
        region = finalT < 0.33 ? 'proximal' : finalT < 0.66 ? 'intermediate' : 'distal';
      }

      assignments.push({
        type: 'chain',
        fingerIdx,
        t: finalT,
        radialOffset,
        region,
      });
    }
  }

  return assignments;
}

// Export seeded random creator for external use
export { createSeededRandom };
