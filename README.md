# Freedom Particles

A browser-based 3D particle experience driven by real-time hand tracking. The default app renders hand-shaped particle formations and fingertip streams using a lightweight physics simulation. A legacy free-flow particle field is still available.

## Setup

```bash
npm install
npm run dev
```

## GitHub Pages

This project deploys from `main` via GitHub Actions. After the workflow succeeds:

```
https://dobuzi.github.io/particles/
```

## App Modes

- Default: hand particle formations + fingertip streams.
- Legacy mode: add `?legacy` to the URL to load the older free-flow particle field.

## Gesture Guide

- Allow webcam access when prompted.
- Show one or two hands; the system tracks both hands.
- Move hands to sculpt the particle forms; pinch drawing is only in legacy mode.

## Controls (Default Mode)

- Particle count (50–150)
- Particle size
- Hand ↔ Stream balance
- Stream intensity + on/off
- Flow + noise strength
- Depth exaggeration, spacing stiffness, responsiveness
- Color + glow intensity
- Pause, background toggle, camera preview toggle

## Hand Preview

A compact preview at the bottom shows the webcam feed with landmarks for both hands and a live status indicator (1/2 hands + FPS). If permission is denied, it shows “Camera blocked.”

## Performance Tips

- Lower particle count or disable streams on slower machines.
- Reduce glow and responsiveness for steadier motion.
- Toggle the camera preview off if you need extra headroom.

## Architecture Notes

- `src/FingertipStreamApp.tsx`: main UI and controls for the current experience
- `src/hooks/useHandTracking.ts`: dual-hand MediaPipe Tasks Vision tracking
- `src/components/HandParticleSystem.tsx`: hand-formed particles + fingertip streams
- `src/simulation/`: Verlet/PBD simulation primitives
- `src/hand/`: hand skeleton and particle distribution

## Legacy Field

The legacy mode (`?legacy`) contains the original particle field with flow noise, gesture drawing, and dual-hand formation controls. See `src/App.tsx`, `src/components/ParticleField.tsx`, and `src/hooks/useHandDrawing.ts`.
