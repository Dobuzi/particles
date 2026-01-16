# Freedom Particles

A browser-based 3D particle field that responds to hand-drawn gestures in mid-air. The system combines a flowing noise field with gesture-defined shape forces to visualize “freedom” as an expressive, evolving form.

## Setup

```bash
npm install
npm run dev
```

## Gesture Guide

- Allow webcam access when prompted.
- Show one hand; the index fingertip drives the drawing point.
- Pinch (thumb to index) to draw a 3D stroke.
- Release the pinch to stop drawing.
- Use “Clear Shape” to reset the stroke.

## Controls

- Particle presets: 30k / 60k / 120k
- Flow strength: adjusts the noise-driven velocity
- Shape forces: attraction, alignment, and repulsion
- Gesture toggle: enable/disable drawing
- Pause/resume and light/dark background
- Perf mode: disables hand tracking and lowers workload

## Performance Tips

- Start at 30k or 60k particles on laptops.
- Reduce shape forces if motion appears too stiff.
- Turn off gesture drawing to save CPU when not needed.

## Architecture Notes

- `src/hooks/useHandDrawing.ts`: MediaPipe Tasks Vision hand tracking + gesture-to-shape mapping
- `src/utils/flowField.ts`: simplex-noise flow field
- `src/components/ParticleField.tsx`: CPU particle simulation and shape force blending

## Known Limitations

- Depth is inferred heuristically from hand scale, so Z may feel less precise.
- CPU updates can saturate at 120k+ particles on lower-end GPUs.
- Stroke sampling uses a subset of points to stay real-time.

## Future Improvements

- GPU-based particle simulation (ping-pong FBO) for 200k+ particles.
- More accurate depth estimation via stereo or depth models.
- Record/replay multiple strokes and layered behaviors.
