# Changelog

All notable changes to EchoSim. Format loosely follows Keep a Changelog;
versions are pre-1.0 and breaking changes are expected between minors.

## [0.1.0] — 2026-08-23

First public-quality build. Sprints 0–35 of the master specification.

### Simulation core
- Deterministic engine-free TypeScript monorepo (Node headless; byte-reproducible per seed).
- Personality (14 traits) → needs with hysteresis → explainable utility AI →
  uniform-cost GOAP with generation-tokened plan execution.
- Timed semantic navigation, reservations, jobs/schedules, authored hours,
  seeded daily weather, town events.
- Perception tiers (direct / visual / audible / announcement) feeding bounded
  episodic memories with explainable retrieval.
- Emotion decay, directional 8-dimension relationships, belief store with
  hop-decayed provenance gossip and loop guards, deterministic template
  conversations ("u dummy." easter egg intact).
- Reflection → durable semantic memories (reinforce / contradict / dedupe).
- Habits gated on multi-day recurrence with capped utility pull; derived
  long-term intentions biasing social goals.
- Social groups: multi-membership, meetings with attendance-only knowledge,
  shared-group topic eligibility and participant warmth.
- Level-of-detail simulation (Full/Reduced/Coarse/Dormant) with critical-need
  bypass and determinism under mixed configurations.

### Persistence
- Versioned save format v3 with atomic writes and migration guards.
- Proven round-trip contract: mid-flight save → restore → byte-identical futures.

### Tooling & interfaces
- `apps/sim-cli` — headless runner (`--seed --days --authored`).
- `apps/debug-ui` — React inspector: utility breakdowns, plan/failure viewer,
  memory/belief tables, event timeline, social graph (ego + rumour chains),
  demo scenarios, recorded debug controls.
- `apps/game` — Phaser living-town view: player as plain actor, six social
  commands, speech bubbles, rain visuals, optional generated ambience.
- `@echosim/research` — feature-flag ablations, metrics, flat CSV exports
  with git/timestamp metadata (`pnpm experiment`).

### Optional AI
- Vendor-free provider contract; template/mock/OpenAI-compatible backends;
  retry/timeout/validation/metrics/cache facade. AI-off is always error-free.

### Performance
- Planner open-list deduplication + cached-sort numeric hashing:
  **13.8× speedup** on authored towns with identical outcomes.
- Benchmarks: 100 agents × 3 days ≈ 14 s; soak 50 × 30 days ≈ 9.5 min clean.

### Verification
- 114 tests across 16 suites (unit/regression/determinism/architecture/
  inspector/UI/persistence/perf/scenarios/content/research).
