using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Raised when an agent is spawned into the world.</summary>
    public readonly struct AgentSpawnedEvent : ISimulationEvent
    {
        public AgentId Agent { get; }
        public LocationId? StartLocation { get; }
        public SimTime AtTime { get; }

        public AgentSpawnedEvent(AgentId agent, LocationId? startLocation, SimTime atTime)
        {
            Agent = agent;
            StartLocation = startLocation;
            AtTime = atTime;
        }
    }

    /// <summary>Raised when an agent changes location.</summary>
    public readonly struct AgentMovedEvent : ISimulationEvent
    {
        public AgentId Agent { get; }
        public LocationId? FromLocation { get; }
        public LocationId ToLocation { get; }
        public SimTime AtTime { get; }

        public AgentMovedEvent(AgentId agent, LocationId? fromLocation, LocationId toLocation, SimTime atTime)
        {
            Agent = agent;
            FromLocation = fromLocation;
            ToLocation = toLocation;
            AtTime = atTime;
        }
    }
}
