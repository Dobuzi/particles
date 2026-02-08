# Improvement TODOs

Prioritized list of improvements for the Freedom Particles project.

---

## Phase 1: Critical Fixes

### Fix ESLint configuration
- [ ] Create `eslint.config.js` using ESLint v9+ flat config format
- [ ] Configure rules for TypeScript + React
- [ ] Ensure `npm run lint` passes

### Add error handling
- [ ] Wrap `HandLandmarker.createFromModelPath()` in try-catch with user-facing error message
- [ ] Add null checks for `canvas.getContext('2d')` calls
- [ ] Handle `getUserMedia` failures gracefully (camera denied, unavailable)
- [ ] Add WebGL context loss detection and recovery in the Three.js renderer
- [ ] Show loading/error states during MediaPipe model download

### Consolidate duplicate types
- [ ] Remove duplicate `HandInfo` definitions from `useHandDrawing.ts` and `useHandTracking.ts`; import from `src/types/index.ts`
- [ ] Audit other duplicated type definitions and centralize them

### Extract magic numbers into a constants file
- [ ] Create `src/constants.ts` for shared values (`VOLUME`, `PINCH_THRESHOLD`, `FRAME_SKIP`, etc.)
- [ ] Replace inline magic numbers across components and hooks
- [ ] Document what each constant controls

---

## Phase 2: Code Quality

### Deduplicate utility functions
- [ ] Remove duplicate `lerp()` implementations in `useHandDrawing.ts`, `ParticleField.tsx`, and `ParticleStreams.tsx`; import from `src/utils/math.ts`
- [ ] Consolidate scattered vector math operations into `src/utils/math.ts`

### Break up large files
- [ ] Split `FingertipStreamApp.tsx` (~900 lines): extract panel sections into sub-components and settings management into a custom hook
- [ ] Split `ClaySimulation.ts` (~52 KB): extract split/merge logic and constraint solving into separate modules
- [ ] Extract inline function definitions from render/effect bodies where they don't depend on closure state

### Pin dependency versions
- [ ] Pin `@mediapipe/tasks-vision` to a specific version instead of `latest`
- [ ] Review and update outdated dependencies (React 18 → 19, Vite 4 → 5, Three.js, TypeScript)

### Add code formatting
- [ ] Add Prettier with a `.prettierrc` config
- [ ] Add `format` script to `package.json`
- [ ] Consider adding `lint-staged` + `husky` for pre-commit formatting

---

## Phase 3: Testing

### Set up test infrastructure
- [ ] Install and configure Vitest (aligns with Vite toolchain)
- [ ] Add `test` and `test:coverage` scripts to `package.json`
- [ ] Set a coverage target (e.g., 80% for utility/simulation code)

### Write unit tests for core logic
- [ ] `src/utils/math.ts` — vector operations, lerp, clamp
- [ ] `src/utils/color.ts` — HSL ↔ RGB conversion
- [ ] `src/utils/flowField.ts` — flow vector generation
- [ ] `src/simulation/VerletParticle.ts` — Verlet integration step accuracy
- [ ] `src/simulation/Constraints.ts` — distance/volume constraint solving
- [ ] `src/simulation/ClaySimulation.ts` — cluster split/merge, particle behavior
- [ ] `src/hooks/useGestures.ts` — gesture detection thresholds (pinch, grab)
- [ ] `src/hand/ParticleDistribution.ts` — bone weight allocation, particle counts

---

## Phase 4: Accessibility & UX

### Keyboard and screen reader support
- [ ] Add keyboard shortcuts for mode switching, toggling camera, adjusting settings
- [ ] Add ARIA labels to all interactive controls (buttons, sliders, panels)
- [ ] Ensure the settings panel is navigable via keyboard (Tab, Enter, Escape)
- [ ] Add descriptive labels to the camera preview element

### Onboarding and discoverability
- [ ] Add a gesture tutorial overlay for first-time users
- [ ] Show a brief explanation of each mode when selected
- [ ] Display a help tooltip or "?" icon linking to gesture reference

### Persist user settings
- [ ] Save selected mode, camera toggle state, and slider values to `localStorage`
- [ ] Restore settings on page load
- [ ] Add a "Reset to defaults" button

### UI polish
- [ ] Add a fullscreen toggle button
- [ ] Show a visible FPS counter (opt-in via settings or debug mode)
- [ ] Add loading indicator while MediaPipe model downloads

---

## Phase 5: Performance

### Adaptive frame management
- [ ] Replace hardcoded `FRAME_SKIP` with adaptive logic based on measured FPS
- [ ] Implement adaptive particle count reduction when FPS drops below threshold
- [ ] Add a Level of Detail (LOD) system to scale visual fidelity with device capability

### Lazy loading
- [ ] Defer MediaPipe model download until camera is actually enabled
- [ ] Show download progress to the user
- [ ] Cache the model in IndexedDB or service worker for faster subsequent loads

### Profiling and monitoring
- [ ] Add an optional performance metrics overlay (FPS, particle count, memory)
- [ ] Profile `ClaySimulation` constraint solving loop for optimization opportunities
- [ ] Measure and log GPU draw call count per frame

---

## Phase 6: Documentation

### Update project docs
- [ ] Update `AGENTS.md` — currently says "no tracked source files" which is outdated
- [ ] Expand `README.md` with: browser compatibility matrix, troubleshooting section, contribution guidelines
- [ ] Add JSDoc comments to exported functions in `src/utils/`, `src/simulation/`, and `src/hand/`
- [ ] Create an architecture diagram showing the data flow (hand tracking → simulation → rendering)

### Add changelog
- [ ] Start a `CHANGELOG.md` tracking changes from this point forward

---

## Phase 7: CI/CD & Tooling

### Continuous integration
- [ ] Add a GitHub Actions workflow that runs lint + type-check + tests on PRs
- [ ] Add a build step to catch production build failures early
- [ ] Consider adding Lighthouse CI for performance regression tracking

### Browser compatibility
- [ ] Add feature detection for WebGL, getUserMedia, and Worker APIs
- [ ] Show a clear fallback message on unsupported browsers
- [ ] Document the minimum browser versions required
