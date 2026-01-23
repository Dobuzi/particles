// Particle Simulation System
// Combines Verlet integration with PBD constraints

import type { Vec3 } from '../types';
import {
  type VerletParticle,
  createParticle,
  integrate,
  applyTargetConstraint,
  setTarget,
  teleport,
} from './VerletParticle';
import {
  type DistanceConstraint,
  solveDistanceConstraint,
  solveMinDistanceAll,
} from './Constraints';

// Simulation configuration
export type SimulationConfig = {
  // Physics
  timestep: number;           // Fixed timestep for integration
  substeps: number;           // Constraint solver iterations per frame
  damping: number;            // Global velocity damping [0, 1]

  // Target following
  targetStiffness: number;    // How strongly particles follow targets [0, 1]

  // Spacing
  minDistance: number;        // Minimum distance between particles
  repulsionStrength: number;  // How strongly to enforce min distance [0, 1]

  // Constraints
  constraintStiffness: number; // Stiffness of structural constraints
};

const DEFAULT_CONFIG: SimulationConfig = {
  timestep: 1 / 60,
  substeps: 3,
  damping: 0.95,
  targetStiffness: 0.15,
  minDistance: 0.04,
  repulsionStrength: 0.6,
  constraintStiffness: 0.7,
};

// Main simulation state
export type ParticleSimulation = {
  particles: VerletParticle[];
  constraints: DistanceConstraint[];
  config: SimulationConfig;
  time: number;
  initialized: boolean;
};

// Create a new simulation
export function createSimulation(
  particleCount: number,
  config: Partial<SimulationConfig> = {}
): ParticleSimulation {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Create particles at origin (will be positioned by targets)
  const particles: VerletParticle[] = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(
      createParticle(
        { x: 0, y: 0, z: 0 },
        {
          damping: fullConfig.damping,
          targetStiffness: fullConfig.targetStiffness,
        }
      )
    );
  }

  return {
    particles,
    constraints: [],
    config: fullConfig,
    time: 0,
    initialized: false,
  };
}

// Initialize particle positions from targets (first frame)
export function initializePositions(
  sim: ParticleSimulation,
  targets: Vec3[]
): void {
  const count = Math.min(sim.particles.length, targets.length);

  for (let i = 0; i < count; i++) {
    teleport(sim.particles[i], targets[i]);
  }

  sim.initialized = true;
}

// Update all particle targets
export function updateTargets(
  sim: ParticleSimulation,
  targets: Vec3[]
): void {
  const count = Math.min(sim.particles.length, targets.length);

  for (let i = 0; i < count; i++) {
    setTarget(sim.particles[i], targets[i]);
  }

  // Initialize on first target update
  if (!sim.initialized && targets.length > 0) {
    initializePositions(sim, targets);
  }
}

// Step the simulation forward
export function step(sim: ParticleSimulation, dt: number): void {
  if (!sim.initialized) return;

  const { config, particles, constraints } = sim;

  // Use fixed timestep with accumulator for stability
  sim.time += dt;
  const steps = Math.min(Math.floor(sim.time / config.timestep), 4); // Cap to prevent spiral
  sim.time -= steps * config.timestep;

  for (let s = 0; s < steps; s++) {
    // 1. Apply target attraction (soft constraint)
    for (const particle of particles) {
      applyTargetConstraint(particle);
    }

    // 2. Integrate (Verlet)
    for (const particle of particles) {
      integrate(particle, config.timestep);
    }

    // 3. Solve constraints (PBD iterations)
    for (let iter = 0; iter < config.substeps; iter++) {
      // Distance constraints
      for (const constraint of constraints) {
        solveDistanceConstraint(particles, constraint);
      }

      // Minimum distance (repulsion)
      solveMinDistanceAll(
        particles,
        config.minDistance,
        config.repulsionStrength
      );
    }
  }
}

// Add structural constraints
export function addConstraints(
  sim: ParticleSimulation,
  constraints: DistanceConstraint[]
): void {
  sim.constraints.push(...constraints);
}

// Clear all constraints
export function clearConstraints(sim: ParticleSimulation): void {
  sim.constraints.length = 0;
}

// Get particle positions as Float32Array for GPU upload
export function getPositions(sim: ParticleSimulation): Float32Array {
  const data = new Float32Array(sim.particles.length * 3);

  for (let i = 0; i < sim.particles.length; i++) {
    const p = sim.particles[i].position;
    data[i * 3] = p.x;
    data[i * 3 + 1] = p.y;
    data[i * 3 + 2] = p.z;
  }

  return data;
}

// Get particle velocities as Float32Array
export function getVelocities(sim: ParticleSimulation): Float32Array {
  const data = new Float32Array(sim.particles.length * 3);

  for (let i = 0; i < sim.particles.length; i++) {
    const p = sim.particles[i];
    data[i * 3] = p.position.x - p.prevPosition.x;
    data[i * 3 + 1] = p.position.y - p.prevPosition.y;
    data[i * 3 + 2] = p.position.z - p.prevPosition.z;
  }

  return data;
}

// Update simulation config
export function updateConfig(
  sim: ParticleSimulation,
  updates: Partial<SimulationConfig>
): void {
  Object.assign(sim.config, updates);

  // Update particle properties that derive from config
  for (const particle of sim.particles) {
    particle.damping = sim.config.damping;
    particle.targetStiffness = sim.config.targetStiffness;
  }
}

// Resize simulation (add/remove particles)
export function resize(
  sim: ParticleSimulation,
  newCount: number
): void {
  const currentCount = sim.particles.length;

  if (newCount > currentCount) {
    // Add particles
    for (let i = currentCount; i < newCount; i++) {
      sim.particles.push(
        createParticle(
          { x: 0, y: 0, z: 0 },
          {
            damping: sim.config.damping,
            targetStiffness: sim.config.targetStiffness,
          }
        )
      );
    }
  } else if (newCount < currentCount) {
    // Remove particles
    sim.particles.length = newCount;

    // Remove constraints that reference removed particles
    sim.constraints = sim.constraints.filter(
      (c) => c.indexA < newCount && c.indexB < newCount
    );
  }
}

// Get simulation stats for debugging
export function getStats(sim: ParticleSimulation): {
  particleCount: number;
  constraintCount: number;
  avgSpeed: number;
} {
  let totalSpeed = 0;

  for (const p of sim.particles) {
    const vx = p.position.x - p.prevPosition.x;
    const vy = p.position.y - p.prevPosition.y;
    const vz = p.position.z - p.prevPosition.z;
    totalSpeed += Math.sqrt(vx * vx + vy * vy + vz * vz);
  }

  return {
    particleCount: sim.particles.length,
    constraintCount: sim.constraints.length,
    avgSpeed: sim.particles.length > 0 ? totalSpeed / sim.particles.length : 0,
  };
}
