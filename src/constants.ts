// Shared constants for the particle visualization system

// === World Space ===

/** Half-width of the 3D bounding volume for particles */
export const VOLUME = 2.6;

// === Hand Tracking ===

/** Process every N-th frame for hand detection (higher = less CPU, more latency) */
export const HAND_TRACKING_FRAME_SKIP = 2;

/** Process every N-th frame for hand drawing mode */
export const HAND_DRAWING_FRAME_SKIP = 3;

/** Exponential smoothing factor for landmark positions (0 = frozen, 1 = raw) */
export const SMOOTHING_ALPHA = 0.35;

// === Gesture Detection ===

/** Thumb-to-index distance threshold for pinch activation (normalized coords) */
export const PINCH_THRESHOLD = 0.08;

/** Thumb-to-index distance threshold for pinch release (hysteresis) */
export const PINCH_RELEASE = 0.12;

/** Fingertip-to-palm distance threshold for grab activation */
export const GRAB_THRESHOLD = 0.15;

/** Fingertip-to-palm distance threshold for grab release (hysteresis) */
export const GRAB_RELEASE = 0.20;

/** Pinch distance for drawing mode */
export const PINCH_DISTANCE = 0.04;

/** Minimum distance between consecutive drawn shape points */
export const MIN_POINT_DISTANCE = 0.04;

/** Maximum number of shape points to retain */
export const MAX_SHAPE_POINTS = 400;

// === Formation ===

/** Maximum number of hand landmark targets to sample */
export const MAX_FORMATION_TARGETS = 140;

// === Particle Streams ===

/** Number of fingertip pair streams */
export const STREAM_COUNT = 5;

/** Minimum distance between stream particles for granular feel */
export const MIN_PARTICLE_DISTANCE = 0.08;

/** Soft repulsion force between nearby stream particles */
export const REPULSION_STRENGTH = 0.015;

/** Range within which stream particle repulsion applies */
export const REPULSION_RANGE = 0.15;

// === MediaPipe Landmark Indices ===

export const LANDMARK = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_TIP: 20,
} as const;

/** Bone connections for drawing hand skeleton */
export const LANDMARK_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [5, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17],                               // Palm
] as const;

/** Finger chain sequences (wrist to tip) */
export const HAND_CHAINS = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8],
  [0, 9, 10, 11, 12],
  [0, 13, 14, 15, 16],
  [0, 17, 18, 19, 20],
] as const;
