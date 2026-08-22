using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Immutable identity of an agent: stable ID plus display data.
    /// Identity never changes over a lifetime; state does.
    /// </summary>
    public sealed class AgentIdentity
    {
        public AgentId Id { get; }
        public string DisplayName { get; }

        public AgentIdentity(AgentId id, string displayName)
        {
            Id = id;
            if (string.IsNullOrWhiteSpace(displayName))
                throw new ArgumentException("Display name required.", nameof(displayName));
            DisplayName = displayName;
        }

        public override string ToString() => $"{DisplayName} ({Id})";
    }

    /// <summary>
    /// Sprint 1 runtime state foundation for one agent.
    /// Later sprints extend this with needs, emotion, memory, beliefs, plans.
    /// </summary>
    public sealed class AgentState
    {
        public AgentIdentity Identity { get; }
        public LocationId HomeLocationId { get; }
        public LocationId CurrentLocationId { get; private set; }
        public bool Active { get; set; }

        internal bool HasLocation { get; private set; }

        public AgentState(AgentIdentity identity, LocationId homeLocationId, LocationId? currentLocationId = null)
        {
            Identity = identity ?? throw new ArgumentNullException(nameof(identity));
            HomeLocationId = homeLocationId;
            if (currentLocationId.HasValue)
            {
                CurrentLocationId = currentLocationId.Value;
                HasLocation = true;
            }
            Active = true;
        }

        internal void SetCurrentLocation(LocationId locationId)
        {
            CurrentLocationId = locationId;
            HasLocation = true;
        }

        public override string ToString() => Identity.ToString();
    }
}
