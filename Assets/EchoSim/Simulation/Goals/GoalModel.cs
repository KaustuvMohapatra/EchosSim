using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Additive personality contribution: Min + (Max-Min)*traitValue.</summary>
    public sealed class TraitTerm
    {
        public PersonalityTrait Trait { get; }
        public float Min { get; }
        public float Max { get; }

        public TraitTerm(PersonalityTrait trait, float min, float max)
        {
            Trait = trait;
            Min = min;
            Max = max;
            if (min > max) throw new ArgumentException("Min must be <= Max.");
        }
    }

    /// <summary>Need-driven term: curve(need/100) * weight.</summary>
    public sealed class NeedTerm
    {
        public NeedKind Kind { get; }
        public UtilityCurve Curve { get; }
        public float Weight { get; }

        public NeedTerm(NeedKind kind, UtilityCurve curve, float weight)
        {
            Kind = kind;
            Curve = curve ?? throw new ArgumentNullException(nameof(curve));
            Weight = weight;
        }
    }

    /// <summary>Free-form contextual term (schedule pressure, weather, etc.).</summary>
    public sealed class CustomTerm
    {
        public Func<GoalContext, float> Evaluator { get; }

        public CustomTerm(Func<GoalContext, float> evaluator)
        {
            Evaluator = evaluator ?? throw new ArgumentNullException(nameof(evaluator));
        }
    }

    /// <summary>One additive scoring component of a goal.</summary>
    public sealed class ScoreTerm
    {
        public string Label { get; }
        public float Constant { get; }
        public NeedTerm? Need { get; }
        public TraitTerm? Trait { get; }
        public CustomTerm? Custom { get; }

        private ScoreTerm(string label, float constant, NeedTerm? need, TraitTerm? trait, CustomTerm? custom)
        {
            Label = label;
            Constant = constant;
            Need = need;
            Trait = trait;
            Custom = custom;
        }

        public static ScoreTerm Fixed(string label, float value) => new ScoreTerm(label, value, null, null, null);
        public static ScoreTerm FromNeed(string label, NeedTerm need) => new ScoreTerm(label, 0f, need, null, null);
        public static ScoreTerm FromTrait(string label, TraitTerm trait) => new ScoreTerm(label, 0f, null, trait, null);
        public static ScoreTerm FromCustom(string label, CustomTerm custom) => new ScoreTerm(label, 0f, null, null, custom);
        public static ScoreTerm FromCustom(string label, Func<GoalContext, float> evaluator) => new ScoreTerm(label, 0f, null, null, new CustomTerm(evaluator));
    }

    /// <summary>A selectable goal with explainable scoring configuration.</summary>
    public sealed class GoalDefinition
    {
        public GoalId Id { get; }
        public string DisplayName { get; }
        public float BaseScore { get; }
        public IReadOnlyList<ScoreTerm> Terms { get; }
        /// <summary>Inertia: applied when selecting this goal while another is active.</summary>
        public float SwitchPenalty { get; }
        /// <summary>Needs this goal satisfies when executed.</summary>
        public IReadOnlyList<NeedKind> ReliefNeeds { get; }
        /// <summary>Whether an interrupting need may force-select this goal.</summary>
        public bool CriticalEligible { get; }
        /// <summary>Planner binding: facts that must hold for this goal to be satisfied (Sprint 3).</summary>
        public IReadOnlyList<FactCondition>? DesiredFacts { get; }

        public GoalDefinition(GoalId id, string displayName, float baseScore,
            IEnumerable<ScoreTerm> terms, IEnumerable<NeedKind>? reliefNeeds = null,
            float switchPenalty = 0.08f, bool criticalEligible = false,
            IEnumerable<FactCondition>? desiredFacts = null)
        {
            Id = id;
            DisplayName = displayName ?? throw new ArgumentNullException(nameof(displayName));
            if (!float.IsFinite(baseScore)) throw new ArgumentOutOfRangeException(nameof(baseScore));
            BaseScore = baseScore;
            Terms = terms?.ToList() ?? throw new ArgumentNullException(nameof(terms));
            ReliefNeeds = reliefNeeds?.ToList() ?? new List<NeedKind>();
            SwitchPenalty = switchPenalty >= 0f ? switchPenalty : throw new ArgumentOutOfRangeException(nameof(switchPenalty));
            CriticalEligible = criticalEligible;
            DesiredFacts = desiredFacts?.ToList();
        }
    }

    /// <summary>Snapshot of everything goal scoring may look at.</summary>
    public sealed class GoalContext
    {
        public SimTime Time { get; }
        public NeedSet Needs { get; }
        public PersonalityProfile Personality { get; }
        public GoalId? CurrentGoal { get; }
        /// <summary>0..1 pressure from schedule/job systems (Sprint 5 feeds this).</summary>
        public float SchedulePressure { get; }
        /// <summary>-1..1 mood valence (Sprint 8 feeds this).</summary>
        public float EmotionValence { get; }
        /// <summary>When each goal was last selected (cooldown hysteresis).</summary>
        public IReadOnlyDictionary<GoalId, SimTime> LastSelectedAt { get; }

        public GoalContext(SimTime time, NeedSet needs, PersonalityProfile personality,
            GoalId? currentGoal = null, float schedulePressure = 0f, float emotionValence = 0f,
            IReadOnlyDictionary<GoalId, SimTime>? lastSelectedAt = null)
        {
            Time = time;
            Needs = needs ?? throw new ArgumentNullException(nameof(needs));
            Personality = personality ?? throw new ArgumentNullException(nameof(personality));
            CurrentGoal = currentGoal;
            SchedulePressure = Math.Clamp(schedulePressure, 0f, 1f);
            EmotionValence = Math.Clamp(emotionValence, -1f, 1f);
            LastSelectedAt = lastSelectedAt ?? new Dictionary<GoalId, SimTime>();
        }
    }

    /// <summary>One explained scoring line.</summary>
    public readonly struct ScoreLine
    {
        public string Label { get; }
        public float Value { get; }

        public ScoreLine(string label, float value) { Label = label; Value = value; }

        public override string ToString() =>
            Label + " " + (Value >= 0f ? "+" : "") + Value.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
    }

    /// <summary>Final score plus full breakdown for one candidate goal.</summary>
    public sealed class GoalScoreEntry
    {
        public GoalId Goal { get; }
        public string DisplayName { get; }
        public float Final { get; }
        public IReadOnlyList<ScoreLine> Breakdown { get; }
        public bool CriticalOverride { get; }

        internal GoalScoreEntry(GoalId goal, string displayName, float final,
            List<ScoreLine> breakdown, bool criticalOverride)
        {
            Goal = goal;
            DisplayName = displayName;
            Final = final;
            Breakdown = breakdown;
            CriticalOverride = criticalOverride;
        }
    }

    /// <summary>Ranked outcome of goal selection.</summary>
    public sealed class GoalSelectionResult
    {
        public GoalScoreEntry? Winner { get; }
        public IReadOnlyList<GoalScoreEntry> Ranked { get; }
        /// <summary>True when an existing commitment beat the raw winner (hysteresis).</summary>
        public bool KeptPreviousGoal { get; }

        internal GoalSelectionResult(GoalScoreEntry? winner, List<GoalScoreEntry> ranked, bool keptPrevious)
        {
            Winner = winner;
            Ranked = ranked;
            KeptPreviousGoal = keptPrevious;
        }
    }
}
