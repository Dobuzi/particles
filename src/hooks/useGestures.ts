// Gesture detection for hand tracking
// Detects pinch, grab, and two-hand gestures for clay sculpting

import { useRef, useCallback } from 'react';
import type { Vec3, HandInfo } from '../types';

// Gesture state
export type GestureState = {
  // Pinch gesture (thumb + index close)
  leftPinch: boolean;
  rightPinch: boolean;
  leftPinchPoint: Vec3 | null;   // Midpoint between thumb and index
  rightPinchPoint: Vec3 | null;
  leftPinchStrength: number;     // 0-1 based on distance
  rightPinchStrength: number;

  // Grab gesture (all fingers curled toward palm)
  leftGrab: boolean;
  rightGrab: boolean;
  leftGrabCenter: Vec3 | null;
  rightGrabCenter: Vec3 | null;
  leftGrabStrength: number;
  rightGrabStrength: number;

  // Two-hand gestures
  twoHandDistance: number;       // Distance between hand centers
  twoHandCenter: Vec3 | null;    // Midpoint between hands
  twoHandAxis: Vec3 | null;      // Normalized direction between hands
};

// Landmark indices
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const WRIST = 0;
const INDEX_MCP = 5;   // Index finger base
const MIDDLE_MCP = 9;
const RING_MCP = 13;
const PINKY_MCP = 17;

// Thresholds (in normalized landmark space)
const PINCH_THRESHOLD = 0.08;      // Thumb-index distance for pinch
const PINCH_RELEASE = 0.12;        // Hysteresis for release
const GRAB_THRESHOLD = 0.15;       // Fingertip-to-palm distance for grab
const GRAB_RELEASE = 0.20;

// Calculate distance between two Vec3 points
function distance(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Calculate midpoint between two Vec3 points
function midpoint(a: Vec3, b: Vec3): Vec3 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

// Normalize a vector
function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len < 0.0001) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// Calculate palm center from MCP points
function palmCenter(landmarks: Vec3[]): Vec3 {
  const points = [landmarks[WRIST], landmarks[INDEX_MCP], landmarks[MIDDLE_MCP], landmarks[RING_MCP], landmarks[PINKY_MCP]];
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  return { x: x / points.length, y: y / points.length, z: z / points.length };
}

// Detect pinch gesture
function detectPinch(
  landmarks: Vec3[],
  prevPinch: boolean
): { isPinching: boolean; point: Vec3 | null; strength: number } {
  const thumbTip = landmarks[THUMB_TIP];
  const indexTip = landmarks[INDEX_TIP];
  const dist = distance(thumbTip, indexTip);

  // Hysteresis
  const threshold = prevPinch ? PINCH_RELEASE : PINCH_THRESHOLD;
  const isPinching = dist < threshold;

  // Strength: 1.0 when fully pinched, 0.0 at threshold
  const strength = isPinching ? Math.max(0, 1 - dist / PINCH_THRESHOLD) : 0;

  return {
    isPinching,
    point: isPinching ? midpoint(thumbTip, indexTip) : null,
    strength,
  };
}

// Detect grab gesture (all fingertips close to palm)
function detectGrab(
  landmarks: Vec3[],
  prevGrab: boolean
): { isGrabbing: boolean; center: Vec3 | null; strength: number } {
  const palm = palmCenter(landmarks);
  const fingertips = [
    landmarks[INDEX_TIP],
    landmarks[MIDDLE_TIP],
    landmarks[RING_TIP],
    landmarks[PINKY_TIP],
  ];

  // Average distance of fingertips to palm
  let totalDist = 0;
  for (const tip of fingertips) {
    totalDist += distance(tip, palm);
  }
  const avgDist = totalDist / fingertips.length;

  // Hysteresis
  const threshold = prevGrab ? GRAB_RELEASE : GRAB_THRESHOLD;
  const isGrabbing = avgDist < threshold;

  // Strength based on how tight the grab is
  const strength = isGrabbing ? Math.max(0, 1 - avgDist / GRAB_THRESHOLD) : 0;

  return {
    isGrabbing,
    center: isGrabbing ? palm : null,
    strength,
  };
}

// Hook for gesture detection
export function useGestures() {
  const stateRef = useRef<GestureState>({
    leftPinch: false,
    rightPinch: false,
    leftPinchPoint: null,
    rightPinchPoint: null,
    leftPinchStrength: 0,
    rightPinchStrength: 0,
    leftGrab: false,
    rightGrab: false,
    leftGrabCenter: null,
    rightGrabCenter: null,
    leftGrabStrength: 0,
    rightGrabStrength: 0,
    twoHandDistance: 0,
    twoHandCenter: null,
    twoHandAxis: null,
  });

  const updateGestures = useCallback((hands: HandInfo[]): GestureState => {
    const state = stateRef.current;

    // Find left and right hands
    let leftHand: HandInfo | null = null;
    let rightHand: HandInfo | null = null;
    for (const hand of hands) {
      if (hand.handedness === 'Left') leftHand = hand;
      else if (hand.handedness === 'Right') rightHand = hand;
    }

    // Left hand gestures
    if (leftHand) {
      const pinch = detectPinch(leftHand.landmarks, state.leftPinch);
      state.leftPinch = pinch.isPinching;
      state.leftPinchPoint = pinch.point;
      state.leftPinchStrength = pinch.strength;

      const grab = detectGrab(leftHand.landmarks, state.leftGrab);
      state.leftGrab = grab.isGrabbing;
      state.leftGrabCenter = grab.center;
      state.leftGrabStrength = grab.strength;
    } else {
      state.leftPinch = false;
      state.leftPinchPoint = null;
      state.leftPinchStrength = 0;
      state.leftGrab = false;
      state.leftGrabCenter = null;
      state.leftGrabStrength = 0;
    }

    // Right hand gestures
    if (rightHand) {
      const pinch = detectPinch(rightHand.landmarks, state.rightPinch);
      state.rightPinch = pinch.isPinching;
      state.rightPinchPoint = pinch.point;
      state.rightPinchStrength = pinch.strength;

      const grab = detectGrab(rightHand.landmarks, state.rightGrab);
      state.rightGrab = grab.isGrabbing;
      state.rightGrabCenter = grab.center;
      state.rightGrabStrength = grab.strength;
    } else {
      state.rightPinch = false;
      state.rightPinchPoint = null;
      state.rightPinchStrength = 0;
      state.rightGrab = false;
      state.rightGrabCenter = null;
      state.rightGrabStrength = 0;
    }

    // Two-hand gestures
    if (leftHand && rightHand) {
      const leftCenter = palmCenter(leftHand.landmarks);
      const rightCenter = palmCenter(rightHand.landmarks);

      state.twoHandDistance = distance(leftCenter, rightCenter);
      state.twoHandCenter = midpoint(leftCenter, rightCenter);
      state.twoHandAxis = normalize({
        x: rightCenter.x - leftCenter.x,
        y: rightCenter.y - leftCenter.y,
        z: rightCenter.z - leftCenter.z,
      });
    } else {
      state.twoHandDistance = 0;
      state.twoHandCenter = null;
      state.twoHandAxis = null;
    }

    return state;
  }, []);

  return {
    gestureState: stateRef.current,
    updateGestures,
  };
}
