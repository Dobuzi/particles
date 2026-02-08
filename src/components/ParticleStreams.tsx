// Particle stream visualization connecting fingertip pairs
// Premium feel: spring-damper dynamics, catenary curves, depth-based rendering

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FingertipPair, Vec3 } from '../types';
import { flowVector } from '../utils/flowField';
import { lerp, vec3Lerp, xorshift32 } from '../utils/math';
import { computeStreamColor } from '../utils/color';
import {
  VOLUME,
  STREAM_COUNT,
  REPULSION_STRENGTH,
  REPULSION_RANGE,
} from '../constants';

type ParticleStreamsProps = {
  pairsRef: React.MutableRefObject<FingertipPair[]>;
  particlesPerStream: number;
  flowStrength: number;
  noiseStrength: number;
  colorIntensity: number;
  paused: boolean;
};

// Compute catenary-like curve between two points (sag in the middle)
const catenaryLerp = (a: Vec3, b: Vec3, t: number, sag: number): Vec3 => {
  // Base linear interpolation
  const base = vec3Lerp(a, b, t);
  // Add downward sag in the middle (peaks at t=0.5)
  const sagAmount = sag * Math.sin(t * Math.PI);
  return {
    x: base.x,
    y: base.y - sagAmount,
    z: base.z,
  };
};

