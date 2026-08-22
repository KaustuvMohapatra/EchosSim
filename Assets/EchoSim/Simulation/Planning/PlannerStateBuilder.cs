using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Projects world + resident state into a planner view. Knowledge is scoped to
    /// what the resident plausibly knows (own memory, own location, co-located
    /// company, open/closed flags of role locations). Ephemeral completion flags
    /// reset on every build so goals remain re-achievable.
    /// </summary>
    public sealed class PlannerStateBuilder
    {
        private readonly SimulationWorld _world;
        private readonly TownRoles _roles;
        private readonly OpeningHoursSystem? _hours;
        private readonly JobSystem? _jobs;

        public PlannerStateBuilder(SimulationWorld world, TownRoles roles,
            OpeningHoursSystem? hours = null, JobSystem? jobs = null)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _roles = roles;
            _hours = hours;
            _jobs = jobs;
        }

        public PlannerWorldState Build(AgentState agent, AgentMind mind)
        {
            if (agent == null) throw new ArgumentNullException(nameof(agent));
            if (mind == null) throw new ArgumentNullException(nameof(mind));

            var state = new PlannerWorldState();

            // Location flags: exactly one registered-location flag true.
            bool atHome = agent.HasLocation && agent.CurrentLocationId == agent.HomeLocationId;
            foreach (var locId in _world.Locations.OrderedIds)
            {
                bool here = agent.HasLocation && locId == agent.CurrentLocationId;
                state.Set(StandardActions.LocationKey(locId), here ? 1 : 0);
            }
            state.Set(StandardActions.HomeFact, atHome ? 1 : 0);

            // Authored hours win over stale flags (idempotent).
            _hours?.UpdateAll(_world.Clock.CurrentTime);

            // Role openness facts.
            SetOpenFlag(state, _roles.Cafe, "cafe_open");
            SetOpenFlag(state, _roles.Store, "store_open");

            // Employment facts (Sprint 5): the resident's own job defines the workplace.
            bool onShift = false;
            if (_jobs != null && mind.Job != null)
            {
                bool atWork = agent.HasLocation && agent.CurrentLocationId == mind.Job.Workplace;
                state.Set("at_work", atWork ? 1 : 0);
                state.Set("work_open", _world.Locations.Get(mind.Job.Workplace).IsOpen ? 1 : 0);
                onShift = _jobs.IsExpectedToWork(agent.Identity.Id, _world.Clock.CurrentTime);
            }
            else
            {
                state.Set("at_work", 0);
                state.Set("work_open", 0);
            }
            state.Set("on_shift", onShift ? 1 : 0);

            // Persistent planner memory (skipping ephemeral and location keys).
            var ephemeral = new HashSet<string>(StandardActions.EphemeralSet(), StringComparer.Ordinal);
            foreach (var kv in mind.PlannerMemory)
            {
                if (kv.Key.StartsWith("at_", StringComparison.Ordinal)) continue;
                if (ephemeral.Contains(kv.Key)) continue;
                state.Set(kv.Key, kv.Value);
            }

            // Ephemeral completion flags always start false.
            foreach (var key in StandardActions.EphemeralSet())
                state.Set(key, 0);

            // Company: any other resident sharing the current location.
            int othersPresent = 0;
            if (agent.HasLocation)
            {
                foreach (var otherId in _world.Residents.OrderedIds)
                {
                    if (otherId == mind.Agent) continue;
                    var other = _world.Agents.Get(otherId);
                    if (other.HasLocation && other.CurrentLocationId == agent.CurrentLocationId) othersPresent++;
                }
            }
            state.Set("social_target_nearby", othersPresent > 0 ? 1 : 0);

            return state;
        }

        private void SetOpenFlag(PlannerWorldState state, LocationId? role, string factKey)
        {
            if (!role.HasValue) { state.Set(factKey, 0); return; }
            var runtime = _world.Locations.Get(role.Value);
            state.Set(factKey, runtime.IsOpen ? 1 : 0);
        }
    }
}
