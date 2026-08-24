import { createAuthoredTown } from '@echosim/content';
const w = createAuthoredTown(7001);
// Simulate five full shifts for Mira then a sixth triggering promotion check.
for (let shift = 0; shift < 6; shift++) {
  // Grant professional xp as if from work + mark career day.
  w.town.skills.award('npc_mira', 'Professional', 8);
  const mind = w.town.residents.mind('npc_mira');
  mind.plannerMemory.set('career_days', (mind.plannerMemory.get('career_days') ?? 0) + 1);
}
console.log('prof', JSON.stringify(w.town.skills.stateOf('npc_mira','Professional')));

