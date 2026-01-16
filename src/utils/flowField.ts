import { createNoise3D } from 'simplex-noise';

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const noise3D = createNoise3D(mulberry32(42));

export function flowVector(x: number, y: number, z: number, t: number) {
  // Approximate curl-like flow by offsetting noise queries on each axis.
  const scale = 0.35;
  const time = t * 0.0002;
  const nx = x * scale + time;
  const ny = y * scale + time;
  const nz = z * scale + time;

  const x0 = noise3D(nx, ny, nz);
  const y0 = noise3D(ny + 31.4, nz + 17.9, nx + 7.2);
  const z0 = noise3D(nz + 11.5, nx + 23.1, ny + 5.6);

  return {
    x: x0,
    y: y0,
    z: z0,
  };
}
