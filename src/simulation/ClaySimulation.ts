// Clay Particle Simulation
// Extends Verlet/PBD with cohesion, surface tension, and center anchoring
// Designed for sculptable blob behavior

import type { Vec3 } from '../types';
import {
  type VerletParticle,
  createParticle,
  integrate,
  applyTargetConstraint,
  setTarget,
  teleport,
} from './VerletParticle';
import { solveMinDistanceAll } from './Constraints';

// Clay simulation configuration
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

  // Spacing
  minDistance: number;
  repulsionStrength: number;
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
  minDistance: 0.1,           // Larger spacing for bigger clay
  repulsionStrength: 0.45,
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

  return {
    particles,
    restPositions,
    config: fullConfig,
    center: { ...center },
    time: 0,
    initialized: true,
    sculpting: false,
    sculptCooldown: 0,
  };
}

// Apply cohesion constraint (keep particles within blob radius)
function applyCohesion(sim: ClaySimulation): void {
  const { particles, config, center } = sim;

  for (const particle of particles) {
    if (particle.pinned) continue;

    const dx = particle.position.x - center.x;
    const dy = particle.position.y - center.y;
    const dz = particle.position.z - center.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > config.blobRadius) {
      // Push particle back toward blob boundary
      const excess = dist - config.blobRadius;
      const strength = config.cohesionStrength * Math.min(1, excess / config.blobRadius);
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
  const { particles, config, center } = sim;

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
  const { particles, restPositions, config } = sim;

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

// Step the clay simulation
export function stepClay(sim: ClaySimulation, dt: number): void {
  if (!sim.initialized) return;

  const { config, particles } = sim;

  // Track sculpting cooldown
  if (sim.sculpting) {
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
  }

  // Update rest shape gradually (deformation memory)
  updateRestShape(sim);
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
