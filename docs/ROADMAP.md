# EchoSim Roadmap

Source of truth for scope: `ECHOSIM.txt` master specification (35 sprints).

## Progress

| Sprint | Scope | Status |
|---|---|---|
| 0 | Repository bootstrap & architecture audit | **Done** |
| 1 | Core simulation foundation (IDs, time, RNG, scheduler, event bus, agents/locations, bootstrap) | **Done** |
| 2 | Personality + needs + utility AI | **Done** |
| 3 | GOAP planning | **Done** |
| 4 | Physical world, navigation, affordances | **Done** |
| 5 | Schedules, jobs, daily rhythm | **Done** |
| 6 | Perception & event observation | **Done** |
| 7 | Memory system | **Done** |
| 8 | Emotion & mood | **Done** |
| 9 | Relationships | **Done** |
| 10 | Social actions & interaction protocol | **Done** |
| 11 | Beliefs, knowledge & rumours | **Done** |
| 12 | Conversation engine (no LLM) | **Done** |
| 13 | Player foundation | **Done** |
| 14 | Mira easter egg | **Done** |
| 15 | Items, light economy | **Done** |
| 16 | Weather & environmental pressure | **Done** |
| 17 | Town events & storylets | **Done** |
| 18 | Save/load & versioning | **Done** (round-trip determinism proven) |
| 18.5 | Engine-independent execution completion (TS monorepo port) | **Done** (persistence port completed during S23) |
| 19 | Advanced debug tooling (inspector API + React debug UI) | **Done** |
| 20 | Relationship graph visualization | **Done** |
| 21 | LLM provider abstraction | **Done** |
| 22 | LLM dialogue rendering | **Done** |
| 23 | Reflection & semantic memory | **Done** |
| 24 | Habits & long-term intentions | **Done** |
| 25 | Groups & social structure | **Done** |
| 26 | Multi-LOD simulation | **Done** |
| 27 | Performance measurement + planner optimization | **Done** |
| 28 | Soak tests & validation (50x30 clean) | **Done** |
| 29 | Content expansion (27 residents) | **Done** |
| 30 | Research / experiment mode | **Done** |
| 31 | Gameplay presentation (Phaser living town) | **Done** |
| 32 | Presentation life (bubbles, rain, ambience) | **Done** |
| 33 | Demo scenarios (self-verifying) | **Done** |
| 34 | Portfolio presentation | **Done** |
| 35 | Release hardening (v0.1.0) | **Done** |

## Sprint policy

Sprints execute sequentially. A sprint is complete only when: code compiles,
all tests pass, the demo scenario runs, docs are updated, and the diff has been
reviewed (spec §14). Never claim unexecuted work as done (§53, §55).

## Next up: Sprint 20

Social graph visualization: NPC nodes, directional relationship edges with
dimension selection (affinity/trust/grievance/…), magnitude filters, ego
graphs, and gossip-path views driven by belief provenance — built on the
`@echosim/inspector` read models.
