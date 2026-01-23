// Sparse Connection Lines
// Visual aid for structural connectivity (not simulation constraints)
// Hand: joint-to-joint along bones
// Clay: nearest neighbor connections

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Vec3, HandInfo } from '../types';
import { HAND_SKELETON } from '../hand/HandSkeleton';
import type { ClaySimulation } from '../simulation/ClaySimulation';

const VOLUME = 2.6;

// Convert landmark to world coordinates
const landmarkToWorld = (lm: Vec3, volume: number): Vec3 => ({
  x: (0.5 - lm.x) * 2 * volume,
  y: (0.5 - lm.y) * 2 * volume,
  z: (lm.z || 0) * volume * 0.6,
});

type HandConnectionLinesProps = {
  handsRef: React.MutableRefObject<HandInfo[]>;
  enabled: boolean;
  opacity?: number;
};

// Hand skeleton connection lines
export function HandConnectionLines({
  handsRef,
  enabled,
  opacity = 0.25,
}: HandConnectionLinesProps) {
  const lineRef = useRef<THREE.LineSegments>(null);

  // Create line geometry for skeleton bones
  // Each bone = 2 vertices (start, end)
  const { positions, colors, boneCount } = useMemo(() => {
    const bones = HAND_SKELETON.bones;
    // 2 hands × bones × 2 vertices per bone × 3 components
    const vertexCount = 2 * bones.length * 2;
    const posArray = new Float32Array(vertexCount * 3);
    const colArray = new Float32Array(vertexCount * 3);

    // Initialize with zeros (will be updated each frame)
    // Colors: pearl grey to match particles
    for (let h = 0; h < 2; h++) {
      for (let b = 0; b < bones.length; b++) {
        const baseIdx = (h * bones.length + b) * 6;
        // Start vertex
        colArray[baseIdx + 0] = 0.65;
        colArray[baseIdx + 1] = 0.67;
        colArray[baseIdx + 2] = 0.72;
        // End vertex
        colArray[baseIdx + 3] = 0.65;
        colArray[baseIdx + 4] = 0.67;
        colArray[baseIdx + 5] = 0.72;
      }
    }

    return {
      positions: posArray,
      colors: colArray,
      boneCount: bones.length,
    };
  }, []);

  useFrame(() => {
    if (!enabled || !lineRef.current) return;

    const hands = handsRef.current;
    const geometry = lineRef.current.geometry;
    const posAttr = geometry.attributes.position;
    const bones = HAND_SKELETON.bones;

    // Find left and right hands
    let leftHand: HandInfo | null = null;
    let rightHand: HandInfo | null = null;
    for (const hand of hands) {
      if (hand.handedness === 'Left' && !leftHand) leftHand = hand;
      else if (hand.handedness === 'Right' && !rightHand) rightHand = hand;
    }

    // Update positions for each hand
    const updateHand = (hand: HandInfo | null, handIdx: number) => {
      for (let b = 0; b < bones.length; b++) {
        const bone = bones[b];
        const baseIdx = (handIdx * boneCount + b) * 6;

        if (hand) {
          const start = landmarkToWorld(hand.landmarks[bone.startIdx], VOLUME);
          const end = landmarkToWorld(hand.landmarks[bone.endIdx], VOLUME);

          positions[baseIdx + 0] = start.x;
          positions[baseIdx + 1] = start.y;
          positions[baseIdx + 2] = start.z;
          positions[baseIdx + 3] = end.x;
          positions[baseIdx + 4] = end.y;
          positions[baseIdx + 5] = end.z;
        } else {
          // Move off-screen when hand not present
          for (let i = 0; i < 6; i++) {
            positions[baseIdx + i] = -100;
          }
        }
      }
    };

    updateHand(leftHand, 0);
    updateHand(rightHand, 1);

    posAttr.needsUpdate = true;
  });

  if (!enabled) return null;

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={boneCount * 2 * 2}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={boneCount * 2 * 2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={opacity}
        linewidth={1}
      />
    </lineSegments>
  );
}

