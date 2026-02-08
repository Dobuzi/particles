import { describe, it, expect } from 'vitest';
import {
  clamp,
  lerp,
  smoothstep,
  vec3,
  vec3Zero,
  vec3Add,
  vec3Sub,
  vec3Scale,
  vec3Lerp,
  vec3Length,
  vec3Distance,
  vec3Normalize,
  vec3Dot,
  smoothVec3,
  smoothLandmarks,
  xorshift32,
  randomInRange,
} from '../math';

// === Scalar Operations ===

describe('clamp', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('works with negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  it('works when min equals max', () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(1, 3, 3)).toBe(3);
  });
});

describe('lerp', () => {
  it('returns a when t is 0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b when t is 1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('returns midpoint when t is 0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it('interpolates correctly at 0.25', () => {
    expect(lerp(0, 100, 0.25)).toBe(25);
  });

  it('works with negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });

  it('extrapolates when t > 1', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });

  it('extrapolates when t < 0', () => {
    expect(lerp(0, 10, -1)).toBe(-10);
  });
});

describe('smoothstep', () => {
  it('returns 0 when x is at or below edge0', () => {
    expect(smoothstep(0, 1, 0)).toBe(0);
    expect(smoothstep(0, 1, -1)).toBe(0);
  });

  it('returns 1 when x is at or above edge1', () => {
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it('returns 0.5 at the midpoint', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });

  it('produces smooth interpolation (derivative is 0 at edges)', () => {
    // Values near edges should be very close to 0 or 1
    const nearZero = smoothstep(0, 1, 0.01);
    const nearOne = smoothstep(0, 1, 0.99);
    expect(nearZero).toBeGreaterThan(0);
    expect(nearZero).toBeLessThan(0.01);
    expect(nearOne).toBeGreaterThan(0.99);
    expect(nearOne).toBeLessThan(1);
  });

  it('works with custom edge values', () => {
    expect(smoothstep(2, 4, 2)).toBe(0);
    expect(smoothstep(2, 4, 4)).toBe(1);
    expect(smoothstep(2, 4, 3)).toBe(0.5);
  });

  it('is monotonically increasing', () => {
    let prev = 0;
    for (let i = 0; i <= 10; i++) {
      const val = smoothstep(0, 1, i / 10);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });
});

// === Vector Operations ===

describe('vec3', () => {
  it('creates a vector with given components', () => {
    const v = vec3(1, 2, 3);
    expect(v).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('creates a vector with negative components', () => {
    const v = vec3(-1, -2, -3);
    expect(v).toEqual({ x: -1, y: -2, z: -3 });
  });

  it('creates a vector with zero components', () => {
    const v = vec3(0, 0, 0);
    expect(v).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('creates a vector with decimal components', () => {
    const v = vec3(1.5, 2.7, 3.9);
    expect(v.x).toBeCloseTo(1.5);
    expect(v.y).toBeCloseTo(2.7);
    expect(v.z).toBeCloseTo(3.9);
  });
});

describe('vec3Zero', () => {
  it('returns a zero vector', () => {
    expect(vec3Zero()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('returns a new object each time', () => {
    const a = vec3Zero();
    const b = vec3Zero();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('vec3Add', () => {
  it('adds two vectors', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(vec3Add(a, b)).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('adds with zero vector (identity)', () => {
    const a = vec3(1, 2, 3);
    expect(vec3Add(a, vec3Zero())).toEqual(a);
  });

  it('is commutative', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(vec3Add(a, b)).toEqual(vec3Add(b, a));
  });

  it('handles negative values', () => {
    const a = vec3(1, -2, 3);
    const b = vec3(-1, 2, -3);
    expect(vec3Add(a, b)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('vec3Sub', () => {
  it('subtracts two vectors', () => {
    const a = vec3(5, 7, 9);
    const b = vec3(1, 2, 3);
    expect(vec3Sub(a, b)).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('subtracting zero vector returns original', () => {
    const a = vec3(1, 2, 3);
    expect(vec3Sub(a, vec3Zero())).toEqual(a);
  });

  it('subtracting self returns zero', () => {
    const a = vec3(3, 4, 5);
    expect(vec3Sub(a, a)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('vec3Scale', () => {
  it('scales a vector by a positive scalar', () => {
    const v = vec3(1, 2, 3);
    expect(vec3Scale(v, 2)).toEqual({ x: 2, y: 4, z: 6 });
  });

  it('scales by zero gives zero vector', () => {
    const v = vec3(5, 10, 15);
    expect(vec3Scale(v, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('scales by 1 returns same values', () => {
    const v = vec3(3, 4, 5);
    expect(vec3Scale(v, 1)).toEqual({ x: 3, y: 4, z: 5 });
  });

  it('scales by negative scalar negates vector', () => {
    const v = vec3(1, 2, 3);
    expect(vec3Scale(v, -1)).toEqual({ x: -1, y: -2, z: -3 });
  });

  it('scales by fractional value', () => {
    const v = vec3(10, 20, 30);
    expect(vec3Scale(v, 0.5)).toEqual({ x: 5, y: 10, z: 15 });
  });
});

describe('vec3Lerp', () => {
  it('returns a when t is 0', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(vec3Lerp(a, b, 0)).toEqual(a);
  });

  it('returns b when t is 1', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(vec3Lerp(a, b, 1)).toEqual(b);
  });

  it('returns midpoint when t is 0.5', () => {
    const a = vec3(0, 0, 0);
    const b = vec3(10, 20, 30);
    expect(vec3Lerp(a, b, 0.5)).toEqual({ x: 5, y: 10, z: 15 });
  });

  it('interpolates each component independently', () => {
    const a = vec3(0, 10, 20);
    const b = vec3(10, 10, 0);
    const result = vec3Lerp(a, b, 0.5);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
    expect(result.z).toBe(10);
  });
});

describe('vec3Length', () => {
  it('returns 0 for zero vector', () => {
    expect(vec3Length(vec3Zero())).toBe(0);
  });

  it('returns correct length for unit axis vectors', () => {
    expect(vec3Length(vec3(1, 0, 0))).toBe(1);
    expect(vec3Length(vec3(0, 1, 0))).toBe(1);
    expect(vec3Length(vec3(0, 0, 1))).toBe(1);
  });

  it('computes length for 3-4-5 triangle analog (3,4,0)', () => {
    expect(vec3Length(vec3(3, 4, 0))).toBe(5);
  });

  it('computes length for (1,1,1)', () => {
    expect(vec3Length(vec3(1, 1, 1))).toBeCloseTo(Math.sqrt(3));
  });

  it('length is always non-negative', () => {
    expect(vec3Length(vec3(-3, -4, 0))).toBe(5);
  });
});

describe('vec3Distance', () => {
  it('returns 0 for same points', () => {
    const a = vec3(1, 2, 3);
    expect(vec3Distance(a, a)).toBe(0);
  });

  it('computes distance between two points', () => {
    const a = vec3(0, 0, 0);
    const b = vec3(3, 4, 0);
    expect(vec3Distance(a, b)).toBe(5);
  });

  it('is commutative', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(vec3Distance(a, b)).toBe(vec3Distance(b, a));
  });

  it('satisfies triangle inequality', () => {
    const a = vec3(0, 0, 0);
    const b = vec3(1, 0, 0);
    const c = vec3(0, 1, 0);
    expect(vec3Distance(a, c)).toBeLessThanOrEqual(
      vec3Distance(a, b) + vec3Distance(b, c)
    );
  });
});

describe('vec3Normalize', () => {
  it('normalizes a vector to unit length', () => {
    const v = vec3(3, 4, 0);
    const n = vec3Normalize(v);
    expect(vec3Length(n)).toBeCloseTo(1);
  });

  it('preserves direction', () => {
    const v = vec3(3, 4, 0);
    const n = vec3Normalize(v);
    expect(n.x).toBeCloseTo(3 / 5);
    expect(n.y).toBeCloseTo(4 / 5);
    expect(n.z).toBeCloseTo(0);
  });

  it('normalizing a unit vector returns the same direction', () => {
    const v = vec3(1, 0, 0);
    const n = vec3Normalize(v);
    expect(n).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('handles zero vector by dividing by 1 (no NaN)', () => {
    // The implementation uses || 1 to avoid division by zero
    const v = vec3Zero();
    const n = vec3Normalize(v);
    expect(n.x).toBe(0);
    expect(n.y).toBe(0);
    expect(n.z).toBe(0);
    expect(Number.isNaN(n.x)).toBe(false);
    expect(Number.isNaN(n.y)).toBe(false);
    expect(Number.isNaN(n.z)).toBe(false);
  });

  it('normalizes negative vectors correctly', () => {
    const v = vec3(-3, -4, 0);
    const n = vec3Normalize(v);
    expect(vec3Length(n)).toBeCloseTo(1);
    expect(n.x).toBeCloseTo(-3 / 5);
    expect(n.y).toBeCloseTo(-4 / 5);
  });
});

describe('vec3Dot', () => {
  it('computes dot product of orthogonal vectors as 0', () => {
    expect(vec3Dot(vec3(1, 0, 0), vec3(0, 1, 0))).toBe(0);
    expect(vec3Dot(vec3(1, 0, 0), vec3(0, 0, 1))).toBe(0);
    expect(vec3Dot(vec3(0, 1, 0), vec3(0, 0, 1))).toBe(0);
  });

  it('computes dot product of parallel vectors', () => {
    expect(vec3Dot(vec3(1, 0, 0), vec3(1, 0, 0))).toBe(1);
    expect(vec3Dot(vec3(2, 0, 0), vec3(3, 0, 0))).toBe(6);
  });

  it('computes dot product of anti-parallel vectors', () => {
    expect(vec3Dot(vec3(1, 0, 0), vec3(-1, 0, 0))).toBe(-1);
  });

  it('is commutative', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    expect(vec3Dot(a, b)).toBe(vec3Dot(b, a));
  });

  it('dot product with itself equals squared length', () => {
    const v = vec3(3, 4, 5);
    const len = vec3Length(v);
    expect(vec3Dot(v, v)).toBeCloseTo(len * len);
  });

  it('computes correctly for general vectors', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    expect(vec3Dot(a, b)).toBe(32);
  });
});

// === Smoothing / Filtering ===

describe('smoothVec3', () => {
  it('returns current when previous is null', () => {
    const current = vec3(1, 2, 3);
    expect(smoothVec3(null, current, 0.5)).toEqual(current);
  });

  it('returns previous when alpha is 0 (no smoothing toward current)', () => {
    const prev = vec3(0, 0, 0);
    const curr = vec3(10, 10, 10);
    expect(smoothVec3(prev, curr, 0)).toEqual(prev);
  });

  it('returns current when alpha is 1 (full weight to current)', () => {
    const prev = vec3(0, 0, 0);
    const curr = vec3(10, 10, 10);
    expect(smoothVec3(prev, curr, 1)).toEqual(curr);
  });

  it('smooths at alpha 0.5 to midpoint', () => {
    const prev = vec3(0, 0, 0);
    const curr = vec3(10, 20, 30);
    const result = smoothVec3(prev, curr, 0.5);
    expect(result).toEqual({ x: 5, y: 10, z: 15 });
  });
});

describe('smoothLandmarks', () => {
  it('returns current landmarks when previous is null', () => {
    const current = [vec3(1, 2, 3), vec3(4, 5, 6)];
    expect(smoothLandmarks(null, current, 0.5)).toEqual(current);
  });

  it('smooths each landmark toward current by alpha', () => {
    const prev = [vec3(0, 0, 0), vec3(10, 10, 10)];
    const curr = [vec3(10, 10, 10), vec3(20, 20, 20)];
    const result = smoothLandmarks(prev, curr, 0.5);
    expect(result[0]).toEqual({ x: 5, y: 5, z: 5 });
    expect(result[1]).toEqual({ x: 15, y: 15, z: 15 });
  });

  it('handles mismatched lengths (current longer than previous)', () => {
    const prev = [vec3(0, 0, 0)];
    const curr = [vec3(10, 10, 10), vec3(20, 20, 20)];
    const result = smoothLandmarks(prev, curr, 0.5);
    // First point smoothed with prev[0]
    expect(result[0]).toEqual({ x: 5, y: 5, z: 5 });
    // Second point: prev[1] is undefined, so uses curr[1] as fallback
    expect(result[1]).toEqual({ x: 20, y: 20, z: 20 });
  });

  it('returns current values when alpha is 1', () => {
    const prev = [vec3(0, 0, 0)];
    const curr = [vec3(10, 20, 30)];
    const result = smoothLandmarks(prev, curr, 1);
    expect(result[0]).toEqual(curr[0]);
  });

  it('returns previous values when alpha is 0', () => {
    const prev = [vec3(1, 2, 3)];
    const curr = [vec3(10, 20, 30)];
    const result = smoothLandmarks(prev, curr, 0);
    expect(result[0]).toEqual(prev[0]);
  });
});

// === Random ===

describe('xorshift32', () => {
  it('produces a non-zero result from a non-zero seed', () => {
    const result = xorshift32(1);
    expect(result).not.toBe(0);
  });

  it('is deterministic (same seed gives same result)', () => {
    expect(xorshift32(42)).toBe(xorshift32(42));
  });

  it('produces different results for different seeds', () => {
    expect(xorshift32(1)).not.toBe(xorshift32(2));
    expect(xorshift32(100)).not.toBe(xorshift32(200));
  });

  it('returns an unsigned 32-bit integer (>= 0)', () => {
    const seeds = [1, 42, 12345, 999999, 2147483647];
    for (const seed of seeds) {
      const result = xorshift32(seed);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('generates a sequence of non-repeating values for several iterations', () => {
    const seen = new Set<number>();
    let state = 1;
    for (let i = 0; i < 100; i++) {
      state = xorshift32(state);
      expect(seen.has(state)).toBe(false);
      seen.add(state);
    }
  });
});

describe('randomInRange', () => {
  it('returns a value within the given range', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomInRange(5, 10);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThan(10);
    }
  });

  it('returns min when range is zero', () => {
    expect(randomInRange(5, 5)).toBe(5);
  });

  it('works with negative ranges', () => {
    for (let i = 0; i < 50; i++) {
      const val = randomInRange(-10, -5);
      expect(val).toBeGreaterThanOrEqual(-10);
      expect(val).toBeLessThan(-5);
    }
  });

  it('works with a range crossing zero', () => {
    for (let i = 0; i < 50; i++) {
      const val = randomInRange(-5, 5);
      expect(val).toBeGreaterThanOrEqual(-5);
      expect(val).toBeLessThan(5);
    }
  });
});
