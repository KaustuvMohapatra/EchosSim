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

---

## SPRINT 2 COMPLETE — Personality + Needs + Utility AI

1. **Summary.** Residents gained internal motivation: 14-trait personality
   profiles, seven needs with threshold dynamics and hysteresis, five utility
   curve types, seven standard goals scored through explainable additive
   breakdowns, and a deterministic goal selector with switch inertia,
   re-selection cooldown and critical-need override.
2. **Architecture implemented.** `Personality/`, `Needs/`, `Goals/`,
   `Cognition/` namespaces; per-resident `AgentMind` owned by
   `ResidentRegistry`; `CognitionSystem` is the seam where the Sprint 3 planner
   plugs in.
3. **Files created.** `PersonalityProfile.cs`, `NeedSystem.cs`
   (definitions/state/set), `UtilityCurves.cs`, `GoalModel.cs`,
   `GoalSelector.cs`, `StandardGoals.cs`, `AgentMind.cs` (+registry+spec),
   `CognitionSystem.cs`; tests `PersonalityNeedGoalTests.cs`.
4. **Files modified.** Core `Ids.cs` (+`GoalId`), `SimulationWorld`
   (+`Residents`, `SpawnResident`), demo rewritten for the §2.10 scenario.
5. **Public APIs.** `PersonalityProfile(.Builder/.MiraLike)`, `PersonalityTrait`,
   `NeedKind/Definition/State/Set`, `StandardNeeds`,
   `UtilityCurve` family, `GoalDefinition/Context/ScoreEntry/SelectionResult`,
   `ScoreTerm/TraitTerm/NeedTerm/CustomTerm`, `GoalSelector(+Options)`,
   `StandardGoals`, `AgentMind`, `ResidentSpec/Registry`,
   `CognitionSystem`, `GoalDecision`.
6. **Data models.** Need convention documented (0=satisfied → 100=critical);
   goal scoring = Base + Σ(need/trait/custom terms) − inertia/cooldown +
   critical bonus.
7. **Tests created.** 15 new (74 total): trait validation/immutability, Mira
   fixture, growth/clamp/thresholds, personality→utility divergence,
   determinism, critical override bypassing inertia, commitment hysteresis,
   stable ordinal tie-break, breakdown-sums-to-final invariant, curve
   monotonicity/finiteness, schedule-pressure custom term.
8. **Tests executed.** Yes — **Passed! 74/74**.
9. **Build result.** Succeeded, 0 warnings / 0 errors (two C#9 test-side syntax
   fixes during development).
10. **Demo result.** Vera (sociability .95) selects Socialize; Ivo (hunger 82)
    selects Eat, escalating to CRITICAL override as hunger passes the interrupt
    threshold; hysteresis keeps Vera committed across ticks. Deterministic.
11. **Performance notes.** Scoring allocates breakdown lists per evaluation;
    acceptable now, flagged for §27 allocation pass.
12. **Known limitations.** No execution yet — goals are intentions only until
    Sprint 3 planning; needs only grow (no activity relief wired).
13. **Technical debt.** Breakdown list allocation in hot path; selector options
    global-per-selector rather than per-goal.
14. **Documentation updated.** This report; ROADMAP marked Sprint 2 done;
    TESTING coverage map updated.
15. **Git status.** Committed on `feature/echosim`.
16. **Recommended next sprint work.** Sprint 3 GOAP: planner world state,
    action definitions, A* search, executor lifecycle, failure taxonomy.
17. **Anything unverified.** Nothing within sprint scope.

---

## SPRINT 3 COMPLETE — GOAP Planning

1. **Summary.** Intentions became plans: compact fact-based planner state with
   canonical hashing, data-driven planning actions (preconditions/effects/base+
   dynamic cost/durations/location binding/need relief), a uniform-cost best-first
   planner (closed set, expansion+depth caps, structured failure reasons), and a
   PlanningDirector executing plans in simulated time with lifecycle events,
   critical interruption, deferred replanning, and generation-tokened completions.
