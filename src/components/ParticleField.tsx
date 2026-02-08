import { useFrame } from '@react-three/fiber';
import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { flowVector } from '../utils/flowField';
import type { ShapePoint } from '../types';
import { clamp, xorshift32 } from '../utils/math';
import { hslToRgb } from '../utils/color';

type ParticleFieldProps = {
  count: number;
  volume: number;
  flowStrength: number;
  attractionStrength: number;
  alignmentStrength: number;
  repulsionStrength: number;
  paused: boolean;
  perfMode: boolean;
  colorMode: 'position' | 'velocity' | 'noise';
  colorIntensity: number;
  highContrast: boolean;
  formationEnabled: boolean;
  formationStrength: number;
  formationDensity: number;
  handTargetsRef: React.MutableRefObject<{ data: Float32Array; count: number }>;
  shapeRef: React.MutableRefObject<ShapePoint[]>;
};

export function ParticleField({
  count,
  volume,
  flowStrength,
  attractionStrength,
  alignmentStrength,
  repulsionStrength,
  paused,
  perfMode,
  colorMode,
  colorIntensity,
  highContrast,
  formationEnabled,
  formationStrength,
  formationDensity,
  handTargetsRef,
  shapeRef,
}: ParticleFieldProps) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const frameRef = useRef(0);

  const { positions, velocities, baseScales, noiseSeeds, colors, selectSeeds } = useMemo(() => {
    const positionsArray = new Float32Array(count * 3);
    const velocitiesArray = new Float32Array(count * 3);
    const scalesArray = new Float32Array(count);
    const seedsArray = new Uint32Array(count);
    const selectSeedsArray = new Uint32Array(count);
    const colorsArray = new Float32Array(count * 3);
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
      selectSeedsArray[i] = (Math.random() * 0xffffffff) >>> 0;
      colorsArray[i3] = 0.75;
      colorsArray[i3 + 1] = 0.9;
      colorsArray[i3 + 2] = 1.0;
    }
    return {
      positions: positionsArray,
      velocities: velocitiesArray,
      baseScales: scalesArray,
      noiseSeeds: seedsArray,
      selectSeeds: selectSeedsArray,
      colors: colorsArray,
    };
  }, [count, volume]);

  const updateColor = (i3: number, x: number, y: number, z: number, speed: number, flow: { x: number; y: number; z: number }) => {
    const intensity = Math.max(0.2, Math.min(1, colorIntensity));
    const contrast = highContrast ? 1.2 : 1.0;
    let hue = 0.55;
    let sat = 0.55 * intensity;
    let lum = 0.55;

    if (colorMode === 'position') {
      const angle = Math.atan2(z, x);
      hue = (angle / (Math.PI * 2) + 1) % 1;
      const height = (y / volume + 1) * 0.5;
      lum = 0.35 + height * 0.45;
      sat = 0.5 + intensity * 0.35;
    } else if (colorMode === 'velocity') {
      const v = Math.min(1, speed * 45);
      hue = 0.65 - v * 0.4;
      lum = 0.3 + v * 0.6;
      sat = 0.35 + v * 0.6 * intensity;
    } else {
      const n = (flow.x + flow.y + flow.z) / 3;
      hue = (0.58 + n * 0.18 + 1) % 1;
      lum = 0.38 + Math.abs(n) * 0.5;
      sat = 0.45 + intensity * 0.4;
    }

    const [r, g, b] = hslToRgb(hue, Math.min(1, sat * contrast), Math.min(0.85, lum * contrast));
    colors[i3] = r;
    colors[i3 + 1] = g;
    colors[i3 + 2] = b;
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
    const shouldUpdateColor = true;
    const targetCloud = handTargetsRef.current;
    const targetCount = formationEnabled ? targetCloud.count : 0;
    const maxTargets = 140;
    const targetStride = targetCount > 0 ? Math.ceil(targetCount / maxTargets) : 1;
    const formationPull = formationStrength * 0.0018;
    const formationDamp = formationStrength * 0.015;

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

      if (targetCount > 0 && formationDensity > 0) {
        const selector = selectSeeds[i] / 0xffffffff;
        if (selector < formationDensity) {
          let bestDx = 0;
          let bestDy = 0;
          let bestDz = 0;
          let minDist = Number.POSITIVE_INFINITY;
          const targetData = targetCloud.data;
          for (let t = 0; t < targetCount; t += targetStride) {
            const base = t * 4;
            const dx = targetData[base] - x;
            const dy = targetData[base + 1] - y;
            const dz = targetData[base + 2] - z;
            const dist = dx * dx + dy * dy + dz * dz;
            if (dist < minDist) {
              minDist = dist;
              bestDx = dx;
              bestDy = dy;
              bestDz = dz;
            }
          }
          if (minDist < Number.POSITIVE_INFINITY) {
            const dist = Math.sqrt(minDist) + 0.0001;
            velocities[i3] += (bestDx / dist) * formationPull;
            velocities[i3 + 1] += (bestDy / dist) * formationPull;
            velocities[i3 + 2] += (bestDz / dist) * formationPull;
            velocities[i3] *= 1 - formationDamp;
            velocities[i3 + 1] *= 1 - formationDamp;
            velocities[i3 + 2] *= 1 - formationDamp;
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

      if (shouldUpdateColor) {
        const speed = Math.hypot(
          velocities[i3],
          velocities[i3 + 1],
          velocities[i3 + 2]
        );
        updateColor(i3, x, y, z, speed, flow);
      }
    }

    geometry.attributes.position.needsUpdate = true;
    if (shouldUpdateColor) geometry.attributes.aColor.needsUpdate = true;
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
        attribute vec3 aColor;
        uniform float uSize;
        uniform float uVolume;
        varying float vScale;
        varying vec3 vColor;
        void main() {
          float depthScale = 1.0 - clamp(abs(position.z) / uVolume, 0.0, 1.0);
          vScale = aBaseScale * (0.6 + depthScale * 1.1);
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * vScale * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vScale;
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          float alpha = smoothstep(0.5, 0.0, d) * (0.28 + vScale * 0.35);
          vec3 color = mix(uColor, vColor, 0.85);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    }),
    []
  );

  return (
    <points key={`points-${count}`}>
      <bufferGeometry ref={geometryRef} key={`geom-${count}`}>
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
        <bufferAttribute
          attach="attributes-aColor"
          array={colors}
          count={count}
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
