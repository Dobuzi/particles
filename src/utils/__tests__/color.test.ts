import { describe, it, expect } from 'vitest';
import { hslToRgb, computeParticleColor, computeStreamColor } from '../color';
import type { ColorConfig } from '../../types';
import type { Vec3 } from '../../types';

// === hslToRgb ===

describe('hslToRgb', () => {
  it('converts pure red (h=0, s=1, l=0.5)', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('converts pure green (h=1/3, s=1, l=0.5)', () => {
    const [r, g, b] = hslToRgb(1 / 3, 1, 0.5);
    expect(r).toBeCloseTo(0, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('converts pure blue (h=2/3, s=1, l=0.5)', () => {
    const [r, g, b] = hslToRgb(2 / 3, 1, 0.5);
    expect(r).toBeCloseTo(0, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it('converts white (l=1)', () => {
    const [r, g, b] = hslToRgb(0, 0, 1);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it('converts black (l=0)', () => {
    const [r, g, b] = hslToRgb(0, 0, 0);
    expect(r).toBeCloseTo(0, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('converts gray (s=0, l=0.5)', () => {
    const [r, g, b] = hslToRgb(0, 0, 0.5);
    expect(r).toBeCloseTo(0.5, 2);
    expect(g).toBeCloseTo(0.5, 2);
    expect(b).toBeCloseTo(0.5, 2);
  });

  it('converts yellow (h=1/6, s=1, l=0.5)', () => {
    const [r, g, b] = hslToRgb(1 / 6, 1, 0.5);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('converts cyan (h=0.5, s=1, l=0.5)', () => {
    const [r, g, b] = hslToRgb(0.5, 1, 0.5);
    expect(r).toBeCloseTo(0, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it('converts magenta (h=5/6, s=1, l=0.5)', () => {
    const [r, g, b] = hslToRgb(5 / 6, 1, 0.5);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it('returns values in [0, 1] range for arbitrary valid inputs', () => {
    const hues = [0, 0.1, 0.2, 0.33, 0.5, 0.66, 0.8, 0.95];
    const sats = [0, 0.25, 0.5, 0.75, 1.0];
    const lums = [0, 0.25, 0.5, 0.75, 1.0];
    for (const h of hues) {
      for (const s of sats) {
        for (const l of lums) {
          const [r, g, b] = hslToRgb(h, s, l);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(1);
          expect(g).toBeGreaterThanOrEqual(0);
          expect(g).toBeLessThanOrEqual(1);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('desaturated colors approach gray at same lightness', () => {
    const [r, g, b] = hslToRgb(0.3, 0, 0.6);
    // With saturation 0, all channels should be equal to lightness
    expect(r).toBeCloseTo(0.6, 2);
    expect(g).toBeCloseTo(0.6, 2);
    expect(b).toBeCloseTo(0.6, 2);
  });
});

// === computeParticleColor ===

describe('computeParticleColor', () => {
  const basePosition: Vec3 = { x: 5, y: 3, z: 2 };
  const baseVelocity: Vec3 = { x: 0.01, y: 0.02, z: 0.01 };
  const baseFlow: Vec3 = { x: 0.5, y: -0.3, z: 0.1 };
  const volume = 20;

  describe('position mode', () => {
    const config: ColorConfig = {
      mode: 'position',
      intensity: 0.8,
      highContrast: false,
    };

    it('returns an RGB tuple with 3 elements', () => {
      const result = computeParticleColor(config, basePosition, baseVelocity, baseFlow, volume);
      expect(result).toHaveLength(3);
    });

    it('returns values in [0, 1] range', () => {
      const [r, g, b] = computeParticleColor(config, basePosition, baseVelocity, baseFlow, volume);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    });

    it('produces different colors for different positions', () => {
      const pos1: Vec3 = { x: 10, y: 0, z: 0 };
      const pos2: Vec3 = { x: 0, y: 0, z: 10 };
      const c1 = computeParticleColor(config, pos1, baseVelocity, baseFlow, volume);
      const c2 = computeParticleColor(config, pos2, baseVelocity, baseFlow, volume);
      // Different positions should give different hues
      const isDifferent = c1[0] !== c2[0] || c1[1] !== c2[1] || c1[2] !== c2[2];
      expect(isDifferent).toBe(true);
    });

    it('color varies with height (y position)', () => {
      const low: Vec3 = { x: 5, y: -10, z: 2 };
      const high: Vec3 = { x: 5, y: 10, z: 2 };
      const cLow = computeParticleColor(config, low, baseVelocity, baseFlow, volume);
      const cHigh = computeParticleColor(config, high, baseVelocity, baseFlow, volume);
      // Lightness should differ between low and high y
      const isDifferent = cLow[0] !== cHigh[0] || cLow[1] !== cHigh[1] || cLow[2] !== cHigh[2];
      expect(isDifferent).toBe(true);
    });

    it('high contrast mode changes the result', () => {
      const configHC: ColorConfig = { mode: 'position', intensity: 0.8, highContrast: true };
      const normal = computeParticleColor(config, basePosition, baseVelocity, baseFlow, volume);
      const contrast = computeParticleColor(configHC, basePosition, baseVelocity, baseFlow, volume);
      const isDifferent = normal[0] !== contrast[0] || normal[1] !== contrast[1] || normal[2] !== contrast[2];
      expect(isDifferent).toBe(true);
    });
  });

  describe('velocity mode', () => {
    const config: ColorConfig = {
      mode: 'velocity',
      intensity: 0.8,
      highContrast: false,
    };

    it('returns an RGB tuple with 3 elements', () => {
      const result = computeParticleColor(config, basePosition, baseVelocity, baseFlow, volume);
      expect(result).toHaveLength(3);
    });

    it('returns values in [0, 1] range', () => {
      const [r, g, b] = computeParticleColor(config, basePosition, baseVelocity, baseFlow, volume);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    });

    it('produces different colors for slow vs fast particles', () => {
      const slow: Vec3 = { x: 0.001, y: 0, z: 0 };
      const fast: Vec3 = { x: 0.5, y: 0.5, z: 0.5 };
      const cSlow = computeParticleColor(config, basePosition, slow, baseFlow, volume);
      const cFast = computeParticleColor(config, basePosition, fast, baseFlow, volume);
      const isDifferent = cSlow[0] !== cFast[0] || cSlow[1] !== cFast[1] || cSlow[2] !== cFast[2];
      expect(isDifferent).toBe(true);
    });

    it('faster particles are brighter (higher luminance)', () => {
      const slow: Vec3 = { x: 0.001, y: 0, z: 0 };
      const fast: Vec3 = { x: 0.5, y: 0.5, z: 0.5 };
      const cSlow = computeParticleColor(config, basePosition, slow, baseFlow, volume);
      const cFast = computeParticleColor(config, basePosition, fast, baseFlow, volume);
      // Approximate luminance: 0.299*r + 0.587*g + 0.114*b
      const lumSlow = 0.299 * cSlow[0] + 0.587 * cSlow[1] + 0.114 * cSlow[2];
      const lumFast = 0.299 * cFast[0] + 0.587 * cFast[1] + 0.114 * cFast[2];
      expect(lumFast).toBeGreaterThan(lumSlow);
    });

    it('zero velocity still returns valid color', () => {
      const zero: Vec3 = { x: 0, y: 0, z: 0 };
      const [r, g, b] = computeParticleColor(config, basePosition, zero, baseFlow, volume);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
    });
  });

  describe('noise mode', () => {
    const config: ColorConfig = {
      mode: 'noise',
      intensity: 0.8,
      highContrast: false,
    };

    it('returns an RGB tuple with 3 elements', () => {
      const result = computeParticleColor(config, basePosition, baseVelocity, baseFlow, volume);
      expect(result).toHaveLength(3);
    });

    it('returns values in [0, 1] range', () => {
      const [r, g, b] = computeParticleColor(config, basePosition, baseVelocity, baseFlow, volume);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    });

    it('produces different colors for different flow values', () => {
      const flow1: Vec3 = { x: 0.8, y: 0.8, z: 0.8 };
      const flow2: Vec3 = { x: -0.8, y: -0.8, z: -0.8 };
      const c1 = computeParticleColor(config, basePosition, baseVelocity, flow1, volume);
      const c2 = computeParticleColor(config, basePosition, baseVelocity, flow2, volume);
      const isDifferent = c1[0] !== c2[0] || c1[1] !== c2[1] || c1[2] !== c2[2];
      expect(isDifferent).toBe(true);
    });

    it('flow values with different signs produce different lightness', () => {
      const flowPos: Vec3 = { x: 1, y: 1, z: 1 };
      const flowNeg: Vec3 = { x: -1, y: -1, z: -1 };
      const cPos = computeParticleColor(config, basePosition, baseVelocity, flowPos, volume);
      const cNeg = computeParticleColor(config, basePosition, baseVelocity, flowNeg, volume);
      const isDifferent = cPos[0] !== cNeg[0] || cPos[1] !== cNeg[1] || cPos[2] !== cNeg[2];
      expect(isDifferent).toBe(true);
    });
  });

  describe('intensity and contrast', () => {
    it('clamps intensity below 0.2 to 0.2', () => {
      const configLow: ColorConfig = { mode: 'position', intensity: 0, highContrast: false };
      const configMin: ColorConfig = { mode: 'position', intensity: 0.2, highContrast: false };
      const cLow = computeParticleColor(configLow, basePosition, baseVelocity, baseFlow, volume);
      const cMin = computeParticleColor(configMin, basePosition, baseVelocity, baseFlow, volume);
      // Intensity 0 is clamped to 0.2, so both should produce identical results
      expect(cLow[0]).toBeCloseTo(cMin[0], 5);
      expect(cLow[1]).toBeCloseTo(cMin[1], 5);
      expect(cLow[2]).toBeCloseTo(cMin[2], 5);
    });

    it('clamps intensity above 1 to 1', () => {
      const configHigh: ColorConfig = { mode: 'position', intensity: 5, highContrast: false };
      const configMax: ColorConfig = { mode: 'position', intensity: 1, highContrast: false };
      const cHigh = computeParticleColor(configHigh, basePosition, baseVelocity, baseFlow, volume);
      const cMax = computeParticleColor(configMax, basePosition, baseVelocity, baseFlow, volume);
      expect(cHigh[0]).toBeCloseTo(cMax[0], 5);
      expect(cHigh[1]).toBeCloseTo(cMax[1], 5);
      expect(cHigh[2]).toBeCloseTo(cMax[2], 5);
    });
  });
});

// === computeStreamColor ===

describe('computeStreamColor', () => {
  it('returns an RGB tuple with 3 elements', () => {
    const result = computeStreamColor(0.5, 0, 0.8);
    expect(result).toHaveLength(3);
  });

  it('returns values in [0, 1] range', () => {
    for (let finger = 0; finger < 5; finger++) {
      for (const t of [0, 0.25, 0.5, 0.75, 1.0]) {
        const [r, g, b] = computeStreamColor(t, finger, 0.8);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
      }
    }
  });

  it('produces different colors for different fingers', () => {
    const c0 = computeStreamColor(0.5, 0, 0.8);
    const c2 = computeStreamColor(0.5, 2, 0.8);
    const isDifferent = c0[0] !== c2[0] || c0[1] !== c2[1] || c0[2] !== c2[2];
    expect(isDifferent).toBe(true);
  });

  it('middle of stream (t=0.5) is brighter than endpoints', () => {
    const cMid = computeStreamColor(0.5, 0, 0.8);
    const cStart = computeStreamColor(0, 0, 0.8);
    const cEnd = computeStreamColor(1, 0, 0.8);
    // Luminance approximation
    const lumMid = 0.299 * cMid[0] + 0.587 * cMid[1] + 0.114 * cMid[2];
    const lumStart = 0.299 * cStart[0] + 0.587 * cStart[1] + 0.114 * cStart[2];
    const lumEnd = 0.299 * cEnd[0] + 0.587 * cEnd[1] + 0.114 * cEnd[2];
    expect(lumMid).toBeGreaterThanOrEqual(lumStart);
    expect(lumMid).toBeGreaterThanOrEqual(lumEnd);
  });

  it('higher intensity increases saturation', () => {
    const cLow = computeStreamColor(0.5, 2, 0.1);
    const cHigh = computeStreamColor(0.5, 2, 1.0);
    // Higher intensity should produce more saturated (more colorful) result
    // The colors should be different
    const isDifferent = cLow[0] !== cHigh[0] || cLow[1] !== cHigh[1] || cLow[2] !== cHigh[2];
    expect(isDifferent).toBe(true);
  });

  it('each finger has a distinct base hue', () => {
    // Collect colors for each finger at same t and intensity
    const colors = [];
    for (let finger = 0; finger < 5; finger++) {
      colors.push(computeStreamColor(0.5, finger, 0.8));
    }
    // Each finger should produce a unique color (no two identical)
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const same =
          colors[i][0] === colors[j][0] &&
          colors[i][1] === colors[j][1] &&
          colors[i][2] === colors[j][2];
        expect(same).toBe(false);
      }
    }
  });
});
