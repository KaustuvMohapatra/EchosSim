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

---

## SPRINT 5 COMPLETE — Schedules, Jobs & Daily Rhythm

1. **Summary.** The town gained a clock-shaped life: weekly schedules with
   weekday/weekend/special-day overrides, employment (job definitions with
   workplaces, shifts, income), authored opening hours with open/close events,
   seeded routine offsets, and schedule pressure feeding goal utility through
   the existing custom-term hook. Planning-failure backoff suppresses
   unachievable goals instead of retry-spamming every tick.
2. **Architecture implemented.** `Simulation/Schedules/*`, jobs inside
   `ScheduleModel.cs` (`JobDefinition`, `JobSystem`),
   `Simulation/World/OpeningHours.cs`; employment facts (`at_work`, `on_shift`,
   `work_open`) projected by `PlannerStateBuilder`; Work action is now
   employment-bound via the resident's own job rather than a shared town role.
3. **Files created.** `ScheduleModel.cs`, `OpeningHours.cs`,
   `SchedulesJobsTests.cs`.
4. **Files modified.** `LocationDefinition/RuntimeState` (+hours, manual-override
   semantics), `AgentMind` (+Job/Schedule/RoutineOffsetMinutes + authoring
   setters), `PlannerStateBuilder`, `PlanningDirector` (backoff suppression),
   `StandardGoals` (Work gated on real pressure), `StandardActions`
   (employment-bound Work, `work_open` precondition), demo WorkingDay section.
5. **Public APIs.** `ScheduleImportance`, `ScheduleEntry`, `DailySchedule`,
   `WeeklySchedule`, `JobDefinition`, `JobSystem`
   (`Define/Assign/IsOnShift/IsExpectedToWork/ComputePressure/MinutesLate`),
   `OpeningHours(.System)`, `LocationOpenStateChangedEvent`,
   `CognitionSystem.SuppressGoal`,
   `PlanningDirector.PlanningFailureBackoffMinutes`.
6. **Data models.** Pressure: 1.0 across the offset-shifted shift with ±30-min
   shoulders; rest day = empty profile for the date; manual closures always win
   over authored hours.
7. **Tests created.** 13 new (118 total): wrap-midnight entries,
   weekend/override profiles, offset shifts, pressure/rest-days, late-minute
   math incl. wrapped shifts, hours flip events, manual override precedence,
   critical hunger beating full work pressure, closed workplace avoidance,
   commute planning to an open workplace, planning-failure suppression timing.
8. **Tests executed.** Yes — **Passed! 118/118**.
9. **Build result.** Succeeded, 0 warnings / 0 errors.
10. **Demo result.** A full working day: residents socialize and explore
    overnight, Bosse forms his bakery commute inside the pre-shift shoulder,
    both work their shifts, head home in the evening, sleep — and Bosse wakes
    at midnight ravenous, abandoning sleep for food (survival-first emergence).
    Two runs byte-identical.
11. **Bugs found & fixed this sprint.** Expired commitments let satisfied goals
    re-elect themselves forever (selector saw them as "current"); empty plans
    (goal already true) crashed the executor; single-role Workplace could not
    express multiple employers (Work is now job-bound); off-shift Work scored
    competitively from raw traits (now gated on real pressure).
12. **Known limitations.** Attendance/tardiness tracking defined but not yet
    wired into consequences; income stored but unspent until Sprint 15.
13. **Technical debt.** Suppression is per-goal time-boxed only; no difficulty
    scaling of backoff.
14. **Documentation updated.** This report; ROADMAP Sprint 5 done; DECISIONS
    D13 added.
15. **Git status.** Committed on `feature/echosim`.
16. **Recommended next sprint work.** Sprint 6: perception — observations with
    source/confidence, same-location visibility, town announcements.
17. **Anything unverified.** Nothing within sprint scope.

---

## SPRINT 6 COMPLETE — Perception & Event Observation

