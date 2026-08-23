import { createAuthoredTown } from '@echosim/content';
const w = createAuthoredTown(7001);
const expected = new Map<string, number>();
for (const id of w.town.residents.orderedIds()) {
  const s = w.town.agentsById.get(id)!;
  if (s.hasLocation) expected.set(s.currentLocationId!, (expected.get(s.currentLocationId!) ?? 0) + 1);
}
function check(t: number): string | null {
  for (const [loc, want] of expected) {
    const rt = w.town.locations.get(loc as never);
    if (rt.occupiedCount !== want) return 't' + t + ' ' + loc + ': occ=' + rt.occupiedCount + ' want=' + want;
  }
  return null;
}
let bad = check(0); if (bad) console.log('INITIAL', bad);
for (let m = 0; m < 1440 && !bad; m += 10) {
  w.town.cognition.advanceNeeds({ totalMinutes: 10 });
  w.town.clock.advance({ totalMinutes: 10 });
  // recompute expectation from truth AFTER tick
  w.director.tickAll();
  for (const [k] of expected) expected.delete(k);
  for (const id of w.town.residents.orderedIds()) {
    const s = w.town.agentsById.get(id)!;
    if (s.hasLocation) expected.set(s.currentLocationId!, (expected.get(s.currentLocationId!) ?? 0) + 1);
  }
  bad = check(m + 10);
  if (bad) console.log('DIVERGED', bad);
}
if (!bad) console.log('occupancy consistent all day');

