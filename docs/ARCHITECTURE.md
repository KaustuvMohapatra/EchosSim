# EchoSim Architecture

Status markers follow the spec convention: **Implemented**, **Partial**, **Planned**.

## System overview

```
World state (locations, agents)
        |
SimulationClock  ──►  SimulationScheduler  ──►  systems react
        |
   EventBus (typed pub/sub)
        |
Agent / Location repositories (deterministic insertion order)
```

The simulation domain is **engine-free C#** (`netstandard2.1`, C# 9). Unity is a host,
not a dependency of the domain.

## Assembly map

| Assembly | Location | Depends on | Status |
|---|---|---|---|
| `EchoSim.Core` | `Assets/EchoSim/Core` | nothing (no UnityEngine) | Implemented |
| `EchoSim.Simulation` | `Assets/EchoSim/Simulation` | EchoSim.Core | Implemented (Sprint 1 scope) |
| `EchoSim.World`, `.Player`, `.AI`, `.Presentation`, `.Debug` | planned | see spec §8 | Planned |

### Dual compilation strategy

Source of truth lives under `Assets/EchoSim/**` so Unity compiles it via `.asmdef`
files (`noEngineReferences: true`). The same files are globbed by hand-authored
csproj files under `src/` so the domain compiles headlessly:

```
dotnet build EchoSim.sln
dotnet test  EchoSim.sln
```

This gives CI-grade verification without opening the editor and guarantees the
"simulation runs independently of visuals" requirement from day one.

## Core services

- **Stable IDs** (`Core/IDs`) — `AgentId`, `LocationId`, `MemoryId`, `EventId`,
  `ActionId`. Validated readonly structs; ordinal equality; never derived from
  display names.
- **Time** (`Core/Time`) — `SimTime`/`SimDuration` (minute granularity, epoch =
  Monday D0 00:00) and `SimulationClock` (pause/resume/scale presets 0.5×–16×).
  No wall-clock access anywhere in the domain.
- **RNG** (`Core/Random`) — SplitMix64-based `SeededRandom`; named streams
  (`world`, `agents`, `events`, `social`, `content`) derived deterministically
  from one master seed via `SimRandomProvider`.
- **Scheduler** (`Core/Scheduling`) — deterministic due-time ordering (time,
  then sequence); drift-free repeating ops; cancellation; auto-processes on clock
  advance. No `Invoke()` semantics.
- **EventBus** (`Core/Events`) — typed struct events, snapshot iteration (safe
  subscribe/unsubscribe during publish), fault aggregation, statistics.
- **Diagnostics** (`Core/Diagnostics`) — `ISimLog` keeps domain free of Console/Unity.

## Simulation layer

- `SimulationBootstrap.CreateWorld(config)` — composition root; fixed creation order.
- `SimulationWorld` — aggregate root owning clock/RNG/bus/scheduler/repositories;
  spawn/move operations maintain occupancy invariants and publish typed events.
- `HeadlessSimulationRunner` — advances time in fixed steps for tools/tests/demo.

## Dependency rules (enforced by asmdef layout)

```
EchoSim.Core      ← no references at all
EchoSim.Simulation ← EchoSim.Core only
```

Presentation, AI providers, and Unity glue must depend on Simulation contracts,
never the reverse (see `docs/DECISIONS.md`).

## Determinism contract

1. All randomness flows from `SimulationConfiguration.Seed` through named streams.
2. Repository iteration order = insertion order; construction order is fixed.
3. Scheduler ordering is total: `(due time, schedule sequence)`.
4. Floating point appears only in scale conversion of *real* seconds; the
   authoritative path (`Advance(SimDuration)`) is integer-only.
