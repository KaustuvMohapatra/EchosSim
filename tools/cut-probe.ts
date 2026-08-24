import { buildInteriors, wallsToHide } from '../apps/life/src/world/interiors.js';
const cafe = buildInteriors().get('cafe')!;
console.log('walls', cafe.walls.length);
for (const w of cafe.walls) console.log(w.id, w.x1.toFixed(2), w.z1.toFixed(2), w.x2.toFixed(2), w.z2.toFixed(2));
const h = wallsToHide(cafe.walls, {x:-30,z:0}, {x:0,z:0});
console.log('hidden', [...h]);