1. **Summary.** Residents stopped being omniscient. A `PerceptionSystem`
   converts world activity into personal `Observation`s with source and
   confidence: participants know directly, co-located residents see, adjacent
   residents hear loud events (via authored location adjacency), announcements
   reach the whole population. Per-resident ring-buffered observation logs are
   ready as input for Sprint 7 memory encoding.
2. **Architecture implemented.** `Simulation/Perception/*`; adjacency registry
   on `SimulationWorld`; auto-sources wired to movement/activity/opening-hours
   bus events; scenario events via `Publish`/`Announce`.
3. **Files created.** `Observation.cs`, `PerceptionSystem.cs`,
   `PerceptionTests.cs`.
4. **Files modified.** `SimulationWorld` (+location adjacency graph), demo
   (+WitnessedIncident section).
5. **Public APIs.** `PerceptionSource`, `ObservationReach`, `ObservableEvent`,
   `Observation`, `PerceptionSystem`
   (`Publish/Announce/ObservationsOf/RecentOf/LogCapacity/TotalDelivered`),
   `SimulationWorld.ConnectLocations/AreAdjacent`.
6. **Data models.** Reach tiers: SameLocation (quiet) / Nearby (loud, carries to
   adjacent locations) / Town (announcements); confidence: direct 1.0, visual
   0.9, audible 0.7, announcement 0.95, all scaled by event base confidence.
7. **Tests created.** 7 new (125 total): direct participation incl. off-site
   actors; co-located visual observation; distant silence for quiet events;
   adjacency-bounded audibility; town-wide announcements; movement auto-
   perception scoping; ring-buffer eviction order.
8. **Tests executed.** Yes — **Passed! 125/125**.
9. **Build result.** Succeeded, 0 warnings / 0 errors.
10. **Demo result.** One cafe insult: participants hold it at confidence 1.00,
    a fellow guest saw it at 0.90, the baker next door heard it at 0.70, and a
    librarian across town knows nothing of it — then everyone receives the
    mayor's announcement at 0.95. Byte-identical across runs.
11. **Bugs found & fixed this sprint.** Test fixture spawned plain agents where
    residents were required (perception is resident-scoped by design).
12. **Known limitations.** No occlusion/line-of-sight (spec-permitted MVP);
    reach is authored per event type rather than derived from acoustics.
13. **Technical debt.** Observation logs are unsorted-by-type scans on retrieval;
    indexed retrieval lands with memory systems.
14. **Documentation updated.** This report; ROADMAP Sprint 6 done; DECISIONS
    D14 added.
15. **Git status.** Committed on `feature/echosim`.
16. **Recommended next sprint work.** Sprint 7: episodic memory — encode
    observations into memories with importance/valence, decay, retrieval.
17. **Anything unverified.** Nothing within sprint scope.

---

## SPRINTS 7–9 COMPLETE — Memory, Emotion, Relationships

1. **Summary.** Residents gained inner continuity. Observations encode into
   bounded episodic memories via an importance/valence table (noise skipped),
   grudge-holders retain negative events more strongly; retrieval is scored and
   fully explainable (recency/importance/actor/location breakdown); consolidation
   prunes stale low-value entries. Emotion (valence −1..1, arousal 0..1) decays
   toward neutral and feeds goal scoring. Relationships are directional 8-
   dimensional vectors shaped by social events, scaled by observer personality,
   softening through drift, with derived labels (Stranger→Enemy/Crush).
2. **Files created.** `Memory/MemorySystem.cs`, `Emotion/EmotionSystem.cs`,
   `Relationships/RelationshipSystem.cs`, `Social/SocialReactionSystem.cs`
   (+`ObservationRecordedEvent` on the perception bus).
3. **Tests.** +11 → **134 passing**: noise filtering, grudge amplification,
   ranked retrieval w/ breakdown-sums invariant, consolidation survival,
   emotion clamp/decay/mood-shift, directional grievance, witness bias,
   personality scaling, drift/label evolution.
