import { createAuthoredTown } from '@echosim/content';
const w = createAuthoredTown(7001);
w.town.locations.updateDefinition('cafe' as never, { displayName: 'Moonlight Cafe', capacity: 4, hours: { openMinuteOfDay: 480, closeMinuteOfDay: 1380 } } as never);
const rt = w.town.locations.get('cafe' as never);
rt.forceOpen(rt.definition.hours ? (480 <= 600 && 600 <= 1380) : true);
console.log(rt.definition.displayName, '| cap', rt.definition.capacity, '| open@10:00', rt.isOpen);

