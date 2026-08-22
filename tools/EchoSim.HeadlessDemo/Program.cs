using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;

namespace EchoSim.HeadlessDemo
{
    /// <summary>
    /// Sprint 4 demo: GOAP over a navigable town.
    ///   A/B/C planning branches as before, plus:
    ///   - authored travel minutes between locations (movement consumes them)
    ///   - affordance-gated actions (bed, fridge, counters)
    ///   - seat reservations with denial on conflict
    /// Deterministic for a given seed.
    /// </summary>
    internal static class Program
    {
        private static void Main(string[] args)
        {
            ulong seed = args.Length > 0 && ulong.TryParse(args[0], out var s) ? s : 1234UL;
            Console.Out.WriteLine($"EchoSim sprint-4 demo | seed={seed}");

            ScenarioA(seed);
            ScenarioB(seed);
            ScenarioC(seed);
            LiveRunWithInterruption(seed);
        }

        private static SimulationWorld NewTown(ulong seed)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_dee"), "Dee's Home"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Corner Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_store"), "General Store"));

            // Sprint 4: authored travel minutes.
            var nav = (TimedNavigationService)world.Navigation;
            var home = new LocationId("loc_home_dee");
            var cafe = new LocationId("loc_cafe");
            var store = new LocationId("loc_store");
            nav.SetTravelTime(home, cafe, 20);
            nav.SetTravelTime(home, store, 15);
            nav.SetTravelTime(cafe, store, 10);

            // Sprint 4: affordances gate what actions exist where (spec §4.5).
            world.Affordances.Register(home, new ActionId("act_sleep"), "bed");
            world.Affordances.Register(home, new ActionId("act_get_ingredients"), "fridge");
            world.Affordances.Register(cafe, new ActionId("act_buy_meal"), "cafe counter");
            world.Affordances.Register(store, new ActionId("act_buy_ingredients"), "shop counter");
            return world;
        }

        private static TownRoles Roles() => new TownRoles
        {
            Cafe = new LocationId("loc_cafe"),
            Store = new LocationId("loc_store"),
            GateByAffordances = true
        };

        private static AgentMind Spawn(SimulationWorld world, int hunger, int fun = 20, int pantry = 2)
        {
            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_dee", "Dee")
            {
                HomeLocationId = "loc_home_dee",
                Personality = PersonalityProfile.Balanced(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = hunger, [NeedKind.Fun] = fun }
            });
            mind.PlannerMemory[StandardActions.PantryStock] = pantry;
            return mind;
        }

        private static void PrintPlan(string label, ActiveExecution? run)
        {
            if (run == null) { Console.Out.WriteLine($"{label}: no active plan"); return; }
            var chain = string.Join(" > ", run.Plan.Steps.Select(st => st.DisplayName));
            string cost = run.Plan.TotalCost.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture);
            Console.Out.WriteLine($"{label} goal={run.Goal} cost={cost}");
            Console.Out.WriteLine($"    {chain}");
        }

        private static void ScenarioA(ulong seed)
        {
            var world = NewTown(seed);
            var cognition = new CognitionSystem(world);
            var director = new PlanningDirector(world, cognition, roles: Roles());
            var mind = Spawn(world, hunger: 88);

            director.Tick(mind.Agent);
            PrintPlan("[A cafe-open ]", director.PeekActive(mind.Agent));
        }

        private static void ScenarioB(ulong seed)
        {
            var world = NewTown(seed);
            world.Locations.Get(new LocationId("loc_cafe")).SetOpen(false);
            var cognition = new CognitionSystem(world);
            var director = new PlanningDirector(world, cognition, roles: Roles());
            var mind = Spawn(world, hunger: 88);

            director.Tick(mind.Agent);
            PrintPlan("[B cafe-closed]", director.PeekActive(mind.Agent));
        }

        private static void ScenarioC(ulong seed)
        {
            var world = NewTown(seed);
            world.Locations.Get(new LocationId("loc_cafe")).SetOpen(false);
            var cognition = new CognitionSystem(world);
            var director = new PlanningDirector(world, cognition, roles: Roles());
            var mind = Spawn(world, hunger: 88, pantry: 0);

            director.Tick(mind.Agent);
            PrintPlan("[C no-pantry  ]", director.PeekActive(mind.Agent));
        }

        private static void LiveRunWithInterruption(ulong seed)
        {
            Console.Out.WriteLine("--- live day: critical interruption forces replan ---");
            var world = NewTown(seed);
            var cognition = new CognitionSystem(world);
            var director = new PlanningDirector(world, cognition, roles: Roles());
            var mind = Spawn(world, hunger: 15, fun: 96); // fun urgent -> Relax plan

            world.Events.Subscribe<PlanStartedEvent>(e =>
                Line(e.AtTime, $"plan-start {e.Agent} goal={e.Goal} steps={e.StepCount}"));
            world.Events.Subscribe<PlanStepCompletedEvent>(e =>
                Line(e.AtTime, $"step-done  {e.Action} ({e.StepIndex + 1})"));
            world.Events.Subscribe<PlanFinishedEvent>(e =>
                Line(e.AtTime, $"plan-{e.Outcome.ToString().ToLowerInvariant(),9} {e.Goal} reason={e.Reason}"));

            // Mid-plan hunger spike crosses the interrupt threshold.
            var spikeTime = new SimTime(0, 0, 45);
            world.Scheduler.ScheduleAt(spikeTime,
                _ => world.Residents.Get(mind.Agent).Needs.Get(NeedKind.Hunger).Apply(-90f),
                "missed-meals");

            for (int t = 0; t < 60 * 4 && (t == 0 || director.IsBusy(mind.Agent)); t += 5)
            {
                cognition.AdvanceNeeds(SimDuration.FromMinutes(t == 0 ? 0 : 5));
                world.Clock.Advance(SimDuration.FromMinutes(t == 0 ? 0 : 5));
                director.Tick(mind.Agent);
            }

            Console.Out.WriteLine($"final: t={world.Clock.CurrentTime} at={world.Agents.Get(mind.Agent).CurrentLocationId} " +
                $"hunger={mind.Needs.Get(NeedKind.Hunger).Current:0}");
        }

        private static void Line(SimTime time, string message) =>
            Console.Out.WriteLine($"[{time}] {message}");
    }
}
