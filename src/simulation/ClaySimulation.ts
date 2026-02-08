// Clay Particle Simulation
// Extends Verlet/PBD with cohesion, surface tension, and center anchoring
// Designed for sculptable blob behavior

import type { Vec3 } from '../types';
import {
  type VerletParticle,
  createParticle,
  integrate,
  applyTargetConstraint,
  teleport,
} from './VerletParticle';
import { solveMinDistanceAll } from './Constraints';

// Clay simulation configuration
// See docs/art-direction-modes.md for mode-specific parameter recommendations
export type ClayConfig = {
  // Physics
  timestep: number;
  substeps: number;
  damping: number;

  // Blob shape
  blobRadius: number;          // Target radius of the blob (2x larger default)
  cohesionStrength: number;    // How strongly particles stay in blob [0, 1]
  surfaceTension: number;      // Pull outer particles inward [0, 1]
  centerAnchor: number;        // Weak spring to keep blob centered [0, 1]

  // Deformation memory
  restShapeAdaptRate: number;  // How fast rest shape updates [0, 1] - lower = more memory
  sculptRadius: number;        // Radius of sculpt influence (larger neighborhood)

  // Sculptural manipulation
  sculptStrength: number;      // How strongly neighbors follow grabbed particle [0, 1]
  sculptMemoryRate: number;    // How fast sculpted regions update rest positions [0, 1]

  // Refine tool (Scrape/Flatten)
  scrapeRadius: number;        // Radius of scrape influence [0.3, 1.5]
  scrapeStrength: number;      // How strongly scrape affects particles [0, 1]
  flattenRadius: number;       // Radius of flatten influence [0.3, 1.5]
  flattenStrength: number;     // How strongly flatten pushes to plane [0, 1]

  // Split/Merge
  splitDistance: number;       // Distance between grabs to trigger split [0.5, 2.0]
  mergeDistance: number;       // Distance for auto-merge [0.2, 0.8]
  interClusterCohesion: number; // Cohesion between clusters [0, 1] - 0 = fully split

  // Spacing
  minDistance: number;
  repulsionStrength: number;

  // Jitter (organic life)
  jitterAmplitude: number;     // Amplitude of coherent noise jitter [0, 0.01]
  jitterSpeed: number;         // Speed of jitter animation [0.5, 2.0]
};

const DEFAULT_CLAY_CONFIG: ClayConfig = {
  timestep: 1 / 60,
  substeps: 3,
  damping: 0.92,              // Slightly more damping for clay feel
  blobRadius: 1.2,            // 2x larger default
  cohesionStrength: 0.25,     // Softer cohesion for plasticity
  surfaceTension: 0.08,       // Reduced surface tension
  centerAnchor: 0.008,        // Very weak center anchor
  restShapeAdaptRate: 0.015,  // Slow rest shape adaptation = shape memory
  sculptRadius: 0.8,          // Large sculpt neighborhood
  sculptStrength: 0.6,        // Moderate neighbor influence
  sculptMemoryRate: 0.08,     // Fast local memory update during sculpt
  scrapeRadius: 0.6,          // Medium scrape area
  scrapeStrength: 0.4,        // Moderate scrape effect
  flattenRadius: 0.5,         // Medium flatten area
  flattenStrength: 0.5,       // Moderate flatten effect
  splitDistance: 1.5,         // Pull distance to trigger split
  mergeDistance: 0.4,         // Cluster proximity for auto-merge
  interClusterCohesion: 0.05, // Weak cohesion between clusters when split
  minDistance: 0.1,           // Larger spacing for bigger clay
  repulsionStrength: 0.45,
  jitterAmplitude: 0.002,     // Subtle organic movement
  jitterSpeed: 0.8,           // Moderate animation speed
};

// Sculpt state for local deformation (cached while grabbing)
export type SculptState = {
  neighbors: number[];          // Indices of particles within sculpt radius
  weights: number[];            // Influence weight per neighbor (smoothstep falloff)
  prevTarget: Vec3;             // Previous target for computing movement delta
};

// Pin constraint for pick-and-move with sculpt state
export type PinConstraint = {
  particleIndex: number;        // Index of the pinned particle
  target: Vec3;                 // Target position to follow
  stiffness: number;            // How strongly the particle follows [0, 1]
  sculptState: SculptState | null;  // Cached neighbors and weights for sculpt pull
};

// Cluster state for split/merge
export type ClayCluster = {
  id: number;
  center: Vec3;                 // Computed center of the cluster
  particleCount: number;        // Number of particles in this cluster
};

// Clay simulation state
export type ClaySimulation = {
  particles: VerletParticle[];
  restPositions: Vec3[];        // "Memory" positions that slowly adapt
  config: ClayConfig;
  center: Vec3;                 // Current blob center
  time: number;
  initialized: boolean;
  sculpting: boolean;           // True when actively being sculpted
  sculptCooldown: number;       // Frames since last sculpt
  // Pick-and-move state (per-hand)
  leftPinnedParticle: PinConstraint | null;
  rightPinnedParticle: PinConstraint | null;
  // Cluster state for split/merge
  clusterIds: number[];         // Cluster ID per particle
  clusters: ClayCluster[];      // Active clusters
  nextClusterId: number;        // Counter for generating new cluster IDs
  isSplit: boolean;             // True if clay is currently split
};

// Create clay simulation with particles in spherical arrangement
export function createClaySimulation(
  particleCount: number,
  center: Vec3 = { x: 0, y: 0, z: 0 },
  config: Partial<ClayConfig> = {}
): ClaySimulation {
  const fullConfig = { ...DEFAULT_CLAY_CONFIG, ...config };
  const particles: VerletParticle[] = [];

  // Distribute particles in a sphere using Fibonacci lattice
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < particleCount; i++) {
    // Fibonacci sphere distribution
    const t = i / (particleCount - 1);
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = goldenAngle * i;

    // Random radius variation for organic look (0.4 to 1.0 of blobRadius)
    const radiusVariation = 0.4 + Math.random() * 0.6;
    const r = fullConfig.blobRadius * radiusVariation;

    const x = center.x + r * Math.sin(inclination) * Math.cos(azimuth);
    const y = center.y + r * Math.sin(inclination) * Math.sin(azimuth);
    const z = center.z + r * Math.cos(inclination);

    particles.push(
      createParticle(
        { x, y, z },
        {
          damping: fullConfig.damping,
          targetStiffness: 0.02, // Very weak target following for plasticity
        }
      )
    );
  }

  // Initialize rest positions to match initial particle positions
  const restPositions: Vec3[] = particles.map((p) => ({
    x: p.position.x,
    y: p.position.y,
    z: p.position.z,
  }));

  // Initialize all particles in cluster 0
  const clusterIds = new Array(particleCount).fill(0);
  const clusters: ClayCluster[] = [{
    id: 0,
    center: { ...center },
    particleCount,
  }];

  return {
    particles,
    restPositions,
    config: fullConfig,
    center: { ...center },
    time: 0,
    initialized: true,
    sculpting: false,
    sculptCooldown: 0,
    leftPinnedParticle: null,
    rightPinnedParticle: null,
    clusterIds,
    clusters,
    nextClusterId: 1,
    isSplit: false,
  };
}

