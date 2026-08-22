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
            WorkingDay(seed);
        }

        /// <summary>Sprint 5: jobs, shifts and authored hours drive a full working day.</summary>
        private static void WorkingDay(ulong seed)
        {
            Console.Out.WriteLine("--- working day: employment rhythm ---");
            var world = NewTown(seed);
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Rising Crumb Bakery",
                hours: OpeningHours.FromClock(5, 0, 14, 0)));
            world.Affordances.Register(new LocationId("loc_bakery"), new ActionId("act_work"), "oven station");

            var hours = new OpeningHoursSystem(world);
            var jobs = new JobSystem(world);
            jobs.Define(new JobDefinition("job_baker", "Baker", new LocationId("loc_bakery"), 7 * 60, 13 * 60, 14f));
            jobs.Define(new JobDefinition("job_barista", "Barista", new LocationId("loc_cafe"), 9 * 60, 15 * 60, 12f));

            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_frida"), "Frida's Flat"));

            var rng = world.Randoms.GetStream(RandomStreams.Agents);
            string[] names = { "npc_bosse", "npc_frida" };
            string[] homes = { "loc_home_dee", "loc_home_frida" };

            var residents = new List<AgentMind>();
            for (int i = 0; i < names.Length; i++)
            {
                var (_, mind) = world.SpawnResident(new ResidentSpec(names[i], names[i].Substring(4))
                {
                    HomeLocationId = homes[i],
                    Personality = PersonalityProfile.Balanced().Edit()
                        .Set(PersonalityTrait.Ambition, 0.8f).Build(),
                    InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 25f }
                });
                jobs.Assign(mind.Agent, i == 0 ? "job_baker" : "job_barista");
                mind.SetRoutineOffset(rng.NextInt(-20, 21)); // seeded jitter, spec §5.6
                mind.PlannerMemory[StandardActions.PantryStock] = 2;
                residents.Add(mind);
            }

            var cognition = new CognitionSystem(world);
            cognition.SetSchedulePressureProvider(jobs.ComputePressure);
            var director = new PlanningDirector(world, cognition, roles: Roles(), hours: hours, jobs: jobs);

            world.Events.Subscribe<LocationOpenStateChangedEvent>(e =>
                Line(e.AtTime, $"hours    {e.Location} {(e.IsOpen ? "opens" : "closes")}"));
            world.Events.Subscribe<PlanStartedEvent>(e =>
                Line(e.AtTime, $"plan     {e.Agent} -> {e.Goal} ({e.StepCount} steps)"));
            world.Events.Subscribe<PlanFinishedEvent>(e =>
            {
                if (e.Outcome != PlanLifecycle.Succeeded)
                    Line(e.AtTime, $"plan-{e.Outcome.ToString().ToLowerInvariant()}  {e.Agent} {e.Goal} reason={e.Reason}");
            });
            world.Events.Subscribe<PlanStepCompletedEvent>(e =>
                Line(e.AtTime, $"step     {e.Agent} {e.Action} ({e.StepIndex + 1})"));

            for (int minute = 0; minute <= 24 * 60; minute += 10)
            {
                if (minute > 0)
                {
                    cognition.AdvanceNeeds(SimDuration.FromMinutes(10));
                    world.Clock.Advance(SimDuration.FromMinutes(10));
                }
                director.TickAll();
            }

            Console.Out.WriteLine($"end of day: t={world.Clock.CurrentTime}");
            foreach (var mind in residents)
                Console.Out.WriteLine(
                    $"{mind.Agent,-11} job={mind.Job!.Title,-7} at={world.Agents.Get(mind.Agent).CurrentLocationId} " +
                    $"hunger={mind.Needs.Get(NeedKind.Hunger).Current:0} energy={mind.Needs.Get(NeedKind.Energy).Current:0}");
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
            var fridaHome = new LocationId("loc_home_frida");
            world.Affordances.Register(fridaHome, new ActionId("act_sleep"), "bed");
            world.Affordances.Register(fridaHome, new ActionId("act_get_ingredients"), "fridge");
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
