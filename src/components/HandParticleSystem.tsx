// Unified hand particle system with skeleton-based distribution
// PRIMARY: Hand-form particles distributed along weighted bone structure
// SECONDARY: Thin streams connecting matching fingertips between hands
// Uses Verlet/PBD physics for smooth particle spacing

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Vec3, HandInfo, ParticleAssignment } from '../types';
import { flowVector } from '../utils/flowField';
import { vec3Lerp, xorshift32 } from '../utils/math';
import { HAND_SKELETON } from '../hand/HandSkeleton';
import { createStableDistribution, createLinkDistribution } from '../hand/ParticleDistribution';
import {
  createSimulation,
  updateTargets,
  step,
  getPositions,
  updateConfig,
  type ParticleSimulation,
} from '../simulation';

// Fingertip indices for inter-hand streams
const FINGERTIP_INDICES = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky

const VOLUME = 2.6;

// Simulation config
const SIM_CONFIG = {
  timestep: 1 / 60,
  substeps: 2,
  damping: 0.92,
  targetStiffness: 0.18,
  minDistance: 0.06,
  repulsionStrength: 0.5,
  constraintStiffness: 0.7,
};

type HandParticleSystemProps = {
  handsRef: React.MutableRefObject<HandInfo[]>;
  totalParticles: number;
  handStreamBalance: number; // 0 = all hand-form, 1 = all streams
  streamIntensity: number;   // 0-1 stream visibility
  showStreams: boolean;
  showLinks: boolean;         // Joint-link ribbon particles
  flowStrength: number;
  noiseStrength: number;
  colorIntensity: number;    // 0-1 color vibrancy
  paused: boolean;
  // === TUNING PARAMETERS ===
  depthExaggeration?: number;   // 0.5 = subtle, 1.0 = normal, 1.5 = dramatic
  spacingStiffness?: number;    // 0.3 = loose, 0.6 = normal, 1.0 = tight
  streamResponsiveness?: number; // 0.5 = sluggish, 1.0 = normal, 2.0 = reactive
  glowIntensity?: number;       // 0.0 = no glow, 0.5 = balanced, 1.0 = full glow
  particleSize?: number;        // 0.2 = tiny, 0.4 = normal, 0.8 = large
};

// Convert landmark to world coordinates (mirrored X for natural view)
const landmarkToWorld = (lm: Vec3, volume: number): Vec3 => ({
  x: (0.5 - lm.x) * 2 * volume,
  y: (0.5 - lm.y) * 2 * volume,
  z: (lm.z || 0) * volume * 0.6,
});

// Compute particle position from bone assignment and landmarks
// FIXED: Offsets are in normalized space (0.02-0.08), must scale to world space
const OFFSET_SCALE = VOLUME * 2;  // Scale factor to match world coordinates

const computeParticleTarget = (
  assignment: ParticleAssignment,
  landmarks: Vec3[]
): Vec3 => {
  const bone = HAND_SKELETON.bones[assignment.boneId];
  const start = landmarks[bone.startIdx];
  const end = landmarks[bone.endIdx];

  // Interpolate along bone
  const base = vec3Lerp(start, end, assignment.t);

  // Add perpendicular offset (scaled to world space)
  return {
    x: base.x + assignment.offset.x * OFFSET_SCALE,
    y: base.y + assignment.offset.y * OFFSET_SCALE,
    z: base.z + assignment.offset.z * OFFSET_SCALE,
  };
};

// Color mapping by region - unified pearl grey, brightness-only variation
// Both hands use same neutral palette for structural clarity
const getRegionColor = (region: string, isLeftHand: boolean): [number, number, number] => {
  // Subtle warm tint for left hand, cool tint for right (very subtle differentiation)
  const warmShift = isLeftHand ? 0.02 : -0.01;

  // Pearl grey base with region-based brightness
  switch (region) {
    case 'palm': return [0.72 + warmShift, 0.74, 0.78];        // Slightly darker interior
    case 'thumb': return [0.78 + warmShift, 0.80, 0.84];
    case 'proximal': return [0.76 + warmShift, 0.78, 0.82];    // Knuckles
    case 'intermediate': return [0.80 + warmShift, 0.82, 0.86];
    case 'distal': return [0.88 + warmShift, 0.90, 0.92];      // Brightest at tips
    default: return [0.78 + warmShift, 0.80, 0.84];
  }
};

