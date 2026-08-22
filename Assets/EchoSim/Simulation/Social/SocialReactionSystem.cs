using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Wires the perception pipeline into inner life: every recorded observation
    /// becomes a memory (MemorySystem), and social observations additionally move
    /// emotion (EmotionSystem) and relationships (RelationshipSystem).
    /// One choke point — nothing hard-codes per-agent reactions.
    /// </summary>
    public sealed class SocialReactionSystem
    {
        public SocialReactionSystem(
            SimulationWorld world,
            MemorySystem memory,
            EmotionSystem emotion,
            RelationshipSystem relationships)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            _emotion = emotion ?? throw new ArgumentNullException(nameof(emotion));
            _relationships = relationships ?? throw new ArgumentNullException(nameof(relationships));
            var _ = memory ?? throw new ArgumentNullException(nameof(memory)); // memory self-subscribes

            world.Events.Subscribe<ObservationRecordedEvent>(e =>
            {
                var o = e.Observation;
                switch (o.EventType)
                {
                    case "insult_incident":
                    case "insult":
                        _emotion.Apply(o.Observer, -0.35f * o.Confidence, +0.30f * o.Confidence);
                        break;
                    case "help":
                    case "comfort":
                        _emotion.Apply(o.Observer, +0.30f * o.Confidence, -0.10f * o.Confidence);
                        break;
                    case "compliment":
                    case "gift":
                        _emotion.Apply(o.Observer, +0.25f * o.Confidence, +0.15f * o.Confidence);
                        break;
                    case "tease":
                        // Playful among friends; stings otherwise (relationship decides later effects).
                        _emotion.Apply(o.Observer, -0.10f * o.Confidence, +0.20f * o.Confidence);
                        break;
                }

                if (o.Actors.Length > 0)
                {
                    AgentId actor = o.Actors[0];
                    AgentId? target = o.Actors.Length > 1 ? o.Actors[1] : null;
                    if (actor != o.Observer)
                        _relationships.HandleSocialEvent(o.Observer, o.EventType, actor, target, o.Confidence);
                }
            });
        }

        private readonly EmotionSystem _emotion;
        private readonly RelationshipSystem _relationships;
    }
}
