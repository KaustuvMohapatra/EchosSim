import { createAuthoredTown } from '@echosim/content';
const w = createAuthoredTown(7001);
const expected = new Map<string, number>();
function recompute(){ expected.clear(); for (const id of w.town.residents.orderedIds()) { const s = w.town.agentsById.get(id)!; if (s.hasLocation && s.currentLocationId!==undefined) expected.set(s.currentLocationId,(expected.get(s.currentLocationId)??0)+1);} }
recompute();
let last = '';
for (let m = 0; m < 1440; m += 10) {
  w.town.cognition.advanceNeeds({ totalMinutes: 10 });
  w.town.clock.advance({ totalMinutes: 10 });
  w.director.tickAll();
  const before = JSON.stringify([...expected]);
  recompute();
  for (const [loc, want] of expected) {
    const rt = w.town.locations.get(loc as never);
    if (rt.occupiedCount !== want) {
      console.log('DIVERGED t'+(m+10), loc, 'occ',rt.occupiedCount,'want',want);
      console.log('expected-before-tick', before);
      // dump who thinks they are where
      for (const id of w.town.residents.orderedIds()){ const s=w.town.agentsById.get(id)!; if(s.currentLocationId===loc) console.log('  claims:',id); }
      process.exit(0);
    }
  }
}
console.log('consistent');

