# EchoSim

> An engine-independent emergent social simulation where autonomous residents
> form memories, relationships, beliefs, routines and habits — allowing
> consequences and information to propagate through a living town.

## Why it exists

Most "living world" NPCs are state machines wearing costumes. EchoSim inverts
that: **systems create behaviour**. Needs create pressure, utility creates
intention, GOAP creates adaptation, perception creates limited knowledge,
memory creates continuity, reflection creates abstraction, beliefs create
uncertainty, groups create social structure — and rendering is just a
replaceable window onto the result. The whole simulation runs headless in
Node; browser views consume read models and never touch simulation internals.

## Quick Start

```bash
corepack enable && corepack pnpm install   # Node 18+

npm run sim -- --seed=7001 --days=3        # headless, byte-reproducible
npm run sim -- --seed=7001 --days=2 --authored   # full 27-resident cast

npm run dev                                # playable living town (browser)
npm run dev:debug                          # debug inspector (why this NPC?)

npm run typecheck && npm test              # everything must be green
```

## Architecture

```
EchoSim core (engine-free TypeScript)
├── @echosim/core        IDs · Time · seeded RNG streams · Scheduler · EventBus
├── @echosim/cognition   Personality · Needs · Utility AI · GOAP
├── @echosim/world       Locations · Hours · Navigation · Jobs · Weather
├── @echosim/social      Perception · Memory · Emotion · Relationships
│                        Beliefs/Gossip · Conversations · Reflection
│                        Semantic memory · Habits · Groups
├── @echosim/simulation  Town composition root · PlanningDirector · LOD
├── @echosim/content     Authored residents (27) · demo/scaled towns · scenarios
├── @echosim/persistence Versioned saves; proven mid-flight round-trip identity
├── @echosim/inspector   Read-model snapshots · event journal · soak monitor
├── @echosim/ai          OPTIONAL LLM providers (template/mock/openai-compatible)
└── @echosim/research    Experiment runner · ablations · CSV exports

        ↓ consumed by ↓
 apps/sim-cli     apps/game (Phaser)   apps/debug-ui (React)   tests/research
```

Core rules enforced by tests: simulation packages never import
Phaser/React/DOM (`tests/architecture/`); no `Math.random()` or wall clock in
simulation logic; every LLM touchpoint can be disabled with zero errors.

## How cognition works

```
Needs + Schedule + Personality (+ habits, intentions, weather, mood)
        ↓  explainable additive scoring (every term logged)
Utility Goal Selection
        ↓
GOAP (uniform-cost search; open-list dedup; expansion caps)
        ↓  timed execution with generation tokens
Actions → Events → Perception → Memory → Relationship/Belief updates
        ↓                                  ↓
   Replan loop              Reflection → semantic traits → Habits → Intentions

Optional LLM: conversation intent (sim-decided) → bounded context builder
→ provider → schema validation → surface text ONLY (never mutates state)
```

### Explainability example (real output)

```
MIRA -> Work 1.223 (committed)
    Base               +0.020
    SchedulePressure   +1.050
    Ambition           +0.123
    Conscientiousness  +0.030
    EnergyCost         +0.000
```

Plans show step progress ("✓ GoTo Cafe ▸ BuyFood"), last failure detail
(`LocationClosed: loc_cafe closed`), replan reason and planner node counts.

## Demos & screenshots

- `npm run dev` — playable town: click buildings to walk; select residents to
  Greet / Talk / Compliment / Tease / Help / Apologize. They remember.
- `npm run dev:debug` — agent list with filters, utility breakdowns, plan
  viewer, memory/belief tables, event timeline, **Social Graph** tab
  (directional dimension edges, ego view, rumour chains), Demo selector.
- Demo scenarios are self-verifying: adaptive replanning under closures,
  memory persistence across days, gossip provenance decay, contradictory
  evidence revising rumours, rain emptying the park while rain-loving Mira
  keeps wandering.

## Testing

```bash
npm test                    # 114 tests across 16 suites
npm run test:determinism    # golden RNG vectors (.NET-identical streams)
npm run test:architecture   # engine-independence guardrails
npm run test:regression     # historical bug preservation
npm run test:inspector      # read-only invariant fingerprint suite
```

### Bugs these suites caught (highlights)

| Bug | Root cause |
|---|---|
| Greedy goal testing | Goal checked at child-generation instead of pop |
| Stale callbacks | Cancelled plans' callbacks consumed newer plans' steps |
| Commitment livelock | Expired commitments waived cooldown forever |
| Self relationships | Observer linked to themselves on own actions |
| Memory subject convention | Observer stored as subject instead of other actor |
| Restore override leakage | Manual closures froze authored hours after restore |
| Missing cognition timers | Cooldowns absent from saves caused divergence |
| Browser game crash | `town.attachRandoms()` called but never ported |
| Weather never changed | No host scheduled the daily seeded roll |
| Inspector mutated reads | getOrCreate created stores/links during inspection |
| Arrival memory flood | Unlisted event type fell through to default importance |
| Quadratic planning cost | O(all-locations) move effects + BigInt hashing per node |

## Performance (measured, single process)

| Scenario | Before S30 fix | After |
|---|---|---|
| 20 agents x 3 days | 7.9 s | **1.3 s** (~3400 sim-min/s) |
| 50 agents x 3 days | 24.3 s | **4.1 s** |
| 100 agents x 3 days | 55.5 s | **14.4 s** |
| Authored town x 1 day | 62.0 s | **4.5 s** |

Soak gauntlet (`npm run soak`): 50 NPCs x 30 days, 720 hourly invariant
sweeps — **0 violations**, bounded memories (11,240/12,500 cap), no stuck
signatures, no NaN/self-links/orphan refs. Failure artifacts auto-export.

Profiling showed 97% of planning time in state hashing; open-list dedup plus
cached-sort numeric hashing delivered a **13.8x speedup with byte-identical
plan outcomes** (`npm run bench` reproduces).

## Research mode

```bash
pnpm experiment --config experiments/memory-ablation.json
```

Ablations flip first-class Town feature switches (memory, reflection, gossip,
habits, personality) — no monkey-patching. Results land in `results/<id>/`:
flat documented `summary.csv` (incl. git commit + timestamp), plus
agents/relationships/beliefs/events CSVs. Shipped example: `memory-off`
zeroes memories/day while baseline conversation rates stay stable.

## Optional LLM layer

`@echosim/ai`: template/mock/OpenAI-compatible providers behind one contract
with retries, timeouts, schema validation, metrics and caching. Disabled by
default; when enabled it renders surface text only — an acceptance test
proves AI-off and AI-on runs produce **byte-identical towns**.

## Known limitations

- Movement is semantic travel over an authored graph (no spatial pathfinding).
- Conversation text is deterministic templates unless the optional LLM is on.
- Day-one authored-town plan failures are high (pre-shift Work attempts);
  suppression backoff keeps them cheap, smarter gating is future work.
- Debug timeline filters are prefix/text based; inspector is live-only.
- Group meetings exist but recurring calendars are minimal.
- No CI pipeline file yet — all verification is the local commands above.

## Roadmap

Sprints 0-33 complete. Remaining polish and release hardening tracked in
docs/ROADMAP.md; sprint-by-sprint history in docs/SPRINT_REPORTS.md.
