// Hook to extract and pair fingertips between two hands

import { useRef, useCallback } from 'react';
import type { Vec3, FingertipPair, FingerName, HandInfo } from '../types';
import { FINGERTIP_INDICES } from '../types';
import { vec3Lerp } from '../utils/math';

const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// Smoothing factor for fingertip position updates (0 = no smoothing, 1 = no update)
const SMOOTHING_ALPHA = 0.35;

export type FingertipPairsState = {
  pairs: FingertipPair[];
  leftHand: HandInfo | null;
  rightHand: HandInfo | null;
  hasBothHands: boolean;
};

export function useFingertipPairs() {
  // Use refs to avoid React state updates in hot path
  const pairsRef = useRef<FingertipPair[]>(
    FINGER_NAMES.map((finger) => ({
      finger,
      left: null,
      right: null,
      active: false,
    }))
  );

  const prevLeftRef = useRef<Vec3[] | null>(null);
  const prevRightRef = useRef<Vec3[] | null>(null);

  const extractFingertips = useCallback(
    (landmarks: Vec3[], volume: number): Vec3[] => {
      return FINGER_NAMES.map((finger) => {
        const idx = FINGERTIP_INDICES[finger];
        const lm = landmarks[idx];
        // Convert from normalized [0,1] to world space [-volume, volume]
        // X is mirrored (0.5 - lm.x) so user's left hand appears on screen left
        return {
          x: (0.5 - lm.x) * 2 * volume,
          y: (0.5 - lm.y) * 2 * volume,
          z: (lm.z || 0) * volume * 0.6, // MediaPipe z is relative depth
        };
      });
    },
    []
  );

  const smoothFingertips = useCallback(
    (current: Vec3[], previous: Vec3[] | null): Vec3[] => {
      if (!previous) return current;
      return current.map((tip, i) => vec3Lerp(previous[i], tip, SMOOTHING_ALPHA));
    },
    []
  );

  const updateFromHands = useCallback(
    (hands: HandInfo[], volume: number): FingertipPairsState => {
      let leftHand: HandInfo | null = null;
      let rightHand: HandInfo | null = null;

      // Separate hands by handedness
      for (const hand of hands) {
        if (hand.handedness === 'Left' && !leftHand) {
          leftHand = hand;
        } else if (hand.handedness === 'Right' && !rightHand) {
          rightHand = hand;
        } else if (!leftHand) {
          leftHand = hand;
        } else if (!rightHand) {
          rightHand = hand;
        }
      }

      // Extract and smooth fingertips
      let leftTips: Vec3[] | null = null;
      let rightTips: Vec3[] | null = null;

      if (leftHand) {
        const raw = extractFingertips(leftHand.landmarks, volume);
        leftTips = smoothFingertips(raw, prevLeftRef.current);
        prevLeftRef.current = leftTips;
      } else {
        prevLeftRef.current = null;
      }

      if (rightHand) {
        const raw = extractFingertips(rightHand.landmarks, volume);
        rightTips = smoothFingertips(raw, prevRightRef.current);
        prevRightRef.current = rightTips;
      } else {
        prevRightRef.current = null;
      }

      // Update pairs
      const hasBothHands = leftTips !== null && rightTips !== null;
      const pairs = FINGER_NAMES.map((finger, i) => ({
        finger,
        left: leftTips ? leftTips[i] : null,
        right: rightTips ? rightTips[i] : null,
        active: hasBothHands,
      }));

      pairsRef.current = pairs;

      return {
        pairs,
        leftHand,
        rightHand,
        hasBothHands,
      };
    },
    [extractFingertips, smoothFingertips]
  );

  const clearPairs = useCallback(() => {
    pairsRef.current = FINGER_NAMES.map((finger) => ({
      finger,
      left: null,
      right: null,
      active: false,
    }));
    prevLeftRef.current = null;
    prevRightRef.current = null;
  }, []);

  return {
    pairsRef,
    updateFromHands,
    clearPairs,
  };
}
