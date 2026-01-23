// Shared types for the particle visualization system

// === Vector Types ===

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

// === Hand Tracking Types ===

export type Handedness = 'Left' | 'Right' | 'Unknown';

export type HandInfo = {
  handedness: Handedness;
  landmarks: Vec3[];
  confidence?: number;
};

export type HandState = {
  status: 'loading' | 'ready' | 'tracking' | 'denied' | 'error';
  message: string;
  isDrawing: boolean;
  points: ShapePoint[];
  hasHand: boolean;
  hasTwoHands: boolean;
  fps: number | null;
  hands: HandInfo[];
};

// === Shape/Drawing Types ===

export type ShapePoint = {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  timestamp: number;
};

// === Fingertip Pairing Types ===

export const FINGERTIP_INDICES = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
} as const;

export type FingerName = keyof typeof FINGERTIP_INDICES;

export type FingertipPair = {
  finger: FingerName;
  left: Vec3 | null;
  right: Vec3 | null;
  active: boolean; // true if both hands present
};

// === Particle System Types ===

export type HandTargetCloud = {
  data: Float32Array;
  count: number;
};

export type ParticleStreamConfig = {
  particlesPerStream: number;
  flowSpeed: number;
  noiseAmplitude: number;
  noiseFrequency: number;
};

// === Hand Skeleton Types ===

export type BoneRegion = 'palm' | 'thumb' | 'proximal' | 'intermediate' | 'distal';

export type Bone = {
  id: number;
  startIdx: number;      // MediaPipe landmark index
  endIdx: number;        // MediaPipe landmark index
  region: BoneRegion;
  weight: number;        // Particle density weight (higher = more particles)
  finger: number;        // -1 for palm, 0-4 for thumb through pinky
};

export type HandSkeleton = {
  bones: Bone[];
  totalWeight: number;
};

export type ParticleAssignment = {
  boneId: number;
  t: number;              // Position along bone [0, 1]
  offset: Vec3;           // Perpendicular offset (for palm fill)
  region: BoneRegion;
  finger: number;
};

// Mesh-based particle assignment (for palm surface)
export type MeshParticleAssignment = {
  type: 'mesh';
  triangleIdx: number;           // Which palm triangle
  barycentricCoords: [number, number, number]; // Barycentric position
  normalOffset: number;          // Offset along surface normal
  region: 'palm';
};

// Finger-chain particle assignment
export type ChainParticleAssignment = {
  type: 'chain';
  fingerIdx: number;             // 0-4 (thumb through pinky)
  t: number;                     // Position along finger [0, 1]
  radialOffset: Vec3;            // Perpendicular offset from chain
  region: BoneRegion;
};

// Unified particle assignment (bone, mesh, or chain based)
export type UnifiedParticleAssignment =
  | (ParticleAssignment & { type: 'bone' })
  | MeshParticleAssignment
  | ChainParticleAssignment;

// === Configuration Types ===

export type FlowConfig = {
  strength: number;
};

export type ShapeForceConfig = {
  attraction: number;
  alignment: number;
  repulsion: number;
};

export type FormationConfig = {
  enabled: boolean;
  strength: number;
  density: number;
};

export type ColorConfig = {
  mode: 'position' | 'velocity' | 'noise';
  intensity: number;
  highContrast: boolean;
};