export function HandParticleSystem({
  handsRef,
  totalParticles,
  handStreamBalance,
  streamIntensity,
  showStreams,
  showLinks,
  flowStrength,
  noiseStrength,
  colorIntensity,
  paused,
  depthExaggeration = 1.0,
  spacingStiffness = 0.6,
  streamResponsiveness = 1.0,
  glowIntensity = 0.5,
  particleSize = 0.4,
}: HandParticleSystemProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const frameRef = useRef(0);
  const simulationRef = useRef<ParticleSimulation | null>(null);

  // Calculate particle distribution
  const handFormRatio = 1 - handStreamBalance * 0.7;
  const handFormParticles = Math.floor(totalParticles * handFormRatio);
  const streamParticles = totalParticles - handFormParticles;
  const particlesPerHand = Math.floor(handFormParticles / 2);
  const particlesPerStream = showStreams ? Math.floor(streamParticles / 5) : 0;

  // Create skeleton-based particle distribution
  const {
    leftAssignments,
    rightAssignments,
    streamAssignments,
    leftLinkAssignments,
    rightLinkAssignments,
  } = useMemo(() => {
    // Use stable seeded distribution for each hand
    const left = createStableDistribution(particlesPerHand, 42);
    const right = createStableDistribution(particlesPerHand, 137);

    // Stream assignments (simple linear t along stream)
    const streams: Array<{ streamIdx: number; t: number }> = [];
    if (showStreams && particlesPerStream > 0) {
      for (let s = 0; s < 5; s++) {
        for (let p = 0; p < particlesPerStream; p++) {
          const t = (p + 0.5) / particlesPerStream + (Math.random() - 0.5) * 0.05;
          streams.push({ streamIdx: s, t: Math.max(0, Math.min(1, t)) });
        }
      }
    }

    // Link particles (joint-to-joint ribbons)
    const leftLinks = showLinks ? createLinkDistribution(3, 201) : [];
    const rightLinks = showLinks ? createLinkDistribution(3, 307) : [];

    return {
      leftAssignments: left,
      rightAssignments: right,
      streamAssignments: streams,
      leftLinkAssignments: leftLinks,
      rightLinkAssignments: rightLinks,
    };
  }, [particlesPerHand, particlesPerStream, showStreams, showLinks]);

  // Initialize particle buffers
  const {
    positions,
    colors,
    baseScales,
    renderScales,
    noiseSeeds,
    particleData, // Encodes: type (0=hand, 1=stream, 2=link) + region weight for contrast
  } = useMemo(() => {
    const total = particlesPerHand * 2 + streamAssignments.length + leftLinkAssignments.length + rightLinkAssignments.length;
    const positionsArray = new Float32Array(total * 3);
    const colorsArray = new Float32Array(total * 3);
    const baseScalesArray = new Float32Array(total);
    const renderScalesArray = new Float32Array(total);
    const seedsArray = new Uint32Array(total);
    const particleDataArray = new Float32Array(total * 2); // [type, regionWeight]

    let idx = 0;

    // Region weight for luminance contrast (palm=darker, distal=brighter)
    const getRegionWeight = (region: string): number => {
      switch (region) {
        case 'palm': return 0.75;       // Darkest - interior mass
        case 'thumb': return 0.85;
        case 'proximal': return 0.82;   // Finger bases slightly dark
        case 'intermediate': return 0.90;
        case 'distal': return 1.0;      // Brightest - fingertips
        default: return 0.85;
      }
    };

    // Left hand particles
    for (const assignment of leftAssignments) {
      const i3 = idx * 3;
      const i2 = idx * 2;
      positionsArray[i3] = 0;
      positionsArray[i3 + 1] = 0;
      positionsArray[i3 + 2] = 0;

      // Color by region
      const [r, g, b] = getRegionColor(assignment.region, true);
      colorsArray[i3] = r;
      colorsArray[i3 + 1] = g;
      colorsArray[i3 + 2] = b;

      // Scale varies by region (palm larger, distal smaller)
      const regionScale = assignment.region === 'palm' ? 1.1 :
                         assignment.region === 'distal' ? 0.7 : 0.9;
      baseScalesArray[idx] = (0.7 + Math.random() * 0.4) * regionScale;
      renderScalesArray[idx] = baseScalesArray[idx];
      seedsArray[idx] = (Math.random() * 0xffffffff) >>> 0;

      // Particle data: [type=0 (hand), regionWeight]
      particleDataArray[i2] = 0.0;  // Hand-form particle
      particleDataArray[i2 + 1] = getRegionWeight(assignment.region);
      idx++;
    }

    // Right hand particles
    for (const assignment of rightAssignments) {
      const i3 = idx * 3;
      const i2 = idx * 2;
      positionsArray[i3] = 0;
      positionsArray[i3 + 1] = 0;
      positionsArray[i3 + 2] = 0;

      const [r, g, b] = getRegionColor(assignment.region, false);
      colorsArray[i3] = r;
      colorsArray[i3 + 1] = g;
      colorsArray[i3 + 2] = b;

      const regionScale = assignment.region === 'palm' ? 1.1 :
                         assignment.region === 'distal' ? 0.7 : 0.9;
      baseScalesArray[idx] = (0.7 + Math.random() * 0.4) * regionScale;
      renderScalesArray[idx] = baseScalesArray[idx];
      seedsArray[idx] = (Math.random() * 0xffffffff) >>> 0;

      // Particle data: [type=0 (hand), regionWeight]
      particleDataArray[i2] = 0.0;
      particleDataArray[i2 + 1] = getRegionWeight(assignment.region);
      idx++;
    }

    // Stream particles
    for (const stream of streamAssignments) {
      const i3 = idx * 3;
      const i2 = idx * 2;
      positionsArray[i3] = 0;
      positionsArray[i3 + 1] = 0;
      positionsArray[i3 + 2] = 0;

      // Warm cream accent for all streams (unified, not rainbow)
      const streamBrightness = 0.85 + (stream.streamIdx / 5) * 0.1; // Slight variation
      const r = 0.95 * streamBrightness;
      const g = 0.88 * streamBrightness;
      const b = 0.75 * streamBrightness;
      colorsArray[i3] = r;
      colorsArray[i3 + 1] = g;
      colorsArray[i3 + 2] = b;

      baseScalesArray[idx] = 0.4 + Math.random() * 0.25;
      renderScalesArray[idx] = baseScalesArray[idx];
      seedsArray[idx] = (Math.random() * 0xffffffff) >>> 0;

      // Particle data: [type=1 (stream), regionWeight=1.0 (bright)]
      particleDataArray[i2] = 1.0;  // Stream particle
      particleDataArray[i2 + 1] = 1.0;
      idx++;
    }

    // Left hand link particles (joint ribbons)
    for (const link of leftLinkAssignments) {
      const i3 = idx * 3;
      const i2 = idx * 2;
      positionsArray[i3] = 0;
      positionsArray[i3 + 1] = 0;
      positionsArray[i3 + 2] = 0;

      // Same color as hand but slightly desaturated
      const [r, g, b] = getRegionColor(link.region, true);
      colorsArray[i3] = r * 0.85;
      colorsArray[i3 + 1] = g * 0.85;
      colorsArray[i3 + 2] = b * 0.85;

      // Link particles are smaller
      baseScalesArray[idx] = 0.35 + Math.random() * 0.15;
      renderScalesArray[idx] = baseScalesArray[idx];
      seedsArray[idx] = (Math.random() * 0xffffffff) >>> 0;

      // Particle data: [type=2 (link), regionWeight]
      particleDataArray[i2] = 2.0;  // Link particle
      particleDataArray[i2 + 1] = getRegionWeight(link.region) * 0.9;
      idx++;
    }

    // Right hand link particles
    for (const link of rightLinkAssignments) {
      const i3 = idx * 3;
      const i2 = idx * 2;
      positionsArray[i3] = 0;
      positionsArray[i3 + 1] = 0;
      positionsArray[i3 + 2] = 0;

      const [r, g, b] = getRegionColor(link.region, false);
      colorsArray[i3] = r * 0.85;
      colorsArray[i3 + 1] = g * 0.85;
      colorsArray[i3 + 2] = b * 0.85;

      baseScalesArray[idx] = 0.35 + Math.random() * 0.15;
      renderScalesArray[idx] = baseScalesArray[idx];
      seedsArray[idx] = (Math.random() * 0xffffffff) >>> 0;

      particleDataArray[i2] = 2.0;  // Link particle
      particleDataArray[i2 + 1] = getRegionWeight(link.region) * 0.9;
      idx++;
    }

    return {
      positions: positionsArray,
      colors: colorsArray,
      baseScales: baseScalesArray,
      renderScales: renderScalesArray,
      noiseSeeds: seedsArray,
      particleData: particleDataArray,
    };
  }, [leftAssignments, rightAssignments, streamAssignments, leftLinkAssignments, rightLinkAssignments]);

  // Actual particle count
  const actualParticleCount = particlesPerHand * 2 + streamAssignments.length + leftLinkAssignments.length + rightLinkAssignments.length;

  // Initialize or resize simulation
  useEffect(() => {
    if (!simulationRef.current) {
      simulationRef.current = createSimulation(actualParticleCount, SIM_CONFIG);
    } else if (simulationRef.current.particles.length !== actualParticleCount) {
      // Recreate simulation on resize
      simulationRef.current = createSimulation(actualParticleCount, SIM_CONFIG);
    }
  }, [actualParticleCount]);

  // Update simulation config when settings change
  useEffect(() => {
    if (simulationRef.current) {
      updateConfig(simulationRef.current, {
        damping: 0.9 + (1 - flowStrength) * 0.08,
        targetStiffness: 0.12 + noiseStrength * 0.08,
        // Spacing stiffness affects both min distance and repulsion
        minDistance: 0.04 + spacingStiffness * 0.04,  // 0.04-0.08
        repulsionStrength: 0.3 + spacingStiffness * 0.5, // 0.3-0.8
      });
    }
  }, [flowStrength, noiseStrength, spacingStiffness]);

  // Smoothed hand landmarks with memory
  const smoothedLeftRef = useRef<Vec3[] | null>(null);
  const smoothedRightRef = useRef<Vec3[] | null>(null);
  const leftPresenceRef = useRef(0);
  const rightPresenceRef = useRef(0);

  // Last known good landmarks (for graceful degradation)
  const lastGoodLeftRef = useRef<Vec3[] | null>(null);
  const lastGoodRightRef = useRef<Vec3[] | null>(null);
  const leftLostFramesRef = useRef(0);
  const rightLostFramesRef = useRef(0);

  // Per-stream state for soft transitions and distance-based intensity
  const streamPresenceRef = useRef<Float32Array>(new Float32Array(5)); // One per finger
  const streamDistancesRef = useRef<Float32Array>(new Float32Array(5));

  useFrame(({ clock }, delta) => {
    if (paused) return;
    frameRef.current += 1;

    const geometry = geometryRef.current;
    const material = materialRef.current;
    const sim = simulationRef.current;
    if (!geometry || !material || !sim) return;

    const time = clock.getElapsedTime() * 1000;
    const hands = handsRef.current;

    // Find left and right hands
    let leftHand: HandInfo | null = null;
    let rightHand: HandInfo | null = null;
    for (const hand of hands) {
      if (hand.handedness === 'Left' && !leftHand) leftHand = hand;
      else if (hand.handedness === 'Right' && !rightHand) rightHand = hand;
      else if (!leftHand) leftHand = hand;
      else if (!rightHand) rightHand = hand;
    }

    // === ROBUST LANDMARK PROCESSING ===
    // Velocity-clamped smoothing with jitter rejection and memory
    const smoothAlpha = 0.35;         // Base smoothing
    const maxVelocity = 0.4;          // Max plausible landmark velocity per frame
    const presenceGainSpeed = 0.10;   // Faster recovery
    const presenceLossSpeed = 0.04;   // Slower decay (hysteresis)
    const memoryDecayFrames = 30;     // Frames before memory fades

    // Helper: velocity-clamped lerp (rejects jitter spikes)
    const clampedLerp = (prev: Vec3, next: Vec3, alpha: number): Vec3 => {
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const dz = next.z - prev.z;
      const velocity = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // If velocity is unrealistically high, dampen the lerp
      const clampedAlpha = velocity > maxVelocity
        ? alpha * (maxVelocity / velocity) * 0.5  // Reject jitter
        : alpha;

      return vec3Lerp(prev, next, clampedAlpha);
    };

    // === LEFT HAND ===
    if (leftHand) {
      const worldLandmarks = leftHand.landmarks.map((lm) => landmarkToWorld(lm, VOLUME));

      if (smoothedLeftRef.current) {
        // Velocity-clamped smoothing
        smoothedLeftRef.current = worldLandmarks.map((lm, i) =>
          clampedLerp(smoothedLeftRef.current![i], lm, smoothAlpha)
        );
      } else {
        smoothedLeftRef.current = worldLandmarks;
      }

      // Update memory
      lastGoodLeftRef.current = smoothedLeftRef.current.map((lm) => ({ ...lm }));
      leftLostFramesRef.current = 0;

      // Presence recovery (fast)
      leftPresenceRef.current = Math.min(1, leftPresenceRef.current + presenceGainSpeed);
    } else {
      // Hand lost - use memory with decay
      leftLostFramesRef.current++;

      if (lastGoodLeftRef.current && leftLostFramesRef.current < memoryDecayFrames) {
        // Keep using last known landmarks (particles hold position briefly)
        smoothedLeftRef.current = lastGoodLeftRef.current;
      }

      // Presence decay (slow for graceful fade)
      leftPresenceRef.current = Math.max(0, leftPresenceRef.current - presenceLossSpeed);
    }

    // === RIGHT HAND ===
    if (rightHand) {
      const worldLandmarks = rightHand.landmarks.map((lm) => landmarkToWorld(lm, VOLUME));

      if (smoothedRightRef.current) {
        smoothedRightRef.current = worldLandmarks.map((lm, i) =>
          clampedLerp(smoothedRightRef.current![i], lm, smoothAlpha)
        );
      } else {
        smoothedRightRef.current = worldLandmarks;
      }

      lastGoodRightRef.current = smoothedRightRef.current.map((lm) => ({ ...lm }));
      rightLostFramesRef.current = 0;
      rightPresenceRef.current = Math.min(1, rightPresenceRef.current + presenceGainSpeed);
    } else {
      rightLostFramesRef.current++;

      if (lastGoodRightRef.current && rightLostFramesRef.current < memoryDecayFrames) {
        smoothedRightRef.current = lastGoodRightRef.current;
      }

      rightPresenceRef.current = Math.max(0, rightPresenceRef.current - presenceLossSpeed);
    }

    const leftLandmarks = smoothedLeftRef.current;
    const rightLandmarks = smoothedRightRef.current;
    const leftPresence = leftPresenceRef.current;
    const rightPresence = rightPresenceRef.current;

    const noiseScale = noiseStrength * 0.0006;
    const flowScale = flowStrength * 0.0004;

    // Build targets array for simulation
    const targets: Vec3[] = [];
    let idx = 0;

    // Left hand particle targets
    for (const assignment of leftAssignments) {
      if (leftLandmarks && leftPresence > 0.01) {
        targets.push(computeParticleTarget(assignment, leftLandmarks));
      } else {
        // Drift toward origin when no hand
        targets.push({
          x: positions[idx * 3] * 0.97,
          y: positions[idx * 3 + 1] * 0.97,
          z: positions[idx * 3 + 2] * 0.97,
        });
      }
      idx++;
    }

    // Right hand particle targets
    for (const assignment of rightAssignments) {
      if (rightLandmarks && rightPresence > 0.01) {
        targets.push(computeParticleTarget(assignment, rightLandmarks));
      } else {
        targets.push({
          x: positions[idx * 3] * 0.97,
          y: positions[idx * 3 + 1] * 0.97,
          z: positions[idx * 3 + 2] * 0.97,
        });
      }
      idx++;
    }

    // === STREAM DISTANCE & PRESENCE CALCULATION ===
    // Update per-stream state before building targets
    const streamPresence = streamPresenceRef.current;
    const streamDistances = streamDistancesRef.current;
    const bothHandsActive = leftLandmarks && rightLandmarks && leftPresence > 0.2 && rightPresence > 0.2;

    for (let s = 0; s < 5; s++) {
      if (bothHandsActive) {
        const fingerIdx = FINGERTIP_INDICES[s];
        const leftTip = leftLandmarks![fingerIdx];
        const rightTip = rightLandmarks![fingerIdx];

        // Calculate fingertip distance
        const dx = rightTip.x - leftTip.x;
        const dy = rightTip.y - leftTip.y;
        const dz = rightTip.z - leftTip.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        streamDistances[s] = distance;

        // Distance-based target presence:
        // Close (< 0.3) = full intensity, Far (> 1.5) = minimal
        const distanceFactor = 1 - Math.min(1, Math.max(0, (distance - 0.3) / 1.2));
        const targetPresence = distanceFactor * Math.min(leftPresence, rightPresence);

        // Smooth wake-up (faster) and sleep (slower) transitions
        // Responsiveness multiplier: 0.5 = sluggish, 1.0 = normal, 2.0 = snappy
        const wakeSpeed = 0.12 * streamResponsiveness;
        const sleepSpeed = 0.06 * streamResponsiveness;
        const speed = targetPresence > streamPresence[s] ? wakeSpeed : sleepSpeed;
        streamPresence[s] += (targetPresence - streamPresence[s]) * speed;
      } else {
        // Gracefully fade out when hands separate
        streamPresence[s] *= 0.94;
        streamDistances[s] = 999; // Mark as inactive
      }
    }

    // Stream particle targets
    for (const stream of streamAssignments) {
      const fingerIdx = FINGERTIP_INDICES[stream.streamIdx];

      if (bothHandsActive && streamPresence[stream.streamIdx] > 0.01) {
        const leftTip = leftLandmarks![fingerIdx];
        const rightTip = rightLandmarks![fingerIdx];
        targets.push(vec3Lerp(leftTip, rightTip, stream.t));
      } else {
        targets.push({
          x: positions[idx * 3] * 0.97,
          y: positions[idx * 3 + 1] * 0.97,
          z: positions[idx * 3 + 2] * 0.97,
        });
      }
      idx++;
    }

    // Left hand link particle targets (joint ribbons)
    for (const link of leftLinkAssignments) {
      if (leftLandmarks && leftPresence > 0.01) {
        const bone = HAND_SKELETON.bones[link.boneId];
        const start = leftLandmarks[bone.startIdx];
        const end = leftLandmarks[bone.endIdx];
        targets.push(vec3Lerp(start, end, link.t));
      } else {
        targets.push({
          x: positions[idx * 3] * 0.97,
          y: positions[idx * 3 + 1] * 0.97,
          z: positions[idx * 3 + 2] * 0.97,
        });
      }
      idx++;
    }

    // Right hand link particle targets
    for (const link of rightLinkAssignments) {
      if (rightLandmarks && rightPresence > 0.01) {
        const bone = HAND_SKELETON.bones[link.boneId];
        const start = rightLandmarks[bone.startIdx];
        const end = rightLandmarks[bone.endIdx];
        targets.push(vec3Lerp(start, end, link.t));
      } else {
        targets.push({
          x: positions[idx * 3] * 0.97,
          y: positions[idx * 3 + 1] * 0.97,
          z: positions[idx * 3 + 2] * 0.97,
        });
      }
      idx++;
    }

    // Update simulation targets and step physics
    updateTargets(sim, targets);
    step(sim, Math.min(delta, 0.05)); // Cap delta to prevent instability

    // Copy simulation positions to render buffer with flow/noise
    const simPositions = getPositions(sim);
    idx = 0;

    // Update left hand particles
    for (let _i = 0; _i < leftAssignments.length; _i++) {
      const i3 = idx * 3;
      const presence = leftPresence;

      // Get simulated position
      let px = simPositions[i3];
      let py = simPositions[i3 + 1];
      let pz = simPositions[i3 + 2];

      // Add flow field influence
      const flow = flowVector(px, py, pz, time);
      px += flow.x * flowScale * 0.5;
      py += flow.y * flowScale * 0.5;
      pz += flow.z * flowScale * 0.5;

      // Add noise
      let seed = noiseSeeds[idx];
      seed = xorshift32(seed);
      px += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale;
      seed = xorshift32(seed);
      py += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale;
      seed = xorshift32(seed);
      pz += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale;
      noiseSeeds[idx] = seed;

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      renderScales[idx] = baseScales[idx] * presence;
      idx++;
    }

    // Update right hand particles
    for (let _i = 0; _i < rightAssignments.length; _i++) {
      const i3 = idx * 3;
      const presence = rightPresence;

      let px = simPositions[i3];
      let py = simPositions[i3 + 1];
      let pz = simPositions[i3 + 2];

      const flow = flowVector(px, py, pz, time);
      px += flow.x * flowScale * 0.5;
      py += flow.y * flowScale * 0.5;
      pz += flow.z * flowScale * 0.5;

      let seed = noiseSeeds[idx];
      seed = xorshift32(seed);
      px += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale;
      seed = xorshift32(seed);
      py += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale;
      seed = xorshift32(seed);
      pz += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale;
      noiseSeeds[idx] = seed;

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      renderScales[idx] = baseScales[idx] * presence;
      idx++;
    }

    // Update stream particles with distance-based intensity
    for (const stream of streamAssignments) {
      const i3 = idx * 3;
      const streamIdx = stream.streamIdx;

      // Use per-stream presence (already smoothed, distance-aware)
      const streamPres = streamPresence[streamIdx];
      const distance = streamDistances[streamIdx];
      const presence = streamPres * streamIntensity;

      let px = simPositions[i3];
      let py = simPositions[i3 + 1];
      let pz = simPositions[i3 + 2];

      // Flow field (reduced for streams)
      const flow = flowVector(px, py, pz, time);
      px += flow.x * flowScale * 0.25;
      py += flow.y * flowScale * 0.25;
      pz += flow.z * flowScale * 0.25;

      // Distance-reactive noise: closer fingers = calmer stream
      // Far fingers = more turbulent (anticipation effect)
      const distanceNoiseFactor = distance < 999
        ? 0.3 + Math.min(1, distance / 1.5) * 0.7  // 0.3 (close) to 1.0 (far)
        : 0.5;

      let seed = noiseSeeds[idx];
      seed = xorshift32(seed);
      px += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale * distanceNoiseFactor;
      seed = xorshift32(seed);
      py += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale * distanceNoiseFactor;
      seed = xorshift32(seed);
      pz += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale * distanceNoiseFactor * 0.5;
      noiseSeeds[idx] = seed;

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      // Scale modulation: closer = slightly larger particles (more "solid" stream)
      const distanceScaleFactor = distance < 999
        ? 1.0 + (1 - Math.min(1, distance / 1.0)) * 0.3  // Up to 30% larger when close
        : 1.0;

      renderScales[idx] = baseScales[idx] * presence * distanceScaleFactor;
      idx++;
    }

    // Update left hand link particles
    for (let _i = 0; _i < leftLinkAssignments.length; _i++) {
      const i3 = idx * 3;
      const presence = leftPresence;

      let px = simPositions[i3];
      let py = simPositions[i3 + 1];
      let pz = simPositions[i3 + 2];

      // Minimal flow for links (they're structural)
      const flow = flowVector(px, py, pz, time);
      px += flow.x * flowScale * 0.15;
      py += flow.y * flowScale * 0.15;
      pz += flow.z * flowScale * 0.15;

      // Minimal noise
      let seed = noiseSeeds[idx];
      seed = xorshift32(seed);
      px += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale * 0.3;
      seed = xorshift32(seed);
      py += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale * 0.3;
      noiseSeeds[idx] = seed;

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      renderScales[idx] = baseScales[idx] * presence;
      idx++;
    }

    // Update right hand link particles
    for (let _i = 0; _i < rightLinkAssignments.length; _i++) {
      const i3 = idx * 3;
      const presence = rightPresence;

      let px = simPositions[i3];
      let py = simPositions[i3 + 1];
      let pz = simPositions[i3 + 2];

      const flow = flowVector(px, py, pz, time);
      px += flow.x * flowScale * 0.15;
      py += flow.y * flowScale * 0.15;
      pz += flow.z * flowScale * 0.15;

      let seed = noiseSeeds[idx];
      seed = xorshift32(seed);
      px += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale * 0.3;
      seed = xorshift32(seed);
      py += ((seed & 0xffff) / 0xffff - 0.5) * noiseScale * 0.3;
      noiseSeeds[idx] = seed;

      positions[i3] = px;
      positions[i3 + 1] = py;
      positions[i3 + 2] = pz;

      renderScales[idx] = baseScales[idx] * presence;
      idx++;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aScale.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;

    // Update shader uniforms
    material.uniforms.uTime.value = time;
    material.uniforms.uSize.value = particleSize;
    material.uniforms.uDepthExaggeration.value = depthExaggeration;
    material.uniforms.uColorIntensity.value = colorIntensity;
    material.uniforms.uGlowIntensity.value = glowIntensity;
  });

  const shader = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.4 },  // FIXED: Was 16.0, causing 768px particles! Now ~15-25px
        uVolume: { value: VOLUME },
        uDepthExaggeration: { value: 1.0 },
        uColorIntensity: { value: 0.9 },
        uGlowIntensity: { value: 0.5 },
      },
      vertexShader: `
        attribute float aScale;
        attribute vec3 aColor;
        attribute vec2 aParticleData;  // [type, regionWeight]
        uniform float uSize;
        uniform float uVolume;
        uniform float uDepthExaggeration;
        varying float vScale;
        varying vec3 vColor;
        varying float vDepth;
        varying float vParticleType;    // 0 = hand, 1 = stream, 2 = link
        varying float vRegionWeight;    // Luminance contrast weight

        void main() {
          vScale = aScale;
          vColor = aColor;
          vParticleType = aParticleData.x;
          vRegionWeight = aParticleData.y;

          // Normalize Z to [0, 1] where 1 = closer to camera
          float normalizedZ = (position.z + uVolume) / (2.0 * uVolume);
          vDepth = clamp(normalizedZ, 0.0, 1.0);

          // Enhanced depth-based scale with exaggeration control
          float depthFactor = pow(vDepth, 0.8);
          float depthScale = mix(0.5, 1.3, depthFactor * uDepthExaggeration);
          depthScale = clamp(depthScale, 0.4, 1.5);

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * aScale * depthScale * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uColorIntensity;
        uniform float uGlowIntensity;
        varying float vScale;
        varying vec3 vColor;
        varying float vDepth;
        varying float vParticleType;
        varying float vRegionWeight;

        // Soft-knee compression to prevent white-out
        // Maps [0, inf) to [0, limit) with smooth rolloff
        vec3 softClamp(vec3 color, float knee, float limit) {
          vec3 result;
          for (int i = 0; i < 3; i++) {
            float x = color[i];
            if (x < knee) {
              result[i] = x;
            } else {
              // Soft compression above knee
              float excess = x - knee;
              float range = limit - knee;
              result[i] = knee + range * (1.0 - exp(-excess / range));
            }
          }
          return result;
        }

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);

          // === CORE SHAPE ===
          float coreSharpness = mix(0.16, 0.08, vDepth);
          float core = smoothstep(0.5, coreSharpness, d);

          // === GLOW WITH ENERGY CONSERVATION ===
          // 1. Base glow - tighter than before
          float baseGlow = smoothstep(0.5, 0.15, d);  // Narrower glow radius

          // 2. Type-based glow: hand=0.25, stream=0.7, link=0.15 (most subtle)
          float typeGlowMult = vParticleType < 0.5 ? 0.25
                             : vParticleType < 1.5 ? 0.7
                             : 0.15;  // Links are subtle connectors

          // 3. Depth-aware attenuation: interior (far) particles get less glow
          float depthGlowMult = mix(0.3, 1.0, vDepth);  // Far=0.3, Near=1.0

          // 4. Combined glow with intensity control
          float glow = baseGlow * typeGlowMult * depthGlowMult * uGlowIntensity;

          // === BASE COLOR WITH REGION CONTRAST ===
          vec3 baseColor = vColor;
          float luminance = dot(baseColor, vec3(0.299, 0.587, 0.114));

          // Region-based luminance contrast (palm darker, tips brighter)
          baseColor *= vRegionWeight;

          // === ATMOSPHERIC PERSPECTIVE ===
          float desatAmount = mix(0.3, 0.0, vDepth);
          vec3 desaturatedColor = mix(baseColor, vec3(luminance * vRegionWeight), desatAmount);

          float brightnessScale = mix(0.6, 1.0, vDepth);
          vec3 color = desaturatedColor * brightnessScale;

          // === COLOR INTENSITY (reduced impact) ===
          float satBoost = 1.0 + (uColorIntensity - 0.5) * 0.25;  // Reduced from 0.4
          vec3 boostedColor = mix(vec3(luminance), color, satBoost);
          color = boostedColor * (0.9 + uColorIntensity * 0.15);  // Reduced boost

          // === GLOW APPLICATION WITH SOFT CLAMP ===
          // Glow adds to color, but we soft-clamp to prevent white-out
          vec3 glowContribution = color * glow * 0.4;  // Reduced multiplier
          color = color + glowContribution;

          // Soft-knee compression: smooth rolloff above 0.85, limit at 1.1
          color = softClamp(color, 0.85, 1.1);

          // === ALPHA ===
          // Reduced base alpha to further prevent accumulation
          float depthAlpha = mix(0.4, 0.85, vDepth);  // Reduced from 0.5-1.0
          float baseAlpha = 0.4 + vScale * 0.35;      // Reduced from 0.5 + 0.5
          float alpha = core * baseAlpha * depthAlpha;

          // Type-based alpha: hand=1.0, stream=1.2, link=0.7 (subtle)
          float typeAlphaMult = vParticleType < 0.5 ? 1.0
                              : vParticleType < 1.5 ? 1.2
                              : 0.7;  // Links are more transparent
          alpha *= typeAlphaMult;

          gl_FragColor = vec4(color, alpha);
        }
      `,
    }),
    []
  );

  return (
    <points key={`hand-system-${actualParticleCount}-${showStreams}-${showLinks}`}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={actualParticleCount}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aScale"
          array={renderScales}
          count={actualParticleCount}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aColor"
          array={colors}
          count={actualParticleCount}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aParticleData"
          array={particleData}
          count={actualParticleCount}
          itemSize={2}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        args={[shader]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

