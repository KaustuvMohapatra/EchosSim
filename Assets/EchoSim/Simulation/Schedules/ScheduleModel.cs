using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>How firmly a schedule entry pulls (spec §5.2). Emergencies still win.</summary>
    public enum ScheduleImportance
    {
        Optional = 0,
        Preferred = 1,
        Important = 2,
        Mandatory = 3
    }

    /// <summary>One scheduled block inside a day. End may wrap past midnight.</summary>
    public sealed class ScheduleEntry
    {
        public string Activity { get; }
        public int StartMinuteOfDay { get; }
        public int EndMinuteOfDay { get; }
        public ScheduleImportance Importance { get; }

        public ScheduleEntry(string activity, int startMinuteOfDay, int endMinuteOfDay,
            ScheduleImportance importance = ScheduleImportance.Preferred)
        {
            if (string.IsNullOrWhiteSpace(activity)) throw new ArgumentException("Activity label required.", nameof(activity));
            if ((uint)startMinuteOfDay > 1439 || (uint)endMinuteOfDay > 1439)
                throw new ArgumentOutOfRangeException(nameof(startMinuteOfDay), "Minutes must be within [0,1439].");
            Activity = activity;
            StartMinuteOfDay = startMinuteOfDay;
            EndMinuteOfDay = endMinuteOfDay;
            Importance = importance;
        }

        public bool Contains(int minuteOfDay)
        {
            return StartMinuteOfDay <= EndMinuteOfDay
                ? minuteOfDay >= StartMinuteOfDay && minuteOfDay <= EndMinuteOfDay
                : minuteOfDay >= StartMinuteOfDay || minuteOfDay <= EndMinuteOfDay;
        }
    }

    /// <summary>A single day profile: ordered entries.</summary>
    public sealed class DailySchedule
    {
        private readonly List<ScheduleEntry> _entries;

        public DailySchedule(IEnumerable<ScheduleEntry> entries)
        {
            _entries = entries?.OrderBy(e => e.StartMinuteOfDay).ToList() ?? new List<ScheduleEntry>();
        }

        public IReadOnlyList<ScheduleEntry> Entries => _entries;

        public ScheduleEntry? EntryAt(int minuteOfDay)
        {
            foreach (var e in _entries)
                if (e.Contains(minuteOfDay)) return e;
            return null;
        }

        public static DailySchedule Empty() => new DailySchedule(new ScheduleEntry[0]);
    }

    /// <summary>
    /// Weekday/weekend profiles plus per-day overrides (spec §5.7).
    /// Day 0 of the epoch is Monday.
    /// </summary>
    public sealed class WeeklySchedule
    {
        public DailySchedule Weekday { get; }
        public DailySchedule Weekend { get; }
        /// <summary>dayNumber -> profile. Null value means "nothing scheduled".</summary>
        private readonly Dictionary<int, DailySchedule?> _overrides = new Dictionary<int, DailySchedule?>();

        public WeeklySchedule(DailySchedule? weekday = null, DailySchedule? weekend = null)
        {
            Weekday = weekday ?? DailySchedule.Empty();
            Weekend = weekend ?? DailySchedule.Empty();
        }

        public void Override(int dayNumber, DailySchedule? profile) => _overrides[dayNumber] = profile;

        public bool HasOverride(int dayNumber) => _overrides.ContainsKey(dayNumber);

        public DailySchedule ProfileFor(SimTime time)
        {
            if (_overrides.TryGetValue(time.DayNumber, out var o))
                return o ?? DailySchedule.Empty();
            return time.IsWeekend ? Weekend : Weekday;
        }

        public ScheduleEntry? EntryAt(SimTime time) => ProfileFor(time).EntryAt(time.MinuteOfDay);
    }

    /// <summary>
    /// Authored employment: workplace, shift window (may wrap midnight), income.
    /// Preferred skills and attendance expectations arrive with Sprint 24's
    /// long-term goals; income is stored now for the Sprint 15 economy.
    /// </summary>
    public sealed class JobDefinition
    {
        public string Id { get; }
        public string Title { get; }
        public LocationId Workplace { get; }
        public int ShiftStartMinuteOfDay { get; }
        public int ShiftEndMinuteOfDay { get; }
        public float IncomePerHour { get; }
        public ActionId WorkAction { get; }

        public JobDefinition(string id, string title, LocationId workplace,
            int shiftStartMinuteOfDay, int shiftEndMinuteOfDay,
            float incomePerHour, string workActionId = "act_work")
        {
            if (string.IsNullOrWhiteSpace(id)) throw new ArgumentException("Job id required.", nameof(id));
            if (incomePerHour < 0f) throw new ArgumentOutOfRangeException(nameof(incomePerHour));
            Id = id;
            Title = title;
            Workplace = workplace;
            ShiftStartMinuteOfDay = shiftStartMinuteOfDay;
            ShiftEndMinuteOfDay = shiftEndMinuteOfDay;
            IncomePerHour = incomePerHour;
            WorkAction = new ActionId(workActionId);
        }

        public bool IsWithinShift(int minuteOfDay)
            => ShiftStartMinuteOfDay <= ShiftEndMinuteOfDay
                ? minuteOfDay >= ShiftStartMinuteOfDay && minuteOfDay <= ShiftEndMinuteOfDay
                : minuteOfDay >= ShiftStartMinuteOfDay || minuteOfDay <= ShiftEndMinuteOfDay;

        /// <summary>Late-arrival helper: positive when start happened after shift start (+offset).</summary>
        public static int MinutesLate(int actualStartMinuteOfDay, int nominalStartMinuteOfDay)
        {
            int delta = actualStartMinuteOfDay - nominalStartMinuteOfDay;
            if (delta > 720) delta -= 1440; // wrapped-midnight shifts
            if (delta < -720) delta += 1440;
            return Math.Max(0, delta);
        }
    }

    /// <summary>
    /// Owns job definitions and assignments; computes on-shift state and the
    /// 0..1 schedule pressure that feeds goal utility through the custom term
    /// wired via <see cref="CognitionSystem.SetSchedulePressureProvider"/>.
    /// </summary>
    public sealed class JobSystem
    {
        private readonly SimulationWorld _world;
        private readonly Dictionary<string, JobDefinition> _jobs = new Dictionary<string, JobDefinition>(StringComparer.Ordinal);

        public JobSystem(SimulationWorld world)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
        }

        public void Define(JobDefinition job) => _jobs.Add(job.Id, job);

        public JobDefinition Get(string jobId)
        {
            if (!_jobs.TryGetValue(jobId, out var job))
                throw new KeyNotFoundException($"Unknown job '{jobId}'.");
            return job!;
        }

        public void Assign(AgentId agent, string jobId)
        {
            var mind = _world.Residents.Get(agent);
            mind.Job = Get(jobId);
        }

        /// <summary>Per-resident routine offset (spec §5.6) shifts personal shift bounds.</summary>
        private static (int start, int end) Shifted(JobDefinition job, AgentMind mind)
        {
            int off = mind.RoutineOffsetMinutes;
            int s = Mod(job.ShiftStartMinuteOfDay + off, 1440);
            int e = Mod(job.ShiftEndMinuteOfDay + off, 1440);
            return (s, e);
        }

        private static int Mod(int v, int m) => ((v % m) + m) % m;

        public bool IsOnShift(AgentId agent, SimTime time)
        {
            var mind = _world.Residents.Get(agent);
            if (mind.Job == null) return false;
            var (s, e) = Shifted(mind.Job, mind);
            return WithinWindow(time.MinuteOfDay, s, e);
        }

        /// <summary>
        /// True across the pressure shoulders (±30 min around the shifted shift),
        /// i.e., whenever employment pulls on the resident. Planning uses this so
        /// commute legs can form just before a strict shift window opens.
        /// </summary>
        public bool IsExpectedToWork(AgentId agent, SimTime time)
            => mind_job(_world, agent) != null && ComputePressure(agent, time) > 0f;

        private static JobDefinition? mind_job(SimulationWorld world, AgentId agent)
            => world.Residents.Get(agent).Job;

        /// <summary>
        /// 0 outside working hours; 1.0 across the (offset-adjusted) shift;
        /// linear ±30-minute shoulders so agents drift toward work instead of
        /// teleporting into urgency. An explicitly empty day profile is a rest day.
        /// </summary>
        public float ComputePressure(AgentId agent, SimTime time)
        {
            var mind = _world.Residents.Get(agent);
            var job = mind.Job;
            if (job == null) return 0f;

            // Explicit rest day: the assigned weekly profile is empty for this date.
            if (mind.Schedule != null && mind.Schedule.ProfileFor(time).Entries.Count == 0)
                return 0f;

            var (start, end) = Shifted(job, mind);
            int minute = time.MinuteOfDay;

            if (WithinWindow(minute, start, end)) return 1f;

            const int Shoulder = 30;
            int minutesToStart = CircularForward(minute, start);
            int minutesPastEnd = CircularForward(end, minute);

            if (minutesToStart <= Shoulder)
                return 1f * (1f - minutesToStart / (float)Shoulder) * 0.9f;
            if (minutesPastEnd <= Shoulder)
                return 1f * (1f - minutesPastEnd / (float)Shoulder) * 0.9f;
            return 0f;
        }

        private static bool WithinWindow(int minute, int start, int end)
            => start <= end ? minute >= start && minute <= end : minute >= start || minute <= end;

        private static int CircularForward(int from, int to) => (to - from + 1440) % 1440;
    }
}
