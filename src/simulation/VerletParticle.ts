// Verlet particle representation
// Position-based dynamics for smooth, stable physics

import type { Vec3 } from '../types';

// Single Verlet particle state
export type VerletParticle = {
  // Current position
  position: Vec3;
  // Previous position (for Verlet integration)
  prevPosition: Vec3;
  // Accumulated forces this frame
  acceleration: Vec3;
  // Mass (affects force response)
  mass: number;
  // Damping factor [0, 1] - higher = more damping
  damping: number;
  // Whether particle is pinned (won't move)
  pinned: boolean;
  // Target position (for soft constraints)
  target: Vec3;
  // Target stiffness [0, 1]
  targetStiffness: number;
};

// Create a new Verlet particle at position
export function createParticle(
  position: Vec3,
  options: Partial<{
    mass: number;
    damping: number;
    pinned: boolean;
    targetStiffness: number;
  }> = {}
): VerletParticle {
  return {
    position: { ...position },
    prevPosition: { ...position },
    acceleration: { x: 0, y: 0, z: 0 },
    mass: options.mass ?? 1,
    damping: options.damping ?? 0.98,
    pinned: options.pinned ?? false,
    target: { ...position },
    targetStiffness: options.targetStiffness ?? 0.1,
  };
}

// Apply a force to a particle
export function applyForce(particle: VerletParticle, force: Vec3): void {
  if (particle.pinned) return;

  const invMass = 1 / particle.mass;
  particle.acceleration.x += force.x * invMass;
  particle.acceleration.y += force.y * invMass;
  particle.acceleration.z += force.z * invMass;
}

// Verlet integration step
export function integrate(particle: VerletParticle, dt: number): void {
  if (particle.pinned) {
    // Pinned particles stay at target
    particle.position.x = particle.target.x;
    particle.position.y = particle.target.y;
    particle.position.z = particle.target.z;
    particle.prevPosition.x = particle.target.x;
    particle.prevPosition.y = particle.target.y;
    particle.prevPosition.z = particle.target.z;
    return;
  }

  // Velocity = current - previous (implicit from Verlet)
  const vx = (particle.position.x - particle.prevPosition.x) * particle.damping;
  const vy = (particle.position.y - particle.prevPosition.y) * particle.damping;
  const vz = (particle.position.z - particle.prevPosition.z) * particle.damping;

  // Store current as previous
  particle.prevPosition.x = particle.position.x;
  particle.prevPosition.y = particle.position.y;
  particle.prevPosition.z = particle.position.z;

  // Update position: x += v + a*dt²
  const dtSq = dt * dt;
  particle.position.x += vx + particle.acceleration.x * dtSq;
  particle.position.y += vy + particle.acceleration.y * dtSq;
  particle.position.z += vz + particle.acceleration.z * dtSq;

  // Reset acceleration
  particle.acceleration.x = 0;
  particle.acceleration.y = 0;
  particle.acceleration.z = 0;
}

// Apply soft constraint toward target position
export function applyTargetConstraint(particle: VerletParticle): void {
  if (particle.pinned) return;

  const dx = particle.target.x - particle.position.x;
  const dy = particle.target.y - particle.position.y;
  const dz = particle.target.z - particle.position.z;

  particle.position.x += dx * particle.targetStiffness;
  particle.position.y += dy * particle.targetStiffness;
  particle.position.z += dz * particle.targetStiffness;
}

// Update target position (from hand tracking)
export function setTarget(particle: VerletParticle, target: Vec3): void {
  particle.target.x = target.x;
  particle.target.y = target.y;
  particle.target.z = target.z;
}

// Get velocity (implicit from position history)
export function getVelocity(particle: VerletParticle): Vec3 {
  return {
    x: particle.position.x - particle.prevPosition.x,
    y: particle.position.y - particle.prevPosition.y,
    z: particle.position.z - particle.prevPosition.z,
  };
}

// Get speed (magnitude of velocity)
export function getSpeed(particle: VerletParticle): number {
  const v = getVelocity(particle);
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

// Teleport particle to position (resets velocity)
export function teleport(particle: VerletParticle, position: Vec3): void {
  particle.position.x = position.x;
  particle.position.y = position.y;
  particle.position.z = position.z;
  particle.prevPosition.x = position.x;
  particle.prevPosition.y = position.y;
  particle.prevPosition.z = position.z;
  particle.target.x = position.x;
  particle.target.y = position.y;
  particle.target.z = position.z;
}