// Apply cohesion constraint (keep particles within blob radius)
function applyCohesion(sim: ClaySimulation): void {
  const { particles, config, clusterIds, clusters, isSplit } = sim;

  // Build a map of cluster centers for fast lookup
  const clusterCenters = new Map<number, Vec3>();
  for (const cluster of clusters) {
    clusterCenters.set(cluster.id, cluster.center);
  }

  // Cohesion: pull particles toward their cluster center
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i];
    if (particle.pinned) continue;

    // Get this particle's cluster center
    const clusterId = clusterIds[i];
    const clusterCenter = clusterCenters.get(clusterId) || sim.center;

    // Effective blob radius (smaller per cluster when split)
    const effectiveRadius = isSplit
      ? config.blobRadius * 0.7 // Smaller radius per cluster when split
      : config.blobRadius;

    const dx = particle.position.x - clusterCenter.x;
    const dy = particle.position.y - clusterCenter.y;
    const dz = particle.position.z - clusterCenter.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > effectiveRadius) {
      // Push particle back toward cluster boundary
      const excess = dist - effectiveRadius;
      const strength = config.cohesionStrength * Math.min(1, excess / effectiveRadius);
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      particle.position.x -= nx * excess * strength;
      particle.position.y -= ny * excess * strength;
      particle.position.z -= nz * excess * strength;
    }
  }
}

// Apply surface tension (pull outer particles inward slightly)
function applySurfaceTension(sim: ClaySimulation): void {
  const { particles, config, center } = sim;
  const innerRadius = config.blobRadius * 0.7;

  for (const particle of particles) {
    if (particle.pinned) continue;

    const dx = particle.position.x - center.x;
    const dy = particle.position.y - center.y;
    const dz = particle.position.z - center.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Only affect outer shell particles
    if (dist > innerRadius) {
      const shellRatio = (dist - innerRadius) / (config.blobRadius - innerRadius);
      const strength = config.surfaceTension * shellRatio * shellRatio;
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      // Pull inward
      particle.position.x -= nx * strength * 0.02;
      particle.position.y -= ny * strength * 0.02;
      particle.position.z -= nz * strength * 0.02;
    }
  }
}

// Apply center anchoring (weak spring to keep blob from drifting)
function applyCenterAnchor(sim: ClaySimulation): void {
  const { particles, config, center, isSplit } = sim;

  // When split, don't anchor clusters to center - let them move freely
  if (isSplit) return;

  // Calculate current centroid
  let cx = 0, cy = 0, cz = 0;
  for (const p of particles) {
    cx += p.position.x;
    cy += p.position.y;
    cz += p.position.z;
  }
  cx /= particles.length;
  cy /= particles.length;
  cz /= particles.length;

  // Apply correction toward target center
  const dx = center.x - cx;
  const dy = center.y - cy;
  const dz = center.z - cz;

  for (const particle of particles) {
    if (particle.pinned) continue;
    particle.position.x += dx * config.centerAnchor;
    particle.position.y += dy * config.centerAnchor;
    particle.position.z += dz * config.centerAnchor;
  }
}

// Update rest positions gradually (deformation memory)
function updateRestShape(sim: ClaySimulation): void {
  const { particles, restPositions, config, sculpting, sculptCooldown } = sim;

  // Only adapt rest shape when NOT actively sculpting
  // and after a cooldown period (allows shape to "set")
  if (sculpting || sculptCooldown < 10) return;

  const adaptRate = config.restShapeAdaptRate;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i].position;
    const r = restPositions[i];

    // Slowly move rest position toward current position
    r.x += (p.x - r.x) * adaptRate;
    r.y += (p.y - r.y) * adaptRate;
    r.z += (p.z - r.z) * adaptRate;
  }
}

// Apply soft pull toward rest positions (shape memory)
function applyRestShapeConstraint(sim: ClaySimulation): void {
  const { particles, restPositions } = sim;

  // Very gentle pull toward rest position (allows plastic deformation)
  const pullStrength = 0.02;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    const r = restPositions[i];
    const dx = r.x - p.position.x;
    const dy = r.y - p.position.y;
    const dz = r.z - p.position.z;

    p.position.x += dx * pullStrength;
    p.position.y += dy * pullStrength;
    p.position.z += dz * pullStrength;
  }
}

// Apply pin constraint (for pick-and-move)
function applyPinConstraint(sim: ClaySimulation, pin: PinConstraint | null): void {
  if (!pin) return;

  const particle = sim.particles[pin.particleIndex];
  if (!particle) return;

  // Move particle toward target with high stiffness
  const dx = pin.target.x - particle.position.x;
  const dy = pin.target.y - particle.position.y;
  const dz = pin.target.z - particle.position.z;

  particle.position.x += dx * pin.stiffness;
  particle.position.y += dy * pin.stiffness;
  particle.position.z += dz * pin.stiffness;
}

// Simple coherent noise using sine waves (cheaper than perlin)
// Returns value in [-1, 1]
function coherentNoise(seed: number, t: number, frequency: number): number {
  const phase1 = seed * 1.618033988749895;
  const phase2 = seed * 2.718281828459045;
  const phase3 = seed * 3.141592653589793;
  return (
    Math.sin(t * frequency + phase1) * 0.5 +
    Math.sin(t * frequency * 1.7 + phase2) * 0.3 +
    Math.sin(t * frequency * 2.3 + phase3) * 0.2
  );
}

// Smoothstep interpolation for falloff
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Compute sculpt state: find neighbors within radius and compute influence weights
function computeSculptState(
  sim: ClaySimulation,
  particleIndex: number,
  target: Vec3
): SculptState {
  const { particles, config } = sim;
  const grabbedPos = particles[particleIndex].position;
  const neighbors: number[] = [];
  const weights: number[] = [];

  for (let i = 0; i < particles.length; i++) {
    if (i === particleIndex) continue; // Skip the grabbed particle itself

    const p = particles[i].position;
    const dx = p.x - grabbedPos.x;
    const dy = p.y - grabbedPos.y;
    const dz = p.z - grabbedPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < config.sculptRadius) {
      // Compute influence weight using smoothstep falloff
      // Weight is 1.0 at center, 0.0 at sculptRadius
      const w = smoothstep(config.sculptRadius, 0, dist);
      // Square the weight for stronger locality (closer neighbors have much more influence)
      const wSquared = w * w;

      neighbors.push(i);
      weights.push(wSquared);
    }
  }

  return {
    neighbors,
    weights,
    prevTarget: { ...target },
  };
}

