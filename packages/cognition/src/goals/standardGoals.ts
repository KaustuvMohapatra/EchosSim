/** Authoring helpers for the initial goal set. All goals are pure data. */
import { NeedKind } from "../needs/needs.js";
import { PersonalityTrait } from "../personality/personality.js";
import { LinearCurve, LogisticCurve, QuadraticCurve, ThresholdCurve } from "../utility/curves.js";
import {
  customTerm, defineGoal, needTerm, traitTerm, type GoalDefinition,
} from "./goalModel.js";
import { trueFact } from "../goap/plannerState.js";

export function createDefaultGoals(): GoalDefinition[] {
  return [
    defineGoal(
      "goal_eat", "Eat", 0.10,
      [
        needTerm("Hunger", { kind: NeedKind.Hunger, curve: new LinearCurve(), weight: 0.66 }),
        traitTerm("Patience", { trait: PersonalityTrait.Patience, min: -0.04, max: 0.04 }),
      ],
      { reliefNeeds: [NeedKind.Hunger], criticalEligible: true, desiredFacts: [trueFact("just_ate")] },
    ),
    defineGoal(
      "goal_sleep", "Sleep", 0.08,
      [
        needTerm("Energy", { kind: NeedKind.Energy, curve: new LogisticCurve(0.65, 10), weight: 0.80 }),
        traitTerm("Routine", { trait: PersonalityTrait.RoutinePreference, min: -0.03, max: 0.05 }),
      ],
      {
        reliefNeeds: [NeedKind.Energy, NeedKind.Comfort], criticalEligible: true,
        desiredFacts: [trueFact("rested")],
      },
    ),
    defineGoal(
      "goal_socialize", "Socialize", 0.06,
      [
        needTerm("Social", { kind: NeedKind.Social, curve: new QuadraticCurve(1.6), weight: 0.50 }),
        traitTerm("Sociability", { trait: PersonalityTrait.Sociability, min: -0.12, max: 0.28 }),
        customTerm("Emotion", (ctx) => ctx.emotionValence * 0.10),
        // Long-term intentions nudge, never dictate (Sprint 24).
        customTerm("Intentions", (ctx) => ctx.intentionBias ?? 0),
        // Crowded rooms push sociable residents in, others out (Sprint 51).
        customTerm("Crowding", (ctx) =>
          -(ctx.crowding ?? 0) * 0.12 * (1.2 - ctx.personality.get(2 as never)))
      ],
      { reliefNeeds: [NeedKind.Social], desiredFacts: [trueFact("socialized")] },
    ),
    defineGoal(
      "goal_relax", "Relax", 0.05,
      [
        needTerm("Fun", { kind: NeedKind.Fun, curve: new LinearCurve(), weight: 0.40 }),
        needTerm("Comfort", { kind: NeedKind.Comfort, curve: new LinearCurve(), weight: 0.20 }),
        traitTerm("Openness", { trait: PersonalityTrait.Openness, min: -0.02, max: 0.06 }),
        customTerm("Habit", (ctx) =>
          (ctx.currentLocationKey !== undefined ? ctx.habitBonus ?? 0 : 0)),
      ],
      { reliefNeeds: [NeedKind.Fun], desiredFacts: [trueFact("relaxed")] },
    ),
    defineGoal(
      "goal_explore", "Explore", 0.04,
      [
        needTerm("Fun", { kind: NeedKind.Fun, curve: new LinearCurve(), weight: 0.22 }),
        traitTerm("Curiosity", { trait: PersonalityTrait.Curiosity, min: -0.06, max: 0.20 }),
        traitTerm("RiskTolerance", { trait: PersonalityTrait.RiskTolerance, min: -0.02, max: 0.06 }),
        customTerm("Emotion", (ctx) => -ctx.emotionValence * 0.05),
        // Rain suppresses wandering — but rain-lovers barely care (Sprint 16).
        customTerm("Weather", (ctx) =>
          ctx.weather === 2 /* Rain */ ? -0.14 * (1 - ctx.preferences.get("rain")) :
          ctx.weather === 3 /* HeavyRain */ ? -0.22 * (1 - ctx.preferences.get("rain")) :
          ctx.weather === 1 /* Cloudy */ ? -0.03 : 0),
        // Familiar spots carry a modest habit pull (Sprint 24), hard-capped.
        customTerm("Habit", (ctx) =>
          ctx.currentLocationKey !== undefined
            ? Math.min(0.15, ctx.habitBonus ?? 0)
            : 0),
      ],
      { reliefNeeds: [NeedKind.Fun], desiredFacts: [trueFact("explored")] },
    ),
    defineGoal(
      "goal_go_home", "GoHome", 0.04,
      [
        needTerm("Comfort", { kind: NeedKind.Comfort, curve: new LogisticCurve(0.55, 9), weight: 0.30 }),
        needTerm("FatiguePull", { kind: NeedKind.Energy, curve: new LinearCurve(), weight: 0.15 }),
        traitTerm("Routine", { trait: PersonalityTrait.RoutinePreference, min: -0.02, max: 0.08 }),
      ],
      { reliefNeeds: [NeedKind.Comfort], desiredFacts: [trueFact("at_home")] },
    ),
    defineGoal(
      "goal_work", "Work", 0.02,
      [
        customTerm("SchedulePressure", (ctx) => ctx.schedulePressure * 1.20 - 0.15),
        traitTerm("Ambition", { trait: PersonalityTrait.Ambition, min: -0.08, max: 0.18 }),
        traitTerm("Conscientiousness", { trait: PersonalityTrait.Conscientiousness, min: -0.04, max: 0.10 }),
        needTerm("EnergyCost", { kind: NeedKind.Energy, curve: new ThresholdCurve(0.85), weight: -0.25 }),
      ],
      { desiredFacts: [trueFact("worked")] },
    ),
  ];
}
