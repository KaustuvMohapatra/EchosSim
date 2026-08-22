using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// The player is just another actor with a stable ID: NPCs hold memories,
    /// relationships and beliefs about them exactly as about each other (spec §13).
    /// </summary>
    public static class PlayerIds
    {
        public const string PlayerAgentId = "player";
    }

    public sealed class PlayerController
    {
        private readonly SimulationWorld _world;
        private readonly SocialSystem _social;

        public PlayerController(SimulationWorld world, SocialSystem social)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _social = social ?? throw new ArgumentNullException(nameof(social));
        }

        public bool IsRegistered => _world.Residents.TryGet(Id, out _);

        public AgentId Id { get; private set; }

        public AgentMind Register(string homeLocationId, string displayName = "You")
        {
            var (_, mind) = _world.SpawnResident(new ResidentSpec(PlayerIds.PlayerAgentId, displayName)
            {
                HomeLocationId = homeLocationId,
                Personality = PersonalityProfile.Balanced()
            });
            Id = mind.Agent;
            return mind;
        }

        public void MoveTo(LocationId location) => _world.MoveAgent(Id, location);

        /// <summary>Every player action flows through the same social pipeline NPC actions use.</summary>
        public SocialAttemptResult Do(SocialActionType action, AgentId target, string? detail = null)
            => _social.Attempt(Id, target, action, detail);
    }
}
