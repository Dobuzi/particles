# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains no tracked source files or directories. When adding code, prefer a clear top-level layout such as `src/` for application code, `tests/` for automated tests, and `assets/` for static files. Keep modules focused and group by feature or domain to avoid oversized, catch-all folders.

## Build, Test, and Development Commands

No build or test tooling is configured yet. After choosing a language/runtime, document the primary workflow commands in this section. Examples:

- `npm run dev`: start the local development server.
- `npm test`: run the test suite.
- `npm run build`: produce a production build.

## Coding Style & Naming Conventions

No formatting or linting tools are configured. When adding code, establish and document:

- Indentation (e.g., 2 spaces or 4 spaces) and line-length limits.
- Naming patterns (e.g., `camelCase` for variables, `PascalCase` for types, `kebab-case` for files).
- Formatting/linting tools (e.g., `prettier`, `eslint`, `ruff`, `gofmt`) and how to run them.

## Testing Guidelines

No testing framework is currently defined. When adding tests, specify:

- The framework (e.g., `vitest`, `jest`, `pytest`, `go test`).
- Test file naming (e.g., `*.test.ts`, `*_spec.py`).
- How to run unit vs. integration tests and any coverage requirements.

## Commit & Pull Request Guidelines

No Git history is available to infer conventions. Adopt a simple, consistent format such as:

- `type: short summary` (e.g., `feat: add particle emitter`).

For pull requests, include a clear description, link relevant issues, and add screenshots or logs when behavior changes.

## Security & Configuration Tips

Document required environment variables in a `.env.example` file and keep secrets out of the repository. Note any local setup steps (e.g., database or API credentials) in a `README.md` or this file.