// Apply sculpt pull field: move neighbors based on grabbed particle movement
function applySculptPullField(
  sim: ClaySimulation,
  pin: PinConstraint | null
): void {
  if (!pin || !pin.sculptState) return;

  const { particles, config } = sim;
  const { sculptState } = pin;
  const { neighbors, weights, prevTarget } = sculptState;

  // Compute movement delta of the grabbed particle
  const delta = {
    x: pin.target.x - prevTarget.x,
    y: pin.target.y - prevTarget.y,
    z: pin.target.z - prevTarget.z,
  };

  // Skip if no significant movement
  const deltaLen = Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);
  if (deltaLen < 0.0001) return;

  // Maximum displacement per frame to prevent tearing
  const maxDisplacement = config.sculptRadius * 0.3;

  // Apply pull to each neighbor based on weight
  for (let i = 0; i < neighbors.length; i++) {
    const neighborIdx = neighbors[i];
    const w = weights[i];
    const particle = particles[neighborIdx];

    if (particle.pinned) continue;

    // Displacement = delta * weight * sculptStrength
    let dx = delta.x * w * config.sculptStrength;
    let dy = delta.y * w * config.sculptStrength;
    let dz = delta.z * w * config.sculptStrength;

    // Clamp displacement to prevent tearing
    const dispLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dispLen > maxDisplacement) {
      const scale = maxDisplacement / dispLen;
      dx *= scale;
      dy *= scale;
      dz *= scale;
    }

    // Apply additive pull (soft, not overwriting)
    particle.position.x += dx;
    particle.position.y += dy;
    particle.position.z += dz;
  }

  // Update prevTarget for next frame
  sculptState.prevTarget.x = pin.target.x;
  sculptState.prevTarget.y = pin.target.y;
  sculptState.prevTarget.z = pin.target.z;
}

// Apply two-hand sculpt: stretch/compress particles between grab points
function applyTwoHandSculpt(sim: ClaySimulation): void {
  const { leftPinnedParticle, rightPinnedParticle, particles, config } = sim;

  // Only apply if both hands are grabbing
  if (!leftPinnedParticle || !rightPinnedParticle) return;
  if (!leftPinnedParticle.sculptState || !rightPinnedParticle.sculptState) return;

  const leftTarget = leftPinnedParticle.target;
  const rightTarget = rightPinnedParticle.target;
  const leftPrev = leftPinnedParticle.sculptState.prevTarget;
  const rightPrev = rightPinnedParticle.sculptState.prevTarget;

  // Compute current and previous distance between hands
  const currentDist = Math.sqrt(
    (rightTarget.x - leftTarget.x) ** 2 +
    (rightTarget.y - leftTarget.y) ** 2 +
    (rightTarget.z - leftTarget.z) ** 2
  );
  const prevDist = Math.sqrt(
    (rightPrev.x - leftPrev.x) ** 2 +
    (rightPrev.y - leftPrev.y) ** 2 +
    (rightPrev.z - leftPrev.z) ** 2
  );

  // Skip if no significant change
  if (Math.abs(currentDist - prevDist) < 0.001 || prevDist < 0.001) return;

  // Compute stretch factor
  const stretchFactor = currentDist / prevDist;

  // Midpoint between the two grab targets
  const midpoint = {
    x: (leftTarget.x + rightTarget.x) / 2,
    y: (leftTarget.y + rightTarget.y) / 2,
    z: (leftTarget.z + rightTarget.z) / 2,
  };

  // Axis direction from left to right
  const axis = {
    x: rightTarget.x - leftTarget.x,
    y: rightTarget.y - leftTarget.y,
    z: rightTarget.z - leftTarget.z,
  };
  const axisLen = Math.sqrt(axis.x ** 2 + axis.y ** 2 + axis.z ** 2);
  if (axisLen < 0.001) return;
  axis.x /= axisLen;
  axis.y /= axisLen;
  axis.z /= axisLen;

  // Influence radius for two-hand sculpt (larger than single-hand)
  const twoHandRadius = Math.max(currentDist * 0.6, config.sculptRadius * 1.5);

  // Blend the influence from both sculpt states
  const leftNeighbors = new Set(leftPinnedParticle.sculptState.neighbors);
  const rightNeighbors = new Set(rightPinnedParticle.sculptState.neighbors);

  // Apply stretch/compress to all particles near the axis between hands
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Skip the grabbed particles themselves
    if (i === leftPinnedParticle.particleIndex || i === rightPinnedParticle.particleIndex) continue;

    // Vector from midpoint to particle
    const toP = {
      x: p.position.x - midpoint.x,
      y: p.position.y - midpoint.y,
      z: p.position.z - midpoint.z,
    };

    // Distance to midpoint
    const distToMid = Math.sqrt(toP.x ** 2 + toP.y ** 2 + toP.z ** 2);
    if (distToMid > twoHandRadius) continue;

    // Project onto axis to get position along stretch direction
    const alongAxis = toP.x * axis.x + toP.y * axis.y + toP.z * axis.z;

    // Distance perpendicular to axis (for influence falloff)
    const perpDist = Math.sqrt(distToMid ** 2 - alongAxis ** 2);

    // Influence based on perpendicular distance
    const influence = smoothstep(twoHandRadius, 0, perpDist);
    if (influence < 0.001) continue;

    // Check if this particle is a neighbor of either grab point (stronger influence)
    const isLeftNeighbor = leftNeighbors.has(i);
    const isRightNeighbor = rightNeighbors.has(i);
    const neighborBoost = (isLeftNeighbor || isRightNeighbor) ? 1.5 : 1.0;

    // Apply stretch along axis
    const stretchAmount = (stretchFactor - 1) * alongAxis * influence * neighborBoost * config.sculptStrength;

    p.position.x += axis.x * stretchAmount;
    p.position.y += axis.y * stretchAmount;
    p.position.z += axis.z * stretchAmount;
  }
}