4. **Bugs found & fixed.** Memory subject convention stored the wrong party
   (observer remembered themselves instead of the other actor).

---

## SPRINTS 10–12 COMPLETE — Social Protocol, Beliefs, Conversations

1. **Summary.** The full social stack without any LLM: fourteen social actions
   gated by co-location, mutual conversation locks and mood/personality-driven
   acceptance; a belief store where direct experience outranks rumours, every
   hop decays confidence, provenance records who-said-what, and per-event loop
   guards kill echo chains; a deterministic conversation engine that selects
   intents from context (grievances gossip; close friends tease), picks topics
   from beliefs/memories, and speaks template utterances with seeded variation.
2. **Files created.** `Social/SocialSystem.cs`, `Social/ConversationSystem.cs`,
   `Beliefs/BeliefSystem.cs`, `SocialBeliefConversationTests.cs`.
3. **Tests.** +11 → **145 passing**: co-location gating, lock contention,
   insult→memory→relationship→mood pipeline, urgent-need refusal (hardened to a
   hard refusal by design), hop decay & provenance, rumour loop-cutting,
   first-hand evidence overriding hearsay, no-teleporting-knowledge invariant,
   deterministic utterance replay, gossip belief transfer.
4. **Bugs found & fixed.** Urgent listeners could still randomly accept chat —
   now urgency is an absolute refusal for friendly actions.

---

## SPRINTS 13–15 COMPLETE — Player, Mira, Economy

1. **Summary.** The player enters as just another stable-ID actor whose actions
   flow through the identical social pipeline — NPCs remember, resent, and warm
   to them exactly like each other. Mira arrives as authored data (content key
   npc_mira_18nov, MiraLike personality, preference profile), her signature rare
   line "u dummy." emerging from generic gates: affinity > 0.5 + seeded 10%
   chance + 6h per-pair cooldown. Light economy lands: item definitions, shop
   stock with scarcity, wallets, wages on work completion, gifts scaled by
   recipient preferences, and InsufficientMoney/ResourceUnavailable failures
   wired into plan execution.
2. **Files created.** `Player/PlayerFoundation.cs`, `Content/ContentFixtures.cs`,
   `Economy/EconomySystem.cs`, `PlayerMiraEconomyTests.cs`.
3. **Tests.** +12 → **155 passing**: player pipeline identity, NPC grudges
   against the player, fixture distinctness, easter-egg rarity bounds,
   purchase money/stock/inventory/memory flows, sell-out scarcity, wage math,
   preference-scaled gifting, broke-resident planning failure path.
4. **Bugs found & fixed.** Memory-subject convention regression caught here;
   relationship links were forming from non-social noise events (movement) —
   now constrained to a social event whitelist.

---

## SPRINTS 16–18 COMPLETE — Weather, Town Events, Save/Load

1. **Summary.** Seeded daily weather rolls (Clear↔HeavyRain Markov table)
   reach goal scoring: rain suppresses Explore for everyone except rain-lovers,
   whose authored preference cancels the penalty — no special cases. Authored
   town events activate in day/time windows and announce town-wide through the
   perception bus. Storylets fire when pair conditions hold (e.g., Trust > 0.75
   plus third-party Grievance > 0.6 → confiding moment) with cooldowns.
   Finally, persistence: versioned DTO save format (locations, agents with
   personalities/needs/wallets/inventories/planner-facts, relationships,
   memories with access counts, beliefs with provenance, suppression timers,
   in-flight plan runs with remaining step time), atomic writes with .bak
   backups, explicit migration chain rejecting future versions gracefully —
   and the crown-jewel guarantee:
2. **The round-trip contract.** Save a living town mid-flight, restore it from
   disk, run both forward side-by-side: their futures are byte-for-byte
   IDENTICAL (37 = 37 planned events). A saved world is the same world.
