# EchoSim Roadmap

Source of truth for scope: `ECHOSIM.txt` master specification (35 sprints).

## Progress

| Sprint | Scope | Status |
|---|---|---|
| 0 | Repository bootstrap & architecture audit | **Done** |
| 1 | Core simulation foundation (IDs, time, RNG, scheduler, event bus, agents/locations, bootstrap) | **Done** |
| 2 | Personality + needs + utility AI | **Done** |
| 3 | GOAP planning | Planned |
| 4 | Physical world, navigation, affordances | Planned |
| 5 | Schedules, jobs, daily rhythm | Partial — daily scheduling primitives exist; jobs/opening hours not yet |
| 6 | Perception & event observation | Planned |
| 7 | Memory system | Planned |
| 8 | Emotion & mood | Planned |
| 9 | Relationships | Planned |
| 10 | Social actions & interaction protocol | Planned |
| 11 | Beliefs, knowledge & rumours | Planned |
| 12 | Conversation engine (no LLM) | Planned |
| 13 | Player foundation | Planned |
| 14 | Mira easter egg | Planned |
| 15 | Items, light economy | Planned |
| 16 | Weather & environmental pressure | Planned |
| 17 | Town events & storylets | Planned |
| 18 | Save/load & versioning | Planned |
| 19 | Advanced debug tooling | Planned |
| 20 | Relationship graph visualization | Planned |
| 21 | LLM provider abstraction | Planned |
| 22 | LLM dialogue rendering | Planned |
| 23 | Reflection & semantic memory | Planned |
| 24 | Long-term goals & habits | Planned |
| 25 | Households, friend groups | Planned |
| 26 | Offscreen / multi-LOD simulation | Planned |
| 27 | Performance & allocation control | Planned |
| 28 | Soak tests & validation | Planned |
| 29 | Content expansion | Planned |
| 30 | Research / experiment mode | Planned |
| 31 | UX & gameplay presentation | Planned |
| 32 | Audio / animation / VFX polish | Planned |
| 33 | Onboarding & demo mode | Planned |
| 34 | Portfolio presentation | Planned |
| 35 | Release hardening | Planned |

## Sprint policy

Sprints execute sequentially. A sprint is complete only when: code compiles,
all tests pass, the demo scenario runs, docs are updated, and the diff has been
reviewed (spec §14). Never claim unexecuted work as done (§53, §55).

## Next up: Sprint 2

Personality profile (normalized 0–1 parameters), need dynamics with hysteresis,
utility curves, goal selection with explainable score breakdowns.