// Update rest positions locally for sculpted region (deformation memory)
function updateLocalRestPositions(
  sim: ClaySimulation,
  pin: PinConstraint | null
): void {
  if (!pin || !pin.sculptState) return;

  const { particles, restPositions, config } = sim;
  const { sculptState } = pin;
  const { neighbors, weights } = sculptState;

  // Update rest position for grabbed particle
  const grabbedIdx = pin.particleIndex;
  const grabbedPos = particles[grabbedIdx].position;
  const grabbedRest = restPositions[grabbedIdx];
  grabbedRest.x += (grabbedPos.x - grabbedRest.x) * config.sculptMemoryRate;
  grabbedRest.y += (grabbedPos.y - grabbedRest.y) * config.sculptMemoryRate;
  grabbedRest.z += (grabbedPos.z - grabbedRest.z) * config.sculptMemoryRate;

  // Update rest positions for neighbors with weighted memory rate
  for (let i = 0; i < neighbors.length; i++) {
    const neighborIdx = neighbors[i];
    const w = weights[i];
    const pos = particles[neighborIdx].position;
    const rest = restPositions[neighborIdx];

    // Memory rate is proportional to influence weight
    const localMemoryRate = config.sculptMemoryRate * w;

    rest.x += (pos.x - rest.x) * localMemoryRate;
    rest.y += (pos.y - rest.y) * localMemoryRate;
    rest.z += (pos.z - rest.z) * localMemoryRate;
  }
}

// Apply organic jitter to particles
function applyJitter(sim: ClaySimulation, globalTime: number): void {
  const { particles, config, leftPinnedParticle, rightPinnedParticle } = sim;
  const { jitterAmplitude, jitterSpeed } = config;

  if (jitterAmplitude <= 0) return;

  const t = globalTime * jitterSpeed;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Reduce jitter for pinned particles (precise control)
    const isPinned =
      (leftPinnedParticle?.particleIndex === i) ||
      (rightPinnedParticle?.particleIndex === i);
    const amplitude = isPinned ? jitterAmplitude * 0.1 : jitterAmplitude;

    // Use particle index as seed for deterministic noise per particle
    const seed = i * 0.1;
    const nx = coherentNoise(seed, t, 1.0) * amplitude;
    const ny = coherentNoise(seed + 100, t, 1.1) * amplitude;
    const nz = coherentNoise(seed + 200, t, 0.9) * amplitude * 0.5; // Less z jitter

    p.position.x += nx;
    p.position.y += ny;
    p.position.z += nz;
  }
}

// Step the clay simulation
export function stepClay(sim: ClaySimulation, dt: number, globalTime: number = 0): void {
  if (!sim.initialized) return;

  const { config, particles } = sim;

  // Track sculpting cooldown
  const hasPin = sim.leftPinnedParticle || sim.rightPinnedParticle;
  if (sim.sculpting || hasPin) {
    sim.sculptCooldown = 0;
    sim.sculpting = false; // Reset each frame, set by sculpt functions
  } else {
    sim.sculptCooldown++;
  }

  // Fixed timestep with accumulator
  sim.time += dt;
  const steps = Math.min(Math.floor(sim.time / config.timestep), 4);
  sim.time -= steps * config.timestep;

  for (let s = 0; s < steps; s++) {
    // 1. Apply target constraint (if any external influence)
    for (const particle of particles) {
      applyTargetConstraint(particle);
    }

    // 2. Integrate
    for (const particle of particles) {
      integrate(particle, config.timestep);
    }

    // 3. Constraint solving
    for (let iter = 0; iter < config.substeps; iter++) {
      // Pin constraints FIRST (highest priority)
      applyPinConstraint(sim, sim.leftPinnedParticle);
      applyPinConstraint(sim, sim.rightPinnedParticle);

      // Sculpt pull field (neighbors follow grabbed particle)
      // Only on first substep to avoid over-pulling
      if (iter === 0) {
        applySculptPullField(sim, sim.leftPinnedParticle);
        applySculptPullField(sim, sim.rightPinnedParticle);
        // Two-hand sculpt: stretch/compress between grab points
        applyTwoHandSculpt(sim);
      }

      // Cohesion (keep in blob)
      applyCohesion(sim);

      // Surface tension
      applySurfaceTension(sim);

      // Soft rest shape constraint (shape memory)
      applyRestShapeConstraint(sim);

      // Minimum distance repulsion
      solveMinDistanceAll(particles, config.minDistance, config.repulsionStrength);

      // Center anchoring
      applyCenterAnchor(sim);
    }

    // Update local rest positions for sculpted regions (once per step, not per substep)
    updateLocalRestPositions(sim, sim.leftPinnedParticle);
    updateLocalRestPositions(sim, sim.rightPinnedParticle);
  }

  // Apply organic jitter (after constraints, before rendering)
  applyJitter(sim, globalTime);

  // Update rest shape gradually (deformation memory)
  updateRestShape(sim);

  // Update cluster centers (needed for cohesion and merge detection)
  if (sim.isSplit) {
    updateClusterCenters(sim);
    // Check for auto-merge if clusters are close enough
    checkAndApplyMerge(sim);
  }
}

// Apply sculpt force at a point (for pinch/grab gestures)
export function applySculptForce(
  sim: ClaySimulation,
  point: Vec3,
  force: Vec3,
  radius: number,
  strength: number
): void {
  sim.sculpting = true; // Mark as actively sculpting

  for (const particle of sim.particles) {
    if (particle.pinned) continue;

    const dx = particle.position.x - point.x;
    const dy = particle.position.y - point.y;
    const dz = particle.position.z - point.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < radius) {
      // Falloff from center of influence
      const falloff = 1 - (dist / radius);
      const influence = falloff * falloff * strength;

      particle.position.x += force.x * influence;
      particle.position.y += force.y * influence;
      particle.position.z += force.z * influence;
    }
  }
}

// Apply attraction toward a point (for pinch gesture)
export function applyAttraction(
  sim: ClaySimulation,
  point: Vec3,
  radius: number,
  strength: number
): void {
  sim.sculpting = true; // Mark as actively sculpting

  // Use larger radius from config for softer, more plastic feel
  const effectiveRadius = Math.max(radius, sim.config.sculptRadius);

  for (const particle of sim.particles) {
    if (particle.pinned) continue;

    const dx = point.x - particle.position.x;
    const dy = point.y - particle.position.y;
    const dz = point.z - particle.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < effectiveRadius && dist > 0.001) {
      // Softer falloff for more plastic feel
      const falloff = 1 - (dist / effectiveRadius);
      const influence = falloff * falloff * strength; // Quadratic falloff
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;

      particle.position.x += nx * influence;
      particle.position.y += ny * influence;
      particle.position.z += nz * influence;
    }
  }
}

