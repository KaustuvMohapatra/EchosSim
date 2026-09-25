# EchoSim Life UI — Personal Life Phase

Branch: `feature/echosim`

This phase continues the Phase 1 Life presentation overhaul without replacing
the existing UI architecture or creating presentation-owned simulation state.

## Implemented

- Added a compact Phone surface with Messages, Calendar and Invitations tabs.
- Message sending routes through `deliverMessage`, preserving the existing
  weak remote relationship nudge and receiver-memory behavior.
- Calendar entries come from `workShifts`; no presentation schedule is
  synthesized.
- Invitations are read from `InvitationBoard` and accept/decline actions route
  back through that board.
- Added a resident-scoped personal-life read model to `LifeModeAdapter`.
  React receives copied presentation data rather than mutable simulation stores.
- Household profiles expose real household membership and the resident's actual
  home location.
- Career presentation uses the inspector's current job plus real upcoming work
  shifts.
- Skills use `Town.skills` and the existing `xpForLevel` curve; no fake XP
  thresholds or promotion progress were introduced.
- Private Life profile data is only requested for residents the player can
  control through household switching.
- Replaced fragile positional HUD selectors with explicit tool classes.
- Fixed narrow portrait lower-HUD overlap and suppresses the lower resident /
  action cards while a side panel is open on compact layouts.

## Tests added

- Personal-life time formatting and skill progress presentation.
- Resident-scoped phone message visibility.
- Simulation-backed skill read-model values.
- Household membership exposure for the controlled resident.
- Invitation history read helper after accept, including unrelated-resident
  isolation.

## Verification status

The repository was inspected and edited directly through the authenticated
GitHub connection. The execution container cannot resolve `github.com`, so a
working checkout could not be materialized for dependency-complete npm
verification. GitHub also reports no Actions workflow/status checks for the
feature commits.

Accordingly, these commands were **not claimed as passing** in this environment:

```bash
npm run typecheck
npm test
npm run build:life
```

The committed diffs and strict TypeScript-facing APIs were reviewed directly.
A dependency-complete checkout should run the three commands above before
merging this branch.
