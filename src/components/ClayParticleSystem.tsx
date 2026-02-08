// Clay Particle System
// Independent sculptable blob controlled by hand gestures
// Uses separate Verlet simulation with cohesion physics

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Vec3, HandInfo } from '../types';
import type { SculptToolMode, RefineMode, RefineBrush } from '../FingertipStreamApp';
import { useGestures } from '../hooks/useGestures';
import {
  createClaySimulation,
  stepClay,
  getClayPositions,
  updateClayConfig,
  applyAttraction,
  applySqueeze,
  applyScrape,
  applyFlatten,
  applyCarve,
  applyStamp,
  applyFlattenCarve,
  applyFlattenStamp,
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
  getSculptStateLeft,
  getSculptStateRight,
  checkAndApplySplit,
  isClaySplit,
  type ClaySimulation,
} from '../simulation/ClaySimulation';

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
  // Interaction / Sculpting
  sculptStrength?: number;
  sculptRadius?: number;        // Radius of sculpt influence region
  sculptMemoryRate?: number;    // How fast sculpted regions remember shape
  pickEnabled?: boolean;        // Enable pick-and-move (default true)
  pickRadius?: number;          // Radius for particle selection
  // Jitter (organic life)
  jitterAmplitude?: number;   // Amplitude of coherent noise jitter
  jitterSpeed?: number;       // Speed of jitter animation
  // Visuals
  colorHue?: number;          // Base hue [0, 1]
  particleSize?: number;
  glowIntensity?: number;
  // Tool mode
  toolMode?: SculptToolMode;  // Current sculpt tool mode
  refineMode?: RefineMode;    // Scrape or Flatten
  refineBrush?: RefineBrush;  // Smooth, Carve, or Stamp
  // Expose simulation for connection lines
  onSimulationReady?: (sim: ClaySimulation | null) => void;
  // Split status callback
  onSplitStatusChange?: (isSplit: boolean) => void;
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
  sculptRadius = 0.8,
  sculptMemoryRate = 0.08,
  pickEnabled = true,
  pickRadius = 0.4,
  jitterAmplitude = 0.002,
  jitterSpeed = 0.8,
  colorHue = 0.05,        // Terracotta (natural clay)
  particleSize = 0.35,
  glowIntensity = 0.4,
  toolMode = 'grab',
  refineMode = 'scrape',
  refineBrush = 'smooth',
  onSimulationReady,
  onSplitStatusChange,
}: ClayParticleSystemProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const simulationRef = useRef<ClaySimulation | null>(null);
  const prevSplitStatusRef = useRef<boolean>(false);
  const { updateGestures } = useGestures();

  // Initialize simulation
  useEffect(() => {
    if (enabled && !simulationRef.current) {
      simulationRef.current = createClaySimulation(particleCount, { x: 0, y: 0, z: 0 }, {
        blobRadius,
        cohesionStrength,
        surfaceTension,
        sculptRadius,
        sculptStrength,
        sculptMemoryRate,
        jitterAmplitude,
        jitterSpeed,
      });
      onSimulationReady?.(simulationRef.current);
    } else if (!enabled && simulationRef.current) {
      simulationRef.current = null;
      onSimulationReady?.(null);
    }
  }, [enabled, particleCount, blobRadius, cohesionStrength, surfaceTension, sculptRadius, sculptStrength, sculptMemoryRate, jitterAmplitude, jitterSpeed, onSimulationReady]);

  // Update config when props change
  useEffect(() => {
    if (simulationRef.current) {
      updateClayConfig(simulationRef.current, {
        blobRadius,
        cohesionStrength,
        surfaceTension,
        sculptRadius,
        sculptStrength,
        sculptMemoryRate,
        jitterAmplitude,
        jitterSpeed,
      });
    }
  }, [blobRadius, cohesionStrength, surfaceTension, sculptRadius, sculptStrength, sculptMemoryRate, jitterAmplitude, jitterSpeed]);

  // Initialize particle buffers
  const { positions, colors, scales } = useMemo(() => {
    const positionsArray = new Float32Array(particleCount * 3);
    const colorsArray = new Float32Array(particleCount * 3);
    const scalesArray = new Float32Array(particleCount);

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
    }

    return {
      positions: positionsArray,
      colors: colorsArray,
      scales: scalesArray,
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

  // Refine tool state: track stroke for scrape/flatten
  const refineStateRef = useRef<{
    active: boolean;
    prevPos: Vec3 | null;
    lastStampTime: number;      // For stamp brush rate-limiting
    lastStampPos: Vec3 | null;  // For stamp brush distance-based rate-limiting
  }>({
    active: false,
    prevPos: null,
    lastStampTime: 0,
    lastStampPos: null,
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

    // === TOOL-ROUTED INTERACTION LOGIC ===
    const refine = refineStateRef.current;

    // Clean up state when switching modes
    if (toolMode !== 'grab' && (pick.leftHolding || pick.rightHolding)) {
      if (pick.leftHolding) { unpinParticleLeft(sim); pick.leftHolding = false; }
      if (pick.rightHolding) { unpinParticleRight(sim); pick.rightHolding = false; }
    }
    if (toolMode !== 'refine' && refine.active) {
      refine.active = false;
      refine.prevPos = null;
    }

    // === GRAB TOOL ===
    if (toolMode === 'grab' && pickEnabled) {
      // Left hand pick-and-move
      if (worldLeftPinch) {
        if (!pick.leftHolding && gestures.leftPinchStrength >= PINCH_START_THRESHOLD) {
          const nearestIdx = findNearestParticle(sim, worldLeftPinch, pickRadius);
          if (nearestIdx !== null) {
            pinParticleLeft(sim, nearestIdx, worldLeftPinch);
            pick.leftHolding = true;
          }
        } else if (pick.leftHolding && gestures.leftPinchStrength >= PINCH_HOLD_THRESHOLD) {
          updatePinTargetLeft(sim, worldLeftPinch);
        } else if (pick.leftHolding && gestures.leftPinchStrength < PINCH_HOLD_THRESHOLD) {
          unpinParticleLeft(sim);
          pick.leftHolding = false;
        }
      } else if (pick.leftHolding) {
        unpinParticleLeft(sim);
        pick.leftHolding = false;
      }

      // Right hand pick-and-move
      if (worldRightPinch) {
        if (!pick.rightHolding && gestures.rightPinchStrength >= PINCH_START_THRESHOLD) {
          const nearestIdx = findNearestParticle(sim, worldRightPinch, pickRadius);
          if (nearestIdx !== null) {
            pinParticleRight(sim, nearestIdx, worldRightPinch);
            pick.rightHolding = true;
          }
        } else if (pick.rightHolding && gestures.rightPinchStrength >= PINCH_HOLD_THRESHOLD) {
          updatePinTargetRight(sim, worldRightPinch);
        } else if (pick.rightHolding && gestures.rightPinchStrength < PINCH_HOLD_THRESHOLD) {
          unpinParticleRight(sim);
          pick.rightHolding = false;
        }
      } else if (pick.rightHolding) {
        unpinParticleRight(sim);
        pick.rightHolding = false;
      }

      // Attraction sculpting (when not picking)
      if (worldLeftPinch && gestures.leftPinchStrength > 0.1 && !pick.leftHolding) {
        applyAttraction(sim, worldLeftPinch, blobRadius * 1.5, gestures.leftPinchStrength * sculptStrength * 0.03);
      }
      if (worldRightPinch && gestures.rightPinchStrength > 0.1 && !pick.rightHolding) {
        applyAttraction(sim, worldRightPinch, blobRadius * 1.5, gestures.rightPinchStrength * sculptStrength * 0.03);
      }
    }

    // === STRETCH TOOL ===
    if (toolMode === 'stretch') {
      // Both hands: pick particles for two-point stretch
      if (worldLeftPinch && gestures.leftPinchStrength >= PINCH_START_THRESHOLD) {
        if (!pick.leftHolding) {
          const nearestIdx = findNearestParticle(sim, worldLeftPinch, pickRadius * 1.5);
          if (nearestIdx !== null) {
            pinParticleLeft(sim, nearestIdx, worldLeftPinch);
            pick.leftHolding = true;
          }
        } else {
          updatePinTargetLeft(sim, worldLeftPinch);
        }
      } else if (pick.leftHolding && gestures.leftPinchStrength < PINCH_HOLD_THRESHOLD) {
        unpinParticleLeft(sim);
        pick.leftHolding = false;
      }

      if (worldRightPinch && gestures.rightPinchStrength >= PINCH_START_THRESHOLD) {
        if (!pick.rightHolding) {
          const nearestIdx = findNearestParticle(sim, worldRightPinch, pickRadius * 1.5);
          if (nearestIdx !== null) {
            pinParticleRight(sim, nearestIdx, worldRightPinch);
            pick.rightHolding = true;
          }
        } else {
          updatePinTargetRight(sim, worldRightPinch);
        }
      } else if (pick.rightHolding && gestures.rightPinchStrength < PINCH_HOLD_THRESHOLD) {
        unpinParticleRight(sim);
        pick.rightHolding = false;
      }

      // Release if hand lost
      if (!worldLeftPinch && pick.leftHolding) {
        unpinParticleLeft(sim);
        pick.leftHolding = false;
      }
      if (!worldRightPinch && pick.rightHolding) {
        unpinParticleRight(sim);
        pick.rightHolding = false;
      }

      // Check for split when both hands are grabbing and pulling apart
      if (pick.leftHolding && pick.rightHolding && worldLeftPinch && worldRightPinch) {
        checkAndApplySplit(sim, worldLeftPinch, worldRightPinch);
      }
    }

    // === REFINE TOOL (Scrape or Flatten, with brush variations) ===
    if (toolMode === 'refine') {
      // Use primary pinch point (prefer right hand)
      const primaryPinch = worldRightPinch || worldLeftPinch;
      const primaryStrength = worldRightPinch ? gestures.rightPinchStrength : gestures.leftPinchStrength;

      // Brush params (could be exposed as props in future)
      const CARVE_DEPTH = 0.015;   // How deep carve brush digs
      const STAMP_DEPTH = 0.02;    // Imprint depth
      const STAMP_RATE = 0.15;     // Seconds between stamps
      const STAMP_DIST = 0.08;     // Min distance between stamps

      if (primaryPinch && primaryStrength >= PINCH_HOLD_THRESHOLD) {
        if (!refine.active) {
          // Start refine stroke
          refine.active = true;
          refine.prevPos = { ...primaryPinch };
        }

        // Calculate stroke movement
        const dx = primaryPinch.x - (refine.prevPos?.x ?? primaryPinch.x);
        const dy = primaryPinch.y - (refine.prevPos?.y ?? primaryPinch.y);
        const dz = primaryPinch.z - (refine.prevPos?.z ?? primaryPinch.z);
        const moveDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Stroke direction (normalized)
        const strokeDir = moveDist > 0.001
          ? { x: dx / moveDist, y: dy / moveDist, z: dz / moveDist }
          : { x: 0, y: 0, z: 1 };

        // Plane normal for flatten (facing camera)
        const planeNormal = { x: 0, y: 0, z: 1 };

        // === SCRAPE MODE ===
        if (refineMode === 'scrape') {
          const MIN_STROKE_DIST = 0.01; // Only apply if there's movement
          if (moveDist >= MIN_STROKE_DIST) {
            if (refineBrush === 'smooth') {
              // Smooth: Laplacian relaxation along stroke
              applyScrape(sim, primaryPinch, strokeDir, moveDist);
            } else if (refineBrush === 'carve') {
              // Carve: dig a groove - scrape + push down into stroke
              applyScrape(sim, primaryPinch, strokeDir, moveDist);
              applyCarve(sim, primaryPinch, strokeDir, CARVE_DEPTH);
            } else if (refineBrush === 'stamp') {
              // Stamp: periodic circular imprints along stroke
              // Uses planeNormal (camera Z) for consistent press direction
              const lastPos = refine.lastStampPos;
              const stampDistOk = !lastPos || Math.sqrt(
                (primaryPinch.x - lastPos.x) ** 2 +
                (primaryPinch.y - lastPos.y) ** 2 +
                (primaryPinch.z - lastPos.z) ** 2
              ) >= STAMP_DIST;
              const stampTimeOk = globalTime - refine.lastStampTime >= STAMP_RATE;

              if (stampDistOk && stampTimeOk) {
                // Use planeNormal for consistent "press into screen" direction
                applyStamp(sim, primaryPinch, planeNormal, STAMP_DEPTH);
                refine.lastStampTime = globalTime;
                refine.lastStampPos = { ...primaryPinch };
              }
            }
          }
        }
        // === FLATTEN MODE ===
        else if (refineMode === 'flatten') {
          if (refineBrush === 'smooth') {
            // Smooth flatten: gentle pressure toward plane
            applyFlatten(sim, primaryPinch, planeNormal);
          } else if (refineBrush === 'carve') {
            // Carve flatten: push center in, raise edges
            applyFlattenCarve(sim, primaryPinch, planeNormal, CARVE_DEPTH);
          } else if (refineBrush === 'stamp') {
            // Stamp flatten: strong imprint, rate-limited
            const stampTimeOk = globalTime - refine.lastStampTime >= STAMP_RATE;
            if (stampTimeOk) {
              applyFlattenStamp(sim, primaryPinch, planeNormal, STAMP_DEPTH);
              refine.lastStampTime = globalTime;
              refine.lastStampPos = { ...primaryPinch };
            }
          }
        }

        refine.prevPos = { ...primaryPinch };
      } else {
        // Release
        refine.active = false;
        refine.prevPos = null;
      }
    }

    // === GLOBAL INTERACTIONS (all tools) ===
    // Grab gesture: squeeze the blob
    const grabStrength = Math.max(gestures.leftGrabStrength, gestures.rightGrabStrength);
    if (grabStrength > 0.2) {
      const squeezeScale = 1 - grabStrength * sculptStrength * 0.01;
      applySqueeze(sim, squeezeScale);
    }

    // Two-hand stretch: scale blob along axis (enhanced in stretch mode)
    if (gestures.twoHandCenter && prev.twoHandDistance > 0) {
      const distDelta = gestures.twoHandDistance - prev.twoHandDistance;
      if (Math.abs(distDelta) > 0.001) {
        const stretchMultiplier = toolMode === 'stretch' ? 1.0 : 0.5;
        const stretchFactor = 1 + distDelta * sculptStrength * stretchMultiplier;
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

    // Check and notify split status changes
    const currentSplitStatus = isClaySplit(sim);
    if (currentSplitStatus !== prevSplitStatusRef.current) {
      prevSplitStatusRef.current = currentSplitStatus;
      onSplitStatusChange?.(currentSplitStatus);
    }

    // Get pinned particle indices and sculpt states for visual feedback
    const leftPinnedIdx = getPinnedParticleLeft(sim);
    const rightPinnedIdx = getPinnedParticleRight(sim);
    const leftSculptState = getSculptStateLeft(sim);
    const rightSculptState = getSculptStateRight(sim);

    // Build a map of neighbor weights for visual feedback
    const neighborWeights = new Map<number, number>();
    if (leftSculptState) {
      for (let i = 0; i < leftSculptState.neighbors.length; i++) {
        const idx = leftSculptState.neighbors[i];
        const w = leftSculptState.weights[i];
        neighborWeights.set(idx, Math.max(neighborWeights.get(idx) || 0, w));
      }
    }
    if (rightSculptState) {
      for (let i = 0; i < rightSculptState.neighbors.length; i++) {
        const idx = rightSculptState.neighbors[i];
        const w = rightSculptState.weights[i];
        neighborWeights.set(idx, Math.max(neighborWeights.get(idx) || 0, w));
      }
    }

    // Update render positions
    const simPositions = getClayPositions(sim);
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      positions[i3] = simPositions[i3];
      positions[i3 + 1] = simPositions[i3 + 1];
      positions[i3 + 2] = simPositions[i3 + 2];

      // Visual feedback: scale based on sculpt influence
      const isPinned = i === leftPinnedIdx || i === rightPinnedIdx;
      const neighborWeight = neighborWeights.get(i) || 0;
      const baseScale = scales[i];

      if (isPinned) {
        // Grabbed particle: 30% larger
        geometry.attributes.aScale.array[i] = baseScale * 1.3;
      } else if (neighborWeight > 0) {
        // Influenced neighbors: subtle scale boost based on weight (up to 15%)
        geometry.attributes.aScale.array[i] = baseScale * (1 + neighborWeight * 0.15);
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