// Apply squeeze (scale toward center)
export function applySqueeze(
  sim: ClaySimulation,
  scaleFactor: number
): void {
  sim.sculpting = true; // Mark as actively sculpting

  const { center, particles } = sim;

  for (const particle of particles) {
    if (particle.pinned) continue;

    const dx = particle.position.x - center.x;
    const dy = particle.position.y - center.y;
    const dz = particle.position.z - center.z;

    particle.position.x = center.x + dx * scaleFactor;
    particle.position.y = center.y + dy * scaleFactor;
    particle.position.z = center.z + dz * scaleFactor;
  }
}

// Apply scrape effect: tangential smoothing + directional drag
// Used by Refine tool for surface carving/smoothing strokes
export function applyScrape(
  sim: ClaySimulation,
  toolPos: Vec3,
  strokeDir: Vec3,      // Normalized direction of stroke movement
  strokeSpeed: number   // Magnitude of stroke movement
): void {
  sim.sculpting = true;

  const { particles, restPositions, config } = sim;
  const { scrapeRadius, scrapeStrength, sculptMemoryRate } = config;

  // Skip if no significant movement
  if (strokeSpeed < 0.001) return;

  // Maximum displacement per scrape to prevent instability
  const maxDisplacement = scrapeRadius * 0.15;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Distance from tool position
    const dx = p.position.x - toolPos.x;
    const dy = p.position.y - toolPos.y;
    const dz = p.position.z - toolPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= scrapeRadius) continue;

    // Smoothstep falloff (1 at center, 0 at edge)
    const t = dist / scrapeRadius;
    const falloff = 1 - t * t * (3 - 2 * t);

    // Two effects:
    // 1. Drag along stroke direction (tangential smoothing)
    const dragStrength = falloff * scrapeStrength * strokeSpeed * 0.5;

    // 2. Local averaging (Laplacian smoothing toward neighbors)
    // Compute local average position of nearby particles
    let avgX = 0, avgY = 0, avgZ = 0, neighborCount = 0;
    for (let j = 0; j < particles.length; j++) {
      if (j === i) continue;
      const other = particles[j];
      const odx = other.position.x - p.position.x;
      const ody = other.position.y - p.position.y;
      const odz = other.position.z - p.position.z;
      const oDist = Math.sqrt(odx * odx + ody * ody + odz * odz);
      if (oDist < config.minDistance * 3) {
        avgX += other.position.x;
        avgY += other.position.y;
        avgZ += other.position.z;
        neighborCount++;
      }
    }

    // Apply drag along stroke direction
    let moveX = strokeDir.x * dragStrength;
    let moveY = strokeDir.y * dragStrength;
    let moveZ = strokeDir.z * dragStrength;

    // Apply smoothing toward neighbors (subtle)
    if (neighborCount > 0) {
      avgX /= neighborCount;
      avgY /= neighborCount;
      avgZ /= neighborCount;
      const smoothStrength = falloff * scrapeStrength * 0.1;
      moveX += (avgX - p.position.x) * smoothStrength;
      moveY += (avgY - p.position.y) * smoothStrength;
      moveZ += (avgZ - p.position.z) * smoothStrength;
    }

    // Clamp total displacement
    const moveDist = Math.sqrt(moveX * moveX + moveY * moveY + moveZ * moveZ);
    if (moveDist > maxDisplacement) {
      const scale = maxDisplacement / moveDist;
      moveX *= scale;
      moveY *= scale;
      moveZ *= scale;
    }

    // Apply movement
    p.position.x += moveX;
    p.position.y += moveY;
    p.position.z += moveZ;

    // Update rest position for memory (weighted by falloff)
    const memoryRate = sculptMemoryRate * falloff;
    restPositions[i].x += (p.position.x - restPositions[i].x) * memoryRate;
    restPositions[i].y += (p.position.y - restPositions[i].y) * memoryRate;
    restPositions[i].z += (p.position.z - restPositions[i].z) * memoryRate;
  }
}

// Apply flatten effect: project particles onto a plane
// Used by Refine tool for press-to-flatten gesture
export function applyFlatten(
  sim: ClaySimulation,
  planeOrigin: Vec3,      // Point on the plane
  planeNormal: Vec3       // Normal direction of the plane (normalized)
): void {
  sim.sculpting = true;

  const { particles, restPositions, config } = sim;
  const { flattenRadius, flattenStrength, sculptMemoryRate } = config;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Distance from plane origin (for radius check)
    const dx = p.position.x - planeOrigin.x;
    const dy = p.position.y - planeOrigin.y;
    const dz = p.position.z - planeOrigin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= flattenRadius) continue;

    // Smoothstep falloff
    const t = dist / flattenRadius;
    const falloff = 1 - t * t * (3 - 2 * t);

    // Signed distance to plane
    const signedDist = dx * planeNormal.x + dy * planeNormal.y + dz * planeNormal.z;

    // Project partially toward plane (not full snap)
    const projectionStrength = falloff * flattenStrength;

    p.position.x -= planeNormal.x * signedDist * projectionStrength;
    p.position.y -= planeNormal.y * signedDist * projectionStrength;
    p.position.z -= planeNormal.z * signedDist * projectionStrength;

    // Update rest position for memory
    const memoryRate = sculptMemoryRate * falloff;
    restPositions[i].x += (p.position.x - restPositions[i].x) * memoryRate;
    restPositions[i].y += (p.position.y - restPositions[i].y) * memoryRate;
    restPositions[i].z += (p.position.z - restPositions[i].z) * memoryRate;
  }
}

// Apply carve effect: dig a groove along stroke direction
// Used by Refine tool with carve brush for creating channels/grooves
export function applyCarve(
  sim: ClaySimulation,
  toolPos: Vec3,
  strokeDir: Vec3,      // Normalized direction of stroke movement
  carveDepth: number    // How deep to carve
): void {
  sim.sculpting = true;

  const { particles, restPositions, config } = sim;
  const { scrapeRadius, sculptMemoryRate } = config;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Distance from tool position
    const dx = p.position.x - toolPos.x;
    const dy = p.position.y - toolPos.y;
    const dz = p.position.z - toolPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= scrapeRadius) continue;

    // Smoothstep falloff (1 at center, 0 at edge)
    const t = dist / scrapeRadius;
    const falloff = 1 - t * t * (3 - 2 * t);

    // Push particles perpendicular to stroke and away from center
    // This creates a V-shaped groove
    const perpDist = dist > 0.001 ? dist : 0.001;
    const pushX = (dx / perpDist) * falloff * carveDepth * (1 - t);
    const pushY = (dy / perpDist) * falloff * carveDepth * (1 - t);
    const pushZ = (dz / perpDist) * falloff * carveDepth * (1 - t);

    // Center particles get pushed down (into the surface)
    // Edge particles get pushed up (ridge formation)
    const centerPush = falloff * falloff * carveDepth * 0.5;

    p.position.x += pushX - strokeDir.x * centerPush;
    p.position.y += pushY - strokeDir.y * centerPush;
    p.position.z += pushZ - strokeDir.z * centerPush;

    // Update rest position for memory
    const memoryRate = sculptMemoryRate * falloff;
    restPositions[i].x += (p.position.x - restPositions[i].x) * memoryRate;
    restPositions[i].y += (p.position.y - restPositions[i].y) * memoryRate;
    restPositions[i].z += (p.position.z - restPositions[i].z) * memoryRate;
  }
}

