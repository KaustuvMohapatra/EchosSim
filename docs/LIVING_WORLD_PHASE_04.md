# EchoSim Living World — Phase 04: A World That Attracts Residents

Branch: `feature/echosim`

## Goal

Turn player-placed objects into **reasons to travel**, not only opportunities
for interaction at a resident's current location. Preserve EchoSim's existing
memory, utility/GOAP, job scheduling, survival needs and simulation navigation
as the authoritative game state.

## What is implemented

### A. Leisure decisions integrated with GOAP

- `PlanningDirector.externalIdleActivity` is an optional low-priority hook.
  It runs only when a resident has no active GOAP run, after LOD gating.
  Critical needs are not overridden: those continue to the original GOAP
  planner and can cancel a leisure journey.
- `WorldObjectDirector.recommendAttraction(agentId)` examines objects
  *currently in BuildController inventory*. It considers:
  - Curiosity, Sociability and Ambition personality dimensions
  - Need relief (especially Fun, Social and Comfort)
  - Skill opportunity and actual travel time
  - Opening hours and work-shift timing
  - Energy, Hunger and Safety guardrails
  - Repetition history and cooldown in saved episodic memory
- Choices are ranked deterministically and sampled infrequently using stable
  identity/time hashes. The controlled resident is never commandeered.
- The director uses `town.navigation.beginMove()`, not an invented
  teleportation or a separate clock. Pending journeys block competing
  idle GOAP runs. On successful arrival, the actual object is re-resolved
  and `performWorldObjectActivity()` validates and applies effects.
- A removed/superseded object cannot award rewards. Navigation failure does
  not create a false success or activity memory.
- The existing Phase 03 opportunistic use remains supported: residents may
  use objects already at a venue during natural visits.
- No language model calls or nondeterministic Math.random decisions.

### B. Understandable NPC behavior

- Started journeys emit `sim:world-object-trip-started` events for the
  world-level recent activity feed: e.g. a resident heads to the studio to
  use an easel. The observer can see *what* is happening, not only arrivals.
- Completion still publishes `sim:world-object-used`, core episodic memory,
  effects to real needs/skills, town stories and locally witnessed perception.
- Normal Resident mode knowledge restrictions remain in place.

### C. Sprite-level interaction feedback

- The Babylon `AgentLayer` listens to real completed-object events.
- The resident approaches the object's visible position when possible, then
  shows a short, labeled gesture such as PLAYING, PAINTING, GARDENING or
  READING, or a seated rest/creation pose.
- Animation is explicitly **presentation-only**; reward and memory happened
  at the authoritative simulation event.
- The existing 32-character pixel atlas is reused. These are **pose loops and
  activity labels**, not newly authored occupation-specific frame sheets.
  Future animation production should create specialized frames for hands,
  tools, painting, gardening, etc.

### D. Player discoverability

- Town Observer includes an **Objects** section enumerating what the player
  installed, its location, purpose/skill benefit and a Visit action.
- The larger Town Map reports installed-object counts per lot.
- The build panel and in-world context actions from Phase 03 remain in use.

## Files

- `packages/simulation/src/director.ts`
- `apps/life/src/simulation/WorldObjectDirector.ts`
- `packages/inspector/src/eventJournal.ts`
- `apps/life/src/ui/models/storyView.ts`
- `apps/life/src/characters/activityStates.ts`
- `apps/life/src/characters/AgentLayer.ts`
- `apps/life/src/app/bootstrap.ts`
- `apps/life/src/ui/components/TownObserver.tsx`
- `apps/life/src/ui/components/WorldMap.tsx`
- `apps/life/src/ui/App.tsx`
- `apps/life/src/ui/styles/components.css`
- `tests/life/world-attractions.test.ts`

## Technical caveats

1. The leisure layer is a safe extension to idle GOAP, not yet a native
   `GoalDefinition` inside the core utility planner. A future refactor could
   promote object interests to registered GOAP activities.
2. Leisure **intent while travelling** lives in memory only in the current
   runtime. A browser refresh restores saved residents/objects, but does not
   resume the same external, unfinished walk; the next idle opportunity can
   choose again.
3. Object usage is immediate at the core simulation-arrival boundary.
   The accompanying activity gesture is a visual celebration, not a new
   duration-based reservation/task.
4. Installed objects are still displayed outside opaque Babylon buildings;
   a full interior cutaway or tile-based building redesign is separate work.
5. Built-world state and core town state still use separate localStorage
   entries. Atomic paired save slots and world exports remain outstanding.
6. No full browser visual QA is claimed by source CI. Verify movement and
   object-side sprite behavior in the app at multiple zoom/viewport sizes.

## Recommended manual playtest

1. Create two contrasting residents: a curious explorer and a social resident.
2. Place an easel at the studio, an arcade at the café, and a community garden
   in the park. Unpause the world.
3. Let multiple simulated days pass. Watch for non-player residents choosing
   destinations because of the objects you installed.
4. Confirm no autonomous leisure excursion steals an active job shift, urgent
   need action, or manually controlled resident.
5. In World mode, open Town Observer > Objects, inspect available attractions,
   and choose Visit. Check Town Map object counts.
6. Follow a resident going to use a prop. Look for a prop approach and
   contextual activity label/pose; confirm their memory and skills change.
7. Remove or move a destination object during a pending trip. Verify no
   phantom experience is awarded when the resident arrives.
8. Save and reload. Confirm the residents, placed objects, personal histories
   and used-object cooldowns are intact.

## Next phase candidates

- Native GOAP integration for leisure, with reserved object anchors,
  multi-resident occupancy/capacity and travel/activity duration.
- Authored painting, gaming and gardening sprite animations.
- Proper walkable courtyards and room cutaways rather than solid interiors.
- Unified world-state save/export and replayable event explanations.
