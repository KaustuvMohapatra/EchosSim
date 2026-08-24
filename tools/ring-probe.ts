import * as I from './apps/life/src/world/interiors.js';
// Rebuild via buildInteriors is indirect; instead introspect library lot too.
const lib = I.buildInteriors().get('library')!;
console.log('library walls', lib.walls.length);
for (const w of lib.walls) console.log(w.id, w.x1.toFixed(1), w.z1.toFixed(1), w.x2.toFixed(1), w.z2.toFixed(1));