// Apply stamp effect: circular imprint with subtle raised ridge
// Uses difference-of-Gaussians profile for premium "pressed seal" look
// Art direction: single curated stamp style for visual consistency
export function applyStamp(
  sim: ClaySimulation,
  toolPos: Vec3,
  pressNormal: Vec3,    // Direction to press (typically camera Z or palm normal)
  stampDepth: number    // How deep to stamp (positive = indent)
): void {
  sim.sculpting = true;

  const { particles, restPositions, config } = sim;
  const { scrapeRadius, sculptMemoryRate } = config;

  // Difference-of-Gaussians profile parameters
  // Creates dimple at center with subtle raised ridge at edge
  const SIGMA_INNER = 0.35;   // Inner dimple width (relative to radius)
  const SIGMA_OUTER = 0.75;   // Outer ridge width
  const RIDGE_RATIO = 0.2;    // Ridge height relative to dimple depth (subtle)

  // Memory multiplier for stamps (higher = more permanent)
  const STAMP_MEMORY_MULT = 2.0;
  // Maximum memory rate per frame to prevent runaway drift
  const MAX_MEMORY_RATE = 0.25;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Distance from tool position
    const dx = p.position.x - toolPos.x;
    const dy = p.position.y - toolPos.y;
    const dz = p.position.z - toolPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= scrapeRadius) continue;

    // Normalized distance
    const t = dist / scrapeRadius;

    // Difference of Gaussians profile:
    // Inner Gaussian (negative = indent) - sharp falloff
    const innerGauss = Math.exp(-(t / SIGMA_INNER) * (t / SIGMA_INNER));
    // Outer Gaussian (positive = ridge) - broader falloff
    const outerGauss = Math.exp(-(t / SIGMA_OUTER) * (t / SIGMA_OUTER));

    // Combined profile: -dimple + ridge
    // At center (t=0): profile ≈ -1 + 0.2 = -0.8 (indent)
    // At t≈0.5: inner drops off, outer still present = slight positive (ridge)
    // At edge (t=1): both near zero
    const profile = -innerGauss + RIDGE_RATIO * outerGauss;

    // Displacement along press normal
    // Positive profile = push outward (ridge), negative = push inward (dimple)
    const displacement = profile * stampDepth;

    p.position.x += pressNormal.x * displacement;
    p.position.y += pressNormal.y * displacement;
    p.position.z += pressNormal.z * displacement;

    // Update rest position for permanent imprint
    // Use absolute profile value for memory (both dimple and ridge should persist)
    const influence = Math.abs(profile);
    const memoryRate = Math.min(
      sculptMemoryRate * influence * STAMP_MEMORY_MULT,
      MAX_MEMORY_RATE
    );
    restPositions[i].x += (p.position.x - restPositions[i].x) * memoryRate;
    restPositions[i].y += (p.position.y - restPositions[i].y) * memoryRate;
    restPositions[i].z += (p.position.z - restPositions[i].z) * memoryRate;
  }
}

// Apply carve variant for flatten mode: indent center while flattening edges
// Creates a bowl-like depression
export function applyFlattenCarve(
  sim: ClaySimulation,
  planeOrigin: Vec3,
  planeNormal: Vec3,
  carveDepth: number
): void {
  sim.sculpting = true;

  const { particles, restPositions, config } = sim;
  const { flattenRadius, flattenStrength, sculptMemoryRate } = config;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Distance from plane origin
    const dx = p.position.x - planeOrigin.x;
    const dy = p.position.y - planeOrigin.y;
    const dz = p.position.z - planeOrigin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= flattenRadius) continue;

    // Smoothstep falloff
    const t = dist / flattenRadius;
    const falloff = 1 - t * t * (3 - 2 * t);

    // Signed distance to plane
    const signedDist = dx * planeNormal.x + dy * planeNormal.y + dz * planeNormal.z;

    // Flatten edges (normal behavior)
    const edgeFlatten = (1 - falloff) * flattenStrength;

    // Indent center (carve effect) - stronger at center
    const centerIndent = falloff * falloff * carveDepth;

    p.position.x -= planeNormal.x * (signedDist * edgeFlatten + centerIndent);
    p.position.y -= planeNormal.y * (signedDist * edgeFlatten + centerIndent);
    p.position.z -= planeNormal.z * (signedDist * edgeFlatten + centerIndent);

    // Update rest position for memory
    const memoryRate = sculptMemoryRate * falloff;
    restPositions[i].x += (p.position.x - restPositions[i].x) * memoryRate;
    restPositions[i].y += (p.position.y - restPositions[i].y) * memoryRate;
    restPositions[i].z += (p.position.z - restPositions[i].z) * memoryRate;
  }
}

