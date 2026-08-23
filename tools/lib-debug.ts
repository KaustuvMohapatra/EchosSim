import { createDemoTown } from '@echosim/content';
import { LifeModeAdapter } from '../apps/life/src/simulation/LifeModeAdapter.js';
const a = new LifeModeAdapter({ seed: 7001 });
for (let i = 0; i < 60; i++) a.stepOnce();
console.log('t', a.town.clock.currentTime.totalMinutes, 'library open?', a.town.locations.get('library' as never).isOpen);
const r0 = a.commandMoveTo('library');
console.log('cmd ok', r0, a.lastCommandFeedback);
console.log('nav state', JSON.stringify(a.town.navigation.getState('player')));
for (let i = 0; i < 5; i++) {
  a.stepOnce();
  console.log('after', i+1, 'loc', a.playerLocationId(), 'nav', JSON.stringify(a.town.navigation.getState('player')));
}

