using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Tuning knobs for selection behaviour.</summary>
    public sealed class GoalSelectionOptions
    {
        public float CriticalBonus { get; set; } = 0.5f;
        public float ReSelectionCooldownMinutes { get; set; } = 45f;
        public float ReSelectionPenalty { get; set; } = 0.12f;
    }

    /// <summary>
    /// Deterministic utility-based goal selector with explainable breakdowns,
    /// switch inertia, re-selection cooldown, and critical-need override.
    /// Ties break by goal id ordinal — identical inputs always produce identical output.
    /// </summary>
    public sealed class GoalSelector
    {
        private readonly GoalSelectionOptions _options;

        public GoalSelector(GoalSelectionOptions? options = null)
        {
            _options = options ?? new GoalSelectionOptions();
        }

        public GoalSelectionResult Select(GoalContext context, IReadOnlyList<GoalDefinition> candidates)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            if (candidates == null) throw new ArgumentNullException(nameof(candidates));

            var interrupting = context.Needs.FindInterrupting();
            var ranked = new List<GoalScoreEntry>(candidates.Count);

            for (int i = 0; i < candidates.Count; i++)
                ranked.Add(Score(context, candidates[i], interrupting));

            ranked.Sort(CompareEntries); // deterministic: score desc, then goal id ordinal

            var winner = candidates.Count > 0 ? ranked[0] : null;
            return new GoalSelectionResult(winner, ranked, keptPrevious: false);
        }

        private GoalScoreEntry Score(GoalContext ctx, GoalDefinition goal, NeedState? interrupting)
        {
            var lines = new List<ScoreLine>(goal.Terms.Count + 4);
            bool isCurrent = ctx.CurrentGoal.HasValue && ctx.CurrentGoal.Value == goal.Id;
            bool criticalOverride = false;

            lines.Add(new ScoreLine("Base", goal.BaseScore));
            float total = goal.BaseScore;

            for (int t = 0; t < goal.Terms.Count; t++)
            {
                var term = goal.Terms[t];
                float value = term.Constant;

                if (term.Need != null)
                {
                    var needState = ctx.Needs.Get(term.Need.Kind);
                    value = term.Need.Curve.Evaluate(needState.Normalized) * term.Need.Weight;
                }
                else if (term.Trait != null)
                {
                    value = term.Trait.Min + (term.Trait.Max - term.Trait.Min) * ctx.Personality.Get(term.Trait.Trait);
                }
                else if (term.Custom != null)
                {
                    value = term.Custom.Evaluator(ctx);
                    if (!float.IsFinite(value))
                        throw new InvalidOperationException($"Custom term '{term.Label}' on '{goal.Id}' produced a non-finite value.");
                }

                total += value;
                lines.Add(new ScoreLine(term.Label, value));
            }

            // Critical interruption bypasses inertia and cooldown entirely.
            if (interrupting != null && goal.CriticalEligible && Contains(goal.ReliefNeeds, interrupting.Definition.Kind))
            {
                total += _options.CriticalBonus;
                lines.Add(new ScoreLine("CriticalOverride", _options.CriticalBonus));
                criticalOverride = true;
            }
            else
            {
                if (!isCurrent && ctx.CurrentGoal.HasValue && goal.SwitchPenalty > 0f)
                {
                    total -= goal.SwitchPenalty;
                    lines.Add(new ScoreLine("SwitchCost", -goal.SwitchPenalty));
                }

                if (!isCurrent &&
                    ctx.LastSelectedAt.TryGetValue(goal.Id, out var last) &&
                    (ctx.Time - last).TotalMinutes < _options.ReSelectionCooldownMinutes)
                {
                    total -= _options.ReSelectionPenalty;
                    lines.Add(new ScoreLine("RecentCooldown", -_options.ReSelectionPenalty));
                }
            }

            if (!float.IsFinite(total))
                throw new InvalidOperationException($"Goal '{goal.Id}' scored non-finite.");

            return new GoalScoreEntry(goal.Id, goal.DisplayName, total, lines, criticalOverride);
        }

        private static bool Contains(IReadOnlyList<NeedKind> list, NeedKind kind)
        {
            for (int i = 0; i < list.Count; i++)
                if (list[i] == kind) return true;
            return false;
        }

        private static int CompareEntries(GoalScoreEntry a, GoalScoreEntry b)
        {
            int byScore = b.Final.CompareTo(a.Final);
            return byScore != 0 ? byScore : string.CompareOrdinal(a.Goal.Value, b.Goal.Value);
        }
    }
}
