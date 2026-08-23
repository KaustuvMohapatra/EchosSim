# EchoSim Architecture

Status markers follow the spec convention: **Implemented**, **Partial**, **Planned**.

## System overview

```
EchoSim core (engine-free TypeScript, Node.js)
    │
    ├── @echosim/core        IDs · Time · RNG streams · Scheduler · EventBus
    ├── @echosim/cognition   Personality · Needs · Utility AI · GOAP · PlanningDirector support
    ├── @echosim/world       Locations · Hours · Reservations · Navigation · Jobs · Weather · Events
    ├── @echosim/social      Perception · Memory · Emotion · Relationships · Beliefs/Gossip · Conversations
    ├── @echosim/simulation  Town composition root + PlanningDirector + social wiring
    ├── @echosim/content     Authored residents/fixtures (incl. demo town)
    ├── @echosim/persistence Versioned saves (Node fs; the only Node-dependent package)
    └── @echosim/inspector   Read-model snapshots for presentation layers
        ↓ consumed by
    ┌──────────────┬────────────────┬─────────┬─────────────────┐
 sim-cli        apps/game       apps/debug-ui   tests/research
 (headless)     Phaser+Vite     React+Vite      vitest suites
```

The simulation domain is **engine-free TypeScript**: no Phaser, React, DOM,
canvas, or browser globals in any `packages/*` module. Enforced by
`tests/architecture/engine-independence.test.ts` and duplicated as a regression
guard.

## Package map

| Package | Depends on | Status |
|---|---|---|
| `@echosim/core` | nothing | Implemented |
| `@echosim/cognition` | core | Implemented |
| `@echosim/world` | core | Implemented |
| `@echosim/social` | core, cognition | Implemented |
| `@echosim/simulation` | all of the above | Implemented |
| `@echosim/content` | simulation (+cognition) | Implemented (demo scope) |
| `@echosim/persistence` | simulation chain (+node fs) | Implemented |
| `@echosim/inspector` | simulation chain | Implemented |
| `apps/debug-ui` | inspector + content + React | Implemented |
| `apps/game` | simulation + Phaser | Implemented |
| LLM provider layer | — | Planned |

## Core services

- **Typed IDs** (`core/ids`) — branded string ids (`AgentId`, `LocationId`, …).
- **Time** (`core/time`) — minute-granularity clock with pause/resume/scale;
  integer minutes are authoritative.
- **RNG** (`core/rng`) — SplitMix64 via BigInt; named streams derived from one
  master seed via `SimRandomProvider`. No `Math.random()` in simulation code.
- **Scheduler** (`core/scheduler`) — deterministic due-time ordering
  (time, then sequence); repeating ops anchored to previous deadline.
- **EventBus** (`core/events`) — typed channels, snapshot iteration, fault
  aggregation and statistics.

## Simulation layer

- `Town` (`simulation/town`) — composition root wiring every system;
  deterministic construction order; seeded RNG provider with host-replaceable
  streams (`randoms()` / `attachRandoms()`).
- `PlanningDirector` (`simulation/director`) — cognition → goal decision → GOAP
  plan → timed execution loop with generation-tokened completions (stale
  callbacks can never mutate newer plans), critical interruption, deferred
  replanning, suppression backoff, and per-agent `PlanningDiagnostics`
  (last replan reason, planner outcome, failure detail, nodes expanded).
- `socialWire` (`simulation/socialWire`) — deterministic glue: movement
  observations, relationship/emotion/belief reactions to observed social
  events, conversation flow on Talk completion (intent selection, utterances,
  belief transfer with hop decay).

## Inspector read models

`SimulationInspector` implements `SimulationInspectorAPI`: `getAgents`,
`getAgent`, `getEvents`, `getRelationships`, `getMemories` plus focused reads
(utility breakdowns, plan snapshots, beliefs, time, town stats). Every getter
is side-effect free — memory access uses a non-mutating `peek`, belief/memory
stores are never created by inspection (`tryStoreFor`), and the read-only
invariant is covered by a full-state fingerprint test. An `EventJournal` ring
buffer captures bus events for timeline queries with filters.

## Dependency rules (enforced by architecture tests)

```
core ← nothing engine-related ever
presentation → inspector → simulation → … → core   (never the reverse)
```

## Determinism contract

1. All randomness flows from the seed through named RNG streams.
2. Repositories iterate in insertion order; construction order is fixed.
3. Scheduler ordering is total: `(due time, sequence)`.
4. Same seed + same command sequence ⇒ byte-identical headless runs
   (verified by repeat-run diff and golden vector tests).
