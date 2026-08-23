/** Composition root for the browser view: authored town + the player actor. */
import { createAuthoredTown } from "@echosim/content";
import { PersonalityProfile } from "@echosim/cognition";
import { SimulationInspector } from "@echosim/inspector";
import type { Town, PlanningDirector } from "@echosim/simulation";

export const SEED = 7001n;
export const PLAYER_ID = "player";

const world = createAuthoredTown(SEED);
export const town: Town = world.town;
export const director: PlanningDirector = world.director;

town.spawnResident({
  id: PLAYER_ID,
  displayName: "You",
  homeLocationId: "apt_b",
  personality: PersonalityProfile.balanced(),
});

export const inspector = new SimulationInspector(town, director);
