using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Converts world activity into per-resident observations (spec §6).
    /// Simplified occlusion model: perception is location-based — co-located
    /// residents see; adjacent residents hear loud events; announcements reach
    /// everyone. A spatial vision model is deliberately deferred (spec §6.4).
    /// </summary>
    public sealed class PerceptionSystem
    {
        private readonly SimulationWorld _world;
        private readonly Dictionary<AgentId, List<Observation>> _logs = new Dictionary<AgentId, List<Observation>>();
        private long _nextEventId = 1;
        private int _logCapacity = 200;

        /// <summary>Maximum retained observations per resident (oldest evicted).</summary>
        public int LogCapacity
        {
            get => _logCapacity;
            set { if (value < 1) throw new ArgumentOutOfRangeException(nameof(value)); _logCapacity = value; }
        }

        /// <summary>Total observations delivered (diagnostics).</summary>
        public long TotalDelivered { get; private set; }

        public PerceptionSystem(SimulationWorld world)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));

            // Auto-sources: movement and activity are visual/same-location;
            // opening-hours changes carry to adjacent locations (signage + chatter).
            _world.Events.Subscribe<AgentMovedEvent>(e =>
                Publish("movement", new[] { e.Agent }, e.ToLocation, ObservationReach.SameLocation));
            _world.Events.Subscribe<PlanStepCompletedEvent>(e =>
                Publish("activity:" + e.Action.Value,
                    new[] { e.Agent },
                    _world.Agents.Get(e.Agent).CurrentLocationId,
                    ObservationReach.SameLocation));
            _world.Events.Subscribe<LocationOpenStateChangedEvent>(e =>
                Publish(e.IsOpen ? "location_opened" : "location_closed",
                    Array.Empty<AgentId>(), e.Location, ObservationReach.Nearby));
        }

        /// <summary>
        /// Introduces an observable event into the world and delivers it.
        /// Participants always observe directly regardless of reach.
        /// </summary>
        public EventId Publish(string eventType, AgentId[] actors,
            LocationId? where, ObservationReach reach, float baseConfidence = 1f)
        {
            if (string.IsNullOrWhiteSpace(eventType))
                throw new ArgumentException("Event type required.", nameof(eventType));

            var evt = new ObservableEvent(new EventId(_nextEventId++), eventType,
                actors ?? Array.Empty<AgentId>(), where, _world.Clock.CurrentTime, reach);
            Deliver(evt, baseConfidence);
            return evt.Id;
        }

        /// <summary>Town-wide announcement (spec §6.3).</summary>
        public EventId Announce(string eventType, AgentId[] actors, LocationId? origin)
            => Publish(eventType, actors, origin, ObservationReach.Town);

        private void Deliver(ObservableEvent evt, float baseConfidence)
        {
            var ids = _world.Residents.OrderedIds;

            for (int i = 0; i < ids.Count; i++)
            {
                var observerId = ids[i];
                var observerState = _world.Agents.TryGet(observerId, out var st) ? st : null;

                bool participant = Contains(evt.Actors, observerId);

                if (participant)
                {
                    Append(observerId, new Observation(observerId, evt, baseConfidence, PerceptionSource.DirectParticipation));
                    continue;
                }

                switch (evt.Reach)
                {
                    case ObservationReach.Town:
                        Append(observerId, new Observation(observerId, evt, 0.95f * baseConfidence, PerceptionSource.Announcement));
                        break;

                    case ObservationReach.Nearby:
                        if (observerState != null && observerState.HasLocation &&
                            SharesOrAdjacent(observerState.CurrentLocationId, evt.Where))
                        {
                            bool same = evt.Where.HasValue && observerState.CurrentLocationId == evt.Where.Value;
                            var source = same ? PerceptionSource.VisualNearby : PerceptionSource.AudibleNearby;
                            float conf = same ? 0.90f * baseConfidence : 0.70f * baseConfidence;
                            Append(observerId, new Observation(observerId, evt, conf, source));
                        }
                        break;

                    case ObservationReach.SameLocation:
                        if (observerState != null && observerState.HasLocation &&
                            evt.Where.HasValue && observerState.CurrentLocationId == evt.Where.Value)
                        {
                            Append(observerId, new Observation(observerId, evt, 0.90f * baseConfidence, PerceptionSource.VisualNearby));
                        }
                        break;
                }
            }
        }

        private bool SharesOrAdjacent(LocationId a, LocationId? b)
        {
            if (!b.HasValue) return false;
            if (a == b.Value) return true;
            return _world.AreAdjacent(a, b.Value);
        }

        private static bool Contains(AgentId[] list, AgentId id)
        {
            for (int i = 0; i < list.Length; i++)
                if (list[i] == id) return true;
            return false;
        }

        private void Append(AgentId observer, Observation observation)
        {
            if (!_logs.TryGetValue(observer, out var log))
            {
                log = new List<Observation>();
                _logs.Add(observer, log);
            }
            log.Add(observation);
            if (log.Count > _logCapacity)
                log.RemoveAt(0);
            TotalDelivered++;
        }

        /// <summary>The resident's personal observation history, oldest first.</summary>
        public IReadOnlyList<Observation> ObservationsOf(AgentId agent)
            => _logs.TryGetValue(agent, out var log) ? log : (IReadOnlyList<Observation>)Array.Empty<Observation>();

        /// <summary>Most recent N observations of a given type (Sprint 7 memory encoding will consume this).</summary>
        public IReadOnlyList<Observation> RecentOf(AgentId agent, string eventTypePrefix, int max)
        {
            var result = new List<Observation>();
            var log = ObservationsOf(agent);
            for (int i = log.Count - 1; i >= 0 && result.Count < max; i--)
                if (log[i].EventType.StartsWith(eventTypePrefix, StringComparison.Ordinal))
                    result.Add(log[i]);
            result.Reverse();
            return result;
        }

        public int DistinctObserversObserved => _logs.Count;
    }
}