// Apply stamp for flatten mode: circular imprint with subtle raised ridge
// Same visual language as applyStamp for consistency
// Combines flatten projection with stamp indentation
export function applyFlattenStamp(
  sim: ClaySimulation,
  planeOrigin: Vec3,
  planeNormal: Vec3,
  stampDepth: number
): void {
  sim.sculpting = true;

  const { particles, restPositions, config } = sim;
  const { flattenRadius, flattenStrength, sculptMemoryRate } = config;

  // Same DoG profile as applyStamp for visual consistency
  const SIGMA_INNER = 0.35;
  const SIGMA_OUTER = 0.75;
  const RIDGE_RATIO = 0.2;
  const STAMP_MEMORY_MULT = 2.0;
  const MAX_MEMORY_RATE = 0.25;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.pinned) continue;

    // Distance from plane origin
    const dx = p.position.x - planeOrigin.x;
    const dy = p.position.y - planeOrigin.y;
    const dz = p.position.z - planeOrigin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist >= flattenRadius) continue;

    // Normalized distance
    const t = dist / flattenRadius;

    // Difference of Gaussians profile (same as applyStamp)
    const innerGauss = Math.exp(-(t / SIGMA_INNER) * (t / SIGMA_INNER));
    const outerGauss = Math.exp(-(t / SIGMA_OUTER) * (t / SIGMA_OUTER));
    const profile = -innerGauss + RIDGE_RATIO * outerGauss;

    // Signed distance to plane (for flatten component)
    const signedDist = dx * planeNormal.x + dy * planeNormal.y + dz * planeNormal.z;

    // Two effects:
    // 1. Flatten: project toward plane (proportional to signed distance)
    // 2. Stamp: add DoG profile displacement

    // Flatten effect with profile-based falloff (stronger at center)
    const flattenInfluence = innerGauss * flattenStrength;
    const flattenDisp = signedDist * flattenInfluence;

    // Stamp effect (DoG profile)
    const stampDisp = profile * stampDepth;

    // Combined displacement along normal
    const totalDisp = flattenDisp + stampDisp;

    p.position.x -= planeNormal.x * totalDisp;
    p.position.y -= planeNormal.y * totalDisp;
    p.position.z -= planeNormal.z * totalDisp;

    // Update rest position for permanent imprint
    const influence = Math.max(innerGauss, Math.abs(profile));
    const memoryRate = Math.min(
      sculptMemoryRate * influence * STAMP_MEMORY_MULT,
      MAX_MEMORY_RATE
    );
    restPositions[i].x += (p.position.x - restPositions[i].x) * memoryRate;
    restPositions[i].y += (p.position.y - restPositions[i].y) * memoryRate;
    restPositions[i].z += (p.position.z - restPositions[i].z) * memoryRate;
  }
}

// === SPLIT / MERGE FUNCTIONS ===

// Check if two-hand grab should trigger a split
// Returns true if split occurred
export function checkAndApplySplit(
  sim: ClaySimulation,
  leftPos: Vec3 | null,
  rightPos: Vec3 | null
): boolean {
  if (!leftPos || !rightPos) return false;
  if (sim.leftPinnedParticle === null || sim.rightPinnedParticle === null) return false;

  // Calculate distance between grab points
  const dx = rightPos.x - leftPos.x;
  const dy = rightPos.y - leftPos.y;
  const dz = rightPos.z - leftPos.z;
  const grabDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Check if distance exceeds split threshold
  if (grabDist < sim.config.splitDistance) return false;

  // Already split - don't split again
  if (sim.isSplit) return false;

  // Perform split: divide particles based on which grab point is closer
  // Create a separating plane between the two grab points
  const midpoint = {
    x: (leftPos.x + rightPos.x) / 2,
    y: (leftPos.y + rightPos.y) / 2,
    z: (leftPos.z + rightPos.z) / 2,
  };

  // Plane normal from left to right
  const normalLen = grabDist;
  const planeNormal = {
    x: dx / normalLen,
    y: dy / normalLen,
    z: dz / normalLen,
  };

  // Assign particles to clusters based on which side of the plane they're on
  const newClusterId = sim.nextClusterId++;

  let cluster0Count = 0;
  let cluster1Count = 0;
  const cluster0Center = { x: 0, y: 0, z: 0 };
  const cluster1Center = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < sim.particles.length; i++) {
    const p = sim.particles[i].position;
    // Signed distance to plane
    const signedDist =
      (p.x - midpoint.x) * planeNormal.x +
      (p.y - midpoint.y) * planeNormal.y +
      (p.z - midpoint.z) * planeNormal.z;

    if (signedDist < 0) {
      // Left side - cluster 0
      sim.clusterIds[i] = 0;
      cluster0Center.x += p.x;
      cluster0Center.y += p.y;
      cluster0Center.z += p.z;
      cluster0Count++;
    } else {
      // Right side - new cluster
      sim.clusterIds[i] = newClusterId;
      cluster1Center.x += p.x;
      cluster1Center.y += p.y;
      cluster1Center.z += p.z;
      cluster1Count++;
    }
  }

  // Compute cluster centers
  if (cluster0Count > 0) {
    cluster0Center.x /= cluster0Count;
    cluster0Center.y /= cluster0Count;
    cluster0Center.z /= cluster0Count;
  }
  if (cluster1Count > 0) {
    cluster1Center.x /= cluster1Count;
    cluster1Center.y /= cluster1Count;
    cluster1Center.z /= cluster1Count;
  }

  // Update clusters array
  sim.clusters = [
    { id: 0, center: cluster0Center, particleCount: cluster0Count },
    { id: newClusterId, center: cluster1Center, particleCount: cluster1Count },
  ];

  sim.isSplit = true;
  return true;
}

// Check if clusters should auto-merge based on proximity
export function checkAndApplyMerge(sim: ClaySimulation): boolean {
  if (!sim.isSplit || sim.clusters.length < 2) return false;

  // Update cluster centers
  updateClusterCenters(sim);

  // Check distance between cluster centers
  const c0 = sim.clusters[0];
  const c1 = sim.clusters[1];

  const dx = c1.center.x - c0.center.x;
  const dy = c1.center.y - c0.center.y;
  const dz = c1.center.z - c0.center.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist > sim.config.mergeDistance) return false;

  // Merge: reassign all particles to cluster 0
  return forceMerge(sim);
}

// Force merge all clusters into one (called by UI or auto-merge)
export function forceMerge(sim: ClaySimulation): boolean {
  if (!sim.isSplit) return false;

  // Reassign all particles to cluster 0
  for (let i = 0; i < sim.clusterIds.length; i++) {
    sim.clusterIds[i] = 0;
  }

  // Reset to single cluster
  const center = { x: 0, y: 0, z: 0 };
  for (const p of sim.particles) {
    center.x += p.position.x;
    center.y += p.position.y;
    center.z += p.position.z;
  }
  center.x /= sim.particles.length;
  center.y /= sim.particles.length;
  center.z /= sim.particles.length;

  sim.clusters = [{
    id: 0,
    center,
    particleCount: sim.particles.length,
  }];

  sim.isSplit = false;
  return true;
}

