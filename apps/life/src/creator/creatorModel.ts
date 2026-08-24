/** Character creator model (Sprint 47): UI picks → continuous personality. */
import { PersonalityProfile, PersonalityTrait } from "@echosim/cognition";

export interface TraitPick {
  id: string;
  label: string;
  /** Additive deltas over a 0.45 baseline, clamped to [0,1]. */
  deltas: Partial<Record<PersonalityTrait, number>>;
}

export const TRAIT_PICKS: readonly TraitPick[] = [
  { id: "outgoing", label: "Outgoing",
    deltas: { [PersonalityTrait.Extraversion]: 0.25,
              [PersonalityTrait.Sociability]: 0.3 } },
  { id: "creative", label: "Creative",
    deltas: { [PersonalityTrait.Openness]: 0.3,
              [PersonalityTrait.Curiosity]: 0.2 } },
  { id: "organized", label: "Organized",
    deltas: { [PersonalityTrait.Conscientiousness]: 0.3,
              [PersonalityTrait.RoutinePreference]: 0.2 } },
  { id: "kind", label: "Kind",
    deltas: { [PersonalityTrait.Agreeableness]: 0.3,
              [PersonalityTrait.Generosity]: 0.25 } },
  { id: "calm", label: "Calm",
    deltas: { [PersonalityTrait.EmotionalVolatility]: -0.35,
              [PersonalityTrait.Patience]: 0.25 } },
  { id: "bold", label: "Bold",
    deltas: { [PersonalityTrait.RiskTolerance]: 0.3 } },
];

export interface LifeGoal {
  id: string;
  label: string;
}

export const LIFE_GOALS: readonly LifeGoal[] = [
  { id: "goal_friends", label: "Build a Close Social Circle" },
  { id: "goal_success", label: "Become Successful" },
  { id: "goal_creative", label: "Master a Creative Skill" },
  { id: "goal_comfort", label: "Live Comfortably" },
  { id: "goal_explore", label: "Explore the Town" },
  { id: "goal_money", label: "Become Financially Secure" },
];

const BASELINE = 0.45;

/** Deterministic pick-set → personality profile. */
export function profileFromPicks(pickedIds: readonly string[]): PersonalityProfile {
  const values = new Array<number>(14).fill(BASELINE);
  for (const pickId of pickedIds) {
    const pick = TRAIT_PICKS.find((p) => p.id === pickId);
    if (!pick) continue;
    for (const [traitStr, delta] of Object.entries(pick.deltas)) {
      const idx = Number(traitStr) as PersonalityTrait;
      values[idx] = Math.max(0, Math.min(1, values[idx]! + (delta as number)));
    }
  }
  return PersonalityProfile.fromArray(values);
}

export interface AppearanceSpec {
  bodyColor: string;
  hairColor: string;
  height: number;
}

export const APPEARANCE_PRESETS: readonly AppearanceSpec[] = [
  { bodyColor: "#fbbf24", hairColor: "#4b3a2a", height: 1.75 },
  { bodyColor: "#7dd3fc", hairColor: "#1f2937", height: 1.68 },
  { bodyColor: "#34d399", hairColor: "#92400e", height: 1.82 },
  { bodyColor: "#f472b6", hairColor: "#111827", height: 1.72 },
  { bodyColor: "#a78bfa", hairColor: "#6b4423", height: 1.78 },
  { bodyColor: "#fb923c", hairColor: "#374151", height: 1.65 },
];

export interface CreatedResident {
  id: string;
  name: string;
  pronouns: string;
  traitPicks: readonly string[];
  lifeGoal: string;
  appearance: AppearanceSpec;
}

let creatorCounter = 1;
export function nextCreatorId(): string {
  return `npc_created_${creatorCounter++}`;
}
export function resetCreatorIds(): void { creatorCounter = 1; }
