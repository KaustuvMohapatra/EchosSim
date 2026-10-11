# EchoSim — Living World Pixel-Art Resident Pack

## Production format

The first original in-repository pixel-art character collection contains **32 deterministic variants**, all checked into `apps/life/public/assets/residents/`. Every transparent PNG is `128×240` pixels:

- Frame size: `32×48` pixels.
- Four columns: frames 0 through 3.
- Five rows: front walk/idle, back walk, left walk, right walk, seated.
- Exactly **20 frames per resident**, or **640 frames** across the set.
- Crisp nearest-neighbor sampling in Babylon.js; sprite actors remain flat 2D planes instead of capsules.
- `contact-sheet.png` previews the 32 character variants.

## Using and editing the art

Run `node tools/generate-resident-atlases.mjs` from the repository root to recreate the first collection. The generator is deterministic, self-contained, and uses no external assets. The resulting files are original project-owned sprite artwork rather than a mix of packs with incompatible art styles.

Each atlas can also be edited in Aseprite, LibreSprite, Piskel or Krita at native resolution. Preserve the transparent frame sizes, four-column/five-row order, and row semantics so the existing animator continues to work. The PNGs in `public/assets` are production inputs, not temporary concept-art references.

## Integration

- `apps/life/src/characters/residentAssets.ts` chooses an atlas from a stable resident ID hash.
- `AgentLayer.ts` loads that static PNG as a Babylon `Texture` with nearest sampling, alpha cutout and atlas UV offsets. Failed texture loads revert to the prior procedural drawing rather than generating invisible residents.
- `ResidentCreator.tsx` previews the same atlas and offers previous/next controls for all 32 looks.
- The creator generates a unique ID whose hash resolves to the chosen appearance. This preserves the selected appearance through existing world save/restore without adding a separate unsynchronized cosmetic store.
- `ResidentPortrait.tsx` shows the same first-frame sprite in the roster, controlled character card and profile.
- Character assets are presentation only: NPC personalities, needs, skills, relationships, memories and GOAP behavior are unchanged.

## Verification and future improvements

`tests/life/resident-art.test.ts` checks that every PNG exists, is correctly sized, has transparency and is selectable deterministically. The Life CI workflow runs project-wide typechecking, tests and the production build.

This is a **small-sprite foundation**, not the final detailed animation library. Later passes should include more expressive authored 8-direction movement, occupation-specific interactions, clothing layering, walkable street paths, shadow/occlusion tuning, better facial expression variants, seasonal outfits and memory-driven animation cues.

NPCs still move between semantic venues using visually interpolated positions. The next world-visual phase should make street-following movement and pixel-textured terrain/buildings the visual priority.
