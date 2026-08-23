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

        /// <summary>Assigned job (Sprint 5); null for unemployed residents.</summary>
        public JobDefinition? Job { get; internal set; }

        /// <summary>Personal weekly rhythm (Sprint 5); null when fully utility-driven.</summary>
        public WeeklySchedule? Schedule { get; internal set; }

        /// <summary>Seeded routine jitter in minutes (spec §5.6).</summary>
        public int RoutineOffsetMinutes { get; private set; }

        /// <summary>Authored likes/dislikes (Sprint 14); 0 when unspecified.</summary>
        public PreferenceProfile Preferences { get; private set; } = new PreferenceProfile();

        /// <summary>Wallet (Sprint 15). Mutate via systems, not directly.</summary>
        public float Money { get; set; }

        public Inventory Inventory { get; } = new Inventory();

        public void SetSchedule(WeeklySchedule? schedule) => Schedule = schedule;
        public void SetRoutineOffset(int offsetMinutes) => RoutineOffsetMinutes = offsetMinutes;
        public void SetPreferences(PreferenceProfile preferences) =>
            Preferences = preferences ?? throw new ArgumentNullException(nameof(preferences));

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

        public float EmotionValence { get; private set; }

        /// <summary>Sets mood valence (-1..1); clamped (Sprint 8 writes via EmotionSystem).</summary>
        public void SetEmotion(float valence) => EmotionValence = Math.Clamp(valence, -1f, 1f);

        /// <summary>
        /// Persistent planner facts for this resident (has_meal, has_ingredients, ...).
        /// Written back by plan execution so future replans observe past results.
        /// Ephemeral completion flags are reset per replan by the state builder.
        /// </summary>
        public IDictionary<string, int> PlannerMemory { get; } = new Dictionary<string, int>(StringComparer.Ordinal);
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