2. **Architecture implemented.** `Simulation/Planning/*`; `PlanningDirector`
   bridges `CognitionSystem` decisions to the planner and scheduler; per-resident
   action instantiation keeps home-relative facts uniform; `PlannerStateBuilder`
   projects world+memory into resident-scoped knowledge.
3. **Files created.** `PlannerWorldState.cs`, `PlanningAction.cs`,
   `GoapPlanner.cs`, `StandardActions.cs` (+`TownRoles`),
   `PlannerStateBuilder.cs`, `PlanningDirector.cs`, tests `GoapTests.cs`.
4. **Files modified.** `GoalDefinition` (+`DesiredFacts`), `StandardGoals`
   (+planner bindings), `AgentMind` (+`PlannerMemory`), `CognitionSystem`
   (+commitment-break on unrelieved interrupts, +`FindGoal`), demo rewritten to
   the §3 scenario matrix, Core gained an `IsExternalInit` polyfill.
5. **Public APIs.** `FactCondition/FactEffect/FactOperator/FactEffectMode`,
   `PlannerWorldState`, `PlanningAction`, `ActionCostContext`, `ActivityRelief`,
   `GoapPlan/PlanResult/PlannerMetrics/PlanFailureReason`, `GoapPlanner`,
   `TownRoles`, `StandardActions`, `PlannerStateBuilder`, `PlanLifecycle`,
   `ActionFailureType`, `ActiveExecution`, `IPlanIntervention`,
   `PlanningDirector`, typed events `PlanStarted/StepCompleted/Finished`.
6. **Data models.** Facts are string-keyed ints; goals bind via
   `DesiredFacts`; execution persists non-ephemeral effects into
   `AgentMind.PlannerMemory`; ephemeral completion flags reset per build.
7. **Tests created.** 18 new (92 total) covering spec §3 acceptance: valid /
   cheapest / alternative / impossible plans, cycle avoidance, max-expansions,
   deterministic ties, dynamic costs, state hashing, cafe-open & cafe-closed
   integration runs, intervention→failure→replan recovery, critical preemption,
   day-replay determinism, and a regression test for stale-completion isolation.
8. **Tests executed.** Yes — **Passed! 92/92**.
9. **Build result.** Succeeded, 0 warnings / 0 errors.
10. **Demo result.** Spec §3 branches verified: cafe open → GoTo>Buy>Eat;
    closed → GetFood>Cook>Eat; empty pantry → Store>BuyIngredients>GoHome>Cook>
    Eat. Live run: relax plan cancelled by hunger spike at 00:45 → eat chain
    executed with exact durations (15/12/20 min steps) → success 01:35. Two runs
    byte-identical (SHA256 match).
11. **Bugs found & fixed this sprint.**
    - Planner returned expensive single-step plans (goal checked at child
      generation instead of pop) — fixed to true uniform-cost search.
    - Cancelled plans' scheduled callbacks consumed steps of newer plans — fixed
      via run generations + step-index stamps (`CompleteStepIfCurrent`).
    - Commitment hysteresis vs interruption livelock — unrelieved interrupting
      needs now release commitment before re-selection.
    - Interrupt thresholds retuned so comfort needs never outrank survival needs.
12. **Performance notes.** Search clones states per node (fine at ≤4000
    expansions); extract-min is linear scan; flagged for §27 heap optimization.
13. **Known limitations.** Movement is instant teleport with fixed 15-min cost
    (real travel = Sprint 4); no reservations yet; money facts placeholder.
14. **Technical debt.** Action set rebuilt per decision (cheap but wasteful);
    dynamic costs evaluated once per plan call (documented).
15. **Documentation updated.** This report; ROADMAP Sprint 3 marked done;
    DECISIONS D9–D11 added; TESTING map updated.
16. **Git status.** Committed on `feature/echosim`.
17. **Recommended next sprint work.** Sprint 4: INavigationService with real
    travel times, stuck detection, affordances registry, reservation service.
18. **Anything unverified.** Nothing within sprint scope.