3. **Tests.** +18 total across the three sprints → **163 passing**.
4. **Bugs found & fixed during 16–18.** Restored locations lost authored-hours
   reactivity via manual-override leakage (ForceOpen added); cognition timers
   (cooldowns/commitments/suppressions) missing from the format caused restored
   towns to drift — now captured; duplicate location-registration crash during
   restore after an editing mishap.
5. **Known limitations.** Jobs/schedules are re-authored by hosts rather than
   serialized (definitions are content, not state); observation logs are not
   persisted (memories are the durable trace); Unity editor round-trip still
   pending (headless CI verified throughout).
6. **Anything unverified.** Nothing within sprint scope.

---

## SPRINT 4 COMPLETE — Navigation, Affordances & Reservations

1. **Summary.** Semantic movement became physical travel: `INavigationService`
   with a timed headless implementation (authored symmetric travel minutes,
   scheduler-driven arrivals, supersede/cancel, ETA+grace stuck detection),
   an `AffordanceRegistry` answering "what can be done where", and a
   `ReservationService` with ownership, expiry sweeps and contention reclaim.
   Plan execution now consumes real travel time; cafe seats are reserved and
   can be denied.
2. **Architecture implemented.** `Simulation/Navigation/*`, `Simulation/World/*`;
   services owned by `SimulationWorld`; the Unity NavMesh adapter will
   implement the same `INavigationService` contract later without touching
   planning/execution (spec §4.2).
3. **Files created.** `INavigationService.cs`, `TimedNavigationService.cs`,
   `Affordances.cs` (registry + reservations), tests
   `NavigationAffordanceReservationTests.cs`.
4. **Files modified.** Core IDs (+`ResourceId`); `PlanningAction` (+`IsMovement`);
   `StandardActions` (movement flags + affordance gating via
   `TownRoles.GateByAffordances`, `act_go_home` gained its required location);
   `SimulationWorld` (+services, +`RemoveLocation`);
   `LocationRepository` (+Remove); `PlanningDirector` (nav-driven movement,
   seat reservation/denial/release); demo town authored with travel+affordances.
5. **Public APIs.** `INavigationService`, `TimedNavigationService`,
   `NavigationState/PathStatus/Failure/RequestResult/Arrival`,
   `Affordance(.Registry)`, `ReservationService`, `ResourceId`.
6. **Data models.** Travel table: symmetric minute matrix with default fallback;
   reservations: resource→(owner, until) with sweep-based expiry.
7. **Tests created.** 13 new (105 total): affordance lookup/order/gating;
   reservation conflict, ownership-validated release, owner extension,
   simulated-time expiry, expired-hold reclaim; navigation arrival timing,
   supersede resolution, target destruction, blocked destination, stuck after
   grace.
8. **Tests executed.** Yes — **Passed! 105/105**.
9. **Build result.** Succeeded, 0 warnings / 0 errors.
10. **Demo result.** Live run shows authored travel honored (goto=20 min:
    00:45→01:05), full eat chain completes at 01:40; two runs byte-identical.
11. **Bugs found & fixed this sprint.** Superseded trips never resolved their
    caller's callback — cancellation now reports failure exactly once per
    request. Also repaired a self-inflicted factory edit that had broken the
    GetFood gating block before it ever compiled.
12. **Performance notes.** Stuck/expiry sweeps are O(trips)/O(holds) per 5 min;
    fine for current scale.
13. **Known limitations.** Occlusion-free perception still pending (Sprint 6);
    single seat resource per location; no pathfinding graph (direct pairs).
14. **Technical debt.** `TownRoles.GateByAffordances` transitional flag until
    all fixtures register affordances.
15. **Documentation updated.** This report; ROADMAP Sprint 4 done; DECISIONS
    D12 added; TESTING map updated.
16. **Git status.** Committed on `feature/echosim`.
17. **Recommended next sprint work.** Sprint 5: schedules, jobs, opening hours,
    weekday/weekend rhythm, seeded routine offsets feeding schedule pressure.
18. **Anything unverified.** Nothing within sprint scope.
