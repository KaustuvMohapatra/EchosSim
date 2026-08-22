using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Directional: A→B is stored separately from B→A (spec §9.2).</summary>
    public sealed class Relationship
    {
        /// <summary>0..1 — exposure over time.</summary>
        public float Familiarity { get; internal set; }
        /// <summary>-1..1 — liking.</summary>
        public float Affinity { get; internal set; }
        /// <summary>-1..1 — reliability as experienced.</summary>
        public float Trust { get; internal set; }
        /// <summary>-1..1 — esteem.</summary>
        public float Respect { get; internal set; }
        /// <summary>0..1 — romantic interest.</summary>
        public float Attraction { get; internal set; }
        /// <summary>0..1 — intimidation.</summary>
        public float Fear { get; internal set; }
        /// <summary>0..1 — accumulated grievance.</summary>
        public float Grievance { get; internal set; }
        /// <summary>0..1 — owed favours.</summary>
        public float Obligation { get; internal set; }

        public RelationshipLabel Label()
        {
            if (Grievance >= 0.6f && Affinity <= -0.2f) return RelationshipLabel.Enemy;
            if (Affinity <= -0.35f) return RelationshipLabel.Rival;
            if (Familiarity < 0.15f) return RelationshipLabel.Stranger;
            if (Attraction >= 0.6f) return RelationshipLabel.Crush;
            if (Affinity >= 0.60f && Trust >= 0.50f) return RelationshipLabel.CloseFriend;
            if (Affinity >= 0.30f) return RelationshipLabel.Friend;
            return RelationshipLabel.Acquaintance;
        }

        /// <summary>
        /// Content-authoring hook: seeds a relationship state directly
        /// (used for fixture towns with pre-existing social history).
        /// </summary>
        public void Seed(float affinity, float grievance = 0f, float familiarity = 0f, float trust = 0f)
        {
            Affinity = affinity;
            Grievance = grievance;
            Familiarity = familiarity;
            Trust = trust;
            ClampAll();
        }

        internal void ClampAll()
        {
            Familiarity = Math.Clamp(Familiarity, 0f, 1f);
            Attraction = Math.Clamp(Attraction, 0f, 1f);
            Fear = Math.Clamp(Fear, 0f, 1f);
            Grievance = Math.Clamp(Grievance, 0f, 1f);
            Obligation = Math.Clamp(Obligation, 0f, 1f);
            Affinity = Math.Clamp(Affinity, -1f, 1f);
            Trust = Math.Clamp(Trust, -1f, 1f);
            Respect = Math.Clamp(Respect, -1f, 1f);
        }

        /// <summary>Full-dimension import for save/load.</summary>
        internal void ImportFull(float familiarity, float affinity, float trust, float respect,
            float attraction, float fear, float grievance, float obligation)
        {
            Familiarity = familiarity; Affinity = affinity; Trust = trust; Respect = respect;
            Attraction = attraction; Fear = fear; Grievance = grievance; Obligation = obligation;
            ClampAll();
        }
    }

    public enum RelationshipLabel
    {
        Stranger,
        Acquaintance,
        Friend,
        CloseFriend,
        Rival,
        Enemy,
        Crush
    }

    /// <summary>
    /// Social consequences with personality context (spec §9.3/§9.4). Impact of an
    /// event depends on the OBSERVER's traits: agreeableness amplifies kindness,
    /// grudge retention amplifies grievance from negative events.
    /// </summary>
    public sealed class RelationshipSystem
    {
        private readonly SimulationWorld _world;
        private readonly Dictionary<string, Relationship> _links = new Dictionary<string, Relationship>(StringComparer.Ordinal);

        public RelationshipSystem(SimulationWorld world)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _world.Scheduler.ScheduleRepeating(SimDuration.FromHours(2), _ => Drift(SimDuration.FromHours(2)), "relationship-drift");
        }

        private static string Key(AgentId from, AgentId to) => from.Value + ">" + to.Value;

        public Relationship GetOrCreate(AgentId from, AgentId to)
        {
            var key = Key(from, to);
            if (_links.TryGetValue(key, out var r)) return r!;
            var created = new Relationship();
            _links.Add(key, created);
            return created!;
        }

        /// <summary>Scales a delta by the observer's personality (spec §9.4).</summary>
        private float Scale(AgentId observer, float baseDelta, bool negative)
        {
            if (!_world.Residents.TryGet(observer, out var mind)) return baseDelta;
            float scale = 1f;
            if (negative)
            {
                scale += mind.Personality.Get(PersonalityTrait.GrudgeRetention) * 0.5f;
                scale -= mind.Personality.Get(PersonalityTrait.Patience) * 0.25f;
            }
            else
            {
                scale += mind.Personality.Get(PersonalityTrait.Agreeableness) * 0.4f;
                scale -= mind.Personality.Get(PersonalityTrait.RiskTolerance) * 0.1f;
            }
            return baseDelta * Math.Max(0.25f, scale);
        }

        public void HandleSocialEvent(AgentId observer, string eventType, AgentId actor, AgentId? target, float confidence)
        {
            if (actor == observer) return; // your own actions are not social news to you
            var rel = GetOrCreate(observer, actor);
            rel.Familiarity = Math.Min(1f, rel.Familiarity + 0.05f);

            // Witnessing harm done to a third party also colours the observer's view.
            bool thirdPartyHarm = target.HasValue && target.Value != actor && target.Value != observer &&
                                  eventType.Contains("insult", StringComparison.Ordinal);

            switch (eventType)
            {
                case "insult_incident":
                case "insult":
                    Apply(rel, observer, affinity: -0.22f, respect: -0.12f, grievance: +0.20f, fear: +0.03f, negative: true);
                    break;
                case "confront":
                    Apply(rel, observer, affinity: -0.10f, grievance: +0.12f, negative: true);
                    break;
                case "tease":
                    // Playful between friends; grating otherwise.
                    float teaseBias = rel.Affinity >= 0.3f ? +0.04f : -0.06f;
                    Apply(rel, observer, affinity: teaseBias, grievance: teaseBias < 0 ? 0.05f : 0f, negative: teaseBias < 0);
                    break;
                case "help":
                    Apply(rel, observer, affinity: +0.18f, trust: +0.20f, obligation: +0.15f, respect: +0.08f, negative: false);
                    break;
                case "compliment":
                    Apply(rel, observer, affinity: +0.12f, respect: +0.05f, negative: false);
                    break;
                case "comfort":
                    Apply(rel, observer, affinity: +0.15f, trust: +0.10f, negative: false);
                    break;
                case "apologize":
                    Apply(rel, observer, affinity: +0.10f, trust: +0.08f, grievance: -0.25f, negative: false);
                    break;
                case "gift":
                    Apply(rel, observer, affinity: +0.16f, obligation: +0.10f, negative: false);
                    break;
                case "chat":
                case "greeting":
                case "gossip":
                    Apply(rel, observer, affinity: +0.04f, trust: +0.02f, negative: false);
                    break;
                default:
                    break; // non-social events leave relationships untouched
            }

            if (thirdPartyHarm)
            {
                var thirdParty = GetOrCreate(observer, target!.Value);
                thirdParty.Affinity = Math.Clamp(thirdParty.Affinity - 0.05f, -1f, 1f);
            }
            _ = confidence;
        }

        private void Apply(Relationship rel, AgentId observer,
            float affinity = 0f, float trust = 0f, float respect = 0f,
            float grievance = 0f, float fear = 0f, float obligation = 0f,
            bool negative = false)
        {
            rel.Affinity += Scale(observer, affinity, negative);
            rel.Trust += Scale(observer, trust, negative);
            rel.Respect += Scale(observer, respect, negative);
            rel.Grievance += Scale(observer, grievance, negative);
            rel.Fear += Scale(observer, fear, negative);
            rel.Obligation += Scale(observer, obligation, negative);
            rel.ClampAll();
        }

        /// <summary>Grievances soften, familiarity fades slowly, strong events persist (spec §9.6).</summary>
        public void Drift(SimDuration delta)
        {
            double hours = delta.TotalMinutes / 60.0;
            foreach (var kv in _links)
            {
                var rel = kv.Value;
                rel.Grievance = Math.Max(0f, (float)(rel.Grievance - 0.01 * hours));
                rel.Obligation = Math.Max(0f, (float)(rel.Obligation - 0.008 * hours));
                if (rel.Familiarity > 0.02f)
                    rel.Familiarity = Math.Max(0f, (float)(rel.Familiarity - 0.004 * hours));
            }
        }

        public IEnumerable<(AgentId From, AgentId To, Relationship Rel)> All()
        {
            foreach (var kv in _links)
            {
                int split = kv.Key.IndexOf('>', StringComparison.Ordinal);
                yield return (new AgentId(kv.Key.Substring(0, split)), new AgentId(kv.Key.Substring(split + 1)), kv.Value);
            }
        }

        /// <summary>Full-dimension authoring/import hook (save-load).</summary>
        public void Import(AgentId from, AgentId to, Relationship snapshot)
        {
            var rel = GetOrCreate(from, to);
            rel.ImportFull(snapshot.Familiarity, snapshot.Affinity, snapshot.Trust, snapshot.Respect,
                snapshot.Attraction, snapshot.Fear, snapshot.Grievance, snapshot.Obligation);
        }
    }
}
