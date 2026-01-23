# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # ESLint check
```

## Architecture

This is a React + TypeScript app using Vite. It renders a 3D particle field that responds to hand gestures via webcam.

### Core Data Flow

1. **Hand Tracking** (`src/hooks/useHandDrawing.ts`): Uses MediaPipe Tasks Vision to detect up to 2 hands via webcam. Outputs:
   - `shapeRef`: Array of `ShapePoint` objects (3D positions + tangent vectors) from pinch-draw gestures
   - `handTargetsRef`: Float32Array of landmark positions for dual-hand formation mode

2. **Particle Simulation** (`src/components/ParticleField.tsx`): CPU-based particle system using `useFrame` from react-three-fiber. Each frame:
   - Applies simplex noise flow field to velocities
   - Applies shape forces (attraction/alignment/repulsion) toward drawn stroke points
   - Applies formation forces toward hand landmark targets
   - Updates positions with toroidal boundary wrapping
   - Updates per-particle colors based on position/velocity/noise

3. **Flow Field** (`src/utils/flowField.ts`): Generates curl-like 3D flow vectors using offset simplex noise queries.

### Key Types

- `ShapePoint`: 3D position (x,y,z) + tangent vector (tx,ty,tz) + timestamp
- `HandInfo`: Handedness label + 21-point landmark array
- `HandTargetCloud`: Packed Float32Array (x,y,z,handId per point)

### Performance Considerations

- Particle updates are strided (every 2-4 particles per frame) to reduce CPU load
- Shape point sampling uses stride based on point count
- Hand landmark targets are capped at 140 points with stride sampling
- `perfMode` disables hand tracking and caps particles at 20k
