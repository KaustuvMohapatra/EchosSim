using System;
using System.Collections.Generic;

namespace EchoSim.Core
{
    /// <summary>Handle to a scheduled operation. Pass to <see cref="SimulationScheduler.Cancel"/>.</summary>
    public readonly struct ScheduledOperationHandle : IEquatable<ScheduledOperationHandle>
    {
        public long Value { get; }

        public ScheduledOperationHandle(long value) { Value = value; }

        public bool IsValid => Value > 0;
        public bool Equals(ScheduledOperationHandle other) => Value == other.Value;
        public override bool Equals(object? obj) => obj is ScheduledOperationHandle other && Equals(other);
        public override int GetHashCode() => Value.GetHashCode();
        public override string ToString() => $"Sched#{Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
        public static bool operator ==(ScheduledOperationHandle a, ScheduledOperationHandle b) => a.Equals(b);
        public static bool operator !=(ScheduledOperationHandle a, ScheduledOperationHandle b) => !a.Equals(b);
    }

    /// <summary>
    /// Deterministic scheduler for simulation operations. Time source is the
    /// <see cref="SimulationClock"/>; due work executes when the clock advances past
    /// its deadline, ordered by (due time, schedule sequence). Repeating operations
    /// re-arm from their previous deadline (no drift). Not related to Unity Invoke.
    /// </summary>
    public sealed class SimulationScheduler
    {
        private sealed class Entry
        {
            public long Sequence;
            public SimTime Due;
            public SimDuration RepeatInterval;
            public Action<SimTime> Callback = null!;
            public string? Label;
            public bool Cancelled;
        }

        private readonly SimulationClock _clock;
        private readonly List<Entry> _queue = new List<Entry>();
        private long _nextSequence = 1;

        public SimulationScheduler(SimulationClock clock)
        {
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
            _clock.TimeAdvanced += OnTimeAdvanced;
        }

        public SimulationClock Clock => _clock;
        public int PendingCount { get { int count = 0; for (int i = 0; i < _queue.Count; i++) if (!_queue[i].Cancelled) count++; return count; } }
        public long TotalScheduled { get; private set; }
        public long TotalExecuted { get; private set; }
        public long TotalCancelled { get; private set; }

        /// <summary>Schedules a one-shot callback at an absolute simulated time.</summary>
        public ScheduledOperationHandle ScheduleAt(SimTime when, Action<SimTime> callback, string? label = null)
        {
            if (callback == null) throw new ArgumentNullException(nameof(callback));
            return Enqueue(when, SimDuration.FromMinutes(0), callback, label);
        }

        /// <summary>Schedules a one-shot callback after a delay from the current sim time.</summary>
        public ScheduledOperationHandle ScheduleIn(SimDuration delay, Action<SimTime> callback, string? label = null)
        {
            if (callback == null) throw new ArgumentNullException(nameof(callback));
            return Enqueue(_clock.CurrentTime.Add(delay), SimDuration.FromMinutes(0), callback, label);
        }

        /// <summary>Schedules a repeating callback; first run occurs one interval from now.</summary>
        public ScheduledOperationHandle ScheduleRepeating(SimDuration interval, Action<SimTime> callback, string? label = null)
        {
            if (interval.TotalMinutes <= 0)
                throw new ArgumentOutOfRangeException(nameof(interval), "Repeat interval must be positive.");
            if (callback == null) throw new ArgumentNullException(nameof(callback));
            return Enqueue(_clock.CurrentTime.Add(interval), interval, callback, label);
        }

        /// <summary>Repeats daily at hh:mm; first occurrence is the next such instant.</summary>
        public ScheduledOperationHandle ScheduleDailyAt(int hour, int minute, Action<SimTime> callback, string? label = null)
        {
            var now = _clock.CurrentTime;
            var candidate = new SimTime(now.DayNumber, hour, minute);
            if (candidate <= now) candidate = candidate.Add(SimDuration.FromDays(1));
            return Enqueue(candidate, SimDuration.FromDays(1), callback, label);
        }

        public bool Cancel(ScheduledOperationHandle handle)
        {
            for (int i = 0; i < _queue.Count; i++)
            {
                if (_queue[i].Sequence != handle.Value) continue;
                if (_queue[i].Cancelled) return false;
                _queue[i].Cancelled = true;
                TotalCancelled++;
                return true;
            }
            return false;
        }

        /// <summary>Executes every operation whose deadline has passed, in deterministic order.</summary>
        public void ProcessDue()
        {
            while (_queue.Count > 0)
            {
                var entry = _queue[0];
                if (entry.Cancelled)
                {
                    _queue.RemoveAt(0);
                    continue;
                }
                if (entry.Due > _clock.CurrentTime) return;

                var executedAt = entry.Due;
                _queue.RemoveAt(0);
                if (entry.RepeatInterval.TotalMinutes > 0)
                {
                    // Re-arm from the previous deadline so intervals never drift.
                    entry.Due = entry.Due.Add(entry.RepeatInterval);
                    InsertSorted(entry);
                }

                entry.Callback(executedAt);
                TotalExecuted++;
            }
        }

        private ScheduledOperationHandle Enqueue(SimTime due, SimDuration repeatInterval, Action<SimTime> callback, string? label)
        {
            var entry = new Entry
            {
                Sequence = _nextSequence++,
                Due = due,
                RepeatInterval = repeatInterval,
                Callback = callback,
                Label = label
            };
            InsertSorted(entry);
            TotalScheduled++;
            return new ScheduledOperationHandle(entry.Sequence);
        }

        private void InsertSorted(Entry entry)
        {
            int index = BinarySearchInsertIndex(entry);
            _queue.Insert(index, entry);
        }

        private int BinarySearchInsertIndex(Entry entry)
        {
            int lo = 0, hi = _queue.Count;
            while (lo < hi)
            {
                int mid = (lo + hi) >> 1;
                var other = _queue[mid];
                if (other.Due < entry.Due || (other.Due == entry.Due && other.Sequence < entry.Sequence))
                    lo = mid + 1;
                else
                    hi = mid;
            }
            return lo;
        }

        private void OnTimeAdvanced(SimTime _) => ProcessDue();

        /// <summary>Test/diagnostic helper: detaches from the clock's advance event.</summary>
        internal void DetachFromClock() => _clock.TimeAdvanced -= OnTimeAdvanced;
    }
}
