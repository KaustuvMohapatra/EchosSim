# AGENTS.md — project instructions for OpenCode

Concise operational notes. The full product spec lives in the master document
(ECHOSIM.txt) and `docs/`; do not duplicate it here.

## What this is
EchoSim: an engine-independent emergent social simulation. Deterministic,
seed-driven TypeScript monorepo; the simulation core runs headless under
Node.js with no rendering dependency. Frontends (Phaser game, React debug UI)
consume it through read models only.

## Layout
- `packages/core|cognition|world|social|simulation` — engine-free domain source of truth.
- `packages/content` — authored fixtures + demo town composition.
- `packages/persistence` — versioned save/load (Node `fs` allowed here only).
- `packages/inspector` — read-model snapshots for presentation layers (engine-free).
- `apps/sim-cli` — headless runner (`npm run sim`).
- `apps/game` — Phaser 4 browser view (`npm run dev`).
- `apps/debug-ui` — React debug inspector (`npm run dev:debug`).
- `tests/` — vitest suites (regression / deterministic / architecture / inspector / ui).
- `docs/` — architecture, decisions, roadmap, environment, testing.

## Commands
```powershell
corepack pnpm install
npm run typecheck        # tsc over all packages/apps
npm test                 # vitest suite
npm run sim -- --seed=7001 --days=3   # headless, byte-reproducible per seed
```

## Hard rules
1. Simulation packages must never import phaser/react/DOM APIs or `fs`
   (persistence excepted for `fs`). Enforced by `tests/architecture/`.
2. All randomness via `SimRandomProvider` named streams; never `Math.random()`
   or wall clock inside simulation logic.
3. LLM integration is optional; `AI_ENABLED=false` must never break correctness.
4. New behavior requires tests in the same sprint; fix = regression test.
5. Update `docs/ROADMAP.md` status markers honestly (Done/Partial/Planned).
6. Work on branch `feature/echosim`. Never push without explicit instruction.
7. When a sprint finishes, append a report to `docs/SPRINT_REPORTS.md`.