export function ParticleStreams({
  pairsRef,
  particlesPerStream,
  flowStrength,
  noiseStrength,
  colorIntensity,
  paused,
}: ParticleStreamsProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const frameRef = useRef(0);

  const totalParticles = STREAM_COUNT * particlesPerStream;

  // Initialize particle state
  const {
    positions,
    velocities,
    baseT,      // Each particle's base t parameter (0-1 along stream)
    streamIds,  // Which stream (0-4) this particle belongs to
    noiseSeeds,
    colors,
    scales,
  } = useMemo(() => {
    const positionsArray = new Float32Array(totalParticles * 3);
    const velocitiesArray = new Float32Array(totalParticles * 3);
    const baseTArray = new Float32Array(totalParticles);
    const streamIdsArray = new Uint8Array(totalParticles);
    const seedsArray = new Uint32Array(totalParticles);
    const colorsArray = new Float32Array(totalParticles * 3);
    const scalesArray = new Float32Array(totalParticles);

    for (let stream = 0; stream < STREAM_COUNT; stream++) {
      for (let p = 0; p < particlesPerStream; p++) {
        const i = stream * particlesPerStream + p;
        const i3 = i * 3;

        // Distribute particles along t with slight randomness
        const baseT = (p + 0.5) / particlesPerStream;
        baseTArray[i] = baseT + (Math.random() - 0.5) * 0.05;
        streamIdsArray[i] = stream;
        seedsArray[i] = (Math.random() * 0xffffffff) >>> 0;
        scalesArray[i] = 0.8 + Math.random() * 0.4;

        // Initial positions at origin (will be updated when hands appear)
        positionsArray[i3] = 0;
        positionsArray[i3 + 1] = 0;
        positionsArray[i3 + 2] = 0;

        velocitiesArray[i3] = 0;
        velocitiesArray[i3 + 1] = 0;
        velocitiesArray[i3 + 2] = 0;

        // Initial colors
        const [r, g, b] = computeStreamColor(baseT, stream, colorIntensity);
        colorsArray[i3] = r;
        colorsArray[i3 + 1] = g;
        colorsArray[i3 + 2] = b;
      }
    }

    return {
      positions: positionsArray,
      velocities: velocitiesArray,
      baseT: baseTArray,
      streamIds: streamIdsArray,
      noiseSeeds: seedsArray,
      colors: colorsArray,
      scales: scalesArray,
    };
  }, [totalParticles, particlesPerStream, colorIntensity]);

  // Smoothed target positions for each stream endpoint
  const targetLeftRef = useRef<(Vec3 | null)[]>(Array(STREAM_COUNT).fill(null));
  const targetRightRef = useRef<(Vec3 | null)[]>(Array(STREAM_COUNT).fill(null));

  useFrame(({ clock }) => {
    if (paused) return;
    frameRef.current += 1;

    const geometry = geometryRef.current;
    const material = materialRef.current;
    if (!geometry || !material) return;

    const time = clock.getElapsedTime() * 1000;
    const pairs = pairsRef.current;

    // Update smoothed targets for each stream with adaptive smoothing
    for (let s = 0; s < STREAM_COUNT; s++) {
      const pair = pairs[s];
      if (pair && pair.left && pair.right) {
        const prevLeft = targetLeftRef.current[s];
        const prevRight = targetRightRef.current[s];

        if (prevLeft && prevRight) {
          // Adaptive smoothing: faster when further from target
          const distLeft = Math.sqrt(
            (pair.left.x - prevLeft.x) ** 2 +
            (pair.left.y - prevLeft.y) ** 2 +
            (pair.left.z - prevLeft.z) ** 2
          );
          const distRight = Math.sqrt(
            (pair.right.x - prevRight.x) ** 2 +
            (pair.right.y - prevRight.y) ** 2 +
            (pair.right.z - prevRight.z) ** 2
          );

          // Base alpha 0.2 (smooth), increase to 0.5 for large movements
          const alphaLeft = Math.min(0.5, 0.2 + distLeft * 0.3);
          const alphaRight = Math.min(0.5, 0.2 + distRight * 0.3);

          targetLeftRef.current[s] = vec3Lerp(prevLeft, pair.left, alphaLeft);
          targetRightRef.current[s] = vec3Lerp(prevRight, pair.right, alphaRight);
        } else {
          // First frame: snap to position
          targetLeftRef.current[s] = pair.left;
          targetRightRef.current[s] = pair.right;
        }
      }
    }

    const noiseScale = noiseStrength * 0.0008;
    const flowScale = flowStrength * 0.0006;

    for (let i = 0; i < totalParticles; i++) {
      const i3 = i * 3;
      const streamId = streamIds[i];
      const t = baseT[i];

      const leftTarget = targetLeftRef.current[streamId];
      const rightTarget = targetRightRef.current[streamId];

      if (!leftTarget || !rightTarget) {
        // No active pair - particles drift toward center
        positions[i3] *= 0.98;
        positions[i3 + 1] *= 0.98;
        positions[i3 + 2] *= 0.98;
        continue;
      }

      // Calculate target position along catenary curve (natural hanging shape)
      const distance = Math.sqrt(
        (rightTarget.x - leftTarget.x) ** 2 +
        (rightTarget.y - leftTarget.y) ** 2 +
        (rightTarget.z - leftTarget.z) ** 2
      );
      const sag = distance * 0.15; // Sag proportional to finger distance
      const targetPos = catenaryLerp(leftTarget, rightTarget, t, sag);

      // Add flow field influence
      const flow = flowVector(positions[i3], positions[i3 + 1], positions[i3 + 2], time);

      // Add controlled noise for organic movement
      let seed = noiseSeeds[i];
      seed = xorshift32(seed);
      const r1 = (seed & 0xffff) / 0xffff - 0.5;
      seed = xorshift32(seed);
      const r2 = (seed & 0xffff) / 0xffff - 0.5;
      seed = xorshift32(seed);
      const r3 = (seed & 0xffff) / 0xffff - 0.5;
      noiseSeeds[i] = seed;

      // Calculate direction from current position to target
      const dx = targetPos.x - positions[i3];
      const dy = targetPos.y - positions[i3 + 1];
      const dz = targetPos.z - positions[i3 + 2];

      // Spring-damper dynamics for premium smooth feel
      // k = spring constant, c = damping coefficient
      const k = 0.12; // Slightly stronger spring
      const c = 0.15; // Critical damping for no oscillation

      // Spring force: F = k * displacement
      velocities[i3] += dx * k;
      velocities[i3 + 1] += dy * k;
      velocities[i3 + 2] += dz * k;

      // Flow field influence (perpendicular to stream for swirl effect)
      velocities[i3] += flow.x * flowScale;
      velocities[i3 + 1] += flow.y * flowScale;
      velocities[i3 + 2] += flow.z * flowScale;

      // Brownian noise (reduced for cleaner motion)
      velocities[i3] += r1 * noiseScale * 0.7;
      velocities[i3 + 1] += r2 * noiseScale * 0.7;
      velocities[i3 + 2] += r3 * noiseScale * 0.7;

      // Soft repulsion from nearby particles in same stream (granular spacing)
      // Only check immediate neighbors for efficiency
      const streamStart = streamId * particlesPerStream;
      const streamEnd = streamStart + particlesPerStream;
      const checkRange = 3; // Check 3 particles before/after

      for (let j = Math.max(streamStart, i - checkRange); j < Math.min(streamEnd, i + checkRange + 1); j++) {
        if (j === i) continue;
        const j3 = j * 3;
        const sepX = positions[i3] - positions[j3];
        const sepY = positions[i3 + 1] - positions[j3 + 1];
        const sepZ = positions[i3 + 2] - positions[j3 + 2];
        const sepDist = Math.sqrt(sepX * sepX + sepY * sepY + sepZ * sepZ) + 0.0001;

        if (sepDist < REPULSION_RANGE) {
          // Soft repulsion that increases as particles get closer
          const repulsionFactor = (REPULSION_RANGE - sepDist) / REPULSION_RANGE;
          const force = REPULSION_STRENGTH * repulsionFactor * repulsionFactor;
          velocities[i3] += (sepX / sepDist) * force;
          velocities[i3 + 1] += (sepY / sepDist) * force;
          velocities[i3 + 2] += (sepZ / sepDist) * force;
        }
      }

      // Damping: F = -c * velocity (critical damping for smooth settling)
      const damping = 1 - c;
      velocities[i3] *= damping;
      velocities[i3 + 1] *= damping;
      velocities[i3 + 2] *= damping;

      // Update position
      positions[i3] += velocities[i3];
      positions[i3 + 1] += velocities[i3 + 1];
      positions[i3 + 2] += velocities[i3 + 2];

      // Update color based on current t and stream
      const speed = Math.sqrt(
        velocities[i3] ** 2 + velocities[i3 + 1] ** 2 + velocities[i3 + 2] ** 2
      );
      const dynamicIntensity = colorIntensity * (0.7 + Math.min(speed * 20, 0.3));
      const [r, g, b] = computeStreamColor(t, streamId, dynamicIntensity);
      colors[i3] = lerp(colors[i3], r, 0.1);
      colors[i3 + 1] = lerp(colors[i3 + 1], g, 0.1);
      colors[i3 + 2] = lerp(colors[i3 + 2], b, 0.1);
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
    material.uniforms.uTime.value = time;
  });

  const shader = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 14.0 }, // Larger particles for visibility at low counts
        uVolume: { value: VOLUME },
      },
      vertexShader: `
        attribute float aScale;
        attribute vec3 aColor;
        uniform float uSize;
        uniform float uVolume;
        varying float vScale;
        varying vec3 vColor;
        varying float vDepth;

        void main() {
          vScale = aScale;
          vColor = aColor;

          // Depth factor: particles closer to camera are larger and brighter
          float normalizedZ = (position.z + uVolume) / (2.0 * uVolume);
          vDepth = clamp(normalizedZ, 0.0, 1.0);

          // Depth-based size scaling (closer = larger)
          float depthScale = 0.7 + vDepth * 0.6;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * aScale * depthScale * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vScale;
        varying vec3 vColor;
        varying float vDepth;

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);

          // Soft glow with bright core
          float core = smoothstep(0.5, 0.05, d);
          float glow = smoothstep(0.5, 0.0, d) * 0.4;

          // Depth affects alpha (closer = more opaque)
          float depthAlpha = 0.5 + vDepth * 0.5;
          float alpha = core * (0.5 + vScale * 0.4) * depthAlpha;

          // Add subtle glow halo
          vec3 color = vColor * (1.0 + glow * 0.5);

          gl_FragColor = vec4(color, alpha);
        }
      `,
    }),
    []
  );

  return (
    <points key={`streams-${totalParticles}`}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={totalParticles}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aScale"
          array={scales}
          count={totalParticles}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aColor"
          array={colors}
          count={totalParticles}
          itemSize={3}
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
