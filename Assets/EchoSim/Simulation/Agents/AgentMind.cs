using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Per-resident cognition state: personality, needs, current goal commitment.
    /// Owned by the resident registry; never serialized as-is (Sprint 18 adds DTOs).
    /// </summary>
    public sealed class AgentMind
    {
        private readonly Dictionary<GoalId, SimTime> _lastSelectedAt = new Dictionary<GoalId, SimTime>();

        public AgentId Agent { get; }
        public PersonalityProfile Personality { get; }
        public NeedSet Needs { get; }

        /// <summary>Goal currently committed (may differ from raw winner due to hysteresis).</summary>
        public GoalDefinition? CommittedGoal { get; internal set; }

        public bool HasCommitment => CommittedGoal != null;

        public GoalId? CurrentGoalId => CommittedGoal?.Id;

        internal AgentMind(AgentId agent, PersonalityProfile personality, NeedSet needs)
        {
            Agent = agent;
            Personality = personality ?? throw new ArgumentNullException(nameof(personality));
            Needs = needs ?? throw new ArgumentNullException(nameof(needs));
        }

        public IReadOnlyDictionary<GoalId, SimTime> LastSelectedAt => _lastSelectedAt;

        internal void NoteSelection(GoalId goal, SimTime at) => _lastSelectedAt[goal] = at;

        internal void ReleaseCommitment() => CommittedGoal = null;

        /// <summary>
        /// Commitment hysteresis: a committed satisfier goal is kept while any of its
        /// relief needs remain above the satisfaction threshold (prevents flapping).
        /// </summary>
        public bool CommitmentHolds()
        {
            if (CommittedGoal == null) return false;
            var reliefs = CommittedGoal.ReliefNeeds;
            for (int i = 0; i < reliefs.Count; i++)
            {
                if (!Needs.Get(reliefs[i]).IsSatisfied) return true;
            }
            // All relief needs satisfied: release and remember for cooldown purposes.
            CommittedGoal = null;
            return false;
        }

        public float EmotionValence { get; internal set; }
    }

    /// <summary>Authored description used to spawn a full resident.</summary>
    public sealed class ResidentSpec
    {
        public string Id { get; }
        public string DisplayName { get; }
        public string? HomeLocationId { get; set; }
        public string? StartLocationId { get; set; }
        public PersonalityProfile Personality { get; set; } = PersonalityProfile.Balanced();
        public IDictionary<NeedKind, float>? InitialNeeds { get; set; }
        public bool UseStandardNeeds { get; set; } = true;

        public ResidentSpec(string id, string displayName)
        {
            Id = id ?? throw new ArgumentNullException(nameof(id));
            DisplayName = displayName ?? throw new ArgumentNullException(nameof(displayName));
        }
    }

    /// <summary>Ordered registry of resident minds.</summary>
    public sealed class ResidentRegistry
    {
        private readonly Dictionary<AgentId, AgentMind> _minds = new Dictionary<AgentId, AgentMind>();
        private readonly List<AgentId> _order = new List<AgentId>();

        public IReadOnlyList<AgentId> OrderedIds => _order;
        public int Count => _order.Count;

        public void Add(AgentMind mind)
        {
            _minds.Add(mind.Agent, mind);
            _order.Add(mind.Agent);
        }

        public bool TryGet(AgentId id, out AgentMind mind) => _minds.TryGetValue(id, out mind!);

        public AgentMind Get(AgentId id)
        {
            if (!_minds.TryGetValue(id, out var mind))
                throw new KeyNotFoundException($"Unknown resident '{id}'.");
            return mind!;
        }

        public IEnumerable<AgentMind> AllInOrder()
        {
            for (int i = 0; i < _order.Count; i++) yield return _minds[_order[i]];
        }
    }
}
