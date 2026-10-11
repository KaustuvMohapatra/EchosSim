# EchoSim Living World — Phase 02: Walkable Pixel Neighborhood

Branch: `feature/echosim`
Status: implementation committed; see feature-branch GitHub Actions for verification.

## Goal

Keep Babylon.js and the existing 32-resident animation atlas while turning the authored town from a collection of blank boxes into a readable pixel-inspired living neighborhood. Residents should travel along visual walkways instead of cutting straight through buildings.

## Implemented

### 1. Sidewalk routing (presentation-only)
- `apps/life/src/world/pedestrianPaths.ts` defines three north–south pedestrian lanes (`x=-28,6,37`) and two cross streets (`z=-8,34`) matched to the authored lots.
- `standingPoint()` positions residents just outside solid façades, rather than burying sprites in buildings; parks use open-space anchors.
- `routeFromPosition()` and `routeBetweenLocations()` produce axis-aligned paths via accessible streets.
- `advanceWalk()` consumes distance budget independent of framerate, allowing turns and multiple short segments in one frame.
- `AgentLayer` updates routes on **semantic destination changes**, walks at a consistent visual rate, changes facing to match movement direction and reroutes mid-walk without teleporting back to an old spawn point.
- A stopped resident uses an idle animation. A seated resident retains the separate seated pose.
- The semantic Town still determines actual arrival, schedules, needs and memory; the visible route is deliberately **not** allowed to rewrite simulation truth.

### 2. World art
- `pixelWorldArt.ts`: reusable original, deterministic, low-resolution textures for grass, cobblestone, roofs, façade windows/doors/awnings, trees, flower beds and streetlamps.
- `townMeshes.ts` uses these materials while retaining each building's pickable lot mesh.
- Buildings have differentiated façade appearances (windows, shop awnings, entrance details), tiled rooftops, smaller legible labels and sidewalk entrances.
- Grass and streets form a unified neighborhood visual, not isolated colored primitives.
- Trees and flowers use camera-facing pixel planes; a very subtle breeze animation runs only in the render loop.
- Lamppost sprites are placed near pedestrian intersections and do not block clicking or walking.

### 3. Dynamic atmosphere
- Daylight, dawn/dusk and nighttime sky colors and scene lights derive from the **simulation clock**, not wall-clock time.
- Lighting updates on simulation events, rather than per frame.
- The Babylon scene remains interactive in both World and Resident perspectives.

### 4. Tests and verification
- `tests/life/pedestrian-paths.test.ts` checks arrivals outside obstacles, all authored venue-pair routes avoiding solid buildings, deterministic frame-stepping, mid-route retargeting and redundant waypoint removal.
- GitHub CI workflow runs frozen dependency install, TypeScript, all tests and the Life production build.

## Important limits

These are **visual routes**, not an end-to-end movement/navmesh system. The simulation currently changes semantic locations independently of route playback; a person can be logically at their new location while their avatar is still walking there. The authored path graph is intended to support the existing fixed town, not arbitrary procedural map edits yet.

The rooftops and building footprints remain basic Babylon primitives with 2D pixel façades. This is an intentional 2.5D direction — no capsule residents — but is not yet a fully isometric pixel-game scene. The next phase should expand the town editor, unify placeable-object affordances and support multiple neighborhood layouts.

The 32-character art pack is original and unchanged; character animations still include four-frame directional walking, idle and seated poses rather than occupation-specific animation sprites.

## Smoke test checklist

1. Launch Life with `npm run dev:life`.
2. Observe sprites leaving one venue and walking along sidewalks; no straight-line diagonal movement through boxes.
3. Select a resident while walking; ensure click selection still functions.
4. Switch World/Resident view; ensure limited resident perception remains correct.
5. Create an additional resident with a selected look; verify spawn, independent movement and save/restore.
6. Toggle pause/speed; look for steady, delta-based sprite movement and stationary idle animation.
7. Verify day/night sky, façade materials, trees/flowers and subtle foliage motion.
8. Test apartment, café, studio, park, hall, map/build mode and narrow viewport HUD.
9. Confirm the complete GitHub Actions typecheck/test/build is green.

## Suggested next phase

- **Phase 03 — Meaningful World:** make placed objects register as real affordances and give residents opportunities to perform autonomous activities based on installed equipment (arcades, easels, gardens, noticeboards). Expand the sprite animation atlas to show those actions.
