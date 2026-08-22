# EchoSim Testing

## Test pyramid (spec §47)

| Layer | Where | Runner | Status |
|---|---|---|---|
| Pure domain unit tests | `tests/EchoSim.Tests` | `dotnet test` | Implemented |
| EditMode tests (Unity) | planned mirror of the above | Unity Test Framework | Planned |
| PlayMode tests | — | — | Planned (Sprint 4+) |
| Soak / performance sims | — | headless runner | Planned (Sprint 28) |

## Running

```powershell
dotnet test EchoSim.sln                 # full suite
dotnet run --project tools/EchoSim.HeadlessDemo   # demo scenario, must be byte-reproducible
```

## Coverage map vs spec §1.10

- Time determinism, pause, speed scaling → `SimTimeTests`
- Seed reproduction + stream separation → `SimRandomTests`
- Scheduler ordering / cancellation / repeating / daily anchoring / in-callback scheduling → `SchedulerTests`
- Event dispatch, snapshot safety, fault aggregation → `EventBusTests`
- Typed ID equality & invalid input rejection → `IdsTests`
- Agent creation, movement occupancy, capacity, closed locations, bootstrap determinism, 3-day runner → `WorldTests`

**Current: 59/59 passing.**

## Fixed seeds (spec §49)

| Seed | Reserved for |
|---|---|
| 1234 | Sprint 1 foundation demo (headless runner default) |
| 1001–7001 | reserved per spec: foundation / utility / planning / social / memory / gossip / Mira |

## Rules

1. No test may depend on wall-clock time or unseeded randomness.
2. Any bug fixed in production code gets a regression test in the same sprint.
3. Never report tests as passing without executing them (spec §15).
