import { describe, it, expect } from 'vitest';
import type { Vec3 } from '../../types';
import { flowVector } from '../flowField';

describe('flowVector', () => {
  it('returns an object with x, y, z properties', () => {
    const result = flowVector(0, 0, 0, 0);
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
    expect(result).toHaveProperty('z');
  });

  it('returns numeric values for each component', () => {
    const result = flowVector(1, 2, 3, 100);
    expect(typeof result.x).toBe('number');
    expect(typeof result.y).toBe('number');
    expect(typeof result.z).toBe('number');
  });

  it('values are in the expected range [-1, 1] (simplex noise range)', () => {
    const testPoints = [
      [0, 0, 0, 0],
      [1, 2, 3, 100],
      [-5, 10, -15, 5000],
      [100, 200, 300, 10000],
      [0.5, 0.5, 0.5, 50],
    ];
    for (const [x, y, z, t] of testPoints) {
      const result = flowVector(x, y, z, t);
      expect(result.x).toBeGreaterThanOrEqual(-1);
      expect(result.x).toBeLessThanOrEqual(1);
      expect(result.y).toBeGreaterThanOrEqual(-1);
      expect(result.y).toBeLessThanOrEqual(1);
      expect(result.z).toBeGreaterThanOrEqual(-1);
      expect(result.z).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic: same inputs produce same outputs', () => {
    const a = flowVector(1.5, 2.5, 3.5, 1000);
    const b = flowVector(1.5, 2.5, 3.5, 1000);
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.z).toBe(b.z);
  });

  it('different spatial inputs give different outputs', () => {
    const a = flowVector(0, 0, 0, 0);
    const b = flowVector(10, 10, 10, 0);
    const isSame = a.x === b.x && a.y === b.y && a.z === b.z;
    expect(isSame).toBe(false);
  });

  it('different time inputs give different outputs', () => {
    const a = flowVector(1, 1, 1, 0);
    const b = flowVector(1, 1, 1, 100000);
    const isSame = a.x === b.x && a.y === b.y && a.z === b.z;
    expect(isSame).toBe(false);
  });

  it('nearby points produce similar but not identical flow vectors', () => {
    const a = flowVector(1, 1, 1, 0);
    const b = flowVector(1.001, 1.001, 1.001, 0);
    // Values should be close but not exactly the same (noise is smooth)
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.1);
    expect(Math.abs(a.z - b.z)).toBeLessThan(0.1);
    // But not identical
    const isSame = a.x === b.x && a.y === b.y && a.z === b.z;
    expect(isSame).toBe(false);
  });

  it('does not return NaN for any component', () => {
    const testPoints = [
      [0, 0, 0, 0],
      [999, -999, 0, 50000],
      [0.001, 0.001, 0.001, 1],
    ];
    for (const [x, y, z, t] of testPoints) {
      const result = flowVector(x, y, z, t);
      expect(Number.isNaN(result.x)).toBe(false);
      expect(Number.isNaN(result.y)).toBe(false);
      expect(Number.isNaN(result.z)).toBe(false);
    }
  });

  it('does not return Infinity for any component', () => {
    const result = flowVector(1e6, 1e6, 1e6, 1e6);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.z)).toBe(true);
  });

  it('produces varied output across a grid of points', () => {
    // Sample a small grid and verify not all vectors are the same
    const vectors: Vec3[] = [];
    for (let i = 0; i < 5; i++) {
      vectors.push(flowVector(i * 3, 0, 0, 0));
    }
    // Not all x components should be identical
    const allSameX = vectors.every((v) => v.x === vectors[0].x);
    expect(allSameX).toBe(false);
    // Not all y components should be identical
    const allSameY = vectors.every((v) => v.y === vectors[0].y);
    expect(allSameY).toBe(false);
    // Not all z components should be identical
    const allSameZ = vectors.every((v) => v.z === vectors[0].z);
    expect(allSameZ).toBe(false);
  });

  it('time parameter evolves the field smoothly', () => {
    // Sample the same point at incrementally different times
    const results: Vec3[] = [];
    for (let t = 0; t < 50000; t += 10000) {
      results.push(flowVector(1, 1, 1, t));
    }
    // Consecutive samples should change gradually, not jump wildly
    for (let i = 1; i < results.length; i++) {
      const dx = Math.abs(results[i].x - results[i - 1].x);
      const dy = Math.abs(results[i].y - results[i - 1].y);
      const dz = Math.abs(results[i].z - results[i - 1].z);
      // Each step changes by less than the full range
      expect(dx).toBeLessThan(2);
      expect(dy).toBeLessThan(2);
      expect(dz).toBeLessThan(2);
    }
  });
});
