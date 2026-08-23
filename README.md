# EchoSim

> An engine-independent emergent social simulation where autonomous residents form memories, relationships, beliefs, routines and habits — allowing consequences and information to propagate through a living town.

## Quick Start

```bash
# Install (requires Node.js 18+)
corepack enable
corepack pnpm install

# Run headless simulation
npm run sim -- --seed=42069 --days=3

# Open living town in browser
npm run dev

# Open the React debug inspector (why is this NPC doing this?)
npm run dev:debug

# Run tests
npm test
```

## Architecture

```
Simulation Core (engine-free TypeScript)
├── @echosim/core        IDs · Time · RNG · Events · Scheduler
├── @echosim/cognition   Personality · Needs · Utility AI · GOAP
├── @echosim/world       Locations · Navigation · Jobs · Weather · Events
├── @echosim/social      Perception · Memory · Emotion · Relationships · Beliefs · Conversations
├── @echosim/simulation  Town composition root + PlanningDirector + social wiring
├── @echosim/content     Authored residents & fixtures (demo town)
├── @echosim/persistence Save/load with versioning
└── @echosim/inspector   Read-model snapshots for presentation layers

    ↓ consumed by ↓

apps/sim-cli     Headless Node runner (byte-reproducible per seed)
apps/game        Phaser 4 + Vite browser view
apps/debug-ui    React debug inspector (utility/plan/memory/belief/timeline)
tests/           Vitest suite (determinism + regression + architecture + UI)
```

**Core rule:** simulation packages never import Phaser, React, or DOM APIs. Enforced by `tests/architecture/`.

## Systems

| System | What it does |
|---|---|
| Deterministic RNG | SplitMix64 via BigInt — bit-identical across platforms |
| Time | Integer minute granularity; pause/resume; speed presets 0.5×–16× |
| Personality | 14 normalized traits driving all scoring variation |
| Needs | 7 needs (0=satisfied→100=critical); threshold dynamics with hysteresis |
| Utility AI | Explainable additive scoring: Base + Σ(need/trait/custom) − inertia + critical |
| GOAP | Uniform-cost search (Dijkstra); closed-set cycle avoidance; expansion+depth caps |
| Planning Director | Generation-tokened completions; deferred replanning; suppression backoff |
| Navigation | Timed travel over authored adjacency graph; stuck detection |
| Schedules/Jobs | Shift windows with ±30-min shoulders; weekday/weekend profiles |
| Perception | Reach tiers (same-location/nearby/town); confidence by source |
| Memory | Episodic memories with importance/valence; bounded store; explainable retrieval |
| Emotion | Valence/arousal with exponential decay toward neutral |
| Relationships | Directional 8-dimension vectors; personality-scaled events; drift |
| Beliefs/Gossip | Hop-decayed provenance chains; loop guards; direct experience > hearsay |
| Conversations | Deterministic intent selection; template utterances; no LLM required |
| Economy | Items, stock scarcity, wages, gifts scaled by recipient preference |
| Weather | Seeded daily Markov rolls; rain suppresses exploring unless you love rain |
| Persistence | Versioned JSON saves; atomic writes; migration chain |
| Debug Inspector | Read-only snapshots: utility breakdowns, plans/failures, memories, beliefs, timeline |

## Why These Bugs Matter

The test suite preserves regressions for real bugs found during development:

| Bug | Root Cause |
|---|---|
| Greedy goal testing | Goal checked at child-generation instead of pop → expensive plans won |
| Stale callbacks | Cancelled plans' scheduled callbacks consumed newer plans' steps |
| Commitment livelock | Expired commitments waived cooldown → satisfied goals re-elected forever |
| Self relationships | Observer's own actions created self-referencing links |
| Memory subject convention | Observer stored themselves as memory subject instead of other actor |
| Restore override leakage | Manual closures survived authored-hours sweeps after restore |
| Missing cognition timers | Suppression/cooldown state absent from saves caused restored towns to diverge |

Each has a named regression test.

## Testing

```bash
npm test                    # all tests
npm run test:determinism   # golden vector cross-check against .NET
npm run test:architecture  # engine independence guardrail
npm run test:regression    # historical bug preservation
npm run test:inspector     # debug read-model suite
```

## Known Limitations

- Social conversations are template-based (no LLM required, LLM layer planned)
- Movement is semantic travel over an authored graph (no spatial pathfinding yet)
- Content is 3 demo residents (target: 20–30)
- Save/restore of the new social wiring is exercised via systems tests; full
  persistence round-trip for conversations lands with the next persistence pass

## Roadmap

Sprints 0–19 complete. Remaining: 20 (social graph), 21–22 (optional LLM), 23 (reflection), 24 (habits), 25 (groups), 26–27 (LOD/perf), 28 (soak), 29 (content), 30 (research mode), 31–35 (UX/polish/release).

See `docs/ROADMAP.md` for full status.
