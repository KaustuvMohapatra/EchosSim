# EchoSim Decision Log

Format: context → decision → consequences. Newest at bottom.

## D1 — Engine-agnostic simulation core with dual compilation
**Context.** The master spec targets Unity 6, but the core requirement is a
deterministic, testable simulation that runs independently of visuals (§Pillar 7,
Sprint 1 DoD). Editor round-trips are slow and not automatable from this shell.
**Decision.** All domain code is engine-free C# under `Assets/EchoSim/**` compiled
by Unity via `noEngineReferences` asmdefs; identical sources are also compiled by
dotnet (`src/*.csproj` globs) for headless build+test. Unity glue lives in
Unity-only folders excluded from the dotnet glob.
**Consequences.** Fast CI-grade verification now; guaranteed domain purity;
slight duplication of project metadata (asmdef + csproj).

## D2 — C# 9 language level pinned
**Context.** Unity 6 ships Roslyn with C# 9; the spec's `readonly record struct`
sketches are C# 10.
**Decision.** `LangVersion=9.0`, `netstandard2.1`. IDs are hand-written readonly
structs implementing `IEquatable<T>` instead of record structs. No file-scoped
namespaces.
**Consequences.** Identical compilation inside Unity and dotnet; minor boilerplate.

## D3 — Minute time granularity, integer-backed
**Context.** Schedules in the spec are minute-resolution ("08:00", "every 10
simulated minutes"); float accumulation threatens determinism (§18 priority).
**Decision.** `SimTime`/`SimDuration` store `long` total minutes; epoch is Monday
D0 00:00. Float exists only when converting host real seconds under a speed scale.
**Consequences.** Exact arithmetic, trivial serialization later; no sub-minute events.

## D4 — Named RNG streams derived from one seed
**Context.** Spec §1.4 wants stream separation so adding a consumer never changes
other systems' behavior.
**Decision.** `SimRandomProvider(masterSeed)` lazily creates per-name SplitMix64
streams seeded by `Mix(seed ^ FNV1a(name))`. Canonical names: world, agents,
events, social, content.
**Consequences.** Reproducibility across platforms; streams are independent.

## D5 — Scheduler processes on clock advance; callbacks see post-advance time
**Context.** The clock must stay authoritative; scheduler work must execute in a
total deterministic order.
**Decision.** `SimulationScheduler` subscribes to `TimeAdvanced`; due ops run
ordered by `(due, sequence)`. While processing, `clock.CurrentTime` already equals
the end of the latest advance — relative scheduling from inside callbacks anchors
to that time (covered by tests).
**Consequences.** Simple mental model; lateness bounded only by advance step size
(headless runner uses 10-min steps).

## D6 — NUnit 3 (not 4) for headless tests
**Context.** Unity Test Framework is NUnit-3 based; NUnit 4 removed classic asserts.
**Decision.** Tests use NUnit 3.14 + classic assert syntax, matching what will run
inside Unity EditMode tests later.
**Consequences.** Test files port to Unity nearly verbatim.

## D7 — Occupancy is world-owned invariant
**Context.** Sprint 1 found that letting spawn bypass location occupancy produced
underflow crashes downstream.
**Decision.** All placement/movement flows through `SimulationWorld.ApplyMove`;
spawn publishes exactly one `AgentSpawnedEvent` carrying the resolved start
location; movement publishes `AgentMovedEvent`.
**Consequences.** Single choke point for validation, capacity checks, and eventing;
later perception systems can observe movement purely via the bus.

## D8 — Fail fast on contract violations
**Context.** Silent degradation would poison determinism and debuggability.
**Decision.** Unknown IDs, duplicate registrations, backwards time, paused-clock
advances, capacity overflow/underflow all throw immediately. Event-bus handler
faults run remaining handlers first, then surface an aggregate exception.
**Consequences.** Loud failures during development; soak tests (Sprint 28) rely on
invariants being non-negotiable.

## D9 — Per-resident action instantiation
**Context.** GOAP actions are data, but home-relative facts ("at_home") differ
per resident while goal definitions are shared.
**Decision.** `StandardActions.CreateForResident(world, agent, roles)` builds
concrete action instances per decision cycle; shared role locations come from
`TownRoles` (explicit or convention-detected).
**Consequences.** Uniform fact vocabulary across residents; small per-decision
allocation cost accepted until §27.

## D10 — Goal test on pop; deferred replanning; generation-tokened completions
**Context.** Sprint 3 demos exposed three correctness traps: greedy early goal
tests returned expensive plans; synchronous cancel→replan cycles could spin
without simulated time advancing; cancelled plans left scheduler callbacks that
consumed steps of newer plans.
**Decision.** (1) The planner tests goals when popping nodes, so the cheapest
complete path always wins. (2) `PlanningDirector` never replans recursively —
failures/interruptions cancel and yield; the next external tick decides afresh.
(3) Scheduled completions carry `(generation, stepIndex)` stamps and are
discarded unless both match (`CompleteStepIfCurrent`).
**Consequences.** Bounded work per tick, exact durations, no cross-plan
contamination; replanning latency is bounded by host tick size instead of being
instant.

## D11 — Interrupt thresholds ordered by need class
**Context.** With uniform thresholds, comfort needs (Fun at 96+) hijacked agency
from survival needs and starved plans.
**Decision.** `StandardNeeds` orders interrupt thresholds: Hunger 92 < Energy 95
< Social 93… with Fun/Comfort/Hygiene/Safety at 96–98, so only genuine urgencies
preempt. An interrupting need a committed goal does not relieve breaks that
commitment before re-selection.
**Consequences.** Interruptions feel survival-first; tuning stays data-driven.

## D12 — Navigation contract now, NavMesh later
**Context.** The spec separates semantic movement from physical execution
(§4.2), but the Unity editor round-trip isn't part of headless sprints.
**Decision.** `INavigationService` is the seam; `TimedNavigationService`
(authored travel minutes + scheduler arrivals) is the headless implementation.
The future Unity adapter implements the same interface over NavMeshAgents.
Callers always receive exactly one resolution per request (arrival, failure, or
superseded) — verified by tests.
**Consequences.** Planning/execution never changes when real navigation lands;
travel times are authored data, trivially replaceable by pathfinding distances.

## D13 — Employment is job-bound, not role-bound
**Context.** A single `TownRoles.Workplace` cannot express two residents with
different employers; work facts also leaked into shared action catalogs.
**Decision.** `StandardActions.CreateForResident` receives the resident's own
`JobDefinition`; `PlannerStateBuilder` derives at_work/work_open from that job;
`on_shift` reflects the ±30-minute pressure shoulder (`IsExpectedToWork`) so
commute plans can form before a strict shift opens.
**Consequences.** Any number of workplaces coexist; pre-shift commutes look
natural; strict shift windows remain available via `IsOnShift`.

## D14 — Perception reach over authored adjacency
**Context.** Headless locations are discrete nodes without geometry, but spec
§6.3 still wants quiet < loud < announcement observability tiers.
**Decision.** Locations get an authored bidirectional adjacency graph.
Reach tiers: SameLocation (visual), Nearby (audible, extends to adjacent),
Town (announcements). Confidence degrades by source: direct 1.0 > visual 0.9 >
announcement 0.95*base... audible 0.7. Occlusion/line-of-sight deferred per
spec §6.4.
**Consequences.** Deterministic, cheap perception now; adjacency doubles as the
seed for future pathfinding and spatial reasoning; memory encoding (Sprint 7)
can weigh confidence directly.
