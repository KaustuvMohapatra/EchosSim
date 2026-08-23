using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>How an observation reached someone (spec §6.1/§6.2).</summary>
    public enum PerceptionSource
    {
        DirectParticipation,
        VisualNearby,
        AudibleNearby,
        Announcement
    }

    /// <summary>How far an event carries (spec §6.3). Headless model: discrete locations.</summary>
    public enum ObservationReach
    {
        /// <summary>Quiet: only agents sharing the location perceive it.</summary>
        SameLocation,
        /// <summary>Loud: also carries to adjacent locations.</summary>
        Nearby,
        /// <summary>Broad: the whole population hears it.</summary>
        Town
    }

    /// <summary>An event as it exists in the world, before any observer sees it.</summary>
    public sealed class ObservableEvent
    {
        public EventId Id { get; }
        public string Type { get; }
        public AgentId[] Actors { get; }
        public LocationId? Where { get; }
        public SimTime AtTime { get; }
        public ObservationReach Reach { get; }

        internal ObservableEvent(EventId id, string type, AgentId[] actors,
            LocationId? where, SimTime atTime, ObservationReach reach)
        {
            Id = id;
            Type = type;
            Actors = actors;
            Where = where;
            AtTime = atTime;
            Reach = reach;
        }
    }

    /// <summary>
    /// An event as known by ONE resident. Knowledge is personal: two residents may
    /// hold observations of the same event with different sources and confidence.
    /// </summary>
    public readonly struct Observation
    {
        public AgentId Observer { get; }
        public EventId Event { get; }
        public string EventType { get; }
        public AgentId[] Actors { get; }
        public LocationId? Where { get; }
        public SimTime Timestamp { get; }
        /// <summary>0..1; degrades with distance/source. Memory encoding weighs this (Sprint 7).</summary>
        public float Confidence { get; }
        public PerceptionSource Source { get; }

        internal Observation(AgentId observer, ObservableEvent evt, float confidence, PerceptionSource source)
        {
            Observer = observer;
            Event = evt.Id;
            EventType = evt.Type;
            Actors = evt.Actors;
            Where = evt.Where;
            Timestamp = evt.AtTime;
            Confidence = confidence;
            Source = source;
        }

        public override string ToString() =>
            $"{EventType}@{Where}:{(Where.HasValue ? "" : "")} src={Source} conf={Confidence.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}";
    }
}
