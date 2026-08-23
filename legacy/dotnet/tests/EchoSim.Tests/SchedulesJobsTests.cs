using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class ScheduleModelTests
    {
        [Test]
        public void Entry_Contains_WrapsMidnight()
        {
            var night = new ScheduleEntry("Sleep", 23 * 60, 7 * 60, ScheduleImportance.Mandatory);
            Assert.IsTrue(night.Contains(23 * 60 + 30));
            Assert.IsTrue(night.Contains(3 * 60));
            Assert.IsTrue(night.Contains(7 * 60));
            Assert.IsFalse(night.Contains(12 * 60));

            var day = new ScheduleEntry("Work", 9 * 60, 17 * 60);
            Assert.IsTrue(day.Contains(9 * 60));
            Assert.IsFalse(day.Contains(17 * 60 + 1));
        }

        [Test]
        public void WeeklySchedule_WeekendAndOverrides()
        {
            var weekday = new DailySchedule(new[] { new ScheduleEntry("Work", 540, 1020) });
            var weekend = DailySchedule.Empty(); // rest days have no entries
            var weekly = new WeeklySchedule(weekday, weekend);

            var monday = new SimTime(0, 12, 0);   // day 0
            var saturday = new SimTime(5, 12, 0); // day 5

            Assert.IsNotNull(weekly.EntryAt(monday));
            Assert.IsNull(weekly.EntryAt(saturday), "empty weekend profile = rest day");

            // Special-day override: a holiday on Monday with leisure only.
            weekly.Override(0, new DailySchedule(new[] { new ScheduleEntry("Festival", 600, 1200) }));
            var entry = weekly.EntryAt(monday)!;
            Assert.AreEqual("Festival", entry.Activity);

            weekly.Override(1, null); // explicit nothing-day
            Assert.IsNull(weekly.EntryAt(new SimTime(1, 12, 0)));
        }
    }

    public class JobSystemTests
    {
        private static SimulationWorld NewWorld(out JobSystem jobs)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(5001));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Bakery"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_b"), "Home B"));
            jobs = new JobSystem(world);
            return world;
        }

        private static AgentMind SpawnBaker(SimulationWorld world, JobSystem jobs, int offset = 0)
        {
            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_rohan", "Rohan")
            {
                HomeLocationId = "loc_home_b",
                Personality = PersonalityProfile.Balanced()
            });
            jobs.Define(new JobDefinition("job_baker", "Baker",
                new LocationId("loc_bakery"), 6 * 60, 14 * 60, incomePerHour: 14f));
            jobs.Assign(mind.Agent, "job_baker");
            mind.SetRoutineOffset(offset);
            return mind;
        }

        [Test]
        public void OnShift_WithinWindow_AndRoutineOffsetShiftsIt()
        {
            var world = NewWorld(out var jobs);
            SpawnBaker(world, jobs, offset: 0);

            var atSeven = new SimTime(2, 7, 0);
            var atNoon = new SimTime(2, 12, 0);
            var atNight = new SimTime(2, 20, 0);
            Assert.IsTrue(jobs.IsOnShift(new AgentId("npc_rohan"), atSeven));
            Assert.IsTrue(jobs.IsOnShift(new AgentId("npc_rohan"), atNoon));
            Assert.IsFalse(jobs.IsOnShift(new AgentId("npc_rohan"), atNight));
        }

        [Test]
        public void RoutineOffset_ShiftsEffectiveWindow()
        {
            var world = NewWorld(out var jobs);
            SpawnBaker(world, jobs, offset: +30); // shift becomes 06:30-14:30

            var atSixFifteen = new SimTime(2, 6, 15);
            Assert.IsFalse(jobs.IsOnShift(new AgentId("npc_rohan"), atSixFifteen),
                "with +30m offset the shift starts at 06:30");
        }

        [Test]
        public void Pressure_FullDuringShift_ZeroOutside()
        {
            var world = NewWorld(out var jobs);
            SpawnBaker(world, jobs);
            var agent = new AgentId("npc_rohan");

            Assert.AreEqual(1f, jobs.ComputePressure(agent, new SimTime(2, 9, 0)), 0.001f);
            Assert.AreEqual(0f, jobs.ComputePressure(agent, new SimTime(2, 20, 0)), 0.001f);
        }

        [Test]
        public void RestDay_EmptyProfile_KillsPressure_EvenMidshift()
        {
            var world = NewWorld(out var jobs);
            var mind = SpawnBaker(world, jobs);
            mind.SetSchedule(new WeeklySchedule(
                weekday: new DailySchedule(new[] { new ScheduleEntry("Work", 360, 840) }),
                weekend: DailySchedule.Empty()));

            Assert.Greater(jobs.ComputePressure(mind.Agent, new SimTime(2, 9, 0)), 0.9f); // Tuesday working
            Assert.AreEqual(0f, jobs.ComputePressure(mind.Agent, new SimTime(5, 9, 0)), 0.001f); // Saturday rest
        }

        [Test]
        public void MinutesLate_ComputesWrappedAndNormalCases()
        {
            Assert.AreEqual(15, JobDefinition.MinutesLate(actualStartMinuteOfDay: 8 * 60 + 15, nominalStartMinuteOfDay: 8 * 60));
            Assert.AreEqual(0, JobDefinition.MinutesLate(7 * 60 + 59, 8 * 60), "early is not late");
            int lateAcrossMidnight = JobDefinition.MinutesLate(actualStartMinuteOfDay: 5, nominalStartMinuteOfDay: 23 * 60 + 55);
            Assert.AreEqual(10, lateAcrossMidnight, "22:55 shift starting 00:05 is 10 min late");
        }
    }

    public class OpeningHoursTests
    {
        [Test]
        public void Hours_OpenCloseCycle_PublishesEvents()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(5002));
            world.RegisterLocation(new LocationDefinition(
                new LocationId("loc_cafe"), "Cafe", hours: OpeningHours.FromClock(6, 0, 18, 0)));
            var hours = new OpeningHoursSystem(world, attachHourlySweep: false);

            var flips = new List<LocationOpenStateChangedEvent>();
            world.Events.Subscribe<LocationOpenStateChangedEvent>(flips.Add);

            hours.UpdateAll(new SimTime(0, 3, 0));  // before open -> close
            hours.UpdateAll(new SimTime(0, 7, 0));  // open
            hours.UpdateAll(new SimTime(0, 10, 0)); // stays open (no event)
            hours.UpdateAll(new SimTime(0, 19, 0)); // close

            Assert.AreEqual(3, flips.Count, "close@03 open@07 close@19 — only flips publish");
            Assert.IsFalse(flips[0].IsOpen);
            Assert.IsTrue(flips[1].IsOpen);
            Assert.IsFalse(flips[2].IsOpen);
        }

        [Test]
        public void ManualOverride_WinsOverAuthoredHours()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(5002));
            var def = new LocationDefinition(new LocationId("loc_x"), "X",
                hours: OpeningHours.FromClock(6, 0, 18, 0));
            world.RegisterLocation(def);

            var runtime = world.Locations.Get(new LocationId("loc_x"));
            var hours = new OpeningHoursSystem(world, attachHourlySweep: false);

            hours.UpdateAll(new SimTime(0, 8, 0));
            Assert.IsTrue(runtime.IsOpen);

            runtime.SetOpen(false); // temporary closure for repairs etc.
            hours.UpdateAll(new SimTime(0, 9, 0));
            Assert.IsFalse(runtime.IsOpen, "manual override must survive sweeps");
        }
    }

    public class WorkIntegrationTests
    {
        private sealed class FixedProvider
        {
            public Func<AgentId, SimTime, float>? Provider { get; set; }
        }

        [Test]
        public void CriticalHunger_BeatsFullWorkPressure()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(5003));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_office"), "Office"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_w"), "Home W"));
            var jobs = new JobSystem(world);
            jobs.Define(new JobDefinition("job_office", "Clerk",
                new LocationId("loc_office"), 9 * 60, 17 * 60, 16f));

            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_clerk", "Claire")
            {
                HomeLocationId = "loc_home_w",
                Personality = PersonalityProfile.Balanced(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 95f }
            });
            jobs.Assign(mind.Agent, "job_office");
            mind.PlannerMemory["pantry_stock"] = 1; // eatable at home without travel

            var cognition = new CognitionSystem(world);
            cognition.SetSchedulePressureProvider(jobs.ComputePressure);
            var decision = cognition.Decide(mind.Agent);

            Assert.AreEqual("goal_eat", decision.Effective.Goal.Value,
                "survival overrides employment pressure");
            Assert.IsTrue(decision.Effective.CriticalOverride);
        }

        [Test]
        public void ClosedWorkplace_IsAvoidedByPlanner()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(5004));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_office"), "Office"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_w"), "Home W"));
            world.Locations.Get(new LocationId("loc_office")).SetOpen(false); // burst pipe

            var jobs = new JobSystem(world);
            jobs.Define(new JobDefinition("job_office", "Clerk",
                new LocationId("loc_office"), 0, 1439, 16f)); // always-on shift window

            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_clerk2", "Cleo")
            {
                HomeLocationId = "loc_home_w",
                Personality = PersonalityProfile.MiraLike().Edit()
                    .Set(PersonalityTrait.Ambition, 1f).Build(),
                InitialNeeds = new Dictionary<NeedKind, float>
                { [NeedKind.Fun] = 80f, [NeedKind.Comfort] = 70f }
            });
            jobs.Assign(mind.Agent, "job_office");

            var roles = new TownRoles();
            var agentState = world.Agents.Get(mind.Agent);
            var builder = new PlannerStateBuilder(world, roles, jobs: jobs);
            var state = builder.Build(agentState, mind);

            Assert.AreEqual(0, state.Get("work_open"), "builder reflects closure");
            Assert.AreEqual(1, state.Get("on_shift"));

            var actions = StandardActions.CreateForResident(world, agentState, roles, mind.Job);
            var planner = new GoapPlanner();
            var result = planner.Plan(state,
                new[] { FactCondition.True("worked") }, actions);

            Assert.IsFalse(result.Success,
                "a closed workplace must make 'worked' unreachable rather than fake-achievable");
        }

        [Test]
        public void OpenWorkplace_PlansTheCommute()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(5004));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_office"), "Office"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_w"), "Home W"));

            var jobs = new JobSystem(world);
            jobs.Define(new JobDefinition("job_office", "Clerk",
                new LocationId("loc_office"), 0, 1439, 16f));

            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_clerk3", "Carl")
            {
                HomeLocationId = "loc_home_w",
                Personality = PersonalityProfile.Balanced()
            });
            jobs.Assign(mind.Agent, "job_office");

            var roles = new TownRoles();
            var agentState = world.Agents.Get(mind.Agent);
            var state = new PlannerStateBuilder(world, roles, jobs: jobs).Build(agentState, mind);
            var actions = StandardActions.CreateForResident(world, agentState, roles, mind.Job);

            var result = new GoapPlanner().Plan(state, new[] { FactCondition.True("worked") }, actions);

            Assert.IsTrue(result.Success);
            StringAssert.Contains("act_goto_loc_office",
                string.Join(",", result.Plan!.Steps.Select(s => s.Id.Value)));
        }
    }
}
