# Freedom Particles

A browser-based 3D particle experience driven by real-time hand tracking. The default app renders hand-shaped particle formations and fingertip streams using a lightweight physics simulation. A legacy free-flow particle field is still available.

## Setup

```bash
npm install
npm run dev
```

## Scripts

```bash
npm run dev           # Start Vite dev server
npm run build         # Production build
npm run preview       # Preview production build
npm run lint          # ESLint check
npm run format        # Prettier formatting
npm test              # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
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

## Keyboard Shortcuts

| Key       | Action                  |
|-----------|-------------------------|
| `Space`   | Pause / Resume          |
| `B`       | Toggle dark/light theme |
| `C`       | Toggle camera preview   |
| `S`       | Toggle streams          |
| `L`       | Toggle hand lines       |
| `K`       | Toggle clay             |
| `1`-`5`   | Switch mode preset      |
| `Escape`  | Close popup / panel     |

## Controls (Default Mode)

- Particle count (50-150)
- Particle size
- Hand / Stream balance
- Stream intensity + on/off
- Flow + noise strength
- Depth exaggeration, spacing stiffness, responsiveness
- Color + glow intensity
- Pause, background toggle, camera preview toggle
- Reset to defaults

Settings are automatically saved to localStorage and restored on reload.

## Hand Preview

A compact preview at the bottom shows the webcam feed with landmarks for both hands and a live status indicator (1/2 hands + FPS). If permission is denied, it shows "Camera blocked."

## Browser Compatibility

| Browser        | Minimum Version | Notes                        |
|----------------|-----------------|------------------------------|
| Chrome / Edge  | 91+             | Full support, GPU recommended |
| Firefox        | 95+             | WebGL required               |
| Safari         | 15.1+           | Limited MediaPipe support    |
| Mobile Chrome  | 91+             | Reduced particle counts      |
| Mobile Safari  | 15.4+           | Limited                      |

**Requirements:** WebGL, `getUserMedia` API (webcam access), ES2020+ JavaScript.

## Performance Tips

- Lower particle count or disable streams on slower machines.
- Reduce glow and responsiveness for steadier motion.
- Toggle the camera preview off if you need extra headroom.
- Frame skip adapts automatically to maintain FPS.
- On mobile, particle counts and DPR are reduced automatically.

## Troubleshooting

- **"Camera access denied"**: Check browser permissions. The app needs webcam access for hand tracking.
- **Black screen / no particles**: Ensure WebGL is enabled in your browser. Try a different browser.
- **Low FPS**: Reduce particle count, disable clay or streams, or close other GPU-heavy tabs.
- **Hand not detected**: Ensure good lighting. Keep your hand clearly visible and not too close/far from the camera.
- **MediaPipe model loading slow**: The hand tracking model (~10 MB) downloads on first use. Subsequent loads are cached by the browser.

## Architecture Notes

- `src/FingertipStreamApp.tsx`: main UI and controls for the current experience
- `src/hooks/useHandTracking.ts`: dual-hand MediaPipe Tasks Vision tracking
- `src/components/HandParticleSystem.tsx`: hand-formed particles + fingertip streams
- `src/simulation/`: Verlet/PBD simulation primitives
- `src/hand/`: hand skeleton and particle distribution
- `src/constants.ts`: shared magic numbers and thresholds
- `src/types/index.ts`: all shared TypeScript types

## Legacy Field

The legacy mode (`?legacy`) contains the original particle field with flow noise, gesture drawing, and dual-hand formation controls. See `src/App.tsx`, `src/components/ParticleField.tsx`, and `src/hooks/useHandDrawing.ts`.
