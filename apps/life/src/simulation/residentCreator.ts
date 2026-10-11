/**
 * Presentation-friendly resident creation presets.
 *
 * These are personality weights, not scripted NPC archetypes. Once spawned,
 * every resident uses the same cognition, perception, memory and GOAP pipeline.
 */
import { PersonalityProfile, PersonalityTrait as Trait } from "@echosim/cognition";

export const RESIDENT_PRESETS = [
  { id: "balanced", name: "Balanced", description: "Adaptable, with no strong starting bias." },
  { id: "social", name: "Social Butterfly", description: "Naturally seeks out conversations and company." },
  { id: "explorer", name: "Curious Explorer", description: "Open-minded and drawn toward discoveries." },
  { id: "ambitious", name: "Ambitious Achiever", description: "Prefers progress, routine and hard work." },
  { id: "creative", name: "Creative Dreamer", description: "Curious, open and comfortable trying new things." },
] as const;

export type ResidentPreset = (typeof RESIDENT_PRESETS)[number]["id"];

export function personalityForPreset(preset: ResidentPreset): PersonalityProfile {
  const p = PersonalityProfile.balanced().edit();
  switch (preset) {
    case "social":
      p.set(Trait.Sociability, 0.91)
        .set(Trait.Extraversion, 0.84)
        .set(Trait.Agreeableness, 0.76)
        .set(Trait.RoutinePreference, 0.29);
      break;
    case "explorer":
      p.set(Trait.Curiosity, 0.95)
        .set(Trait.Openness, 0.91)
        .set(Trait.RiskTolerance, 0.76)
        .set(Trait.RoutinePreference, 0.17);
      break;
    case "ambitious":
      p.set(Trait.Ambition, 0.94)
        .set(Trait.Conscientiousness, 0.87)
        .set(Trait.Patience, 0.73)
        .set(Trait.RoutinePreference, 0.70);
      break;
    case "creative":
      p.set(Trait.Openness, 0.96)
        .set(Trait.Curiosity, 0.82)
        .set(Trait.EmotionalVolatility, 0.61)
        .set(Trait.RoutinePreference, 0.22);
      break;
    default:
      break;
  }
  return p.build();
}

/** Stable collision-free IDs within one save, including after a load. */
export function nextResidentId(existing: readonly string[]): string {
  const used = new Set(existing);
  for (let i = 1; i <= 100_000; i++) {
    const id = "created_" + i.toString().padStart(4, "0");
    if (!used.has(id)) return id;
  }
  throw new Error("Resident ID capacity reached.");
}

export function validateResidentName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2) return "Enter a name of at least 2 characters.";
  if (name.length > 32) return "Resident names must be 32 characters or fewer.";
  return null;
}
