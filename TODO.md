# Improvement TODOs

Prioritized list of improvements for the Freedom Particles project.

---

## Phase 1: Critical Fixes -- DONE

### Fix ESLint configuration
- [x] Create `.eslintrc.cjs` using ESLint v8 format
- [x] Configure rules for TypeScript + React
- [x] `npm run lint` now works

### Add error handling
- [x] Distinguish camera denied vs. other errors in `useHandTracking.ts` and `useHandDrawing.ts`
- [x] Null checks for `canvas.getContext('2d')` already present
- [ ] Add WebGL context loss detection and recovery in the Three.js renderer
- [ ] Show loading/error states during MediaPipe model download

### Consolidate duplicate types
- [x] Remove duplicate `HandInfo`, `ShapePoint`, `HandState`, `HandTargetCloud` from `useHandDrawing.ts`; import from `src/types/index.ts`
- [x] `useHandTracking.ts` already imports from shared types

### Extract magic numbers into a constants file
- [x] Create `src/constants.ts` with `VOLUME`, `PINCH_THRESHOLD`, `FRAME_SKIP`, landmark indices, etc.
- [x] Replace inline magic numbers in hooks and components
- [x] Document what each constant controls

---

## Phase 2: Code Quality -- DONE

### Deduplicate utility functions
- [x] Remove duplicate `lerp()` from `useHandDrawing.ts` and `ParticleField.tsx`; import from `src/utils/math.ts`
- [x] Remove duplicate `clamp()`, `hslToRgb()`, `xorshift32()` from `ParticleField.tsx`; import from shared utils
- [x] Consolidate duplicate `distance()`, `normalize()` in `useGestures.ts`; use `vec3Distance`, `vec3Normalize` from math utils

### Pin dependency versions
- [x] Pin `@mediapipe/tasks-vision` to `^0.10.22` instead of `latest`

### Add code formatting
- [x] Add Prettier with a `.prettierrc` config
- [x] Add `format` script to `package.json`

### Break up large files
- [ ] Split `FingertipStreamApp.tsx` (~900 lines): extract panel sections into sub-components
- [ ] Split `ClaySimulation.ts` (~52 KB): extract split/merge logic into separate modules

---

## Phase 3: Testing -- DONE

### Set up test infrastructure
- [x] Install and configure Vitest
- [x] Add `test`, `test:watch`, and `test:coverage` scripts to `package.json`

### Write unit tests for core logic
- [x] `src/utils/math.ts` -- vector operations, lerp, clamp, smoothstep, xorshift
- [x] `src/utils/color.ts` -- HSL/RGB conversion, particle/stream coloring
- [x] `src/utils/flowField.ts` -- flow vector generation, determinism
- [ ] `src/simulation/VerletParticle.ts` -- Verlet integration
- [ ] `src/simulation/Constraints.ts` -- constraint solving
- [ ] `src/hooks/useGestures.ts` -- gesture detection thresholds

---

## Phase 4: Accessibility & UX -- DONE

### Keyboard and screen reader support
- [x] Add keyboard shortcuts (Space, B, C, S, L, K, 1-5, Escape)
- [x] Add ARIA labels to HUD, mode selector, camera preview, toggle buttons, customize dialog
- [x] Panel handle already has `role="button"`, `tabIndex`, and `aria-label`

### Persist user settings
- [x] Save mode, background, camera, clay, streams, lines, pause state to `localStorage`
- [x] Restore settings on page load
- [x] Add a "Reset" button that clears saved settings

### Remaining
- [ ] Add a gesture tutorial overlay for first-time users
- [ ] Show a brief explanation of each mode when selected
- [ ] Add a fullscreen toggle button

---

## Phase 5: Performance -- DONE

### Adaptive frame management
- [x] Replace hardcoded `FRAME_SKIP` with adaptive logic based on measured FPS in `useHandTracking.ts`
- [ ] Implement adaptive particle count reduction when FPS drops below threshold
- [ ] Add a Level of Detail (LOD) system to scale visual fidelity with device capability

### Lazy loading
- [ ] Defer MediaPipe model download until camera is actually enabled
- [ ] Show download progress to the user

---

## Phase 6: Documentation -- DONE

### Update project docs
- [x] Update `AGENTS.md` with actual project structure, commands, coding style, and architecture notes
- [x] Expand `README.md` with: browser compatibility matrix, keyboard shortcuts, troubleshooting section, all scripts
- [ ] Add JSDoc comments to exported functions in `src/utils/`, `src/simulation/`, and `src/hand/`

---

## Phase 7: CI/CD & Tooling -- DONE

### Continuous integration
- [x] Add GitHub Actions workflow (`.github/workflows/ci.yml`) that runs lint + type-check + tests + build
- [ ] Consider adding Lighthouse CI for performance regression tracking

### Browser compatibility
- [ ] Add runtime feature detection for WebGL, getUserMedia, and Worker APIs
- [ ] Show a clear fallback message on unsupported browsers
