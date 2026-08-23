import { createAuthoredTown } from '@echosim/content';
const w = createAuthoredTown(7001);
// Track every moveAgent call for apt_a members around the divergence.
const orig = w.town.moveAgent.bind(w.town);
(w.town as any).moveAgent = (agent: any, loc: any) => {
  const s = w.town.agentsById.get(agent)!;
  console.log('t' + w.town.clock.currentTime.totalMinutes, 'MOVE', agent, String(s.currentLocationId), '->', String(loc));
  orig(agent, loc);
};
for (let m = 0; m < 460; m += 10) {
  w.town.cognition.advanceNeeds({ totalMinutes: 10 });
  w.town.clock.advance({ totalMinutes: 10 });
  w.director.tickAll();
}

