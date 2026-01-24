// Clay Particle System
// Independent sculptable blob controlled by hand gestures
// Uses separate Verlet simulation with cohesion physics

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Vec3, HandInfo } from '../types';
import { useGestures } from '../hooks/useGestures';
import {
  createClaySimulation,
  stepClay,
  getClayPositions,
  updateClayConfig,
  applyAttraction,
  applySqueeze,
  resetClay,
  findNearestParticle,
  pinParticleLeft,
  pinParticleRight,
  updatePinTargetLeft,
  updatePinTargetRight,
  unpinParticleLeft,
  unpinParticleRight,
  getPinnedParticleLeft,
  getPinnedParticleRight,
  type ClaySimulation,
} from '../simulation/ClaySimulation';
import { xorshift32 } from '../utils/math';

const VOLUME = 2.6;

// Convert landmark to world coordinates
const landmarkToWorld = (lm: Vec3, volume: number): Vec3 => ({
  x: (0.5 - lm.x) * 2 * volume,
  y: (0.5 - lm.y) * 2 * volume,
  z: (lm.z || 0) * volume * 0.6,
});

type ClayParticleSystemProps = {
  handsRef: React.MutableRefObject<HandInfo[]>;
  particleCount: number;
  enabled: boolean;
  paused: boolean;
  // Clay properties
  blobRadius?: number;
  cohesionStrength?: number;
  surfaceTension?: number;
  // Interaction
  sculptStrength?: number;
  pickEnabled?: boolean;      // Enable pick-and-move (default true)
  pickRadius?: number;        // Radius for particle selection
  // Jitter (organic life)
  jitterAmplitude?: number;   // Amplitude of coherent noise jitter
  jitterSpeed?: number;       // Speed of jitter animation
  // Visuals
  colorHue?: number;          // Base hue [0, 1]
  particleSize?: number;
  glowIntensity?: number;
  // Expose simulation for connection lines
  onSimulationReady?: (sim: ClaySimulation | null) => void;
};

