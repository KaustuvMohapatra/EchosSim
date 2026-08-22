# EchoSim

**An emergent social-simulation sandbox where autonomous residents form memories,
relationships, beliefs and routines — allowing information and consequences to
propagate through a living town.**

> Status: early foundation (Sprints 0–1 of 35 complete). See `docs/ROADMAP.md`.

## What works today (Sprint 1)

- Deterministic simulation core: seeded SplitMix64 RNG with named streams,
  integer minute-granularity clock (pause / 0.5×–16×), typed stable IDs.
- Simulation scheduler: absolute/repeating/daily operations, cancellation,
  drift-free intervals, deterministic ordering.
- Typed event bus with snapshot-safe iteration and diagnostics counters.
- Agent + location repositories, occupancy invariants, movement events.
- Headless bootstrap that runs the same code Unity will host later.

```text
dotnet run --project tools/EchoSim.HeadlessDemo
```

Running it twice with seed 1234 produces byte-identical logs for two simulated
days of three residents commuting through town.

## Development

| Command | Purpose |
|---|---|
| `dotnet build EchoSim.sln` | compile domain + tests headlessly |
| `dotnet test EchoSim.sln` | run unit suite (59 tests) |
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
