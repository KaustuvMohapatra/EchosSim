import { LifeModeAdapter } from '../apps/life/src/simulation/LifeModeAdapter.js';
const a = new LifeModeAdapter({ seed: 7001 });
const origMove = a.town.moveAgent.bind(a.town);
(a.town as any).moveAgent = (agent: any, loc: any) => {
  try {
    const rt = a.town.locations.get(loc);
    console.log('MOVE', agent, '->', String(loc), '| open?', rt.isOpen, '| occ', rt.occupiedCount, '/', rt.definition.capacity, '| t', a.town.clock.currentTime.totalMinutes % 1440);
    origMove(agent, loc);
  } catch (e) { console.log('MOVE THREW:', String(e)); throw e; }
};
for (let i = 0; i < 60; i++) a.stepOnce();
a.commandMoveTo('library');
for (let i = 0; i < 3; i++) a.stepOnce();

