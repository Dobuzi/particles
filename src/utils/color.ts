// Color utilities for particle visualization

import type { Vec3, ColorConfig } from '../types';
import { clamp } from './math';

export type RGB = [number, number, number];

export const hslToRgb = (h: number, s: number, l: number): RGB => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp >= 1 && hp < 2) [r, g, b] = [x, c, 0];
  else if (hp >= 2 && hp < 3) [r, g, b] = [0, c, x];
  else if (hp >= 3 && hp < 4) [r, g, b] = [0, x, c];
  else if (hp >= 4 && hp < 5) [r, g, b] = [x, 0, c];
  else if (hp >= 5 && hp < 6) [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
};

export const computeParticleColor = (
  config: ColorConfig,
  position: Vec3,
  velocity: Vec3,
  flow: Vec3,
  volume: number
): RGB => {
  const intensity = Math.max(0.2, Math.min(1, config.intensity));
  const contrast = config.highContrast ? 1.2 : 1.0;
  let hue = 0.55;
  let sat = 0.55 * intensity;
  let lum = 0.55;

  if (config.mode === 'position') {
    const angle = Math.atan2(position.z, position.x);
    hue = (angle / (Math.PI * 2) + 1) % 1;
    const height = (position.y / volume + 1) * 0.5;
    lum = 0.35 + height * 0.45;
    sat = 0.5 + intensity * 0.35;
  } else if (config.mode === 'velocity') {
    const speed = Math.sqrt(
      velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z
    );
    const v = Math.min(1, speed * 45);
    hue = 0.65 - v * 0.4;
    lum = 0.3 + v * 0.6;
    sat = 0.35 + v * 0.6 * intensity;
  } else {
    // noise mode
    const n = (flow.x + flow.y + flow.z) / 3;
    hue = (0.58 + n * 0.18 + 1) % 1;
    lum = 0.38 + Math.abs(n) * 0.5;
    sat = 0.45 + intensity * 0.4;
  }

  const [r, g, b] = hslToRgb(
    hue,
    clamp(sat * contrast, 0, 1),
    clamp(lum * contrast, 0, 0.85)
  );
  return [r, g, b];
};

// Stream-specific coloring: gradient based on parameter t along stream
export const computeStreamColor = (
  t: number, // 0 = left fingertip, 1 = right fingertip
  fingerIndex: number, // 0-4 for thumb through pinky
  intensity: number
): RGB => {
  // Each finger gets a distinct hue range
  const baseHues = [0.0, 0.15, 0.35, 0.55, 0.75]; // warm to cool spectrum
  const hue = (baseHues[fingerIndex] + t * 0.08) % 1;
  const sat = 0.6 + intensity * 0.3;
  const lum = 0.45 + (1 - Math.abs(t - 0.5) * 2) * 0.25; // brighter in middle
  return hslToRgb(hue, sat, lum);
};
