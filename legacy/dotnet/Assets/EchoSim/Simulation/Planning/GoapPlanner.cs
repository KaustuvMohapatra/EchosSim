using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    public enum PlanFailureReason
    {
        None = 0,
        NoViablePlan = 1,
        MaxExpansionsReached = 2,
        MaxDepthReached = 3
    }

    /// <summary>Search diagnostics (spec §3.9). No wall-clock timing: determinism first.</summary>
    public sealed class PlannerMetrics
    {
        public int NodesExpanded { get; internal set; }
        public int DeepestDepth { get; internal set; }
        public int PlanLength { get; internal set; }
        public PlanFailureReason FailureReason { get; internal set; }
        public bool Success { get; internal set; }
    }

    /// <summary>An ordered sequence of actions achieving a goal condition set.</summary>
    public sealed class GoapPlan
    {
        public IReadOnlyList<PlanningAction> Steps { get; }
        public float TotalCost { get; }

        internal GoapPlan(List<PlanningAction> steps, float totalCost)
        {
            Steps = steps;
            TotalCost = totalCost;
        }

        public override string ToString() =>
            "plan[" + string.Join(" > ", Steps) + "]";
    }

    public sealed class PlanResult
    {
        public bool Success { get; }
        public GoapPlan? Plan { get; }
        public PlannerMetrics Metrics { get; }

        internal PlanResult(bool success, GoapPlan? plan, PlannerMetrics metrics)
        {
            Success = success;
            Plan = plan;
            Metrics = metrics;
        }

        public static PlanResult Failed(PlanFailureReason reason, PlannerMetrics metrics)
        {
            metrics.Success = false;
            metrics.FailureReason = reason;
            return new PlanResult(false, null, metrics);
        }
    }

    /// <summary>
    /// Uniform-cost best-first GOAP planner (A* with zero heuristic = Dijkstra):
    /// admissible, deterministic, with closed-set cycle avoidance, expansion and
    /// depth caps, and structured failure diagnostics.
    /// </summary>
    public sealed class GoapPlanner
    {
        private sealed class SearchNode
        {
            public PlannerWorldState State = null!;
            public float G;
            public long Sequence;
            public int Depth;
            public SearchNode? Parent;
            public PlanningAction? Via;
        }

        public int MaxExpansions { get; set; } = 4000;
        public int MaxDepth { get; set; } = 12;

        public PlanResult Plan(PlannerWorldState start,
            IReadOnlyList<FactCondition> goalConditions,
            IReadOnlyList<PlanningAction> actions,
            ActionCostContext? costContext = null)
        {
            if (start == null) throw new ArgumentNullException(nameof(start));
            if (goalConditions == null) throw new ArgumentNullException(nameof(goalConditions));
            if (actions == null) throw new ArgumentNullException(nameof(actions));

            var metrics = new PlannerMetrics();
            var context = costContext ?? ActionCostContext.Anonymous;

            if (start.SatisfiesAll(goalConditions))
            {
                metrics.Success = true;
                metrics.PlanLength = 0;
                return new PlanResult(true, new GoapPlan(new List<PlanningAction>(), 0f), metrics);
            }

            // Dynamic costs are state-independent; evaluate once per action up front
            // (cheaper and identical in outcome to per-node evaluation).
            var stepCosts = new float[actions.Count];
            for (int i = 0; i < actions.Count; i++)
                stepCosts[i] = actions[i].CostFor(context);

            var open = new List<SearchNode>();
            var closed = new HashSet<string>(StringComparer.Ordinal);
            long sequence = 0;

            open.Add(new SearchNode { State = start, G = 0f, Sequence = sequence++, Depth = 0 });

            while (open.Count > 0)
            {
                if (metrics.NodesExpanded >= MaxExpansions)
                    return PlanResult.Failed(PlanFailureReason.MaxExpansionsReached, metrics);

                // Deterministic extract-min: lowest g, then earliest insertion.
                int bestIndex = 0;
                for (int i = 1; i < open.Count; i++)
                {
                    var candidate = open[i];
                    var best = open[bestIndex];
                    if (candidate.G < best.G || (candidate.G == best.G && candidate.Sequence < best.Sequence))
                        bestIndex = i;
                }
                var node = open[bestIndex];
                open.RemoveAt(bestIndex);

                string hash = node.State.ComputeHash();
                if (!closed.Add(hash)) continue;

                metrics.NodesExpanded++;
                if (node.Depth > metrics.DeepestDepth) metrics.DeepestDepth = node.Depth;

                // Goal is tested on POP so the cheapest complete path always wins.
                if (node.Via != null && node.State.SatisfiesAll(goalConditions))
                {
                    var steps = Reconstruct(node);
                    metrics.Success = true;
                    metrics.PlanLength = steps.Count;
                    return new PlanResult(true, new GoapPlan(steps, node.G), metrics);
                }

                if (node.Depth >= MaxDepth)
                {
                    continue; // do not expand past the depth cap
                }

                for (int a = 0; a < actions.Count; a++)
                {
                    var action = actions[a];
                    if (!action.IsApplicableIn(node.State)) continue;

                    var next = node.State.Clone();
                    action.ApplyEffectsTo(next);
                    string nextHash = next.ComputeHash();
                    if (closed.Contains(nextHash)) continue;

                    var child = new SearchNode
                    {
                        State = next,
                        G = node.G + stepCosts[a],
                        Sequence = sequence++,
                        Depth = node.Depth + 1,
                        Parent = node,
                        Via = action
                    };

                    open.Add(child);
                }
            }

            return PlanResult.Failed(PlanFailureReason.NoViablePlan, metrics);
        }

        private static List<PlanningAction> Reconstruct(SearchNode goalNode)
        {
            var reversed = new List<PlanningAction>();
            var cursor = goalNode;
            while (cursor.Via != null)
            {
                reversed.Add(cursor.Via);
                cursor = cursor.Parent!;
            }
            reversed.Reverse();
            return reversed;
        }
    }
}
