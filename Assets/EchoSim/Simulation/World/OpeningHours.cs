using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Daily opening window; may wrap midnight. Null = always open.</summary>
    public readonly struct OpeningHours
    {
        public int OpenMinuteOfDay { get; }
        public int CloseMinuteOfDay { get; }

        public OpeningHours(int openMinuteOfDay, int closeMinuteOfDay)
        {
            if ((uint)openMinuteOfDay > 1439 || (uint)closeMinuteOfDay > 1439)
                throw new ArgumentOutOfRangeException(nameof(openMinuteOfDay), "Minutes must be within [0,1439].");
            OpenMinuteOfDay = openMinuteOfDay;
            CloseMinuteOfDay = closeMinuteOfDay;
        }

        public static OpeningHours FromClock(int openHour, int openMinute, int closeHour, int closeMinute)
            => new OpeningHours(openHour * 60 + openMinute, closeHour * 60 + closeMinute);

        public bool IsOpenAt(int minuteOfDay)
            => OpenMinuteOfDay <= CloseMinuteOfDay
                ? minuteOfDay >= OpenMinuteOfDay && minuteOfDay <= CloseMinuteOfDay
                : minuteOfDay >= OpenMinuteOfDay || minuteOfDay <= CloseMinuteOfDay;

        public override string ToString() =>
            OpenMinuteOfDay.ToString(System.Globalization.CultureInfo.InvariantCulture) + "-" +
            CloseMinuteOfDay.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    /// <summary>Raised when a location's open state flips (spec §5.5).</summary>
    public readonly struct LocationOpenStateChangedEvent : ISimulationEvent
    {
        public LocationId Location { get; }
        public bool IsOpen { get; }
        public SimTime AtTime { get; }

        public LocationOpenStateChangedEvent(LocationId location, bool isOpen, SimTime atTime)
        {
            Location = location;
            IsOpen = isOpen;
            AtTime = atTime;
        }
    }

    /// <summary>
    /// Keeps authored opening hours in sync with the clock and announces changes.
    /// Manual closures via <see cref="LocationRuntimeState.SetOpen"/> always win.
    /// </summary>
    public sealed class OpeningHoursSystem
    {
        private readonly SimulationWorld _world;

        public OpeningHoursSystem(SimulationWorld world, bool attachHourlySweep = true)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            if (attachHourlySweep)
                _world.Scheduler.ScheduleRepeating(SimDuration.FromMinutes(60),
                    t => UpdateAll(t), "opening-hours-sweep");
        }

        /// <summary>Idempotent refresh; returns the set of locations that flipped.</summary>
        public List<LocationId> UpdateAll(SimTime now)
        {
            var changed = new List<LocationId>();
            foreach (var id in _world.Locations.OrderedIds)
            {
                var runtime = _world.Locations.Get(id);
                if (runtime.RefreshFromHours(now))
                {
                    changed.Add(id);
                    _world.Events.Publish(new LocationOpenStateChangedEvent(id, runtime.IsOpen, now));
                }
            }
            return changed;
        }
    }
}
