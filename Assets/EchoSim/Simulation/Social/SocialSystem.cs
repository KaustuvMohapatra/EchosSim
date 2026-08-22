using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>The initial social action set (spec §10).</summary>
    public enum SocialActionType
    {
        Greet, Chat, Compliment, Tease, Joke, Help, AskForHelp,
        Comfort, Apologize, Invite, Confront, Insult, ShareInformation, Goodbye
    }

    public sealed class SocialAttemptResult
    {
        public bool Accepted { get; internal set; }
        public string Reason { get; internal set; } = "";
        public EventId? EmittedEvent { get; internal set; }
    }

    /// <summary>
    /// Social interaction protocol: proximity checks, mutual conversation locks,
    /// personality/mood/relationship-driven acceptance, and emission of the
    /// resulting observable event — which feeds memory/emotion/relationships via
    /// the perception pipeline. One flow for NPCs and the player alike.
    /// </summary>
    public sealed class SocialSystem
    {
        private readonly SimulationWorld _world;
        private readonly PerceptionSystem _perception;
        private readonly BeliefSystem _beliefs;
        private readonly EmotionSystem _emotion;
        private readonly ISimRandom _rng;

        public SocialSystem(SimulationWorld world, PerceptionSystem perception,
            BeliefSystem beliefs, EmotionSystem emotion, ISimRandom rng)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _perception = perception ?? throw new ArgumentNullException(nameof(perception));
            _beliefs = beliefs ?? throw new ArgumentNullException(nameof(beliefs));
            _emotion = emotion ?? throw new ArgumentNullException(nameof(emotion));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
        }

        private static float BaseAcceptance(SocialActionType action)
        {
            switch (action)
            {
                case SocialActionType.Greet:
                case SocialActionType.Chat:
                case SocialActionType.Goodbye: return 0.9f;
                case SocialActionType.Compliment:
                case SocialActionType.Comfort:
                case SocialActionType.Apologize: return 0.8f;
                case SocialActionType.Help:
                case SocialActionType.AskForHelp:
                case SocialActionType.Invite: return 0.7f;
                case SocialActionType.ShareInformation: return 0.75f;
                case SocialActionType.Joke: return 0.65f;
                case SocialActionType.Tease: return 0.5f;
                case SocialActionType.Confront: return 0.4f;
                case SocialActionType.Insult: return 1f; // nobody "accepts" an insult
                default: return 0.6f;
            }
        }

        /// <summary>Acceptance depends on mood, sociability and urgency (spec §10).</summary>
        private float AcceptanceProbability(AgentId listener, SocialActionType action)
        {
            if (!_world.Residents.TryGet(listener, out var mind)) return 0f;

            float p = BaseAcceptance(action);
            bool hostile = action == SocialActionType.Insult || action == SocialActionType.Confront;
            if (!hostile)
            {
                // Overwhelmed residents refuse everything friendly — full stop.
                foreach (var need in mind.Needs.All)
                    if (need.ShouldInterrupt) return 0f;
                p += 0.20f * (mind.Personality.Get(PersonalityTrait.Sociability) - 0.5f);
                p += 0.15f * mind.EmotionValence;
            }
            else
            {
                // Bad moods make hostility more likely to land as a confrontation.
                p += 0.10f * (-mind.EmotionValence);
            }
            return Math.Clamp(p, 0.05f, 1f);
        }

        public SocialAttemptResult Attempt(AgentId initiator, AgentId target, SocialActionType action, string? detail = null)
        {
            var result = new SocialAttemptResult();
            var aOk = _world.Agents.TryGet(initiator, out var a);
            var tOk = _world.Agents.TryGet(target, out var t);

            if (!aOk || !tOk || a!.HasLocation == false || t!.HasLocation == false)
            {
                result.Reason = "participant missing or unplaced";
                return result;
            }
            if (a!.CurrentLocationId != t!.CurrentLocationId)
            {
                result.Reason = "not co-located";
                return result;
            }

            bool conversational = action != SocialActionType.Insult && action != SocialActionType.Help;
            ResourceId? lockA = null, lockT = null;
            if (conversational)
            {
                lockA = new ResourceId("conv:" + initiator.Value);
                lockT = new ResourceId("conv:" + target.Value);
                var until = _world.Clock.CurrentTime.Add(SimDuration.FromMinutes(30));
                bool gotA = _world.Reservations.Reserve(lockA.Value, initiator, until);
                bool gotT = gotA && _world.Reservations.Reserve(lockT.Value, target, until);
                if (!gotA || !gotT)
                {
                    result.Reason = "busy: already in conversation";
                    if (gotA && !gotT) _world.Reservations.Release(lockA.Value, initiator);
                    return result;
                }
            }

            try
            {
                float p = AcceptanceProbability(target, action);
                if (!_rng.Chance(p))
                {
                    result.Reason = "declined";
                    _perception.Publish(action.ToString().ToLowerInvariant() + "_rejected",
                        new[] { initiator, target }, a.CurrentLocationId, ObservationReach.SameLocation, 0.6f);
                    return result;
                }

                string type = MapToEventType(action);
                var emitted = _perception.Publish(type, new[] { initiator, target },
                    a.CurrentLocationId, ObservationReach.SameLocation);

                // ShareInformation carries a belief across minds right now.
                if (action == SocialActionType.ShareInformation && detail != null)
                {
                    var parts = detail.Split('|');
                    if (parts.Length == 3)
                        _beliefs.TryTransfer(initiator, target, parts[0], parts[1], emitted);
                }

                if (action == SocialActionType.Insult) _emotion.Apply(target, -0.30f, +0.35f);
                if (action == SocialActionType.Compliment) _emotion.Apply(target, +0.20f, +0.10f);

                result.Accepted = true;
                result.Reason = "ok";
                result.EmittedEvent = emitted;
                return result;
            }
            finally
            {
                if (lockA.HasValue) _world.Reservations.Release(lockA.Value, initiator);
                if (lockT.HasValue) _world.Reservations.Release(lockT.Value, target);
            }
        }

        /// <summary>
        /// Physical gift transfer (Sprint 15): inventory moves, then the social
        /// pipeline does the rest. Recipient preferences scale the warmth.
        /// </summary>
        public SocialAttemptResult GiveItem(AgentId giver, AgentId recipient, ItemId itemId, EconomySystem economy)
        {
            var result = new SocialAttemptResult();
            if (!_world.Residents.TryGet(giver, out var g) || !_world.Residents.TryGet(recipient, out var r))
            {
                result.Reason = "participant missing";
                return result;
            }
            if (!g.Inventory.Remove(itemId))
            {
                result.Reason = "no such item in inventory";
                return result;
            }

            var item = economy.GetItem(itemId);
            r.Inventory.Add(itemId);

            var giverState = _world.Agents.Get(giver);
            var recipientMind = r;

            // Preference-aware warmth: a favourite gift lands better for anyone.
            float preference = r.Preferences.Get(itemId.Value) + r.Preferences.Get(item.HasTag("drink") ? "hotChocolate" : "");
            var emitted = _perception.Publish("gift", new[] { giver, recipient },
                giverState.CurrentLocationId, ObservationReach.SameLocation, 1f + Math.Clamp(preference, 0f, 1f) * 0.5f);

            if (preference > 0.5f)
            {
                _emotion.Apply(recipient, +0.15f * preference, 0f);
            }

            result.Accepted = true;
            result.Reason = "ok";
            result.EmittedEvent = emitted;
            return result;
        }

        internal static string MapToEventType(SocialActionType action)
        {
            switch (action)
            {
                case SocialActionType.Greet: return "greeting";
                case SocialActionType.Chat: return "chat";
                case SocialActionType.Compliment: return "compliment";
                case SocialActionType.Tease: return "tease";
                case SocialActionType.Joke: return "joke";
                case SocialActionType.Help: return "help";
                case SocialActionType.AskForHelp: return "ask_for_help";
                case SocialActionType.Comfort: return "comfort";
                case SocialActionType.Apologize: return "apologize";
                case SocialActionType.Invite: return "invite";
                case SocialActionType.Confront: return "confront";
                case SocialActionType.Insult: return "insult";
                case SocialActionType.ShareInformation: return "gossip";
                case SocialActionType.Goodbye: return "goodbye";
                default: return "social";
            }
        }
    }
}
