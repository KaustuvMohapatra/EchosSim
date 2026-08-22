using System;
using EchoSim.Core;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class SimTimeTests
    {
        [Test]
        public void Epoch_IsMondayMidnight()
        {
            var t = SimTime.Epoch;
            Assert.AreEqual(0, t.DayNumber);
            Assert.AreEqual(0, t.Hour);
            Assert.AreEqual(0, t.Minute);
            Assert.AreEqual(SimDayOfWeek.Monday, t.DayOfWeek);
        }

        [Test]
        public void Components_RoundTrip()
        {
            var t = new SimTime(dayNumber: 3, hour: 17, minute: 45);
            Assert.AreEqual(3, t.DayNumber);
            Assert.AreEqual(17, t.Hour);
            Assert.AreEqual(45, t.Minute);
            Assert.AreEqual((int)SimDayOfWeek.Thursday, (int)t.DayOfWeek);
            Assert.IsFalse(t.IsWeekend);
        }

        [Test]
        public void WeekendDetection()
        {
            var saturday = new SimTime(dayNumber: 5, hour: 12, minute: 0); // day 5 = Saturday
            var sunday = new SimTime(dayNumber: 6, hour: 12, minute: 0);
            var monday = new SimTime(dayNumber: 7, hour: 12, minute: 0);
            Assert.IsTrue(saturday.IsWeekend);
            Assert.IsTrue(sunday.IsWeekend);
            Assert.IsFalse(monday.IsWeekend);
        }

        [Test]
        public void Addition_And_Subtraction()
        {
            var t = new SimTime(0, 23, 30);
            var later = t.Add(SimDuration.FromMinutes(45));
            Assert.AreEqual(new SimTime(1, 0, 15), later);

            var back = later.Subtract(SimDuration.FromHours(1));
            Assert.AreEqual(new SimTime(0, 23, 15), back);
        }

        [Test]
        public void NegativeTimes_AreRejected()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = new SimTime(-1));
            var epoch = SimTime.Epoch;
            Assert.Throws<ArgumentOutOfRangeException>(() => epoch.Subtract(SimDuration.FromMinutes(1)));
        }

        [Test]
        public void InvalidClockComponents_AreRejected()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = new SimTime(0, 24, 0));
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = new SimTime(0, 12, 60));
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = new SimTime(-1, 0, 0));
        }

        [Test]
        public void IntradayWindow_OverMidnight()
        {
            var night = new SimTime(0, 23, 30);
            var noon = new SimTime(0, 12, 0);
            Assert.IsTrue(night.IsWithinInclusiveWindow(22, 0, 6, 0));
            Assert.IsFalse(noon.IsWithinInclusiveWindow(22, 0, 6, 0));
            Assert.IsTrue(noon.IsWithinInclusiveWindow(9, 0, 17, 0));
        }

        [Test]
        public void DurationArithmetic()
        {
            var d = SimDuration.FromHours(2).Add(SimDuration.FromMinutes(30));
            Assert.AreEqual(150, d.TotalMinutes);
            Assert.AreEqual(2.5, d.TotalHours, 1e-9);
            Assert.Throws<ArgumentOutOfRangeException>(
                () => _ = SimDuration.FromMinutes(10) - SimDuration.FromMinutes(20));
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = SimDuration.FromMinutes(-1));
        }
    }

    public class SimulationClockTests
    {
        [Test]
        public void Advance_MovesTimeAndFiresEventOncePerAdvance()
        {
            var clock = new SimulationClock();
            int fired = 0;
            clock.TimeAdvanced += _ => fired++;

            clock.Advance(SimDuration.FromMinutes(90));

            Assert.AreEqual(new SimTime(0, 1, 30), clock.CurrentTime);
            Assert.AreEqual(1, fired);
        }

        [Test]
        public void Determinism_IdenticalAdvances_ProduceIdenticalTime()
        {
            var a = RunSequence();
            var b = RunSequence();
            Assert.AreEqual(a, b);
        }

        private static SimTime RunSequence()
        {
            var clock = new SimulationClock();
            clock.SetScale(SimulationSpeed.Octuple);
            for (int i = 0; i < 100; i++)
                clock.Advance(SimDuration.FromMinutes(i % 7 + 1));
            return clock.CurrentTime;
        }

        [Test]
        public void Pause_BlocksExplicitAdvance()
        {
            var clock = new SimulationClock();
            bool pauseEvent = false;
            clock.PauseStateChanged += p => pauseEvent = p;

            clock.Pause();
            Assert.IsTrue(clock.IsPaused);
            Assert.IsTrue(pauseEvent);
            Assert.Throws<InvalidOperationException>(() => clock.Advance(SimDuration.FromMinutes(5)));

            clock.Resume();
            Assert.IsFalse(clock.IsPaused);
            clock.Advance(SimDuration.FromMinutes(5));
            Assert.AreEqual(new SimTime(0, 0, 5), clock.CurrentTime);
        }

        [Test]
        public void SpeedScaling_ConvertsRealSecondsToSimulatedMinutes()
        {
            var clock = new SimulationClock();

            clock.SetScale(SimulationSpeed.Normal);
            Assert.AreEqual(60, clock.ConvertRealSeconds(60.0).TotalMinutes);

            clock.SetScale(SimulationSpeed.Double);
            Assert.AreEqual(120, clock.ConvertRealSeconds(60.0).TotalMinutes);

            clock.SetScale(SimulationSpeed.Half);
            Assert.AreEqual(30, clock.ConvertRealSeconds(60.0).TotalMinutes);

            clock.SetScale(SimulationSpeed.DebugSixteen);
            Assert.AreEqual(16 * 600, clock.ConvertRealSeconds(600.0).TotalMinutes);

            clock.Pause();
            Assert.AreEqual(0, clock.ConvertRealSeconds(600.0).TotalMinutes, "paused clock converts nothing");
        }

        [Test]
        public void ScaleValidation()
        {
            var clock = new SimulationClock();
            Assert.Throws<ArgumentOutOfRangeException>(() => clock.SetScale(-1f));
            Assert.Throws<ArgumentOutOfRangeException>(() => clock.SetScale(float.NaN));
            Assert.Throws<ArgumentOutOfRangeException>(() => clock.SetScale(float.PositiveInfinity));
        }

        [Test]
        public void AdvanceTo_RejectsBackwardsMotion()
        {
            var clock = new SimulationClock();
            clock.Advance(SimDuration.FromHours(3));
            Assert.Throws<ArgumentOutOfRangeException>(
                () => clock.AdvanceTo(clock.CurrentTime.Subtract(SimDuration.FromMinutes(1))));
            clock.AdvanceTo(clock.CurrentTime);
            Assert.DoesNotThrow(() => clock.AdvanceTo(clock.CurrentTime.Add(SimDuration.FromDays(2))));
        }
    }
}
