/** Frame-presentation metadata for meaningful activities (not sim truth). */
import type { WorldObjectKind } from "@echosim/simulation";

export interface ActivityPresentation {
  label: string;
  pose: "front" | "seated";
  seconds: number;
}

const effects: Readonly<Record<WorldObjectKind, ActivityPresentation>> = {
  arcade: { label: "PLAYING", pose: "front", seconds: 5 },
  easel: { label: "PAINTING", pose: "front", seconds: 6 },
  garden: { label: "GARDENING", pose: "front", seconds: 6 },
  noticeboard: { label: "READING", pose: "front", seconds: 4 },
  chair: { label: "RESTING", pose: "seated", seconds: 4 },
  sofa: { label: "RELAXING", pose: "seated", seconds: 5 },
  table: { label: "THINKING", pose: "seated", seconds: 4 },
  bookshelf: { label: "READING", pose: "front", seconds: 5 },
  bench: { label: "RESTING", pose: "seated", seconds: 4 },
  bed: { label: "NAPPING", pose: "seated", seconds: 5 },
  desk: { label: "CREATING", pose: "seated", seconds: 5 },
  counter: { label: "CHATTING", pose: "front", seconds: 5 },
};
export function activityPresentation(kind: WorldObjectKind): ActivityPresentation {
  return effects[kind];
}
