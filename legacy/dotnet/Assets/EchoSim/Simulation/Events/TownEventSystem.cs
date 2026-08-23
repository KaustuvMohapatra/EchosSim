using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Authored recurring town gathering (spec Sprint 17).</summary>
    public sealed class TownEventDefinition
    {
        public string Key { get; }
        public string Title { get; }
        public LocationId Where { get; }
        public SimDayOfWeek Day { get; }
        public int StartMinuteOfDay { get; }
        public int DurationMinutes { get; }
        public float Interest { get; }

        public TownEventDefinition(string key, string title, LocationId where,
            SimDayOfWeek day, int startMinuteOfDay, int durationMinutes, float interest = 0.6f)
        {
            if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Key required.", nameof(key));
            Key = key; Title = title; Where = where; Day = day;
            StartMinuteOfDay = startMinuteOfDay; DurationMinutes = durationMinutes;
            Interest = Math.Clamp(interest, 0f, 1f);
        }

        public bool IsActiveOn(SimTime time)
        {
            if (time.DayOfWeek != Day) return false;
            int minute = time.MinuteOfDay;
            return minute >= StartMinuteOfDay && minute < StartMinuteOfDay + DurationMinutes;
        }
    }

    public readonly struct TownEventStartedEvent : ISimulationEvent
    {
        public string Key { get; }
        public string Title { get; }
        public LocationId Where { get; }
        public SimTime AtTime { get; }

        public TownEventStartedEvent(string key, string title, LocationId where, SimTime atTime)
        {
            Key = key; Title = title; Where = where; AtTime = atTime;
        }
    }

    /// <summary>
    /// Activates authored gatherings at their windows and announces them
    /// town-wide so awareness spreads through the normal perception pipeline.
    /// </summary>
    public sealed class TownEventSystem
    {
        private readonly SimulationWorld _world;
        private readonly PerceptionSystem _perception;
        private readonly Dictionary<string, TownEventDefinition> _events =
            new Dictionary<string, TownEventDefinition>(StringComparer.Ordinal);
        private readonly HashSet<string> _announcedToday = new HashSet<string>(StringComparer.Ordinal);
        private int _lastAnnouncedDay = -1;

        public TownEventSystem(SimulationWorld world, PerceptionSystem perception)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _perception = perception ?? throw new ArgumentNullException(nameof(perception));
            _world.Scheduler.ScheduleRepeating(SimDuration.FromMinutes(30),
                t => Update(t), "town-event-sweep");
        }

        public void Define(TownEventDefinition def) => _events.Add(def.Key, def);

        public TownEventDefinition? ActiveEventAt(SimTime time)
        {
            foreach (var kv in _events)
                if (kv.Value.IsActiveOn(time)) return kv.Value;
            return null;
        }

        /// <summary>Checks activation windows; announces each event once per day.</summary>
        public void Update(SimTime now) => Sweep(now);

        private void Sweep(SimTime now)
        {
            if (now.DayNumber != _lastAnnouncedDay)
            {
                _announcedToday.Clear();
                _lastAnnouncedDay = now.DayNumber;
            }

            foreach (var kv in _events)
            {
                var def = kv.Value;
                if (!def.IsActiveOn(now)) continue;
                if (_announcedToday.Contains(def.Key)) continue;

                // Announce once per activation, minutes after opening.
                if (now.MinuteOfDay >= def.StartMinuteOfDay + 30 || now.MinuteOfDay == def.StartMinuteOfDay)
                {
                    _announcedToday.Add(def.Key);
                    _perception.Announce("town_event_" + def.Key, Array.Empty<AgentId>(), def.Where);
                    _world.Events.Publish(new TownEventStartedEvent(def.Key, def.Title, def.Where, now));
                }
            }
        }
    }

    /// <summary>Conditionally eligible authored moments (spec Sprint 17 storylets).</summary>
    public sealed class Storylet
    {
        public string Key { get; }
        public Func<StoryletContext, bool> Condition { get; }
        public Action<StoryletContext>? Effect { get; }
        public double CooldownHours { get; }

        public Storylet(string key, Func<StoryletContext, bool> condition,
            Action<StoryletContext>? effect = null, double cooldownHours = 24.0)
        {
            if (string.IsNullOrWhiteSpace(key)) throw new ArgumentException("Key required.", nameof(key));
            Key = key;
            Condition = condition ?? throw new ArgumentNullException(nameof(condition));
            Effect = effect;
            CooldownHours = cooldownHours;
        }
    }

    public sealed class StoryletContext
    {
        public SimulationWorld World { get; }
        public AgentId Subject { get; }
        public AgentId Other { get; }
        public SimTime Time { get; }

        internal StoryletContext(SimulationWorld world, AgentId subject, AgentId other, SimTime time)
        {
            World = world; Subject = subject; Other = other; Time = time;
        }
    }

    /// <summary>
    /// Storylets add opportunities, never force outcomes: when a pair's context
    /// satisfies a condition, the engine emits an observable moment that other
    /// systems (memory, beliefs) treat like any event.
    /// </summary>
    public sealed class StoryletEngine
    {
        private readonly SimulationWorld _world;
        private readonly PerceptionSystem _perception;
        private readonly Dictionary<string, Storylet> _storylets = new Dictionary<string, Storylet>(StringComparer.Ordinal);
        private readonly Dictionary<string, SimTime> _lastFired = new Dictionary<string, SimTime>(StringComparer.Ordinal);

        public long FiredCount { get; private set; }

        public StoryletEngine(SimulationWorld world, PerceptionSystem perception)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _perception = perception ?? throw new ArgumentNullException(nameof(perception));
        }

        public void Register(Storylet storylet) => _storylets.Add(storylet.Key, storylet);

        /// <summary>Evaluates one ordered pair; returns the fired storylet key or null.</summary>
        public string? EvaluatePair(AgentId subject, AgentId other)
        {
            var ctx = new StoryletContext(_world, subject, other, _world.Clock.CurrentTime);

            foreach (var kv in _storylets)
            {
                var s = kv.Value;
                if (_lastFired.TryGetValue(s.Key, out var last) &&
                    (ctx.Time - last).TotalHours < s.CooldownHours)
                    continue;
                try
                {
                    if (!s.Condition(ctx)) continue;
                }
                catch (Exception ex)
                {
                    throw new InvalidOperationException($"Storylet '{s.Key}' condition threw.", ex);
                }

                _lastFired[s.Key] = ctx.Time;
                FiredCount++;
                _perception.Publish("storylet_" + s.Key, new[] { subject, other },
                    CurrentLocation(subject), ObservationReach.SameLocation);
                s.Effect?.Invoke(ctx);
                return s.Key;
            }
            return null;
        }

        private LocationId? CurrentLocation(AgentId id) =>
            _world.Agents.TryGet(id, out var s) && s.HasLocation ? s.CurrentLocationId : null;
    }
}
