import { useFrame } from '@react-three/fiber';
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { flowVector } from '../utils/flowField';
import type { ShapePoint } from '../hooks/useHandDrawing';

type ParticleFieldProps = {
  count: number;
  volume: number;
  flowStrength: number;
  attractionStrength: number;
  alignmentStrength: number;
  repulsionStrength: number;
  paused: boolean;
  perfMode: boolean;
  shapeRef: React.MutableRefObject<ShapePoint[]>;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function ParticleField({
  count,
  volume,
  flowStrength,
  attractionStrength,
  alignmentStrength,
  repulsionStrength,
  paused,
  perfMode,
  shapeRef,
}: ParticleFieldProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const frameRef = useRef(0);

  const { positions, velocities, baseScales, noiseSeeds } = useMemo(() => {
    const positionsArray = new Float32Array(count * 3);
    const velocitiesArray = new Float32Array(count * 3);
    const scalesArray = new Float32Array(count);
    const seedsArray = new Uint32Array(count);
    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      positionsArray[i3] = (Math.random() - 0.5) * 2 * volume;
      positionsArray[i3 + 1] = (Math.random() - 0.5) * 2 * volume;
      positionsArray[i3 + 2] = (Math.random() - 0.5) * 2 * volume;
      velocitiesArray[i3] = (Math.random() - 0.5) * 0.02;
      velocitiesArray[i3 + 1] = (Math.random() - 0.5) * 0.02;
      velocitiesArray[i3 + 2] = (Math.random() - 0.5) * 0.02;
      scalesArray[i] = 0.6 + Math.random() * 0.8;
      seedsArray[i] = (Math.random() * 0xffffffff) >>> 0;
    }
    return {
      positions: positionsArray,
      velocities: velocitiesArray,
      baseScales: scalesArray,
      noiseSeeds: seedsArray,
    };
  }, [count, volume]);

  const xorshift32 = (state: number) => {
    let x = state | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };

  useFrame(({ clock }) => {
    if (paused) return;
    frameRef.current += 1;

    const geometry = geometryRef.current;
    const material = materialRef.current;
    if (!geometry || !material) return;

    const time = clock.getElapsedTime() * 1000;
    const points = shapeRef.current;
    const hasShape = points.length > 1;
    const sampleStride = hasShape ? Math.ceil(points.length / 40) : 1;
    const updateStride = perfMode ? (count > 60000 ? 4 : 3) : count > 80000 ? 3 : 2;
    const offset = frameRef.current % updateStride;
    const noiseScale = flowStrength * 0.001;

    for (let i = offset; i < count; i += updateStride) {
      const i3 = i * 3;
      let x = positions[i3];
      let y = positions[i3 + 1];
      let z = positions[i3 + 2];

      const flow = flowVector(x, y, z, time);
      velocities[i3] += flow.x * noiseScale;
      velocities[i3 + 1] += flow.y * noiseScale;
      velocities[i3 + 2] += flow.z * noiseScale;

      // Brownian noise for organic drift.
      let seed = noiseSeeds[i];
      seed = xorshift32(seed);
      const r1 = (seed & 0xffff) / 0xffff - 0.5;
      seed = xorshift32(seed);
      const r2 = (seed & 0xffff) / 0xffff - 0.5;
      seed = xorshift32(seed);
      const r3 = (seed & 0xffff) / 0xffff - 0.5;
      noiseSeeds[i] = seed;
      velocities[i3] += r1 * 0.0007;
      velocities[i3 + 1] += r2 * 0.0007;
      velocities[i3 + 2] += r3 * 0.0007;

      if (hasShape) {
        // Sample a subset of the stroke to keep CPU work bounded.
        let closest: ShapePoint | null = null;
        let minDist = Number.POSITIVE_INFINITY;

        for (let s = 0; s < points.length; s += sampleStride) {
          const point = points[s];
          const dx = point.x - x;
          const dy = point.y - y;
          const dz = point.z - z;
          const dist = dx * dx + dy * dy + dz * dz;
          if (dist < minDist) {
            minDist = dist;
            closest = point;
          }
        }

        if (closest) {
          const dist = Math.sqrt(minDist) + 0.0001;
          const falloff = clamp(1 - dist / (volume * 0.6), 0, 1);

          if (attractionStrength > 0) {
            velocities[i3] +=
              ((closest.x - x) / dist) * attractionStrength * falloff * 0.001;
            velocities[i3 + 1] +=
              ((closest.y - y) / dist) * attractionStrength * falloff * 0.001;
            velocities[i3 + 2] +=
              ((closest.z - z) / dist) * attractionStrength * falloff * 0.001;
          }

          if (alignmentStrength > 0) {
            velocities[i3] += closest.tx * alignmentStrength * falloff * 0.002;
            velocities[i3 + 1] += closest.ty * alignmentStrength * falloff * 0.002;
            velocities[i3 + 2] += closest.tz * alignmentStrength * falloff * 0.002;
          }

          if (repulsionStrength > 0 && dist < volume * 0.2) {
            velocities[i3] -=
              ((closest.x - x) / dist) * repulsionStrength * falloff * 0.0015;
            velocities[i3 + 1] -=
              ((closest.y - y) / dist) * repulsionStrength * falloff * 0.0015;
            velocities[i3 + 2] -=
              ((closest.z - z) / dist) * repulsionStrength * falloff * 0.0015;
          }
        }
      }

      velocities[i3] *= 0.985;
      velocities[i3 + 1] *= 0.985;
      velocities[i3 + 2] *= 0.985;

      x += velocities[i3];
      y += velocities[i3 + 1];
      z += velocities[i3 + 2];

      if (x > volume) x = -volume;
      if (x < -volume) x = volume;
      if (y > volume) y = -volume;
      if (y < -volume) y = volume;
      if (z > volume) z = -volume;
      if (z < -volume) z = volume;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;
    }

    geometry.attributes.position.needsUpdate = true;
    material.uniforms.uTime.value = time;
  });

  const shader = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 6.0 },
        uColor: { value: new THREE.Color('#c2f3ff') },
        uVolume: { value: volume },
      },
      vertexShader: `
        attribute float aBaseScale;
        uniform float uSize;
        uniform float uVolume;
        varying float vScale;
        void main() {
          float depthScale = 1.0 - clamp(abs(position.z) / uVolume, 0.0, 1.0);
          vScale = aBaseScale * (0.6 + depthScale * 1.1);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * vScale * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vScale;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          float alpha = smoothstep(0.5, 0.0, d) * (0.4 + vScale * 0.4);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    }),
    []
  );

  return (
    <points>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aBaseScale"
          array={baseScales}
          count={count}
          itemSize={1}
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
