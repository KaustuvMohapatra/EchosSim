# EchoSim Living World — Phase 03: Meaningful World Interactions

Branch: `feature/echosim`

## Objective

Build a vertical slice of *actual sandbox gameplay* on top of the
Babylon 2.5D/pixel character town: the player installs an object, a resident
uses it, simulation state changes, and that experience is remembered.

## Implemented

### Placed objects with real effects

Four new Build Mode choices join existing furniture:
- **Arcade:** play games, restore Fun, gain Social experience; small Energy cost.
- **Art Easel:** paint, restore Fun, gain Creativity experience.
- **Garden Plot:** tend the garden, restore Fun, gain Fitness experience;
  small Energy cost.
- **Community Noticeboard:** read notices, gain Knowledge and some Fun.

Existing furniture (chairs, sofas, tables, bookshelves, benches, beds, desks,
counters) now shares the **installed-object activity contract**, each with
a contextual action and need/skill effect.

`packages/simulation/src/worldObjects.ts` is **engine-independent**. The
activity function verifies the actor exists, is actually at the object's lot,
the activity belongs to the object's kind, and sufficient cooldown has elapsed.
The calling interaction/controller resolves the object from the *current*
BuildController inventory, so deleted furniture cannot be used.

### Memory and chronicle

Successful interactions:
1. Apply real needs and award real skill XP.
2. Add an episodic memory with the object's persistent ID as its subject.
3. Publish a co-located perception event, rather than notifying every resident
   telepathically.
4. Publish a World Chronicle story, visible in World perspective and filtered
   by resident knowledge/group policies in Resident perspective.

Cooldowns are derived from episodic memory (per actor/object), **not**
unsaved timers. World save/restore already serializes these records.

### Player actions

- Clicking player-built furniture offers an actionable **Use / Paint / Play /
  Tend / Browse** entry alongside rotate/delete.
- If the controlled resident is in another lot, travel is initiated first and
  the activity resolves when they actually arrive.
- Pending actions check the live Build inventory again to avoid using a removed
  object. A failed activity reports specific feedback (e.g. still cooling down).
- Build Mode catalog lists activity effects and stays scrollable on mobile.
- Undo, redo, rotation, collision rules, build serialization and restoration
  remain handled by the existing BuildController.

### Autonomous residents

`WorldObjectDirector` observes simulation updates (not render frames). On
simulated-hour boundaries, residents can opportunistically interact with
equipment that already exists **at their current location**. Preferences are
deterministic and weighted by Curiosity, Sociability and Ambition. The controlled
resident is excluded from automated use. One action per resident per eligible
hour prevents instant activity spam; per-object cooldown applies after that.

**Important:** this is a supplementary opportunistic behavior, not yet a GOAP
goal that actively attracts residents across town. Residents still visit places
through their prior autonomous schedules, then sometimes use installed objects.

### Pixel-world representation

Original 2.5D visual props were added for arcades, easels, garden plots and
noticeboards, with details such as arcade screens, painted canvases, planted
soil, and pinned paper notices. Props remain pickable by object ID.

Opaque Babylon buildings do not yet support interior/cutaway rendering.
Activity equipment at indoor lots is therefore displayed in accessible
exterior frontages; the actual installed-object lot remains authoritative in
simulation and BuildController persistence. This is a deliberate interim
visualization rather than a full interior simulation.

## Files

- `packages/simulation/src/worldObjects.ts`
- `packages/simulation/src/stories.ts`
- `apps/life/src/simulation/WorldObjectDirector.ts`
- `apps/life/src/build/BuildController.ts`
- `apps/life/src/interaction/InteractionController.ts`
- `apps/life/src/world/builtObjectArt.ts`
- `apps/life/src/app/bootstrap.ts`
- `apps/life/src/ui/components/ContextMenu.tsx`
- `apps/life/src/ui/components/BuildPanel.tsx`
- `apps/life/src/ui/styles/components.css`
- `tests/life/world-objects.test.ts`

## Verification

The repository's `life-ci.yml` performs frozen dependency installation,
TypeScript checking, complete Vitest regression suite, and production Vite
build. Verify the latest feature-branch run is green before release; this
documentation does not claim browser playtesting has been completed.

### Manual smoke test

1. Start Life and enter Build Mode. Place an arcade near the café, an easel at
   the studio, and a garden in the park.
2. Exit Build Mode. Click an object and choose its activity.
3. Observe travel for an off-lot actor; verify the activity only completes on
   arrival.
4. Verify memory summary, skill XP, needs and World Chronicle changed.
5. Click the same object immediately again; cooldown should block repeated XP.
6. Save and reload; cooldown should still be present.
7. Rotate, delete and undo the object; no deleted object should remain usable.
8. Fast-forward several days; watch existing residents use props
   opportunistically at their currently visited venues.
9. Verify Resident perspective still does not reveal distant private actions,
   and mobile Build Mode remains usable.

## Limitations / Phase 04

- Need a proper *desire to visit activity venues* built into utility/GOAP AI.
- No duration-based player animations for painting/gaming/gardening yet.
- Need simulation-space movement to object interaction anchors plus cutaway
  interior or open-air venue designs.
- Object use applies an activity instantly after validation rather than
  consuming a reserved time-slot or resource.
- No equipment capacity/queues or resource ownership system yet.
- Longer-term save architecture should atomically persist world + build state.
- More gameplay objects and deeper friendships/community events should follow
  validated needs, balancing and stability.
