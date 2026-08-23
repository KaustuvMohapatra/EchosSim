using System;
using System.Collections.Generic;
using EchoSim.Core;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class SchedulerTests
    {
        private static SimulationClock NewClock() => new SimulationClock();

        [Test]
        public void OneShot_ExecutesAtDueTime()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            SimTime? executedAt = null;
            sched.ScheduleAt(new SimTime(0, 8, 0), t => executedAt = t, "bell");

            clock.Advance(SimDuration.FromHours(7));
            Assert.IsNull(executedAt);
            clock.Advance(SimDuration.FromHours(1));
            Assert.AreEqual(new SimTime(0, 8, 0), executedAt);
        }

        [Test]
        public void Ordering_IsByTimeThenScheduleSequence()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            var order = new List<string>();

            // scheduled out of order on purpose
            sched.ScheduleAt(new SimTime(0, 9, 0), _ => order.Add("late"), "late");
            sched.ScheduleAt(new SimTime(0, 8, 0), _ => order.Add("early-a"), "early-a");
            sched.ScheduleAt(new SimTime(0, 8, 0), _ => order.Add("early-b"), "early-b");

            clock.Advance(SimDuration.FromHours(10));

            CollectionAssert.AreEqual(new[] { "early-a", "early-b", "late" }, order,
                "equal deadlines must execute in insertion order");
        }

        [Test]
        public void Repeating_NeverDrifts()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            int executions = 0;
            SimTime lastDue = clock.CurrentTime;

            sched.ScheduleRepeating(SimDuration.FromMinutes(30), t =>
            {
                Assert.AreEqual(lastDue.Add(SimDuration.FromMinutes(30)), t, "interval must anchor to previous deadline");
                lastDue = t;
                executions++;
            });

            clock.AdvanceTo(new SimTime(0, 5, 15)); // 315 minutes -> 10 full intervals + 15 remainder

            Assert.AreEqual(10, executions);
            Assert.AreEqual(new SimTime(0, 5, 0), lastDue);
        }

        [Test]
        public void Cancel_StopsExecution()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            bool ran = false;
            var handle = sched.ScheduleIn(SimDuration.FromMinutes(60), _ => ran = true);

            Assert.IsTrue(sched.Cancel(handle));
            Assert.IsFalse(sched.Cancel(handle), "double cancel reports false");
            clock.Advance(SimDuration.FromHours(2));
            Assert.IsFalse(ran);
        }

        [Test]
        public void Callback_CanCancelOtherPendingOperations()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            bool victimRan = false;
            var victim = sched.ScheduleAt(new SimTime(0, 6, 0), _ => victimRan = true);
            sched.ScheduleAt(new SimTime(0, 5, 0), _ => sched.Cancel(victim));

            clock.Advance(SimDuration.FromHours(8));
            Assert.IsFalse(victimRan);
        }

        [Test]
        public void Callback_CanScheduleNewWork_DuringProcessing()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            var log = new List<string>();

            // Chained work must use absolute times: while due work executes, the
            // clock has already reached the end of the current advance, so
            // relative scheduling from inside a callback is anchored to that time.
            sched.ScheduleAt(new SimTime(0, 4, 0), _ =>
            {
                log.Add("first");
                sched.ScheduleAt(new SimTime(0, 4, 30), __ => log.Add("chained"), "chain");
            });
            sched.ScheduleAt(new SimTime(0, 3, 0), _ => log.Add("earlier"));

            clock.Advance(SimDuration.FromHours(5));
            CollectionAssert.AreEqual(new[] { "earlier", "first", "chained" }, log);
        }

        [Test]
        public void RelativeScheduling_FromInsideCallback_AnchorsToCurrentTime()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            SimTime? chainedAt = null;

            sched.ScheduleAt(new SimTime(0, 4, 0), _ =>
                sched.ScheduleIn(SimDuration.FromMinutes(30), t => chainedAt = t));
            // Clock jumps to 06:00 before callbacks run, so chained op lands at 06:30.
            clock.Advance(SimDuration.FromHours(6));

            Assert.IsNull(chainedAt);
            clock.Advance(SimDuration.FromMinutes(30));
            Assert.AreEqual(new SimTime(0, 6, 30), chainedAt);
        }

        [Test]
        public void ScheduleDaily_AnchorsToNextOccurrence()
        {
            var clock = NewClock();
            clock.AdvanceTo(new SimTime(2, 12, 0)); // Tuesday noon
            var sched = new SimulationScheduler(clock);

            var firedOn = new List<SimTime>();
            sched.ScheduleDailyAt(7, 30, t => firedOn.Add(t), "morning-routine");

            clock.Advance(SimDuration.FromDays(3));

            Assert.AreEqual(3, firedOn.Count);
            foreach (var t in firedOn)
            {
                Assert.AreEqual(7, t.Hour);
                Assert.AreEqual(30, t.Minute);
            }
            // 12:00 is after 07:30, so the first occurrence is tomorrow (day 3)
            Assert.AreEqual(3, firedOn[0].DayNumber);
        }

        [Test]
        public void ScheduleDaily_BeforeTargetTime_RunsSameDay()
        {
            var clock = NewClock();
            clock.AdvanceTo(new SimTime(2, 6, 0)); // 06:00, target 07:30 later today
            var sched = new SimulationScheduler(clock);

            var firedOn = new List<int>();
            sched.ScheduleDailyAt(7, 30, t => firedOn.Add(t.DayNumber));

            clock.Advance(SimDuration.FromHours(4));
            CollectionAssert.AreEqual(new[] { 2 }, firedOn);
        }

        [Test]
        public void DeterministicReplay_ProducesIdenticalLog()
        {
            var runA = RunScriptedDay();
            var runB = RunScriptedDay();
            CollectionAssert.AreEqual(runA, runB, "same schedule must replay identically");
        }

        private static List<string> RunScriptedDay()
        {
            var clock = NewClock();
            var rng = new SeededRandom(1234UL);
            var sched = new SimulationScheduler(clock);
            var log = new List<string>();

            sched.ScheduleDailyAt(8, 0, _ => log.Add("open-town"));
            for (int i = 0; i < 5; i++)
            {
                int delayMinutes = 60 + (int)(rng.NextDouble() * 600);
                string label = $"event-{i}";
                sched.ScheduleIn(SimDuration.FromMinutes(delayMinutes), _ => log.Add(label), label);
            }
            clock.Advance(SimDuration.FromDays(2));
            return log;
        }

        [Test]
        public void InvalidInputs_AreRejected()
        {
            var clock = NewClock();
            var sched = new SimulationScheduler(clock);
            Assert.Throws<ArgumentOutOfRangeException>(
                () => sched.ScheduleRepeating(SimDuration.FromMinutes(0), _ => { }));
            Assert.Throws<ArgumentNullException>(() => sched.ScheduleAt(new SimTime(0, 1, 0), null!));
            Assert.IsFalse(sched.Cancel(new ScheduledOperationHandle(999)));
        }
    }
}
