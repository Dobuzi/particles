// Core math utilities for particle simulation

import type { Vec3 } from '../types';

// === Scalar Operations ===

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

// === Vector Operations ===

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const vec3Zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });

export const vec3Add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

export const vec3Sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

export const vec3Scale = (v: Vec3, s: number): Vec3 => ({
  x: v.x * s,
  y: v.y * s,
  z: v.z * s,
});

export const vec3Lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
});

export const vec3Length = (v: Vec3): number =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

export const vec3Distance = (a: Vec3, b: Vec3): number =>
  vec3Length(vec3Sub(a, b));

export const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v) || 1;
  return vec3Scale(v, 1 / len);
};

export const vec3Dot = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

// === Smoothing / Filtering ===

export const smoothVec3 = (
  previous: Vec3 | null,
  current: Vec3,
  alpha: number
): Vec3 => {
  if (!previous) return current;
  return vec3Lerp(previous, current, alpha);
};

export const smoothLandmarks = (
  previous: Vec3[] | null,
  current: Vec3[],
  alpha: number
): Vec3[] =>
  current.map((point, idx) => {
    if (!previous) return point;
    const prev = previous[idx] || point;
    return vec3Lerp(prev, point, alpha);
  });

// === Random ===

export const xorshift32 = (state: number): number => {
  let x = state | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
};

export const randomInRange = (min: number, max: number): number =>
  min + Math.random() * (max - min);
