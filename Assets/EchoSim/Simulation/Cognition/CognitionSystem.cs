using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Outcome of one cognition decision for a resident.</summary>
    public sealed class GoalDecision
    {
        /// <summary>The raw ranked scoring (full breakdowns available).</summary>
        public GoalSelectionResult Raw { get; }
        /// <summary>The goal actually committed after hysteresis.</summary>
        public GoalScoreEntry Effective { get; }
        /// <summary>True when commitment kept the previous goal against the raw winner.</summary>
        public bool KeptPrevious { get; }

        internal GoalDecision(GoalSelectionResult raw, GoalScoreEntry effective, bool keptPrevious)
        {
            Raw = raw;
            Effective = effective;
            KeptPrevious = keptPrevious;
        }
    }

    /// <summary>
    /// Drives resident cognition: advances needs over simulated time, builds goal
    /// contexts, selects goals with hysteresis. Planning arrives in Sprint 3; this
    /// system is the seam the planner will plug into.
    /// </summary>
    public sealed class CognitionSystem
    {
        private readonly SimulationWorld _world;
        private readonly IReadOnlyList<GoalDefinition> _goals;
        private readonly GoalSelector _selector;
        private Func<AgentId, SimTime, float>? _schedulePressureProvider;

        public CognitionSystem(SimulationWorld world,
            IReadOnlyList<GoalDefinition>? goals = null,
            GoalSelector? selector = null)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _goals = goals ?? StandardGoals.CreateDefault();
            _selector = selector ?? new GoalSelector();
        }

        /// <summary>Sprint 5 supplies job/schedule pressure through this hook.</summary>
        public void SetSchedulePressureProvider(Func<AgentId, SimTime, float> provider)
        {
            _schedulePressureProvider = provider ?? throw new ArgumentNullException(nameof(provider));
        }

        /// <summary>Natural need growth for every resident over a simulated span.</summary>
        public void AdvanceNeeds(SimDuration delta)
        {
            foreach (var mind in _world.Residents.AllInOrder())
                mind.Needs.Advance(delta);
        }

        /// <summary>Pure evaluation without committing anything.</summary>
        public GoalSelectionResult Evaluate(AgentId agent)
        {
            var mind = _world.Residents.Get(agent);
            return _selector.Select(BuildContext(mind), _goals);
        }

        /// <summary>Evaluates and commits with hysteresis semantics.</summary>
        public GoalDecision Decide(AgentId agent)
        {
            var mind = _world.Residents.Get(agent);
            var now = _world.Clock.CurrentTime;
            var result = _selector.Select(BuildContext(mind), _goals);

            if (result.Winner == null)
                throw new InvalidOperationException($"No goals available for '{agent}'.");

            var winner = result.Winner;

            // Hysteresis: keep the current commitment unless a critical override wins.
            if (!winner.CriticalOverride && mind.HasCommitment && mind.CommitmentHolds())
            {
                var committedEntry = FindEntry(result, mind.CommittedGoal!.Id);
                if (committedEntry != null)
                    return new GoalDecision(result, committedEntry, keptPrevious: true);
            }

            // Critical overrides release any prior commitment immediately.
            mind.ReleaseCommitment();
            mind.CommittedGoal = FindDefinition(winner.Goal);
            mind.NoteSelection(winner.Goal, now);
            return new GoalDecision(result, winner, keptPrevious: false);
        }

        private GoalContext BuildContext(AgentMind mind)
        {
            float pressure = _schedulePressureProvider?.Invoke(mind.Agent, _world.Clock.CurrentTime) ?? 0f;
            return new GoalContext(
                time: _world.Clock.CurrentTime,
                needs: mind.Needs,
                personality: mind.Personality,
                currentGoal: mind.CurrentGoalId,
                schedulePressure: pressure,
                emotionValence: mind.EmotionValence,
                lastSelectedAt: mind.LastSelectedAt);
        }

        private GoalScoreEntry? FindEntry(GoalSelectionResult result, GoalId id)
        {
            for (int i = 0; i < result.Ranked.Count; i++)
                if (result.Ranked[i].Goal == id) return result.Ranked[i];
            return null;
        }

        private GoalDefinition? FindDefinition(GoalId id)
        {
            for (int i = 0; i < _goals.Count; i++)
                if (_goals[i].Id == id) return _goals[i];
            return null;
        }
    }
}
