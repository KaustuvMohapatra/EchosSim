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

**Current: 163/163 passing.**

## Coverage map (Sprints 1–18)

- Sprint 1 → IdsTests, SimTimeTests, SimRandomTests, EventBusTests, SchedulerTests, WorldTests
- Sprint 2 → PersonalityNeedGoalTests
- Sprint 3 → GoapTests (planner, director, interventions, determinism, stale-completion regression)
- Sprint 4 → NavigationAffordanceReservationTests
- Sprint 5 → SchedulesJobsTests (+ suppression timing in GoapTests)
- Sprint 6 → PerceptionTests
- Sprints 7–9 → MemoryEmotionRelationshipTests
- Sprints 10–12 → SocialBeliefConversationTests
- Sprints 13–15 → PlayerMiraEconomyTests
- Sprints 16–17 → WeatherTownEventTests
- Sprint 18 → SaveLoadTests (**round-trip determinism**, atomic writes, corrupt/missing/future-version handling)

## Fixed seeds (spec §49)

| Seed | Reserved for |
|---|---|
| 1234 | Sprint 1 foundation demo (headless runner default) |
| 1001–7001 | reserved per spec: foundation / utility / planning / social / memory / gossip / Mira |

## Rules

1. No test may depend on wall-clock time or unseeded randomness.
2. Any bug fixed in production code gets a regression test in the same sprint.
3. Never report tests as passing without executing them (spec §15).
