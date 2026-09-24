# EchoSim Life — UI Phase 1 implementation report

Status: implemented and committed on `feature/echosim`; full dependency-complete repository verification remains pending.

## Git state

The repository instructions require work on `feature/echosim`. That branch did not exist on the remote when this phase started. After explicit permission to commit/push, it was created from current `main` and the UI work was committed there. `main` has not been modified or merged.

Current implementation commits:

- `adcefc3` — `fix(life): restore build mode and household command routing`
- `fbc7fd5` — `feat(life): rebuild UI presentation layer`
- `f7e7b6f` — `test(life): keep observer knowledge-scoped`

## Baseline issues repaired

- `apps/life/src/build/BuildController.ts` was referenced by the Life bootstrap and committed Sprint 43/44 tests but absent from the current tree. The controller was restored from the existing test/API contract instead of deleting Build Mode.
- `apps/life/src/app/bootstrap.ts` contained a duplicate Babylon `Color3` import.
- `packages/simulation/src/town.ts` contained a duplicate `TownStories` import and a conversation payload type that omitted `listener` while reading it.
- `LifeModeAdapter.commandMoveTo(locationId, agentId?)` accepted a target resident but routed movement through the original `playerId`; household switching could therefore control the wrong resident.
- Object/venue interactions and seated presentation state were effectively tied to the original player after household switching.
- Agent visual targets were not synchronized on simulation update boundaries.

## Presentation architecture

The former monolithic inline-style `App.tsx` is now an orchestration layer backed by focused presentation modules.

Pure presentation/read-model helpers:

- `ui/models/residentView.ts` — resident identity, readable activity, mood, relevant needs, relationship labels and autonomy copy.
- `ui/models/storyView.ts` — observer story shaping, relative simulation time, deduping and knowledge-aware event filtering.
- `ui/models/townView.ts` — day period and day-cycle display derived strictly from simulation time.

Components:

- `TopBar`
- `DayCycle`
- `ResidentRail`
- `ControlledResidentCard`
- `ResidentDetails`
- `ActionQueue`
- `ContextMenu`
- `TownObserver`
- `TownMiniMap`
- `WorldMap`
- `BuildPanel`
- `ToastLayer`

Styles are centralized in `tokens.css`, `life.css` and `components.css`.

## UI delivered

- Simulation-driven Morning / Afternoon / Evening / Night progress.
- Compact top HUD with time, weather, pause/play, speed, camera, Town, Map and Build controls.
- Horizontal resident rail built from real inspector summaries.
- Clear controlled-resident and household-control states.
- Controlled resident card showing current activity, location, mood and only the most relevant needs.
- Resident detail panel with overview, relationships and memories from inspector data.
- Compact action queue and exact `full-manual` / `assisted` / `autonomous` modes with player-facing descriptions.
- Contextual NPC and object interactions routed through existing mechanics.
- Town Observer with Live, Town, Following and Map tabs.
- Compact town preview plus expanded stylized town map using the authored lot layout.
- Build Mode kept visually and behaviorally separate, with catalog, undo/redo and persisted placement state.
- Responsive desktop/tablet/mobile layout, visible focus states and reduced-motion handling.

## Read-model / simulation-boundary changes

- `LifeSnapshot` includes read-only location summaries (`id`, display name, open state) for map presentation.
- `townStoriesFor(viewerId)` exposes only `TownStories.visibleTo(viewerId)`; the Life client never uses the omniscient `all()` story feed.
- The raw event journal remains omniscient for the debug inspector, but the Life Observer now scopes it before display:
  - private social/conversation moments require the controlled resident to participate;
  - another resident's arrival is shown only when it happens at the controlled resident's current location;
  - the controlled resident's own movement and global weather remain visible.
- Travel honors the actually controlled resident id.
- Object activities, movement and seat presentation state follow the controlled household member.
- Babylon interpolation remains presentation-only; semantic positions update from adapter emission boundaries rather than React/render FPS.

## Tests added

`tests/life/ui-presentation.test.ts` covers:

- day periods from simulation minutes;
- resident rail mapping without inventing activities;
- exact autonomy mode preservation with friendly labels;
- movement event → readable observer story mapping;
- regression against omniscient movement leakage;
- adapter-level TownStories knowledge filtering.

Existing `tests/life/build.test.ts` is executable again because the missing Build Controller source is restored. Existing household-control tests also exercise switched-resident movement routing.

## Verification performed here

- Restored `BuildController.ts`: strict TypeScript 5.8.3 compilation passed.
- Build Controller runtime sanity passed for placement/collision, undo/redo, wall creation, door splitting and structural undo.
- Syntax transpilation passed for all 24 changed/new TypeScript and TSX files in the implementation workspace.
- GitHub writes were made as normal Git objects/commits on `feature/echosim`; no force update and no change to `main`.

## Verification still required

This execution environment cannot clone the repository or reach npm/GitHub from the local container, so it cannot truthfully run the dependency-complete project gauntlet. Do not mark this UI phase fully verified until a normal checkout runs:

```bash
git switch feature/echosim
git pull
corepack pnpm install
npm run typecheck
npm test
npm run build:life
npx vitest run tests/life/hud.test.ts tests/life/build.test.ts tests/life/household.test.ts tests/life/ui-presentation.test.ts
```

Then smoke-check 1920×1080, 1366×768, 1280×720, tablet and mobile portrait, including household switching, social interactions, map travel, queue/autonomy, Build Mode, Town Observer and resident profiles.

## Next UI phase

After the dependency-complete gauntlet is green, the next coherent presentation slice is the phone/personal-life surface (messages, calendar, invitations), richer home/interior context and deeper story grouping. Those existing systems should be surfaced through read models rather than reimplemented in React.
