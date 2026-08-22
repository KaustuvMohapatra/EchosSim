using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class PlannerStateTests
    {
        [Test]
        public void Facts_DefaultToZero_AndRoundTrip()
        {
            var s = new PlannerWorldState();
            Assert.AreEqual(0, s.Get("missing"));
            Assert.IsFalse(s.IsTrue("missing"));
            s.Set("has_meal", 1);
            Assert.IsTrue(s.IsTrue("has_meal"));
        }

        [Test]
        public void Hash_IsCanonical()
        {
            var a = new PlannerWorldState();
            a.Set("x", 1);
            a.Set("y", 2);

            var b = new PlannerWorldState();
            b.Set("y", 2);
            b.Set("x", 1);

            Assert.AreEqual(a.ComputeHash(), b.ComputeHash(), "insertion order must not affect hash");
            b.Set("z", 9);
            Assert.AreNotEqual(a.ComputeHash(), b.ComputeHash());
        }

        [Test]
        public void Conditions_EvaluateOperators()
        {
            var s = new PlannerWorldState();
            s.Set("stock", 2);
            Assert.IsTrue(new FactCondition("stock", FactOperator.AtLeast, 1).IsSatisfiedBy(s));
            Assert.IsFalse(new FactCondition("stock", FactOperator.AtLeast, 3).IsSatisfiedBy(s));
            Assert.IsTrue(new FactCondition("stock", FactOperator.AtMost, 5).IsSatisfiedBy(s));
        }

        [Test]
        public void Effects_AssignAndAdd()
        {
            var s = new PlannerWorldState();
            s.Set("pantry_stock", 3);
            new FactEffect("pantry_stock", FactEffectMode.AddDelta, -1).ApplyTo(s);
            new FactEffect("has_ingredients", FactEffectMode.Assign, 1).ApplyTo(s);
            Assert.AreEqual(2, s.Get("pantry_stock"));
            Assert.AreEqual(1, s.Get("has_ingredients"));
        }
    }

    public class GoapPlannerTests
    {
        private static PlanningAction A(string id, string[] pre, FactEffect[] fx, float cost) =>
            new PlanningAction(new ActionId(id), id, ToConditions(pre), fx, baseCost: cost);

        private static IReadOnlyList<FactCondition> ToConditions(string[] keys)
        {
            var list = new List<FactCondition>();
            foreach (var k in keys)
            {
                bool atMost = k.StartsWith("!");
                list.Add(new FactCondition(atMost ? k.Substring(1) : k,
                    atMost ? FactOperator.AtMost : FactOperator.AtLeast, 1));
            }
            return list;
        }

        private static GoapPlanner NewPlanner() => new GoapPlanner { MaxExpansions = 5000, MaxDepth = 12 };

        [Test]
        public void ValidPlan_FindsChain()
        {
            var start = new PlannerWorldState();
            var actions = new List<PlanningAction>
            {
                A("get_food", Array.Empty<string>(), new[] { FactEffect.SetTrue("has_ingredients") }, 0.4f),
                A("cook", new[] { "has_ingredients" }, new[] { FactEffect.SetTrue("has_meal") }, 0.7f),
                A("eat", new[] { "has_meal" }, new[] { FactEffect.SetTrue("just_ate") }, 0.3f),
            };
            var goal = new[] { FactCondition.True("just_ate") };

            var result = NewPlanner().Plan(start, goal, actions);

            Assert.IsTrue(result.Success);
            CollectionAssert.AreEqual(
                new[] { "get_food", "cook", "eat" },
                result.Plan!.Steps.Select(s => s.Id.Value));
            Assert.Greater(result.Plan.TotalCost, 0f);
        }

        [Test]
        public void CheapestPlan_Wins()
        {
            var start = new PlannerWorldState();
            var actions = new List<PlanningAction>
            {
                // expensive one-step route
                A("expensive_eat", Array.Empty<string>(), new[] { FactEffect.SetTrue("just_ate") }, 10f),
                // cheap three-step route
                A("get", Array.Empty<string>(), new[] { FactEffect.SetTrue("ing") }, 0.2f),
                A("cook", new[] { "ing" }, new[] { FactEffect.SetTrue("meal") }, 0.3f),
                A("eat", new[] { "meal" }, new[] { FactEffect.SetTrue("just_ate") }, 0.1f),
            };
            var result = NewPlanner().Plan(start, new[] { FactCondition.True("just_ate") }, actions);

            Assert.IsTrue(result.Success);
            CollectionAssert.AreEqual(new[] { "get", "cook", "eat" }, result.Plan!.Steps.Select(s => s.Id.Value));
        }

        [Test]
        public void AlternativePlan_WhenPreferredBlocked()
        {
            var start = new PlannerWorldState();
            start.Set("at_cafe", 1);
            start.Set("cafe_open", 0); // closed!

            var actions = new List<PlanningAction>
            {
                A("buy_at_cafe", new[] { "at_cafe", "cafe_open" }, new[] { FactEffect.SetTrue("has_meal") }, 1.0f),
                A("go_home", Array.Empty<string>(), new[] { FactEffect.SetTrue("at_home"), FactEffect.SetFalse("at_cafe") }, 0.5f),
                A("cook_home", new[] { "at_home" }, new[] { FactEffect.SetTrue("has_meal") }, 0.9f),
                A("eat", new[] { "has_meal" }, new[] { FactEffect.SetTrue("just_ate") }, 0.3f),
            };
            var result = NewPlanner().Plan(start, new[] { FactCondition.True("just_ate") }, actions);

            Assert.IsTrue(result.Success, "must fall back to home cooking");
            CollectionAssert.AreEqual(new[] { "go_home", "cook_home", "eat" }, result.Plan!.Steps.Select(s => s.Id.Value));
        }

        [Test]
        public void ImpossiblePlan_FailsWithReason()
        {
            var start = new PlannerWorldState();
            var actions = new List<PlanningAction>
            {
                A("noop", Array.Empty<string>(), new[] { FactEffect.SetTrue("irrelevant") }, 1f)
            };
            var result = NewPlanner().Plan(start, new[] { FactCondition.True("unreachable_fact") }, actions);

            Assert.IsFalse(result.Success);
            Assert.AreEqual(PlanFailureReason.NoViablePlan, result.Metrics.FailureReason);
        }

        [Test]
        public void CycleAvoidance_Terminates()
        {
            var start = new PlannerWorldState();
            // ping/pong effects that never reach the goal
            var actions = new List<PlanningAction>
            {
                A("ping", new[] { "!flag_b" }, new[] { FactEffect.SetFalse("flag_a"), FactEffect.SetTrue("flag_b") }, 0.5f),
                A("pong", new[] { "!flag_a" }, new[] { FactEffect.SetFalse("flag_b"), FactEffect.SetTrue("flag_a") }, 0.5f),
            };
            var planner = NewPlanner();
            planner.MaxDepth = 8;
            var sw = System.Diagnostics.Stopwatch.StartNew(); // wall clock OK for TEST harness only
            var result = planner.Plan(start, new[] { FactCondition.True("goal_never") }, actions);
            sw.Stop();

            Assert.IsFalse(result.Success);
            Assert.Less(sw.ElapsedMilliseconds, 5000, "search must terminate quickly");
            Assert.That(result.Metrics.NodesExpanded, Is.LessThanOrEqualTo(600));
        }

        [Test]
        public void MaxExpansions_Respected()
        {
            var start = new PlannerWorldState();
            var actions = new List<PlanningAction>();
            for (int i = 0; i < 6; i++)
            {
                string key = "k" + i;
                actions.Add(A("toggle_" + i, Array.Empty<string>(),
                    new[] { new FactEffect(key, FactEffectMode.AddDelta, 1) }, 0.1f));
                actions.Add(A("untoggle_" + i, Array.Empty<string>(),
                    new[] { new FactEffect(key, FactEffectMode.AddDelta, -1) }, 0.1f));
            }

            var planner = new GoapPlanner { MaxExpansions = 50, MaxDepth = 20 };
            var result = planner.Plan(start,
                new[] { new FactCondition("k0", FactOperator.AtLeast, 999) }, actions);

            Assert.IsFalse(result.Success);
            Assert.AreEqual(PlanFailureReason.MaxExpansionsReached, result.Metrics.FailureReason);
            Assert.LessOrEqual(result.Metrics.NodesExpanded, 50);
        }

        [Test]
        public void DeterministicTie_PicksEarliestAuthoredAction()
        {
            var start = new PlannerWorldState();

            Func<List<PlanningAction>> makeActions = () => new List<PlanningAction>
            {
                A("alpha_route", Array.Empty<string>(), new[] { FactEffect.SetTrue("done") }, 1.0f),
                A("beta_route", Array.Empty<string>(), new[] { FactEffect.SetTrue("done") }, 1.0f),
            };

            var r1 = NewPlanner().Plan(start, new[] { FactCondition.True("done") }, makeActions());
            var r2 = NewPlanner().Plan(start, new[] { FactCondition.True("done") }, makeActions());

            Assert.IsTrue(r1.Success && r2.Success);
            Assert.AreEqual(r1.Plan!.Steps[0].Id.Value, r2.Plan!.Steps[0].Id.Value);
            Assert.AreEqual("alpha_route", r1.Plan.Steps[0].Id.Value,
                "equal-cost ties resolve by insertion sequence: alpha's child reaches the goal first");
        }

        [Test]
        public void DynamicCost_InfluencesChoice()
        {
            var start = new PlannerWorldState();
            var cheapFirst = new List<PlanningAction>
            {
                new PlanningAction(new ActionId("store"), "Store", null,
                    new[] { FactEffect.SetTrue("fed") }, baseCost: 1f, dynamicCost: ctx => 0.1f),
                new PlanningAction(new ActionId("market"), "Market", null,
                    new[] { FactEffect.SetTrue("fed") }, baseCost: 1f, dynamicCost: ctx => 0.9f),
            };
            var result = NewPlanner().Plan(start, new[] { FactCondition.True("fed") }, cheapFirst);
            Assert.AreEqual("store", result.Plan!.Steps[0].Id.Value);
        }
    }

    public class PlanningDirectorTests
    {
        private static SimulationWorld NewTown(out TownRoles roles)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(3001));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_rohan"), "Rohan's Home"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_store"), "General Store"));
            roles = new TownRoles
            {
                Cafe = new LocationId("loc_cafe"),
                Store = new LocationId("loc_store")
            };
            return world;
        }

        private static (SimulationWorld World, CognitionSystem Cognition, AgentMind Mind) NewHungryResident(SimulationWorld world, int hunger = 90)
        {
            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_hungry", "Hugo")
            {
                HomeLocationId = "loc_home_rohan",
                Personality = PersonalityProfile.Balanced(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = hunger }
            });
            var cognition = new CognitionSystem(world);
            return (world, cognition, mind);
        }

        [Test]
        public void CafeOpen_BuysMealAtCafe_AndRelievesHunger()
        {
            var (world, cognition, _) = NewHungryResident(NewTown(out var roles));
            var director = new PlanningDirector(world, cognition, roles: roles);
            var agent = new AgentId("npc_hungry");

            cognition.AdvanceNeeds(SimDuration.FromMinutes(0)); // no growth yet
            director.Tick(agent);

            // Execute pending completions by advancing time in steps.
            HeadlessSimulationRunner.RunFor(world, SimDuration.FromHours(2), stepMinutes: 5);

            var state = world.Agents.Get(agent);
            Assert.AreEqual("loc_cafe", state.CurrentLocationId.Value, "agent should be at the cafe");
            Assert.Less(world.Residents.Get(agent).Needs.Get(NeedKind.Hunger).Current, 60f,
                "hunger relieved substantially (55 relief minus ~2h growth)");
            Assert.IsFalse(director.IsBusy(agent), "plan must complete");
            Assert.AreEqual(1, director.TotalPlansSucceeded);
        }

        [Test]
        public void CafeClosed_ReplansHomeCookRoute()
        {
            var (world, cognition, _) = NewHungryResident(NewTown(out var roles));
            world.Locations.Get(new LocationId("loc_cafe")).SetOpen(false);
            var director = new PlanningDirector(world, cognition, roles: roles);
            var agent = new AgentId("npc_hungry");

            director.Tick(agent);
            HeadlessSimulationRunner.RunFor(world, SimDuration.FromHours(3), stepMinutes: 5);

            Assert.IsFalse(director.IsBusy(agent));
            Assert.AreEqual(1, director.TotalPlansSucceeded, "home cook route must succeed");
            var finishedHome = world.Agents.Get(agent).CurrentLocationId == new LocationId("loc_home_rohan");
            Assert.IsTrue(finishedHome || world.Agents.Get(agent).CurrentLocationId == new LocationId("loc_store"),
                "fallback path runs through home/store, not cafe");
        }

        [Test]
        public void Intervention_CausesFailureThenReplanRecovery()
        {
            var (world, cognition, _) = NewHungryResident(NewTown(out var roles), hunger: 93); // critical
            var director = new PlanningDirector(world, cognition, roles: roles);
            var agent = new AgentId("npc_hungry");

            var failures = new List<ActionFailureType?>();
            var interventions = 0;
            director.Intervention = new CountingIntervention(() =>
            {
                if (interventions < 2) { interventions++; failures.Add(ActionFailureType.TargetUnavailable); return ActionFailureType.TargetUnavailable; }
                failures.Add(null);
                return null;
            });

            director.Tick(agent);
            // Deferred retry policy: failures yield; each external tick retries.
            // Stop the moment the recovered plan lands so no further decisions run.
            int guard = 0;
            while (director.TotalPlansSucceeded == 0 && guard++ < 400)
            {
                world.Clock.Advance(SimDuration.FromMinutes(5));
                if (!director.IsBusy(agent)) director.Tick(agent);
            }

            Assert.AreEqual(2, interventions, "two intercepted steps before recovery");
            Assert.GreaterOrEqual(director.TotalPlansFailed + director.TotalReplans, 1, "failure recorded");
            Assert.AreEqual(1, director.TotalPlansSucceeded, "recovered to success");
        }

        [Test]
        public void StaleCompletion_FromCancelledPlan_DoesNotConsumeNewPlanSteps()
        {
            var world = NewTown(out var roles);
            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_stale", "Stan")
            {
                HomeLocationId = "loc_home_rohan",
                Personality = PersonalityProfile.Balanced(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 20f, [NeedKind.Fun] = 96f }
            });
            var agent = mind.Agent;
            var cognition = new CognitionSystem(world);
            var director = new PlanningDirector(world, cognition, roles: roles);

            var steps = new List<string>();
            var stepMinutes = new List<int>();
            bool succeeded = false;
            world.Events.Subscribe<PlanStepCompletedEvent>(e =>
            {
                steps.Add(e.Action.Value);
                stepMinutes.Add(e.AtTime.MinuteOfDay);
            });
            world.Events.Subscribe<PlanFinishedEvent>(e => { if (e.Outcome == PlanLifecycle.Succeeded) succeeded = true; });

            director.Tick(agent); // Relax plan starts at 00:00, completion due 01:00
            Assert.IsTrue(director.IsBusy(agent));

            // Hunger spike at 00:10 cancels Relax; an Eat plan follows.
            mind.Needs.Get(NeedKind.Hunger).Apply(-75f);

            int guard = 0;
            while (!succeeded && guard++ < 200)
            {
                world.Clock.Advance(SimDuration.FromMinutes(5));
                // Tick unconditionally: on busy agents it performs the interruption check.
                director.Tick(agent);
            }

            Assert.IsTrue(succeeded, "replacement plan must finish");
            CollectionAssert.AreEqual(
                new[] { "act_goto_loc_cafe", "act_buy_meal", "act_eat" },
                steps,
                "exactly the replacement plan's steps, in order");
            Assert.GreaterOrEqual(stepMinutes[0], 19, "goto ran its full 15 minutes");
            Assert.LessOrEqual(stepMinutes[2], 62, "eat completed near its own deadline, not instantly");
        }

        private sealed class CountingIntervention : IPlanIntervention
        {
            private readonly Func<ActionFailureType?> _policy;
            public CountingIntervention(Func<ActionFailureType?> policy) { _policy = policy; }
            public ActionFailureType? Intercept(AgentId agent, PlanningAction nextAction) => _policy();
        }

        [Test]
        public void CriticalInterruption_PreemptsLongRunningPlan()
        {
            var (world, cognition, mind) = NewHungryResident(NewTown(out var roles), hunger: 30);
            var director = new PlanningDirector(world, cognition, roles: roles);
            var agent = new AgentId("npc_hungry");

            // Start a long relax plan by making fun urgent and hunger low.
            mind.Needs.Get(NeedKind.Fun).Apply(-70f); // fun -> 100
            director.Tick(agent);
            var startedGoal = director.PeekActive(agent)?.Goal ?? default;
            Assert.IsTrue(director.IsBusy(agent), "setup: a plan must be running");

            // Hunger spikes past its interrupt threshold mid-plan.
            mind.Needs.Get(NeedKind.Hunger).Apply(-70f); // hunger -> 100
            director.Tick(agent);

            Assert.IsFalse(director.IsBusy(agent) && director.PeekActive(agent)?.Goal == startedGoal,
                "previous plan must have been cancelled or replaced");
        }

        [Test]
        public void ReplaysAreDeterministic()
        {
            var runA = ExecuteScriptedDay();
            var runB = ExecuteScriptedDay();
            CollectionAssert.AreEqual(runA, runB, "same seed+scenario must replay identically");
        }

        private static List<string> ExecuteScriptedDay()
        {
            var world = NewTown(out var roles);
            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_day", "Dee")
            {
                HomeLocationId = "loc_home_rohan",
                Personality = PersonalityProfile.MiraLike(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 55f, [NeedKind.Fun] = 45f }
            });
            var log = new List<string>();
            var cognition = new CognitionSystem(world);
            var director = new PlanningDirector(world, cognition, roles: roles);

            world.Events.Subscribe<PlanStartedEvent>(e => log.Add($"start|{e.Goal}|{e.StepCount}|{e.TotalCost.ToString("0.00")}"));
            world.Events.Subscribe<PlanFinishedEvent>(e => log.Add($"finish|{e.Goal}|{e.Outcome}|{e.Reason}"));

            for (int hour = 0; hour < 12; hour++)
            {
                cognition.AdvanceNeeds(SimDuration.FromHours(1));
                world.Clock.Advance(SimDuration.FromHours(1));
                director.Tick(mind.Agent);
                // Let scheduled completions within this hour fire:
                while (director.IsBusy(mind.Agent) && world.Clock.CurrentTime < new SimTime(0, hour + 1, 0))
                    world.Clock.Advance(SimDuration.FromMinutes(5));
            }
            log.Add("final:" + world.Agents.Get(mind.Agent).CurrentLocationId.Value);
            return log;
        }
    }
}
