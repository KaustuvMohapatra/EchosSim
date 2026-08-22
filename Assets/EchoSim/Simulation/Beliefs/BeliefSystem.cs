using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Belief: personal knowledge with provenance (spec §11.2). Never global truth.</summary>
    public sealed class Belief
    {
        public MemoryId Id { get; }
        public AgentId Owner { get; }
        public string SubjectKey { get; }   // agent id or event key
        public string Predicate { get; }    // e.g. "is_rude", "attended_festival"
        /// <summary>-1..1 stance strength; magnitude = certainty, sign = polarity.</summary>
        public float Stance { get; internal set; }
        public float Confidence { get; internal set; }
        /// <summary>Hops from the original witness: 0 = saw it themselves.</summary>
        public int HopCount { get; internal set; }
        /// <summary>Who told us (null for direct experience).</summary>
        public AgentId? SourceAgent { get; internal set; }
        public EventId? SourceEvent { get; internal set; }
        public SimTime LearnedAt { get; internal set; }

        internal Belief(MemoryId id, AgentId owner, string subjectKey, string predicate,
            float stance, float confidence, int hopCount, AgentId? sourceAgent, EventId? sourceEvent, SimTime learnedAt)
        {
            Id = id; Owner = owner; SubjectKey = subjectKey; Predicate = predicate;
            Stance = Math.Clamp(stance, -1f, 1f);
            Confidence = Math.Clamp(confidence, 0f, 1f);
            HopCount = hopCount; SourceAgent = sourceAgent; SourceEvent = sourceEvent;
            LearnedAt = learnedAt;
        }

        public string Key => SubjectKey + "|" + Predicate;

        public override string ToString() =>
            $"{Owner} believes {SubjectKey} {Predicate} ({Stance.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}, " +
            $"conf={Confidence.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}, hops={HopCount})";
    }

    /// <summary>
    /// Per-resident belief store. Direct experience outranks rumours; repeated
    /// evidence reinforces; contradictions average with recency bias.
    /// </summary>
    public sealed class BeliefStore
    {
        private readonly Dictionary<string, Belief> _beliefs = new Dictionary<string, Belief>(StringComparer.Ordinal);
        private long _nextId = 1;

        public int Count => _beliefs.Count;
        public IReadOnlyCollection<Belief> All => _beliefs.Values;

        internal Belief AddOrUpdate(Belief belief)
        {
            if (_beliefs.TryGetValue(belief.Key, out var existing))
            {
                // Combine stances weighted by confidence; confidence takes the max
                // (hearing a rumour twice doesn't make it twice as true).
                float wNew = belief.Confidence, wOld = existing.Confidence * 0.7f + 0.15f;
                float combined = (existing.Stance * wOld + belief.Stance * wNew) / Math.Max(0.001f, wOld + wNew);
                existing.Stance = Math.Clamp(combined, -1f, 1f);
                existing.Confidence = Math.Max(existing.Confidence, belief.Confidence);
                // Provenance keeps the most recent telling.
                existing.SourceAgent = belief.SourceAgent ?? existing.SourceAgent;
                existing.SourceEvent = belief.SourceEvent ?? existing.SourceEvent;
                existing.HopCount = Math.Min(existing.HopCount, belief.HopCount);
                existing.LearnedAt = belief.LearnedAt;
                return existing;
            }
            _beliefs.Add(belief.Key, belief);
            return belief;
        }

        internal long NextId() => _nextId++;

        public bool TryGet(string subjectKey, string predicate, out Belief? belief)
            => _beliefs.TryGetValue(subjectKey + "|" + predicate, out belief);
    }

    /// <summary>
    /// Knowledge formation and gossip transmission (spec §11).
    /// Invariants: knowledge never teleports (only conversation transfers),
    /// loops are cut via per-event dedup, and every hop decays confidence.
    /// </summary>
    public sealed class BeliefSystem
    {
        private readonly SimulationWorld _world;
        private readonly Dictionary<AgentId, BeliefStore> _stores = new Dictionary<AgentId, BeliefStore>();
        private readonly RelationshipSystem _relationships;
        private readonly HashSet<string> _seenEvents = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Confidence multiplier per rumour hop.</summary>
        public float HopDecay { get; set; } = 0.65f;

        public BeliefSystem(SimulationWorld world, RelationshipSystem relationships)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _relationships = relationships ?? throw new ArgumentNullException(nameof(relationships));
        }

        public BeliefStore StoreFor(AgentId agent)
        {
            if (_stores.TryGetValue(agent, out var s)) return s!;
            var created = new BeliefStore();
            _stores.Add(agent, created);
            return created!;
        }

        /// <summary>First-hand knowledge: full-strength formation from lived observation.</summary>
        public void LearnDirect(AgentId owner, string subjectKey, string predicate,
            float stance, float confidence, EventId sourceEvent)
        {
            var store = StoreFor(owner);
            store.AddOrUpdate(new Belief(new MemoryId(store.NextId()), owner,
                subjectKey, predicate, stance, Math.Clamp(confidence, 0f, 1f), 0, null, sourceEvent,
                _world.Clock.CurrentTime));
            _seenEvents.Add(owner.Value + ":" + sourceEvent.Value);
        }

        /// <summary>
        /// Gossip transfer: speaker tells listener a belief about someone else.
        /// Listener confidence depends on trust in the speaker, the speaker's
        /// reliability, and hop decay. Returns false when nothing was learned
        /// (already known from this chain, or speaker lacks the belief).
        /// </summary>
        public bool TryTransfer(AgentId speaker, AgentId listener, string subjectKey, string predicate, EventId originEvent)
        {
            if (speaker == listener) return false;
            var speakerStore = StoreFor(speaker);
            if (!speakerStore.TryGet(subjectKey, predicate, out var belief) || belief == null) return false;

            // Loop prevention (spec §11.7): this exact chain already reached the listener.
            var listenerStore = StoreFor(listener);
            if (_seenEvents.Contains(listener.Value + ":" + originEvent.Value)) return false;

            var rel = _relationships.GetOrCreate(listener, speaker);
            float trustFactor = Math.Clamp(0.5f + rel.Trust * 0.5f, 0.1f, 1f);

            float hops = belief.HopCount + 1;
            float confidence = belief.Confidence * MathF.Pow(HopDecay, hops - belief.HopCount) * trustFactor;

            listenerStore.AddOrUpdate(new Belief(
                new MemoryId(listenerStore.NextId()), listener, subjectKey, predicate,
                belief.Stance, Math.Clamp(confidence, 0f, 1f),
                (int)hops, speaker, belief.SourceEvent ?? originEvent, _world.Clock.CurrentTime));

            _seenEvents.Add(listener.Value + ":" + originEvent.Value);
            return true;
        }

        /// <summary>Direct evidence overrides weak rumours on conflict (spec §11.3).</summary>
        public void ReconcileWithDirectExperience(AgentId owner, string subjectKey, string predicate, float experiencedStance)
        {
            var store = StoreFor(owner);
            if (store.TryGet(subjectKey, predicate, out var b) && b != null && b.HopCount > 0)
            {
                // Lived experience carries more evidential weight than hearsay.
                b.Stance = Math.Clamp(b.Stance * 0.3f + experiencedStance * 0.9f, -1f, 1f);
                b.Confidence = Math.Min(1f, b.Confidence + 0.35f);
                b.HopCount = 0;
                b.SourceAgent = null;
                b.LearnedAt = _world.Clock.CurrentTime;
            }
        }

        public IReadOnlyList<Belief> About(AgentId observer, string subjectKey)
        {
            var result = new List<Belief>();
            foreach (var b in StoreFor(observer).All)
                if (b.SubjectKey == subjectKey) result.Add(b);
            return result;
        }

        public long TotalBeliefs
        {
            get { long n = 0; foreach (var s in _stores.Values) n += s.Count; return n; }
        }
    }
}
