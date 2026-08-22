using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>One remembered episode. Facts never change; retrieval weight does (spec §38).</summary>
    public sealed class EpisodicMemory
    {
        public MemoryId Id { get; }
        public SimTime Timestamp { get; }
        public string EventType { get; }
        public AgentId Subject { get; }
        public LocationId? Where { get; }
        public string Summary { get; }
        public float Importance { get; }
        public float Valence { get; }
        public float Confidence { get; }
        public PerceptionSource Source { get; }
        public EventId SourceEvent { get; }
        public int AccessCount { get; internal set; }
        public SimTime LastAccess { get; internal set; }

        internal EpisodicMemory(MemoryId id, SimTime timestamp, string eventType, AgentId subject,
            LocationId? where, string summary, float importance, float valence,
            float confidence, PerceptionSource source, EventId sourceEvent)
        {
            Id = id; Timestamp = timestamp; EventType = eventType; Subject = subject;
            Where = where; Summary = summary; Importance = importance; Valence = valence;
            Confidence = confidence; Source = source; SourceEvent = sourceEvent;
            LastAccess = timestamp;
        }

        public override string ToString() =>
            $"M{Id.Value} [{Timestamp}] {Summary}";
    }

    /// <summary>Social-event importance/valence table (spec §7.2). Noise stays below the encode floor.</summary>
    public static class MemoryImportanceTable
    {
        private static readonly Dictionary<string, (float importance, float valence)> Table =
            new Dictionary<string, (float, float)>(StringComparer.Ordinal)
            {
                ["insult_incident"]   = (0.72f, -0.80f),
                ["insult"]            = (0.70f, -0.75f),
                ["help"]              = (0.75f,  0.70f),
                ["gift"]              = (0.68f,  0.60f),
                ["compliment"]        = (0.52f,  0.50f),
                ["tease"]             = (0.42f, -0.15f),
                ["confront"]          = (0.60f, -0.45f),
                ["comfort"]           = (0.55f,  0.55f),
                ["apologize"]         = (0.50f,  0.40f),
                ["gossip"]            = (0.45f,  0.00f),
                ["chat"]              = (0.34f,  0.10f),
                ["greeting"]          = (0.20f,  0.10f),
                ["location_closed"]   = (0.30f, -0.20f),
                ["location_opened"]   = (0.18f,  0.05f),
                ["town_announcement"] = (0.40f,  0.10f),
                ["movement"]          = (0.00f,  0.00f)
            };

        /// <summary>Unknown event types encode as mildly notable neutral episodes.</summary>
        public static (float importance, float valence) For(string eventType) =>
            Table.TryGetValue(eventType, out var v) ? v : (0.40f, 0.00f);
    }

    /// <summary>Turns observations into memories, or drops noise (spec §7.3/§7.4).</summary>
    public sealed class MemoryEncoder
    {
        /// <summary>Observations below this importance are forgotten immediately.</summary>
        public const float EncodeFloor = 0.15f;

        public EpisodicMemory? Encode(Observation observation, PersonalityProfile observerPersonality, MemoryId id)
        {
            var (importance, valence) = MemoryImportanceTable.For(observation.EventType);
            if (importance < EncodeFloor) return null;

            // Grudge-holders retain negative interpersonal events more strongly (spec §7.7).
            if (valence < 0f && observation.Actors.Length > 0)
            {
                float grudge = observerPersonality.Get(PersonalityTrait.GrudgeRetention);
                importance = MathF.Min(1f, importance * (1f + grudge * 0.30f));
            }

            // Second-hand knowledge is remembered less vividly than lived experience.
            float sourceFactor = observation.Source switch
            {
                PerceptionSource.DirectParticipation => 1f,
                PerceptionSource.VisualNearby => 0.9f,
                PerceptionSource.AudibleNearby => 0.8f,
                PerceptionSource.Announcement => 0.7f,
                _ => 0.8f
            };
            importance *= sourceFactor;

            var subject = observation.Actors.Length > 1 ? observation.Actors[1] : observation.Actors[0];
            return new EpisodicMemory(id, observation.Timestamp, observation.EventType,
                subject, observation.Where,
                Summarize(observation), Math.Clamp(importance, 0f, 1f), valence,
                observation.Confidence, observation.Source, observation.Event);
        }

        private static string Summarize(Observation o)
        {
            if (o.Actors.Length >= 2)
                return $"{o.Actors[0]} {o.EventType.Replace('_', ' ')} {o.Actors[1]}";
            if (o.Actors.Length == 1)
                return $"{o.Actors[0]} {o.EventType.Replace('_', ' ')}";
            return o.EventType.Replace('_', ' ');
        }
    }

    /// <summary>Bounded personal memory store: eviction keeps what matters (spec §7.9).</summary>
    public sealed class MemoryStore
    {
        private readonly List<EpisodicMemory> _memories = new List<EpisodicMemory>();
        private long _nextId = 1;

        public int Capacity { get; }
        public int Count => _memories.Count;

        public MemoryStore(int capacity = 250)
        {
            Capacity = capacity;
        }

        internal EpisodicMemory Add(SimTime now, Func<long, EpisodicMemory> factory)
        {
            var memory = factory(_nextId++);
            _memories.Add(memory);
            if (_memories.Count > Capacity)
            {
                // Evict least valuable: lowest importance, ties broken by oldest.
                int worst = 0;
                for (int i = 1; i < _memories.Count; i++)
                {
                    var w = _memories[worst];
                    var c = _memories[i];
                    if (c.Importance < w.Importance ||
                        (c.Importance == w.Importance && c.Timestamp < w.Timestamp))
                        worst = i;
                }
                _memories.RemoveAt(worst);
            }
            memory.LastAccess = now;
            return memory;
        }

        public IReadOnlyList<EpisodicMemory> All => _memories;

        public bool TryGet(MemoryId id, out EpisodicMemory? memory)
        {
            foreach (var m in _memories)
                if (m.Id == id) { memory = m; return true; }
            memory = null;
            return false;
        }

        /// <summary>Drops memories below the retention floor that have never been recalled.</summary>
        public int Consolidate(SimTime now, float retentionFloor)
        {
            var doomed = new List<EpisodicMemory>();
            foreach (var m in _memories)
                if (m.Importance < retentionFloor && m.AccessCount == 0 &&
                    (now - m.Timestamp).TotalHours > 48.0)
                    doomed.Add(m);
            foreach (var m in doomed) _memories.Remove(m);
            return doomed.Count;
        }
    }

    public sealed class RetrievalQuery
    {
        public AgentId? AboutAgent { get; set; }
        public LocationId? NearLocation { get; set; }
        public string? TypePrefix { get; set; }
        public SimTime Now { get; set; }
        /// <summary>Recency half-life in simulated hours.</summary>
        public double RecencyHalfLifeHours { get; set; } = 48.0;
    }

    public sealed class RetrievedMemory
    {
        public EpisodicMemory Memory { get; }
        public float Score { get; }
        public IReadOnlyList<ScoreLine> Breakdown { get; }
        internal RetrievedMemory(EpisodicMemory m, float score, List<ScoreLine> b) { Memory = m; Score = score; Breakdown = b; }
    }

    /// <summary>Explainable retrieval scoring (spec §7.6/§7.10).</summary>
    public sealed class MemoryRetriever
    {
        public float WRecency { get; set; } = 0.30f;
        public float WImportance { get; set; } = 0.30f;
        public float WActor { get; set; } = 0.25f;
        public float WLocation { get; set; } = 0.15f;

        public IReadOnlyList<RetrievedMemory> Retrieve(MemoryStore store, RetrievalQuery q, int topN)
        {
            var ranked = new List<RetrievedMemory>();
            foreach (var m in store.All)
            {
                if (q.TypePrefix != null && !m.EventType.StartsWith(q.TypePrefix, StringComparison.Ordinal))
                    continue;

                double hours = Math.Max(0.0, (q.Now - m.Timestamp).TotalMinutes / 60.0);
                float recency = MathF.Pow(0.5f, (float)(hours / Math.Max(0.1, q.RecencyHalfLifeHours)));
                float actorMatch = q.AboutAgent.HasValue && m.Subject == q.AboutAgent.Value ? 1f : 0f;
                float locMatch = q.NearLocation.HasValue && m.Where == q.NearLocation.Value ? 1f : 0f;

                float score = WRecency * recency + WImportance * m.Importance + WActor * actorMatch + WLocation * locMatch;

                var lines = new List<ScoreLine>
                {
                    new ScoreLine("Recency", WRecency * recency),
                    new ScoreLine("Importance", WImportance * m.Importance),
                    new ScoreLine("ActorMatch", WActor * actorMatch),
                    new ScoreLine("LocationMatch", WLocation * locMatch)
                };
                ranked.Add(new RetrievedMemory(m, score, lines));
            }

            ranked.Sort((a, b) =>
            {
                int byScore = b.Score.CompareTo(a.Score);
                return byScore != 0 ? byScore : a.Memory.Id.CompareTo(b.Memory.Id);
            });

            var results = new List<RetrievedMemory>();
            for (int i = 0; i < ranked.Count && i < topN; i++)
            {
                var r = ranked[i];
                r.Memory.AccessCount++;
                r.Memory.LastAccess = q.Now;
                results.Add(r);
            }
            return results;
        }
    }

    /// <summary>Owns per-resident stores; encodes observations arriving on the bus.</summary>
    public sealed class MemorySystem
    {
        private readonly SimulationWorld _world;
        private readonly MemoryEncoder _encoder = new MemoryEncoder();
        private readonly Dictionary<AgentId, MemoryStore> _stores = new Dictionary<AgentId, MemoryStore>();

        public MemoryRetriever Retriever { get; } = new MemoryRetriever();
        /// <summary>Consolidation floor for never-recalled low-value memories.</summary>
        public float ConsolidationFloor { get; set; } = 0.22f;

        public MemorySystem(SimulationWorld world)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _world.Events.Subscribe<ObservationRecordedEvent>(e =>
            {
                var observerId = e.Observation.Observer;
                if (!_world.Residents.TryGet(observerId, out var mind)) return;
                var store = StoreFor(observerId);
                var memory = _encoder.Encode(e.Observation, mind.Personality, new MemoryId(NextGlobalId()));
                if (memory != null)
                    store.Add(_world.Clock.CurrentTime, _ => memory!);
            });
        }

        private long _nextGlobalId = 1;
        private long NextGlobalId() => _nextGlobalId++;

        public MemoryStore StoreFor(AgentId agent)
        {
            if (_stores.TryGetValue(agent, out var s)) return s!;
            var created = new MemoryStore();
            _stores.Add(agent, created);
            return created;
        }

        public int ConsolidateAll()
        {
            int removed = 0;
            var now = _world.Clock.CurrentTime;
            foreach (var store in _stores.Values) removed += store.Consolidate(now, ConsolidationFloor);
            return removed;
        }

        public IReadOnlyList<RetrievedMemory> Recall(AgentId agent, RetrievalQuery query, int topN = 5)
            => Retriever.Retrieve(StoreFor(agent), query, topN);

        public long TotalMemories
        {
            get { long n = 0; foreach (var s in _stores.Values) n += s.Count; return n; }
        }
    }
}
