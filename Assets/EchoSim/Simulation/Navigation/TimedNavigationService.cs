using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Headless timed navigation: authored symmetric travel minutes between
    /// location pairs, scheduler-driven arrivals, supersede/cancel semantics,
    /// stuck detection via a periodic sweep. Deterministic.
    /// </summary>
    public sealed class TimedNavigationService : INavigationService
    {
        private sealed class Trip
        {
            public LocationId Destination;
            public Action<NavigationArrival> OnArrive = null!;
            public long Generation;
            public SimTime ExpectedArrival;
        }

        private readonly SimulationWorld _world;
        private readonly Dictionary<AgentId, NavigationState> _states = new Dictionary<AgentId, NavigationState>();
        private readonly Dictionary<AgentId, Trip> _trips = new Dictionary<AgentId, Trip>();
        private readonly Dictionary<string, int> _travelMinutes = new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly Dictionary<AgentId, long> _generation = new Dictionary<AgentId, long>();

        /// <summary>Travel minutes used when a pair has no authored value.</summary>
        public int DefaultTravelMinutes { get; set; } = 15;
        /// <summary>En-route trips exceeding ExpectedArrival by this many minutes are declared stuck.</summary>
        public int StuckGraceMinutes { get; set; } = 10;

        public TimedNavigationService(SimulationWorld world, bool attachStuckSweep = true)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            if (attachStuckSweep)
                world.Scheduler.ScheduleRepeating(SimDuration.FromMinutes(5),
                    _ => CheckForStuck(_world.Clock.CurrentTime), "nav-stuck-sweep");
        }

        /// <summary>Authors symmetric travel time between two locations.</summary>
        public void SetTravelTime(LocationId a, LocationId b, int minutes)
        {
            if (minutes < 0) throw new ArgumentOutOfRangeException(nameof(minutes));
            if (a == b) return;
            _travelMinutes[PairKey(a, b)] = minutes;
            _travelMinutes[PairKey(b, a)] = minutes;
        }

        public int GetTravelTime(LocationId from, LocationId to)
        {
            if (from == to) return 0;
            return _travelMinutes.TryGetValue(PairKey(from, to), out var m) ? m : DefaultTravelMinutes;
        }

        private static string PairKey(LocationId a, LocationId b) =>
            string.CompareOrdinal(a.Value, b.Value) < 0 ? a.Value + "|" + b.Value : b.Value + "|" + a.Value;

        public NavigationRequestResult BeginMove(AgentId agent, LocationId destination, Action<NavigationArrival> onArrive)
        {
            if (onArrive == null) throw new ArgumentNullException(nameof(onArrive));

            var agentState = _world.Agents.Get(agent); // validates agent
            _world.Locations.Get(destination); // validates destination

            // Replace any active trip.
            Cancel(agent, NavigationFailure.Superseded);

            var from = agentState.CurrentLocationId;
            int minutes = GetTravelTime(from, destination);

            long gen = NextGeneration(agent);
            var now = _world.Clock.CurrentTime;

            _states[agent] = new NavigationState
            {
                Agent = agent,
                Destination = destination,
                Status = NavigationPathStatus.EnRoute,
                Failure = NavigationFailure.None,
                RemainingMinutes = minutes,
                ExpectedArrival = now.Add(SimDuration.FromMinutes(minutes)),
                StuckMinutes = 0
            };
            _trips[agent] = new Trip { Destination = destination, OnArrive = onArrive, Generation = gen, ExpectedArrival = now.Add(SimDuration.FromMinutes(minutes)) };

            _world.Scheduler.ScheduleIn(SimDuration.FromMinutes(minutes), _ => CompleteIfCurrent(agent, gen), "nav:" + agent.Value);

            // Zero-length trips complete immediately.
            if (minutes == 0) CompleteIfCurrent(agent, gen);
            return NavigationRequestResult.Ok();
        }

        private void CompleteIfCurrent(AgentId agent, long generation)
        {
            if (!_trips.TryGetValue(agent, out var trip) || trip.Generation != generation) return;
            _trips.Remove(agent);

            var state = _states[agent];
            var dest = state.Destination!.Value;

            if (!_world.Locations.TryGet(dest, out _))
            {
                state.Status = NavigationPathStatus.Failed;
                state.Failure = NavigationFailure.TargetDestroyed;
                state.Destination = null;
                trip.OnArrive(NavigationArrival.Failed(agent, dest, NavigationFailure.TargetDestroyed));
                return;
            }

            try
            {
                _world.MoveAgent(agent, dest);
                state.Status = NavigationPathStatus.Arrived;
                state.Failure = NavigationFailure.None;
                state.RemainingMinutes = 0;
                state.Destination = null;
                trip.OnArrive(NavigationArrival.Arrived(agent, dest));
            }
            catch (InvalidOperationException)
            {
                state.Status = NavigationPathStatus.Failed;
                state.Failure = NavigationFailure.DestinationBlocked;
                state.Destination = null;
                trip.OnArrive(NavigationArrival.Failed(agent, dest, NavigationFailure.DestinationBlocked));
            }
        }

        public bool Cancel(AgentId agent, NavigationFailure reason = NavigationFailure.Superseded)
        {
            if (!_trips.TryGetValue(agent, out var trip)) return false;
            var destination = trip.Destination;
            _trips.Remove(agent);
            NextGeneration(agent); // invalidates the pending arrival callback

            if (_states.TryGetValue(agent, out var state))
            {
                state.Status = NavigationPathStatus.Failed;
                state.Failure = reason;
                state.ExpectedArrival = null;
                state.RemainingMinutes = 0;
            }

            // Callers must always observe exactly one resolution.
            trip.OnArrive(NavigationArrival.Failed(agent, destination, reason));
            return true;
        }

        public NavigationState GetState(AgentId agent)
        {
            if (_states.TryGetValue(agent, out var s)) return s;
            return new NavigationState { Agent = agent, Status = NavigationPathStatus.Idle, Failure = NavigationFailure.None };
        }

        /// <summary>Declares en-route trips stuck once they pass their ETA + grace.</summary>
        public void CheckForStuck(SimTime now)
        {
            List<AgentId>? stuck = null;
            foreach (var kv in _trips)
            {
                var state = _states[kv.Key];
                if (state.ExpectedArrival.HasValue && now > state.ExpectedArrival.Value.Add(SimDuration.FromMinutes(StuckGraceMinutes)))
                {
                    state.StuckMinutes = (int)(now - state.ExpectedArrival.Value).TotalMinutes - StuckGraceMinutes;
                    (stuck ??= new List<AgentId>()).Add(kv.Key);
                }
            }
            if (stuck == null) return;
            foreach (var agent in stuck)
            {
                var trip = _trips[agent];
                _trips.Remove(agent);
                NextGeneration(agent);
                var state = _states[agent];
                state.Status = NavigationPathStatus.Failed;
                state.Failure = NavigationFailure.NoProgress;
                trip.OnArrive(NavigationArrival.Failed(agent, state.Destination!.Value, NavigationFailure.NoProgress));
            }
        }

        private long NextGeneration(AgentId agent)
        {
            long g = (_generation.TryGetValue(agent, out var v) ? v : 0) + 1;
            _generation[agent] = g;
            return g;
        }
    }
}