// Update cluster centers based on particle positions
function updateClusterCenters(sim: ClaySimulation): void {
  const clusterSums = new Map<number, { x: number; y: number; z: number; count: number }>();

  // Initialize
  for (const cluster of sim.clusters) {
    clusterSums.set(cluster.id, { x: 0, y: 0, z: 0, count: 0 });
  }

  // Sum positions
  for (let i = 0; i < sim.particles.length; i++) {
    const clusterId = sim.clusterIds[i];
    const sum = clusterSums.get(clusterId);
    if (!sum) continue;

    const p = sim.particles[i].position;
    sum.x += p.x;
    sum.y += p.y;
    sum.z += p.z;
    sum.count++;
  }

  // Update centers
  for (const cluster of sim.clusters) {
    const sum = clusterSums.get(cluster.id);
    if (!sum || sum.count === 0) continue;

    cluster.center.x = sum.x / sum.count;
    cluster.center.y = sum.y / sum.count;
    cluster.center.z = sum.z / sum.count;
    cluster.particleCount = sum.count;
  }
}

// Check if two particles are in the same cluster
export function sameCluster(sim: ClaySimulation, i: number, j: number): boolean {
  return sim.clusterIds[i] === sim.clusterIds[j];
}

// Get split status for UI
export function isClaySplit(sim: ClaySimulation): boolean {
  return sim.isSplit;
}

// Get particle positions as Float32Array for rendering
export function getClayPositions(sim: ClaySimulation): Float32Array {
  const data = new Float32Array(sim.particles.length * 3);

  for (let i = 0; i < sim.particles.length; i++) {
    const p = sim.particles[i].position;
    data[i * 3] = p.x;
    data[i * 3 + 1] = p.y;
    data[i * 3 + 2] = p.z;
  }

  return data;
}

// Update clay config
export function updateClayConfig(
  sim: ClaySimulation,
  updates: Partial<ClayConfig>
): void {
  Object.assign(sim.config, updates);

  for (const particle of sim.particles) {
    particle.damping = sim.config.damping;
  }
}

// Move the clay center (for repositioning)
export function setClayCenter(sim: ClaySimulation, newCenter: Vec3): void {
  const dx = newCenter.x - sim.center.x;
  const dy = newCenter.y - sim.center.y;
  const dz = newCenter.z - sim.center.z;

  sim.center = { ...newCenter };

  // Move all particles and rest positions by the same offset
  for (let i = 0; i < sim.particles.length; i++) {
    const particle = sim.particles[i];
    particle.position.x += dx;
    particle.position.y += dy;
    particle.position.z += dz;
    particle.prevPosition.x += dx;
    particle.prevPosition.y += dy;
    particle.prevPosition.z += dz;
    particle.target.x += dx;
    particle.target.y += dy;
    particle.target.z += dz;

    // Also move rest positions
    sim.restPositions[i].x += dx;
    sim.restPositions[i].y += dy;
    sim.restPositions[i].z += dz;
  }
}

// === PICK-AND-MOVE FUNCTIONS ===

// Find nearest particle to a point within radius
export function findNearestParticle(
  sim: ClaySimulation,
  point: Vec3,
  maxRadius: number
): number | null {
  const { particles } = sim;
  let nearestIndex: number | null = null;
  let nearestDistSq = maxRadius * maxRadius;

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i].position;
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const dz = p.z - point.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearestIndex = i;
    }
  }

  return nearestIndex;
}

// Pin a particle for pick-and-move (left hand)
export function pinParticleLeft(
  sim: ClaySimulation,
  particleIndex: number,
  target: Vec3,
  stiffness: number = 0.8
): void {
  // Compute sculpt state (neighbors and weights) at grab start
  const sculptState = computeSculptState(sim, particleIndex, target);

  sim.leftPinnedParticle = {
    particleIndex,
    target: { ...target },
    stiffness,
    sculptState,
  };
  sim.sculpting = true;
}

// Pin a particle for pick-and-move (right hand)
export function pinParticleRight(
  sim: ClaySimulation,
  particleIndex: number,
  target: Vec3,
  stiffness: number = 0.8
): void {
  // Compute sculpt state (neighbors and weights) at grab start
  const sculptState = computeSculptState(sim, particleIndex, target);

  sim.rightPinnedParticle = {
    particleIndex,
    target: { ...target },
    stiffness,
    sculptState,
  };
  sim.sculpting = true;
}

// Update pin target position (left hand)
export function updatePinTargetLeft(sim: ClaySimulation, target: Vec3): void {
  if (sim.leftPinnedParticle) {
    sim.leftPinnedParticle.target.x = target.x;
    sim.leftPinnedParticle.target.y = target.y;
    sim.leftPinnedParticle.target.z = target.z;
    sim.sculpting = true;
  }
}

// Update pin target position (right hand)
export function updatePinTargetRight(sim: ClaySimulation, target: Vec3): void {
  if (sim.rightPinnedParticle) {
    sim.rightPinnedParticle.target.x = target.x;
    sim.rightPinnedParticle.target.y = target.y;
    sim.rightPinnedParticle.target.z = target.z;
    sim.sculpting = true;
  }
}

// Release pinned particle (left hand)
export function unpinParticleLeft(sim: ClaySimulation): void {
  sim.leftPinnedParticle = null;
}

// Release pinned particle (right hand)
export function unpinParticleRight(sim: ClaySimulation): void {
  sim.rightPinnedParticle = null;
}

// Get pinned particle index (for visual feedback)
export function getPinnedParticleLeft(sim: ClaySimulation): number | null {
  return sim.leftPinnedParticle?.particleIndex ?? null;
}

export function getPinnedParticleRight(sim: ClaySimulation): number | null {
  return sim.rightPinnedParticle?.particleIndex ?? null;
}

// Get sculpt state for visual feedback (neighbors and weights)
export function getSculptStateLeft(sim: ClaySimulation): SculptState | null {
  return sim.leftPinnedParticle?.sculptState ?? null;
}

export function getSculptStateRight(sim: ClaySimulation): SculptState | null {
  return sim.rightPinnedParticle?.sculptState ?? null;
}

// Reset clay to initial spherical shape
export function resetClay(sim: ClaySimulation): void {
  const { particles, restPositions, config, center } = sim;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < particles.length; i++) {
    const t = i / (particles.length - 1);
    const inclination = Math.acos(1 - 2 * t);
    const azimuth = goldenAngle * i;
    const radiusVariation = 0.4 + (i % 10) / 10 * 0.6; // Deterministic variation
    const r = config.blobRadius * radiusVariation;

    const x = center.x + r * Math.sin(inclination) * Math.cos(azimuth);
    const y = center.y + r * Math.sin(inclination) * Math.sin(azimuth);
    const z = center.z + r * Math.cos(inclination);

    teleport(particles[i], { x, y, z });

    // Also reset rest position
    restPositions[i].x = x;
    restPositions[i].y = y;
    restPositions[i].z = z;
  }

  // Reset sculpting state
  sim.sculpting = false;
  sim.sculptCooldown = 0;
}
