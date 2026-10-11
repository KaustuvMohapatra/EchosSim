# EchoSim Living World — Phase 01

Branch: feature/echosim  
Status: source committed; full build and runtime verification pending.

## Objective
Keep Babylon.js and EchoSim's engine-independent simulation while replacing capsule NPCs with animated 2D pixels. Make residents createable at runtime and persistent between sessions.

## Implemented
- Deterministic 32×48 pixel-art residents via a single 128×240 DynamicTexture atlas per resident (front, back, left, right, seated; four frames each).
- Alpha-tested billboard planes with nearest-neighbor sampling, walking/idle/seated frame selection and frame-rate-independent visual interpolation.
- No new capsule characters. Existing Babylon camera, pointer selection and floating labels are retained.
- New Resident creation panel with name validation, simulated personality presets, residential homes and a real pixel preview.
- Resident creation delegates to Town.spawnResident through LifeModeAdapter; agents use the same needs, memory, relationships, scheduling and GOAP systems.
- Explicit World mode with town-wide positions and profiles; Resident mode retains perception-scoped knowledge and does not expose strangers' private records.
- Core world save/restore integrated into Life with manual save, autosave every simulated hour, immediate save after creation, and pagehide save. Invalid stored saves fall back to a fresh town without deleting stored data.
- Portable pure identity/preset helpers; regression tests for creating residents, privacy and save/restore.
- Mobile horizontal tool scrolling so World/Create/Save/Build remain reachable.

## Architectural safety
Babylon renders presentation only. Social cognition, autonomous goals, simulation clock, memory and persistence remain in the engine-independent packages. The new World perspective has its own explicit read-model APIs rather than changing a resident's perception.

## Known limitations
- Movement still interpolates semantic location changes; it does not physically navigate streets or avoid buildings. Pathfinding is the highest priority for Phase 02.
- Pixel residents are procedural programmer art. Next: authored sprites, richer silhouettes, outfits, facial details and more animation states.
- Buildings are still simple geometric blocks. Next: coordinated pixel facades, roofs, foliage, ground tiles and environmental animation.
- World Creator does not yet edit lots/jobs, create households, or configure every appearance trait.
- Newly placed furniture is not yet fully registered as a simulation-affordance source for autonomous NPC usage.
- World Observer story feed remains scoped to the player; full god-view chronicle needs a separate storytelling read model.
- Browser localStorage has quota limits and no export/import slots yet.

## Verification
A GitHub Actions workflow now defines frozen pnpm install, repository typecheck, tests, and Life production build. The current execution environment could not clone/install dependencies, so none of these checks are claimed to pass without CI evidence.

Manual checks after CI: animated NPC visibility, selection/picking, World/Resident scope, creator success/validation, save and refresh retaining resident identity, multi-day memory, mobile layout, build mode and existing interaction regression.

## Follow-up development phases
- Phase 02 — real street navigation and travel animation tied to semantic movement.
- Phase 03 — pixel-textured environment, animated decor, lighting and weather.
- Phase 04 — meaningful furniture with NPC affordances and emergent gathering.
- Phase 05 — world chronicle, richer personal stories, creator depth and save-slot export/import.
