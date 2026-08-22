using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Conversation intents (spec §12.2).</summary>
    public enum ConversationIntent
    {
        Greet, SmallTalk, Gossip, Complain, Ask,
        Offer, Apologize, Comfort, Tease, Invite, Confront, Goodbye
    }

    /// <summary>A structured exchange between exactly two participants.</summary>
    public sealed class ConversationSession
    {
        public AgentId Initiator { get; }
        public AgentId Listener { get; }
        public ConversationIntent Intent { get; }
        public string TopicLabel { get; }
        public IReadOnlyList<string> Utterances { get; }
        public SimTime StartedAt { get; }
        /// <summary>Set when the session carried knowledge across minds (gossip).</summary>
        public string? TransferredBelief { get; internal set; }

        internal ConversationSession(AgentId initiator, AgentId listener, ConversationIntent intent,
            string topicLabel, List<string> utterances, SimTime startedAt)
        {
            Initiator = initiator; Listener = listener; Intent = intent;
            TopicLabel = topicLabel; Utterances = utterances; StartedAt = startedAt;
        }
    }

    /// <summary>
    /// Deterministic conversation engine (spec §12): intent selection from context
    /// (relationships, grievances, recent knowledge), topic selection ranked from
    /// beliefs and memories, template utterances with seeded variation. Surface
    /// text never mutates state directly — only emitted events do.
    /// </summary>
    public sealed class ConversationSystem
    {
        private readonly SimulationWorld _world;
        private readonly SocialSystem _social;
        private readonly BeliefSystem _beliefs;
        private readonly MemorySystem _memory;
        private readonly RelationshipSystem _relationships;
        private readonly ISimRandom _rng;

        public ConversationSystem(SimulationWorld world, SocialSystem social,
            BeliefSystem beliefs, MemorySystem memory, RelationshipSystem relationships, ISimRandom rng)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _social = social ?? throw new ArgumentNullException(nameof(social));
            _beliefs = beliefs ?? throw new ArgumentNullException(nameof(beliefs));
            _memory = memory ?? throw new ArgumentNullException(nameof(memory));
            _relationships = relationships ?? throw new ArgumentNullException(nameof(relationships));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
        }

        /// <summary>
        /// Runs a full conversation attempt. Emits one observable social event on
        /// success; returns null when proximity/busy/acceptance blocks it.
        /// </summary>
        public ConversationSession? Start(AgentId initiator, AgentId listener)
        {
            var intent = SelectIntent(initiator, listener);
            var socialType = IntentToAction(intent);

            var attempt = _social.Attempt(initiator, listener, socialType);
            if (!attempt.Accepted) return null;

            var (subjectKey, predicate, topicLabel) = SelectTopic(intent, initiator, listener);
            var utterances = BuildUtterances(intent, initiator, listener, subjectKey, predicate);

            var session = new ConversationSession(initiator, listener, intent,
                topicLabel, utterances, _world.Clock.CurrentTime);

            // Gossip carries knowledge across minds.
            if ((intent == ConversationIntent.Gossip || intent == ConversationIntent.Complain)
                && subjectKey != null && predicate != null && !ReferenceEquals(subjectKey, "") )
            {
                var originEvent = FindOriginEvent(initiator, subjectKey, predicate);
                if (_beliefs.TryTransfer(initiator, listener, subjectKey!, predicate!, originEvent))
                    session.TransferredBelief = subjectKey + "|" + predicate;
            }

            return session;
        }

        private ConversationIntent SelectIntent(AgentId a, AgentId b)
        {
            var rel = _relationships.GetOrCreate(a, b);

            // Strong grievance wants out: complain or confront.
            foreach (var belief in _beliefs.StoreFor(a).All)
                if (belief.HopCount == 0 && belief.Stance < -0.4f && belief.Confidence > 0.5f)
                    return rel.Affinity > 0.3f ? ConversationIntent.Complain : ConversationIntent.Gossip;

            // Fresh positive knowledge becomes gossip for chatty types.
            if (!_world.Residents.TryGet(a, out var mind)) return ConversationIntent.SmallTalk;
            float gossipTendency = mind.Personality.Get(PersonalityTrait.Extraversion) * 0.6f
                                 + mind.Personality.Get(PersonalityTrait.Sociability) * 0.6f;
            foreach (var belief in _beliefs.StoreFor(a).All)
                if (belief.LearnedAt > _world.Clock.CurrentTime.Subtract(SimDuration.FromHours(12)) &&
                    belief.SubjectKey != b.Value &&
                    _rng.Chance(0.35f + gossipTendency * 0.4f))
                    return ConversationIntent.Gossip;

            if (rel.Familiarity < 0.1f) return ConversationIntent.Greet;
            if (rel.Affinity < -0.3f) return ConversationIntent.Confront;
            if (rel.Affinity > 0.5f && rel.Familiarity > 0.3f && _rng.Chance(0.15f))
                return ConversationIntent.Tease; // playful friends, generic gate
            if (mind.Needs.Get(NeedKind.Social).Current > 60f) return ConversationIntent.SmallTalk;
            return ConversationIntent.SmallTalk;
        }

        private static SocialActionType IntentToAction(ConversationIntent intent)
        {
            switch (intent)
            {
                case ConversationIntent.Greet: return SocialActionType.Greet;
                case ConversationIntent.Gossip: return SocialActionType.ShareInformation;
                case ConversationIntent.Complain:
                case ConversationIntent.Confront: return SocialActionType.Confront;
                case ConversationIntent.Apologize: return SocialActionType.Apologize;
                case ConversationIntent.Comfort: return SocialActionType.Comfort;
                case ConversationIntent.Tease: return SocialActionType.Tease;
                case ConversationIntent.Invite: return SocialActionType.Invite;
                case ConversationIntent.Goodbye: return SocialActionType.Goodbye;
                default: return SocialActionType.Chat;
            }
        }

        private (string?, string?, string) SelectTopic(ConversationIntent intent, AgentId speaker, AgentId listener)
        {
            // Rank speaker's own first-hand beliefs by stance magnitude & freshness.
            Belief? best = null;
            float bestScore = 0f;
            foreach (var b in _beliefs.StoreFor(speaker).All)
            {
                if (b.SubjectKey == listener.Value && b.Stance < -0.4f) continue; // no confronting topics here
                float score = MathF.Abs(b.Stance) * b.Confidence / (1f + b.HopCount);
                if (score > bestScore) { bestScore = score; best = b; }
            }

            // Fall back to recent memories.
            string topicLabel;
            if (best != null && bestScore > 0.05f)
            {
                topicLabel = best.SubjectKey + " " + best.Predicate.Replace('_', ' ');
                return (best.SubjectKey, best.Predicate, topicLabel);
            }

            var query = new RetrievalQuery { Now = _world.Clock.CurrentTime };
            var memories = _memory.Retriever.Retrieve(_memory.StoreFor(speaker), query, 1);
            if (memories.Count > 0)
            {
                var m = memories[0].Memory;
                return (null, null, m.Summary);
            }
            return (null, null, "the weather");
        }

        private EventId FindOriginEvent(AgentId speaker, string subjectKey, string predicate)
        {
            if (_beliefs.StoreFor(speaker).TryGet(subjectKey, predicate, out var b) && b != null && b.SourceEvent.HasValue)
                return b.SourceEvent.Value;
            return new EventId(1); // synthetic origin for abstract gossip
        }

        private List<string> BuildUtterances(ConversationIntent intent, AgentId a, AgentId b,
            string? subjectKey, string? predicate)
        {
            string an = DisplayName(a), bn = DisplayName(b);
            string subject = subjectKey != null ? DisplayName(new AgentId(subjectKey)) : "something";
            string variation = _rng.NextInt(0, 2).ToString(System.Globalization.CultureInfo.InvariantCulture);

            var lines = new List<string>(3);
            switch (intent)
            {
                case ConversationIntent.Greet:
                    lines.Add(var0(variation) ? $"Hey, {bn}." : $"Oh — hi, {bn}.");
                    break;
                case ConversationIntent.SmallTalk:
                    lines.Add($"Nice weather for {TopicFallback()}.");
                    lines.Add($"Mm. Seen {an} around lately?");
                    break;
                case ConversationIntent.Gossip:
                    lines.Add($"Did you hear about {subject}?");
                    lines.Add(predicate != null ? $"{predicate.Replace('_', ' ')}... that's what I heard." : "That's what I heard.");
                    break;
                case ConversationIntent.Complain:
                    lines.Add($"It's {subject} again. Honestly.");
                    break;
                case ConversationIntent.Confront:
                    lines.Add($"{bn}, we need to talk.");
                    break;
                case ConversationIntent.Apologize:
                    lines.Add($"I'm sorry about earlier, {bn}.");
                    break;
                case ConversationIntent.Comfort:
                    lines.Add($"You're doing fine, {bn}. Really.");
                    break;
                case ConversationIntent.Tease:
                    // Rare playful easter egg: close friends only, seeded chance,
                    // per-pair cooldown. Generic gates — no special-cased residents.
                    if (TryRareTeaseLine(a, b, out string? rare))
                        lines.Add(rare!);
                    else
                        lines.Add(var0(variation) ? $"Late again? Impressive, {bn}." : $"{bn}, you never change.");
                    break;
                case ConversationIntent.Invite:
                    lines.Add($"Join me at the cafe later?");
                    break;
                case ConversationIntent.Ask:
                case ConversationIntent.Offer:
                case ConversationIntent.Goodbye:
                default:
                    lines.Add(var0(variation) ? $"See you around, {bn}." : $"Take care, {bn}.");
                    break;
            }
            return lines;

            static bool var0(string v) => v == "0";
            string TopicFallback() => "a walk";
        }

        private string DisplayName(AgentId id) =>
            _world.Agents.TryGet(id, out var s) ? s.Identity.DisplayName : id.Value;

        private readonly Dictionary<string, SimTime> _rareLineCooldown = new Dictionary<string, SimTime>(StringComparer.Ordinal);
        private static readonly TimeSpan RareCooldown = TimeSpan.FromHours(6);

        /// <summary>
        /// Rare affectionate tease between genuinely close friends.
        /// Gates: affinity > 0.5, seeded 10% chance, 6h per-pair cooldown.
        /// </summary>
        private bool TryRareTeaseLine(AgentId a, AgentId b, out string? line)
        {
            line = null;
            var rel = _relationships.GetOrCreate(a, b);
            if (rel.Affinity <= 0.5f || !_rng.Chance(0.10f)) return false;

            string pairKey = a.Value.CompareTo(b.Value) < 0 ? a.Value + "|" + b.Value : b.Value + "|" + a.Value;
            var now = _world.Clock.CurrentTime;
            if (_rareLineCooldown.TryGetValue(pairKey, out var last) && (now - last).TotalMinutes < RareCooldown.TotalMinutes)
                return false;

            _rareLineCooldown[pairKey] = now;
            line = "u dummy.";
            return true;
        }
    }
}
