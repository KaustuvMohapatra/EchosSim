using System;
using System.Globalization;

namespace EchoSim.Core
{
    /// <summary>Day of week inside the simulation. Day 0 of the epoch is Monday.</summary>
    public enum SimDayOfWeek
    {
        Monday = 0,
        Tuesday = 1,
        Wednesday = 2,
        Thursday = 3,
        Friday = 4,
        Saturday = 5,
        Sunday = 6
    }

    /// <summary>
    /// A span of simulated time with minute granularity.
    /// Deterministic across platforms: no floating point accumulation.
    /// </summary>
    public readonly struct SimDuration : IEquatable<SimDuration>, IComparable<SimDuration>
    {
        public const long MinutesPerHour = 60L;
        public const long MinutesPerDay = 1440L;

        public long TotalMinutes { get; }

        public SimDuration(long totalMinutes)
        {
            if (totalMinutes < 0)
                throw new ArgumentOutOfRangeException(nameof(totalMinutes), "Simulated durations cannot be negative.");
            TotalMinutes = totalMinutes;
        }

        public static SimDuration FromMinutes(long minutes) => new SimDuration(minutes);
        public static SimDuration FromHours(long hours) => new SimDuration(checked(hours * MinutesPerHour));
        public static SimDuration FromDays(long days) => new SimDuration(checked(days * MinutesPerDay));

        public double TotalHours => TotalMinutes / (double)MinutesPerHour;
        public double TotalDays => TotalMinutes / (double)MinutesPerDay;

        public SimDuration Add(SimDuration other) => new SimDuration(checked(TotalMinutes + other.TotalMinutes));

        public bool Equals(SimDuration other) => TotalMinutes == other.TotalMinutes;
        public int CompareTo(SimDuration other) => TotalMinutes.CompareTo(other.TotalMinutes);
        public override bool Equals(object? obj) => obj is SimDuration other && Equals(other);
        public override int GetHashCode() => TotalMinutes.GetHashCode();
        public override string ToString() =>
            TotalMinutes.ToString(CultureInfo.InvariantCulture) + "m";

        public static SimDuration operator +(SimDuration a, SimDuration b) => new SimDuration(checked(a.TotalMinutes + b.TotalMinutes));
        public static SimDuration operator -(SimDuration a, SimDuration b)
        {
            long result = checked(a.TotalMinutes - b.TotalMinutes);
            if (result < 0) throw new ArgumentOutOfRangeException(nameof(b), "Duration subtraction underflow.");
            return new SimDuration(result);
        }
        public static bool operator ==(SimDuration left, SimDuration right) => left.Equals(right);
        public static bool operator !=(SimDuration left, SimDuration right) => !left.Equals(right);
        public static bool operator <(SimDuration left, SimDuration right) => left.CompareTo(right) < 0;
        public static bool operator >(SimDuration left, SimDuration right) => left.CompareTo(right) > 0;
        public static bool operator <=(SimDuration left, SimDuration right) => left.CompareTo(right) <= 0;
        public static bool operator >=(SimDuration left, SimDuration right) => left.CompareTo(right) >= 0;
    }

    /// <summary>
    /// A point in simulated time, stored as total minutes since the epoch.
    /// Epoch: Day 0 is Monday 00:00. Immutable value type.
    /// </summary>
    public readonly struct SimTime : IEquatable<SimTime>, IComparable<SimTime>
    {
        public const long MinutesPerHour = SimDuration.MinutesPerHour;
        public const long MinutesPerDay = SimDuration.MinutesPerDay;

        public static readonly SimTime Epoch = default;

        public long TotalMinutes { get; }

        public SimTime(long totalMinutes)
        {
            if (totalMinutes < 0)
                throw new ArgumentOutOfRangeException(nameof(totalMinutes), "Simulation time cannot precede the epoch.");
            TotalMinutes = totalMinutes;
        }

        public SimTime(int dayNumber, int hour, int minute)
        {
            if (dayNumber < 0) throw new ArgumentOutOfRangeException(nameof(dayNumber));
            if ((uint)hour > 23u) throw new ArgumentOutOfRangeException(nameof(hour), "Hour must be within [0,23].");
            if ((uint)minute > 59u) throw new ArgumentOutOfRangeException(nameof(minute), "Minute must be within [0,59].");
            TotalMinutes = ((long)dayNumber * MinutesPerDay) + (hour * MinutesPerHour) + minute;
        }

        public int DayNumber => checked((int)(TotalMinutes / MinutesPerDay));
        public int MinuteOfDay => checked((int)(TotalMinutes % MinutesPerDay));
        public int Hour => MinuteOfDay / 60;
        public int Minute => MinuteOfDay % 60;
        public SimDayOfWeek DayOfWeek => (SimDayOfWeek)(DayNumber % 7);
        public bool IsWeekend => DayOfWeek == SimDayOfWeek.Saturday || DayOfWeek == SimDayOfWeek.Sunday;

        public SimTime Add(SimDuration duration) => new SimTime(checked(TotalMinutes + duration.TotalMinutes));
        public SimTime Subtract(SimDuration duration)
        {
            long result = checked(TotalMinutes - duration.TotalMinutes);
            if (result < 0) throw new ArgumentOutOfRangeException(nameof(duration), "Resulting time precedes the epoch.");
            return new SimTime(result);
        }
        public SimDuration DifferenceTo(SimTime later) => new SimDuration(checked(later.TotalMinutes - TotalMinutes));

        public bool IsWithinInclusiveWindow(int startHour, int startMinute, int endHour, int endMinute)
        {
            int mod = MinuteOfDay;
            int start = startHour * 60 + startMinute;
            int end = endHour * 60 + endMinute;
            return start <= end ? mod >= start && mod <= end : mod >= start || mod <= end;
        }

        public bool Equals(SimTime other) => TotalMinutes == other.TotalMinutes;
        public int CompareTo(SimTime other) => TotalMinutes.CompareTo(other.TotalMinutes);
        public override bool Equals(object? obj) => obj is SimTime other && Equals(other);
        public override int GetHashCode() => TotalMinutes.GetHashCode();
        public override string ToString() =>
            "D" + DayNumber.ToString(CultureInfo.InvariantCulture) + " " +
            Hour.ToString("00", CultureInfo.InvariantCulture) + ":" +
            Minute.ToString("00", CultureInfo.InvariantCulture);

        public static SimTime operator +(SimTime time, SimDuration duration) => time.Add(duration);
        public static SimDuration operator -(SimTime later, SimTime earlier) => earlier.DifferenceTo(later);
        public static bool operator ==(SimTime left, SimTime right) => left.Equals(right);
        public static bool operator !=(SimTime left, SimTime right) => !left.Equals(right);
        public static bool operator <(SimTime left, SimTime right) => left.CompareTo(right) < 0;
        public static bool operator >(SimTime left, SimTime right) => left.CompareTo(right) > 0;
        public static bool operator <=(SimTime left, SimTime right) => left.CompareTo(right) <= 0;
        public static bool operator >=(SimTime left, SimTime right) => left.CompareTo(right) >= 0;
    }
}
