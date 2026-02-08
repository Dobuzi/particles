# Repository Guidelines

## Project Structure & Module Organization

```
src/
├── components/          # React Three Fiber 3D components
│   ├── HandParticleSystem.tsx    # Hand-form particle visualization
│   ├── ClayParticleSystem.tsx    # Sculptable clay blob
│   ├── ParticleStreams.tsx       # Fingertip stream connections
│   ├── ParticleField.tsx        # Legacy free-flow particle field
│   └── ConnectionLines.tsx      # Visual connectivity lines
├── hand/                # Hand skeleton and mesh models
│   ├── HandSkeleton.ts          # MediaPipe bone structure
│   ├── ParticleDistribution.ts  # Particle allocation per bone
│   └── HandMesh.ts              # Hand surface mesh
├── hooks/               # React hooks
│   ├── useHandTracking.ts       # MediaPipe hand detection
│   ├── useHandDrawing.ts        # Legacy pinch-draw gesture
│   ├── useGestures.ts           # Pinch/grab gesture detection
│   ├── useFingertipPairs.ts     # Fingertip pair extraction
│   └── usePersistedSettings.ts  # localStorage persistence
├── simulation/          # Physics simulation
│   ├── ClaySimulation.ts        # PBD clay physics
│   ├── VerletParticle.ts        # Verlet integration
│   ├── Constraints.ts           # Distance/volume constraints
│   └── ParticleSimulation.ts    # Base particle simulation
├── utils/               # Shared utilities
│   ├── math.ts                  # Vector math, lerp, clamp, xorshift
│   ├── color.ts                 # HSL/RGB conversion, particle coloring
│   └── flowField.ts             # Curl noise flow vectors
├── types/               # Shared TypeScript type definitions
│   └── index.ts
├── constants.ts         # Shared constants (thresholds, indices, volumes)
├── FingertipStreamApp.tsx       # Main app (default mode)
├── App.tsx                      # Legacy particle field app
├── main.tsx                     # Entry point
└── styles.css                   # All styles
```

## Build, Test, and Development Commands

```bash
npm run dev           # Start Vite dev server
npm run build         # Production build
npm run preview       # Preview production build
npm run lint          # ESLint check
npm run format        # Prettier formatting
npm test              # Run Vitest test suite
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Coding Style & Naming Conventions

- **Indentation**: 2 spaces
- **Variables/functions**: `camelCase`
- **Types/interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE` for module-level constants
- **Files**: `PascalCase` for components, `camelCase` for hooks/utils
- **Formatting**: Prettier (`.prettierrc` configured)
- **Linting**: ESLint with TypeScript + React plugins (`.eslintrc.cjs`)

## Testing Guidelines

- **Framework**: Vitest (aligned with Vite toolchain)
- **Test files**: `src/**/__tests__/*.test.ts`
- **Run**: `npm test` or `npm run test:watch`
- Tests cover utility functions (math, color, flowField)

## Commit & Pull Request Guidelines

Use conventional commit format:
- `feat: short summary` for new features
- `fix: short summary` for bug fixes
- `refactor: short summary` for refactoring
- `test: short summary` for test changes
- `docs: short summary` for documentation

For PRs: include a clear description, link relevant issues, and add screenshots for visual changes.

## Architecture Notes

- **Data flow**: MediaPipe hand tracking → gesture detection → particle simulation → Three.js rendering
- **Performance**: Uses refs instead of React state for high-frequency updates; frame skipping adapts to FPS
- **Shared constants**: All magic numbers centralized in `src/constants.ts`
- **Type consolidation**: All shared types in `src/types/index.ts`
