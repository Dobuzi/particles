// Position-Based Dynamics (PBD) Constraint Solver
// Handles distance constraints and collision avoidance

import type { VerletParticle } from './VerletParticle';

// Distance constraint between two particles
export type DistanceConstraint = {
  indexA: number;
  indexB: number;
  restLength: number;
  stiffness: number; // [0, 1] - how strongly to enforce
};

// Minimum distance constraint (collision avoidance)
export type MinDistanceConstraint = {
  minDistance: number;
  strength: number;
};

// Solve a single distance constraint
export function solveDistanceConstraint(
  particles: VerletParticle[],
  constraint: DistanceConstraint
): void {
  const a = particles[constraint.indexA];
  const b = particles[constraint.indexB];

  if (a.pinned && b.pinned) return;

  // Vector from a to b
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dz = b.position.z - a.position.z;

  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.0001) return; // Avoid division by zero

  // Difference from rest length
  const diff = (dist - constraint.restLength) / dist;
  const correction = diff * constraint.stiffness * 0.5;

  // Distribute correction based on mass
  const totalMass = a.mass + b.mass;
  const ratioA = a.pinned ? 0 : b.mass / totalMass;
  const ratioB = b.pinned ? 0 : a.mass / totalMass;

  // Apply corrections
  if (!a.pinned) {
    a.position.x += dx * correction * ratioA;
    a.position.y += dy * correction * ratioA;
    a.position.z += dz * correction * ratioA;
  }

  if (!b.pinned) {
    b.position.x -= dx * correction * ratioB;
    b.position.y -= dy * correction * ratioB;
    b.position.z -= dz * correction * ratioB;
  }
}

// Solve minimum distance (repulsion) between all particle pairs
// Uses spatial hashing for O(n) instead of O(n²)
export function solveMinDistanceAll(
  particles: VerletParticle[],
  minDist: number,
  strength: number = 0.5
): void {
  const n = particles.length;
  if (n < 2) return;

  // For small particle counts, brute force is fine
  if (n <= 150) {
    solveMinDistanceBruteForce(particles, minDist, strength);
    return;
  }

  // For larger counts, use spatial hashing
  solveMinDistanceSpatialHash(particles, minDist, strength);
}

// Brute force O(n²) - fine for small particle counts
function solveMinDistanceBruteForce(
  particles: VerletParticle[],
  minDist: number,
  strength: number
): void {
  const minDistSq = minDist * minDist;

  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    if (a.pinned) continue;

    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];

      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dz = b.position.z - a.position.z;

      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < minDistSq && distSq > 0.000001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const correction = (overlap / dist) * strength * 0.5;

        // Push apart equally
        const ratioA = b.pinned ? 1 : 0.5;
        const ratioB = a.pinned ? 1 : 0.5;

        if (!a.pinned) {
          a.position.x -= dx * correction * ratioA;
          a.position.y -= dy * correction * ratioA;
          a.position.z -= dz * correction * ratioA;
        }

        if (!b.pinned) {
          b.position.x += dx * correction * ratioB;
          b.position.y += dy * correction * ratioB;
          b.position.z += dz * correction * ratioB;
        }
      }
    }
  }
}

// Spatial hash for O(n) collision detection
type SpatialHash = Map<string, number[]>;

function hashPosition(x: number, y: number, z: number, cellSize: number): string {
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  const cz = Math.floor(z / cellSize);
  return `${cx},${cy},${cz}`;
}

function solveMinDistanceSpatialHash(
  particles: VerletParticle[],
  minDist: number,
  strength: number
): void {
  const cellSize = minDist * 2;
  const hash: SpatialHash = new Map();

  // Build spatial hash
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const key = hashPosition(p.position.x, p.position.y, p.position.z, cellSize);

    if (!hash.has(key)) {
      hash.set(key, []);
    }
    hash.get(key)!.push(i);
  }

  const minDistSq = minDist * minDist;

  // Check each particle against neighbors in adjacent cells
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    if (a.pinned) continue;

    const cx = Math.floor(a.position.x / cellSize);
    const cy = Math.floor(a.position.y / cellSize);
    const cz = Math.floor(a.position.z / cellSize);

    // Check 27 neighboring cells (3x3x3)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const neighbors = hash.get(key);
          if (!neighbors) continue;

          for (const j of neighbors) {
            if (j <= i) continue; // Avoid double-checking pairs

            const b = particles[j];
            const px = b.position.x - a.position.x;
            const py = b.position.y - a.position.y;
            const pz = b.position.z - a.position.z;

            const distSq = px * px + py * py + pz * pz;

            if (distSq < minDistSq && distSq > 0.000001) {
              const dist = Math.sqrt(distSq);
              const overlap = minDist - dist;
              const correction = (overlap / dist) * strength * 0.5;

              const ratioA = b.pinned ? 1 : 0.5;
              const ratioB = a.pinned ? 1 : 0.5;

              if (!a.pinned) {
                a.position.x -= px * correction * ratioA;
                a.position.y -= py * correction * ratioA;
                a.position.z -= pz * correction * ratioA;
              }

              if (!b.pinned) {
                b.position.x += px * correction * ratioB;
                b.position.y += py * correction * ratioB;
                b.position.z += pz * correction * ratioB;
              }
            }
          }
        }
      }
    }
  }
}

// Create distance constraints for particles along a finger chain
export function createChainConstraints(
  startIndex: number,
  count: number,
  restLength: number,
  stiffness: number = 0.8
): DistanceConstraint[] {
  const constraints: DistanceConstraint[] = [];

  for (let i = 0; i < count - 1; i++) {
    constraints.push({
      indexA: startIndex + i,
      indexB: startIndex + i + 1,
      restLength,
      stiffness,
    });
  }

  return constraints;
}

// Create grid-like constraints for palm particles
export function createGridConstraints(
  indices: number[],
  restLength: number,
  stiffness: number = 0.5
): DistanceConstraint[] {
  const constraints: DistanceConstraint[] = [];
  const n = indices.length;

  // Connect each particle to its k nearest neighbors
  // For small counts, this is simple enough
  const k = Math.min(3, n - 1);

  for (let i = 0; i < n; i++) {
    // Find k nearest (for simplicity, just use next k indices with wrapping)
    for (let j = 1; j <= k; j++) {
      const other = (i + j) % n;
      if (other > i) {
        // Avoid duplicates
        constraints.push({
          indexA: indices[i],
          indexB: indices[other],
          restLength,
          stiffness,
        });
      }
    }
  }

  return constraints;
}
