# EchoSim Sprint Reports

Format follows master spec §15. Reports are appended; newest at bottom.

---

## SPRINT 0 COMPLETE — Repository Bootstrap & Architecture Audit

1. **Summary.** No pre-existing repository (fresh start). Audited the machine
   toolchain, chose the dual-compilation architecture, scaffolded a Unity-6
   project root with engine-free domain assemblies, authored the core
   documentation set.
2. **Architecture implemented.** Repo layout (`Assets/EchoSim` domain tree +
   `src|tests|tools` dotnet wrappers), asmdefs with `noEngineReferences`,
   C# 9 / netstandard2.1 pinning, NUnit 3 test stack, gitignore policy.
3. **Files created.** `.gitignore`, `Directory.Build.props`, `EchoSim.sln`,
   `ProjectSettings/ProjectVersion.txt`, `Packages/manifest.json`,
   `docs/{ARCHITECTURE,ROADMAP,ENVIRONMENT,DECISIONS,TESTING}.md`, `AGENTS.md`,
   `README.md`, 4 csproj files, 2 asmdef files.
4. **Files modified.** None (greenfield).
5. **Public APIs.** n/a (infrastructure only).
6. **Data models.** n/a.
7. **Tests created.** None yet (Sprint 1 scope).
8. **Tests executed.** n/a.
9. **Build result.** Toolchain verified: dotnet restore/build OK after Sprint 1
   code landed (see Sprint 1); Unity editor 6000.5.6f1 present but not yet
   round-tripped (documented in ENVIRONMENT.md).
10. **Demo scenario result.** n/a this sprint.
11. **Performance notes.** n/a.
12. **Known limitations.** Unity import not yet exercised; URP package deferred
    until visual sprints.
13. **Technical debt.** Dual project metadata (asmdef+csproj) must stay in sync —
    guarded by convention and AGENTS.md note.
14. **Documentation updated.** All five required docs + AGENTS.md + README.md.
15. **Git status.** Branch `feature/echosim`, initial commit(s).
16. **Recommended next sprint work.** Sprint 1 exactly as specified.
17. **Anything unverified.** Unity editor compile of the asmdefs.

---

## SPRINT 1 COMPLETE — Core Simulation Foundation

1. **Summary.** Deterministic simulation substrate implemented headlessly: typed
   stable IDs, minute-granularity clock with pause/scale, seeded RNG streams,
   deterministic scheduler, typed event bus, agent/location foundations, and a
   composition root. Demo reproduces byte-identical logs for seed 1234 over two
   simulated days.
2. **Architecture implemented.** See `docs/ARCHITECTURE.md`. Dependency rule held:
   Core ← nothing; Simulation ← Core only. No UnityEngine/Console references in
   domain code.
3. **Files created (domain).**
   - `Assets/EchoSim/Core/IDs/Ids.cs`
   - `Assets/EchoSim/Core/Time/SimTime.cs`, `SimulationClock.cs`
   - `Assets/EchoSim/Core/Random/SimRandom.cs`
   - `Assets/EchoSim/Core/Events/EventBus.cs`
   - `Assets/EchoSim/Core/Scheduling/SimulationScheduler.cs`
   - `Assets/EchoSim/Core/Diagnostics/ISimLog.cs`
   - `Assets/EchoSim/Simulation/Agents/AgentState.cs`, `AgentRepository.cs`
   - `Assets/EchoSim/Simulation/Locations/LocationState.cs`
   - `Assets/EchoSim/Simulation/Events/SimulationEvents.cs`
   - `Assets/EchoSim/Simulation/Bootstrap/SimulationWorld.cs`, `SimulationBootstrap.cs`
4. **Files modified.** Test/demo projects as above; no other files touched.
5. **Public APIs.** `AgentId, LocationId, MemoryId, EventId, ActionId`;
   `SimTime, SimDuration, SimDayOfWeek, SimulationClock, SimulationSpeed`;
   `ISimRandom, SeededRandom, SimRandomProvider, RandomStreams`; `EventBus,
   ISimulationEvent, EventBusStatistics`; `SimulationScheduler,
   ScheduledOperationHandle`; `ISimLog`; `AgentIdentity, AgentState,
   AgentRepository, LocationDefinition, LocationRuntimeState, LocationRepository`;
   `SimulationWorld, SimulationBootstrap, SimulationConfiguration,
   HeadlessSimulationRunner`.
6. **Data models.** Agent state foundation (id/name/home/current/active);
   location definition + runtime occupancy; typed events
   `AgentSpawnedEvent`, `AgentMovedEvent`.
7. **Tests created.** 59 across six suites: IdsTests, SimTimeTests (+clock),
   SimRandomTests, EventBusTests, SchedulerTests, WorldTests — covering every
   item in spec §1.10.
8. **Tests executed.** Yes: `dotnet test` → **Passed! 59/59** (0 failed).
9. **Build result.** `dotnet build EchoSim.sln` → succeeded, 0 warnings, 0 errors.
10. **Demo scenario result.** Seed 1234, 3 residents, 2 simulated days, 10-min
    steps: commutes, dawn bell, market crier, festival cancellation all logged;
    run twice → identical SHA256 hashes (reproducibility verified). Two real bugs
    were caught by demo/tests during the sprint and fixed with regression tests
    (spawn occupancy accounting; in-callback scheduling semantics).
11. **Performance notes.** Scheduler insert O(n) list (fine at current scale);
    event bus copy-on-write arrays avoid publish allocations. Profiling deferred
    per spec §43.
12. **Known limitations.** Movement is semantic teleport (navigation = Sprint 4);
    agents have no needs/personality yet; scheduler callbacks observe post-advance
    time (documented decision D5).
13. **Technical debt.** AgentState allows public `Active` setter until behavior
    systems formalize state mutation (Sprint 2+).
14. **Documentation updated.** ARCHITECTURE, ROADMAP, DECISIONS (D1–D8),
    TESTING, README.
15. **Git status.** Committed on `feature/echosim`.
16. **Recommended next sprint work.** Sprint 2 — PersonalityProfile, NeedSystem
    with hysteresis, utility curves + explainable goal selection.
17. **Anything unverified.** Unity editor round-trip (first open/import) still
    pending; documented as environment follow-up.
