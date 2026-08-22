using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Aggregate root of the running simulation: owns the clock, RNG provider,
    /// event bus, scheduler and all repositories. Systems operate on the world
    /// through this object; nothing here references Unity or presentation.
    /// </summary>
    public sealed class SimulationWorld
    {
        public SimulationClock Clock { get; }
        public SimRandomProvider Randoms { get; }
        public EventBus Events { get; }
        public SimulationScheduler Scheduler { get; }
        public AgentRepository Agents { get; } = new AgentRepository();
        public LocationRepository Locations { get; } = new LocationRepository();
        public ResidentRegistry Residents { get; } = new ResidentRegistry();
        /// <summary>Sprint 4: what can be done where (spec §4.5/§4.6).</summary>
        public AffordanceRegistry Affordances { get; } = new AffordanceRegistry();
        /// <summary>Sprint 4: timed travel between locations (Unity NavMesh adapter later).</summary>
        public INavigationService Navigation { get; }
        /// <summary>Sprint 4: seats/beds/counters with ownership and expiry.</summary>
        public ReservationService Reservations { get; }

        internal SimulationWorld(SimulationClock clock, SimRandomProvider randoms, EventBus events, SimulationScheduler scheduler)
        {
            Clock = clock;
            Randoms = randoms;
            Events = events;
            Scheduler = scheduler;
            Reservations = new ReservationService(this);
            Navigation = new TimedNavigationService(this);
        }

        public void RegisterLocation(LocationDefinition definition) => Locations.Add(definition);

        /// <summary>
        /// Removes a location that no agent occupies or navigates toward
        /// (used by tests for target-destruction semantics; later, demolition).
        /// </summary>
        public void RemoveLocation(LocationId id)
        {
            var runtime = Locations.Get(id);
            if (runtime.OccupiedCount > 0)
                throw new InvalidOperationException($"Cannot remove '{id}': still occupied.");
            Locations.Remove(id);
        }

        /// <summary>
        /// Creates an agent and places them at their start location (start location,
        /// else home) with consistent occupancy accounting. Publishes exactly one
        /// AgentSpawnedEvent carrying the resolved start location.
        /// </summary>
        public AgentState SpawnAgent(string idValue, string displayName, string? homeLocationId = null, string? startLocationId = null)
        {
            var id = new AgentId(idValue);
            bool hasHome = !string.IsNullOrEmpty(homeLocationId);
            LocationId home = hasHome ? new LocationId(homeLocationId!) : default;
            var agent = new AgentState(new AgentIdentity(id, displayName), home);
            Agents.Add(agent);

            LocationId? placedAt = null;
            string? start = !string.IsNullOrEmpty(startLocationId)
                ? startLocationId
                : (hasHome ? homeLocationId : null);
            if (start != null)
            {
                var target = Locations.Get(new LocationId(start)); // throws when unknown
                ApplyMove(agent, target);
                placedAt = target.Id;
            }

            Events.Publish(new AgentSpawnedEvent(id, placedAt, Clock.CurrentTime));
            return agent;
        }

        /// <summary>
        /// Spawns a full resident: physical state plus cognition mind (personality + needs).
        /// </summary>
        public (AgentState Agent, AgentMind Mind) SpawnResident(ResidentSpec spec)
        {
            if (spec == null) throw new ArgumentNullException(nameof(spec));
            var agent = SpawnAgent(spec.Id, spec.DisplayName, spec.HomeLocationId, spec.StartLocationId);
            var needs = new NeedSet(StandardNeeds.Library(), spec.InitialNeeds);
            var mind = new AgentMind(agent.Identity.Id, spec.Personality, needs);
            Residents.Add(mind);
            return (agent, mind);
        }

        /// <summary>Teleports an agent to a location immediately. Validates both IDs.</summary>
        public void PlaceAt(AgentId agentId, LocationId locationId)
        {
            var agent = Agents.Get(agentId); // throws when unknown
            var target = Locations.Get(locationId); // throws when unknown
            if (agent.HasLocation && agent.CurrentLocationId == locationId) return;

            LocationId? from = agent.HasLocation ? agent.CurrentLocationId : (LocationId?)null;
            ApplyMove(agent, target);
            Events.Publish(new AgentMovedEvent(agentId, from, locationId, Clock.CurrentTime));
        }

        /// <summary>
        /// Moves an agent from their current location to another one.
        /// Returns false when the agent already is at the target.
        /// </summary>
        public bool MoveAgent(AgentId agentId, LocationId targetLocation)
        {
            var agent = Agents.Get(agentId);
            var target = Locations.Get(targetLocation);
            if (!target.IsOpen)
                throw new InvalidOperationException($"Cannot move '{agentId}': '{targetLocation}' is closed.");
            if (agent.HasLocation && agent.CurrentLocationId == targetLocation) return false;

            LocationId? from = agent.HasLocation ? agent.CurrentLocationId : (LocationId?)null;
            ApplyMove(agent, target);
            Events.Publish(new AgentMovedEvent(agentId, from, targetLocation, Clock.CurrentTime));
            return true;
        }

        private void ApplyMove(AgentState agent, LocationRuntimeState target)
        {
            if (agent.HasLocation)
                Locations.Get(agent.CurrentLocationId).OnAgentLeft();
            target.OnAgentEntered();
            agent.SetCurrentLocation(target.Id);
        }
    }
}