export function ClayParticleSystem({
  handsRef,
  particleCount,
  enabled,
  paused,
  blobRadius = 1.2,
  cohesionStrength = 0.4,
  surfaceTension = 0.15,
  sculptStrength = 0.5,
  pickEnabled = true,
  pickRadius = 0.4,
  jitterAmplitude = 0.002,
  jitterSpeed = 0.8,
  colorHue = 0.05,        // Terracotta (natural clay)
  particleSize = 0.35,
  glowIntensity = 0.4,
  onSimulationReady,
}: ClayParticleSystemProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const simulationRef = useRef<ClaySimulation | null>(null);
  const { updateGestures } = useGestures();

  // Initialize simulation
  useEffect(() => {
    if (enabled && !simulationRef.current) {
      simulationRef.current = createClaySimulation(particleCount, { x: 0, y: 0, z: 0 }, {
        blobRadius,
        cohesionStrength,
        surfaceTension,
        jitterAmplitude,
        jitterSpeed,
      });
      onSimulationReady?.(simulationRef.current);
    } else if (!enabled && simulationRef.current) {
      simulationRef.current = null;
      onSimulationReady?.(null);
    }
  }, [enabled, particleCount, blobRadius, cohesionStrength, surfaceTension, jitterAmplitude, jitterSpeed, onSimulationReady]);

  // Update config when props change
  useEffect(() => {
    if (simulationRef.current) {
      updateClayConfig(simulationRef.current, {
        blobRadius,
        cohesionStrength,
        surfaceTension,
        jitterAmplitude,
        jitterSpeed,
      });
    }
  }, [blobRadius, cohesionStrength, surfaceTension, jitterAmplitude, jitterSpeed]);

  // Initialize particle buffers
  const { positions, colors, scales, noiseSeeds } = useMemo(() => {
    const positionsArray = new Float32Array(particleCount * 3);
    const colorsArray = new Float32Array(particleCount * 3);
    const scalesArray = new Float32Array(particleCount);
    const seedsArray = new Uint32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positionsArray[i3] = 0;
      positionsArray[i3 + 1] = 0;
      positionsArray[i3 + 2] = 0;

      // Terracotta color with subtle variation
      const hueVar = (Math.random() - 0.5) * 0.03; // Tighter hue variation
      const saturation = 0.45 + Math.random() * 0.15; // Moderate saturation
      const lightness = 0.42 + Math.random() * 0.12; // Earthy mid-tones
      const h = colorHue + hueVar;

      // HSL to RGB conversion
      const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
      const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
      const m = lightness - c / 2;
      let r = 0, g = 0, b = 0;
      const hSector = Math.floor(h * 6) % 6;
      switch (hSector) {
        case 0: r = c; g = x; b = 0; break;
        case 1: r = x; g = c; b = 0; break;
        case 2: r = 0; g = c; b = x; break;
        case 3: r = 0; g = x; b = c; break;
        case 4: r = x; g = 0; b = c; break;
        case 5: r = c; g = 0; b = x; break;
      }
      colorsArray[i3] = r + m;
      colorsArray[i3 + 1] = g + m;
      colorsArray[i3 + 2] = b + m;

      scalesArray[i] = 0.8 + Math.random() * 0.4;
      seedsArray[i] = (Math.random() * 0xffffffff) >>> 0;
    }

    return {
      positions: positionsArray,
      colors: colorsArray,
      scales: scalesArray,
      noiseSeeds: seedsArray,
    };
  }, [particleCount, colorHue]);

  // Previous gesture state for smooth transitions
  const prevGestureRef = useRef<{
    leftPinchStrength: number;
    rightPinchStrength: number;
    leftGrabStrength: number;
    rightGrabStrength: number;
    twoHandDistance: number;
  }>({
    leftPinchStrength: 0,
    rightPinchStrength: 0,
    leftGrabStrength: 0,
    rightGrabStrength: 0,
    twoHandDistance: 0,
  });

  // Pick-and-move state: track if we're actively holding a pinch
  const pickStateRef = useRef<{
    leftHolding: boolean;
    rightHolding: boolean;
  }>({
    leftHolding: false,
    rightHolding: false,
  });

  // Pinch thresholds for pick-and-move
  const PINCH_START_THRESHOLD = 0.6;   // Start picking when pinch is this strong
  const PINCH_HOLD_THRESHOLD = 0.3;    // Keep holding until pinch drops below this

  useFrame(({ clock }, delta) => {
    if (paused || !enabled) return;

    const geometry = geometryRef.current;
    const material = materialRef.current;
    const sim = simulationRef.current;
    if (!geometry || !material || !sim) return;

    const globalTime = clock.getElapsedTime();
    const time = globalTime * 1000;
    const hands = handsRef.current;

    // Update gestures
    const gestures = updateGestures(hands);
    const prev = prevGestureRef.current;
    const pick = pickStateRef.current;

    // Convert gesture points to world space
    const worldLeftPinch = gestures.leftPinchPoint
      ? landmarkToWorld(gestures.leftPinchPoint, VOLUME)
      : null;
    const worldRightPinch = gestures.rightPinchPoint
      ? landmarkToWorld(gestures.rightPinchPoint, VOLUME)
      : null;

    // === PICK-AND-MOVE LOGIC ===
    if (pickEnabled) {
      // Left hand pick-and-move
      if (worldLeftPinch) {
        if (!pick.leftHolding && gestures.leftPinchStrength >= PINCH_START_THRESHOLD) {
          // Start picking: find nearest particle
          const nearestIdx = findNearestParticle(sim, worldLeftPinch, pickRadius);
          if (nearestIdx !== null) {
            pinParticleLeft(sim, nearestIdx, worldLeftPinch);
            pick.leftHolding = true;
          }
        } else if (pick.leftHolding && gestures.leftPinchStrength >= PINCH_HOLD_THRESHOLD) {
          // Continue dragging: update pin target
          updatePinTargetLeft(sim, worldLeftPinch);
        } else if (pick.leftHolding && gestures.leftPinchStrength < PINCH_HOLD_THRESHOLD) {
          // Release: unpin particle
          unpinParticleLeft(sim);
          pick.leftHolding = false;
        }
      } else if (pick.leftHolding) {
        // Hand lost: release
        unpinParticleLeft(sim);
        pick.leftHolding = false;
      }

      // Right hand pick-and-move
      if (worldRightPinch) {
        if (!pick.rightHolding && gestures.rightPinchStrength >= PINCH_START_THRESHOLD) {
          // Start picking: find nearest particle
          const nearestIdx = findNearestParticle(sim, worldRightPinch, pickRadius);
          if (nearestIdx !== null) {
            pinParticleRight(sim, nearestIdx, worldRightPinch);
            pick.rightHolding = true;
          }
        } else if (pick.rightHolding && gestures.rightPinchStrength >= PINCH_HOLD_THRESHOLD) {
          // Continue dragging: update pin target
          updatePinTargetRight(sim, worldRightPinch);
        } else if (pick.rightHolding && gestures.rightPinchStrength < PINCH_HOLD_THRESHOLD) {
          // Release: unpin particle
          unpinParticleRight(sim);
          pick.rightHolding = false;
        }
      } else if (pick.rightHolding) {
        // Hand lost: release
        unpinParticleRight(sim);
        pick.rightHolding = false;
      }
    }

    // === ATTRACTION SCULPTING (when not picking) ===
    // Only apply attraction when NOT holding a pinned particle
    if (worldLeftPinch && gestures.leftPinchStrength > 0.1 && !pick.leftHolding) {
      applyAttraction(sim, worldLeftPinch, blobRadius * 1.5, gestures.leftPinchStrength * sculptStrength * 0.03);
    }
    if (worldRightPinch && gestures.rightPinchStrength > 0.1 && !pick.rightHolding) {
      applyAttraction(sim, worldRightPinch, blobRadius * 1.5, gestures.rightPinchStrength * sculptStrength * 0.03);
    }

    // Grab: squeeze the blob
    const grabStrength = Math.max(gestures.leftGrabStrength, gestures.rightGrabStrength);
    if (grabStrength > 0.2) {
      const squeezeScale = 1 - grabStrength * sculptStrength * 0.01;
      applySqueeze(sim, squeezeScale);
    }

    // Two-hand stretch: scale blob along axis
    if (gestures.twoHandCenter && prev.twoHandDistance > 0) {
      const distDelta = gestures.twoHandDistance - prev.twoHandDistance;
      if (Math.abs(distDelta) > 0.001) {
        // Stretch/squash
        const stretchFactor = 1 + distDelta * sculptStrength * 0.5;
        applySqueeze(sim, stretchFactor);
      }
    }

    // Update previous gesture state
    prev.leftPinchStrength = gestures.leftPinchStrength;
    prev.rightPinchStrength = gestures.rightPinchStrength;
    prev.leftGrabStrength = gestures.leftGrabStrength;
    prev.rightGrabStrength = gestures.rightGrabStrength;
    prev.twoHandDistance = gestures.twoHandDistance;

    // Step simulation (pass global time for jitter)
    stepClay(sim, Math.min(delta, 0.05), globalTime);

    // Get pinned particle indices for visual feedback
    const leftPinnedIdx = getPinnedParticleLeft(sim);
    const rightPinnedIdx = getPinnedParticleRight(sim);

    // Update render positions
    const simPositions = getClayPositions(sim);
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      positions[i3] = simPositions[i3];
      positions[i3 + 1] = simPositions[i3 + 1];
      positions[i3 + 2] = simPositions[i3 + 2];

      // Visual feedback: slightly enlarge pinned particles
      const isPinned = i === leftPinnedIdx || i === rightPinnedIdx;
      const baseScale = scales[i];
      if (isPinned) {
        // Temporarily boost scale for visual feedback
        geometry.attributes.aScale.array[i] = baseScale * 1.3;
      } else {
        geometry.attributes.aScale.array[i] = baseScale;
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aScale.needsUpdate = true;

    // Update uniforms
    material.uniforms.uTime.value = time;
    material.uniforms.uSize.value = particleSize;
    material.uniforms.uGlowIntensity.value = glowIntensity;
  });

  const shader = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 0.35 },
        uGlowIntensity: { value: 0.4 },
      },
      vertexShader: `
        attribute float aScale;
        attribute vec3 aColor;
        uniform float uSize;
        varying float vScale;
        varying vec3 vColor;
        varying float vDepth;

        void main() {
          vScale = aScale;
          vColor = aColor;

          // Depth for atmospheric effect
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = clamp(1.0 - (-mvPosition.z - 3.0) / 4.0, 0.0, 1.0);

          gl_PointSize = uSize * aScale * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uGlowIntensity;
        varying float vScale;
        varying vec3 vColor;
        varying float vDepth;

        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);

          // Soft circular shape
          float core = smoothstep(0.5, 0.1, d);

          // Subtle glow
          float glow = smoothstep(0.5, 0.2, d) * uGlowIntensity * 0.5;

          // Color with depth-based atmospheric effect
          vec3 color = vColor * mix(0.7, 1.0, vDepth);
          color += color * glow;

          // Clamp to prevent white-out
          color = min(color, vec3(1.0));

          float alpha = core * 0.7 * vDepth;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    }),
    []
  );

  if (!enabled) return null;

  return (
    <points key={`clay-system-${particleCount}`}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={particleCount}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aScale"
          array={scales}
          count={particleCount}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-aColor"
          array={colors}
          count={particleCount}
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

// Export reset function for UI
export { resetClay };
