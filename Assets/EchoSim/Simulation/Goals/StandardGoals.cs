using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Authoring helpers for the initial goal set. All goals are data: personality
    /// and need effects flow through terms, never special-cased agent logic.
    /// </summary>
    public static class StandardGoals
    {
        public static IReadOnlyList<GoalDefinition> CreateDefault() => new[]
        {
            new GoalDefinition(
                new GoalId("goal_eat"), "Eat", baseScore: 0.10f,
                new[]
                {
                    ScoreTerm.FromNeed("Hunger", new NeedTerm(NeedKind.Hunger, new LinearCurve(), 0.66f)),
                    ScoreTerm.FromTrait("Patience", new TraitTerm(PersonalityTrait.Patience, -0.04f, 0.04f))
                },
                reliefNeeds: new[] { NeedKind.Hunger }, criticalEligible: true),

            new GoalDefinition(
                new GoalId("goal_sleep"), "Sleep", baseScore: 0.08f,
                new[]
                {
                    ScoreTerm.FromNeed("Energy", new NeedTerm(NeedKind.Energy, new LogisticCurve(0.65f, 10f), 0.80f)),
                    ScoreTerm.FromTrait("Routine", new TraitTerm(PersonalityTrait.RoutinePreference, -0.03f, 0.05f))
                },
                reliefNeeds: new[] { NeedKind.Energy, NeedKind.Comfort }, criticalEligible: true),

            new GoalDefinition(
                new GoalId("goal_socialize"), "Socialize", baseScore: 0.06f,
                new[]
                {
                    ScoreTerm.FromNeed("Social", new NeedTerm(NeedKind.Social, new QuadraticCurve(1.6f), 0.50f)),
                    ScoreTerm.FromTrait("Sociability", new TraitTerm(PersonalityTrait.Sociability, -0.12f, 0.28f)),
                    ScoreTerm.FromCustom("Emotion", ctx => ctx.EmotionValence * 0.10f)
                },
                reliefNeeds: new[] { NeedKind.Social }),

            new GoalDefinition(
                new GoalId("goal_relax"), "Relax", baseScore: 0.05f,
                new[]
                {
                    ScoreTerm.FromNeed("Fun", new NeedTerm(NeedKind.Fun, new LinearCurve(), 0.40f)),
                    ScoreTerm.FromNeed("Comfort", new NeedTerm(NeedKind.Comfort, new LinearCurve(), 0.20f)),
                    ScoreTerm.FromTrait("Openness", new TraitTerm(PersonalityTrait.Openness, -0.02f, 0.06f))
                },
                reliefNeeds: new[] { NeedKind.Fun }),

            new GoalDefinition(
                new GoalId("goal_explore"), "Explore", baseScore: 0.04f,
                new[]
                {
                    ScoreTerm.FromNeed("Fun", new NeedTerm(NeedKind.Fun, new LinearCurve(), 0.22f)),
                    ScoreTerm.FromTrait("Curiosity", new TraitTerm(PersonalityTrait.Curiosity, -0.06f, 0.20f)),
                    ScoreTerm.FromTrait("RiskTolerance", new TraitTerm(PersonalityTrait.RiskTolerance, -0.02f, 0.06f)),
                    ScoreTerm.FromCustom("Emotion", ctx => -ctx.EmotionValence * 0.05f)
                },
                reliefNeeds: new[] { NeedKind.Fun }),

            new GoalDefinition(
                new GoalId("goal_go_home"), "GoHome", baseScore: 0.04f,
                new[]
                {
                    ScoreTerm.FromNeed("Comfort", new NeedTerm(NeedKind.Comfort, new LogisticCurve(0.55f, 9f), 0.30f)),
                    ScoreTerm.FromNeed("FatiguePull", new NeedTerm(NeedKind.Energy, new LinearCurve(), 0.15f)),
                    ScoreTerm.FromTrait("Routine", new TraitTerm(PersonalityTrait.RoutinePreference, -0.02f, 0.08f))
                },
                reliefNeeds: new[] { NeedKind.Comfort }),

            new GoalDefinition(
                new GoalId("goal_work"), "Work", baseScore: 0.02f,
                new[]
                {
                    ScoreTerm.FromCustom("SchedulePressure", ctx => ctx.SchedulePressure * 0.90f),
                    ScoreTerm.FromTrait("Ambition", new TraitTerm(PersonalityTrait.Ambition, -0.08f, 0.18f)),
                    ScoreTerm.FromTrait("Conscientiousness", new TraitTerm(PersonalityTrait.Conscientiousness, -0.04f, 0.10f)),
                    ScoreTerm.FromNeed("EnergyCost", new NeedTerm(NeedKind.Energy, new ThresholdCurve(0.85f), -0.25f))
                },
                reliefNeeds: null)
        };
    }
}
