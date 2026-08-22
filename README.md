# EchoSim

**An emergent social-simulation sandbox where autonomous residents form memories,
relationships, beliefs and routines — allowing information and consequences to
propagate through a living town.**

> Status: Sprints 0–18 of 35 complete. The deterministic simulation core is a
> finished, fully tested product: residents with personalities and needs plan
> their days with GOAP, travel between shops with opening hours and jobs, form
> directional relationships and moods, gossip beliefs across minds with hop
> decay, react to weather and town events — and the whole living town survives
> save/load with **identical futures**.

## What works (Sprints 1–18)

- **Deterministic core** — seeded SplitMix64 RNG streams, minute-granularity
  clock (pause / 0.5×–16×), typed stable IDs, drift-free scheduler, typed event bus.
- **Cognition** — 14-trait personalities; 7 needs with hysteresis; explainable
  utility scoring; GOAP planning over fact states with structured failures,
  critical interruption and bounded replanning.
- **A navigable town** — authored travel times, affordance gating, seat/bed
  reservations, opening hours, jobs with shift-pressure shoulders, weekly
  weekday/weekend schedules with per-resident routine offsets.
- **Society** — perception with source/confidence tiers, episodic memory with
  explainable retrieval and decay, decaying emotion, directional 8-dimensional
  relationships, social actions with conversation locks, rumour transmission
  with hop decay and loop guards, template conversations (no LLM required).
- **World pressure** — weather that reshapes choices by preference, recurring
  town events, condition-gated storylets, item/shop/wage economy with gifts.
- **Persistence** — versioned DTO saves, atomic writes with backup, migration
  chain, in-flight plan serialization, and proven round-trip determinism.

```text
dotnet run --project tools/EchoSim.HeadlessDemo
```

The demo runs seven scenarios: three planning branches, an interruption-driven
replan, a full working day, a witnessed incident with uneven knowledge, and the
save/load finale where a restored town replays the future exactly like the
original — byte-identical for any given seed.

## Development

| Command | Purpose |
|---|---|
| `dotnet build EchoSim.sln` | compile domain + tests headlessly |
| `dotnet test EchoSim.sln` | run unit suite (163 tests) |
| `dotnet run --project tools/EchoSim.HeadlessDemo [seed]` | reproducible demo |

Open the repository root directly in **Unity 6000.5.6f1** to work inside the
editor; domain assemblies (`EchoSim.Core`, `EchoSim.Simulation`) have
`noEngineReferences` enabled so they stay engine-free by construction.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system map & dependency rules
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decision log with rationale
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — sprint status
- [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) — toolchain versions
- [`docs/TESTING.md`](docs/TESTING.md) — how to run & what is covered
- [`docs/SPRINT_REPORTS.md`](docs/SPRINT_REPORTS.md) — per-sprint engineering reports