type ClayConnectionLinesProps = {
  simulation: ClaySimulation | null;
  enabled: boolean;
  opacity?: number;
  maxConnections?: number; // Max connections per particle
};

// Clay nearest-neighbor connection lines
export function ClayConnectionLines({
  simulation,
  enabled,
  opacity = 0.15,
  maxConnections = 3,
}: ClayConnectionLinesProps) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const connectionMapRef = useRef<Map<number, number[]>>(new Map());

  // Compute sparse connections (only recompute when topology changes)
  const { positions, colors, maxLineCount } = useMemo(() => {
    if (!simulation) {
      return {
        positions: new Float32Array(0),
        colors: new Float32Array(0),
        maxLineCount: 0,
      };
    }

    // Max possible lines: particles × maxConnections / 2 (each connection counted once)
    const particleCount = simulation.particles.length;
    const maxLines = Math.floor((particleCount * maxConnections) / 2);
    const posArray = new Float32Array(maxLines * 6); // 2 vertices × 3 components
    const colArray = new Float32Array(maxLines * 6);

    // Terracotta color for clay lines (darker than particles)
    for (let i = 0; i < maxLines * 6; i += 3) {
      colArray[i + 0] = 0.55;
      colArray[i + 1] = 0.35;
      colArray[i + 2] = 0.25;
    }

    return {
      positions: posArray,
      colors: colArray,
      maxLineCount: maxLines,
    };
  }, [simulation?.particles.length, maxConnections]);

  // Update connections based on current positions
  useFrame(() => {
    if (!enabled || !simulation || !lineRef.current) return;

    const particles = simulation.particles;
    const geometry = lineRef.current.geometry;
    const posAttr = geometry.attributes.position;

    // Recompute nearest neighbors periodically (every ~30 frames)
    const frameCount = Math.floor(performance.now() / 16);
    if (frameCount % 30 === 0 || connectionMapRef.current.size === 0) {
      computeNearestNeighbors(particles, maxConnections, connectionMapRef.current);
    }

    // Update line positions from connection map
    let lineIdx = 0;
    const connectionMap = connectionMapRef.current;

    for (const [i, neighbors] of connectionMap) {
      if (lineIdx >= maxLineCount) break;

      const p1 = particles[i].position;

      for (const j of neighbors) {
        if (j <= i) continue; // Only draw each connection once
        if (lineIdx >= maxLineCount) break;

        const p2 = particles[j].position;
        const baseIdx = lineIdx * 6;

        positions[baseIdx + 0] = p1.x;
        positions[baseIdx + 1] = p1.y;
        positions[baseIdx + 2] = p1.z;
        positions[baseIdx + 3] = p2.x;
        positions[baseIdx + 4] = p2.y;
        positions[baseIdx + 5] = p2.z;

        lineIdx++;
      }
    }

    // Zero out unused lines
    for (let i = lineIdx; i < maxLineCount; i++) {
      const baseIdx = i * 6;
      for (let j = 0; j < 6; j++) {
        positions[baseIdx + j] = -100;
      }
    }

    posAttr.needsUpdate = true;
  });

  if (!enabled || !simulation) return null;

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={maxLineCount * 2}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          array={colors}
          count={maxLineCount * 2}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={opacity}
        linewidth={1}
      />
    </lineSegments>
  );
}

// Compute nearest neighbors for each particle
function computeNearestNeighbors(
  particles: { position: Vec3 }[],
  maxNeighbors: number,
  connectionMap: Map<number, number[]>
): void {
  connectionMap.clear();

  for (let i = 0; i < particles.length; i++) {
    const p1 = particles[i].position;
    const distances: Array<{ idx: number; dist: number }> = [];

    for (let j = 0; j < particles.length; j++) {
      if (i === j) continue;

      const p2 = particles[j].position;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const dist = dx * dx + dy * dy + dz * dz; // Squared distance

      distances.push({ idx: j, dist });
    }

    // Sort by distance and take closest
    distances.sort((a, b) => a.dist - b.dist);
    const neighbors = distances.slice(0, maxNeighbors).map((d) => d.idx);
    connectionMap.set(i, neighbors);
  }
}
