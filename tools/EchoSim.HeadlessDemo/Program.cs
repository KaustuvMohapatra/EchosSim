using System;
using System.Collections.Generic;
using EchoSim.Core;
using EchoSim.Simulation;

namespace EchoSim.HeadlessDemo
{
    /// <summary>
    /// Sprint 1 demo: seed 1234, three residents, two simulated days.
    /// Every line of output is deterministic — running twice yields identical logs.
    /// </summary>
    internal static class Program
    {
        private static SimulationWorld _world = null!;
        private static int Main(string[] args)
        {
            ulong seed = args.Length > 0 && ulong.TryParse(args[0], out var s) ? s : 1234UL;

            _world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed));
            Console.Out.WriteLine($"EchoSim headless demo | seed={seed} | start={_world.Clock.CurrentTime}");

            BuildTown();
            WireEventLogging();
            SpawnResidents();
            ScriptRoutines(seed);

            HeadlessSimulationRunner.RunFor(_world, SimDuration.FromDays(2), stepMinutes: 10);

            Console.Out.WriteLine("--- SUMMARY ---");
            Console.Out.WriteLine($"time            : {_world.Clock.CurrentTime}");
            Console.Out.WriteLine($"scheduler       : scheduled={_world.Scheduler.TotalScheduled} executed={_world.Scheduler.TotalExecuted} cancelled={_world.Scheduler.TotalCancelled}");
            Console.Out.WriteLine($"event bus       : published={_world.Events.Statistics.PublishedEvents} invocations={_world.Events.Statistics.HandlerInvocations}");
            foreach (var locId in _world.Locations.OrderedIds)
            {
                var loc = _world.Locations.Get(locId);
                Console.Out.WriteLine($"occupancy       : {loc.Definition.DisplayName}={loc.OccupiedCount}");
            }
            return 0;
        }

        private static void BuildTown()
        {
            _world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_rohan"), "Rohan's Apartment"));
            _world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_anika"), "Anika's Cottage"));
            _world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_arjun"), "Arjun's Flat"));
            _world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Rising Crumb Bakery", capacity: 6));
            _world.RegisterLocation(new LocationDefinition(new LocationId("loc_library"), "Town Library", capacity: 12));
            _world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Corner Cafe", capacity: 8));
            _world.RegisterLocation(new LocationDefinition(new LocationId("loc_square"), "Town Square", capacity: 40));
        }

        private static void WireEventLogging()
        {
            // Subscribe BEFORE spawning so the log order matches construction order.
            _world.Events.Subscribe<AgentSpawnedEvent>(e =>
                Line(e.AtTime, $"spawn   {e.Agent} home={Describe(e.StartLocation)}"));
            _world.Events.Subscribe<AgentMovedEvent>(e =>
                Line(e.AtTime, $"move    {e.Agent} {Describe(e.FromLocation)} -> {e.ToLocation}"));

            _world.Scheduler.ScheduleDailyAt(6, 0, t => Line(t, "town    dawn bell rings"));
            _world.Scheduler.ScheduleRepeating(SimDuration.FromHours(12), t => Line(t, "town    market crier does his rounds"));
        }

        private static void SpawnResidents()
        {
            _world.SpawnAgent("npc_rohan_baker", "Rohan", homeLocationId: "loc_home_rohan");
            _world.SpawnAgent("npc_anika_librarian", "Anika", homeLocationId: "loc_home_anika");
            _world.SpawnAgent("npc_arjun_barista", "Arjun", homeLocationId: "loc_home_arjun");
        }

        private static void ScriptRoutines(ulong seed)
        {
            // Per-resident routine jitter comes from the seeded agents stream:
            // identical seeds produce identical routines on every machine.
            var rng = _world.Randoms.GetStream(RandomStreams.Agents);

            Commute("npc_rohan_baker", "loc_bakery", departHour: 6, departMinuteBase: 45, returnHour: 17, returnMinuteBase: 30, rng);
            Commute("npc_anika_librarian", "loc_library", departHour: 8, departMinuteBase: 10, returnHour: 18, returnMinuteBase: 20, rng);
            Commute("npc_arjun_barista", "loc_cafe", departHour: 7, departMinuteBase: 40, returnHour: 19, returnMinuteBase: 5, rng);

            // Demonstrate cancellation: a day-2 festival announcement that never happens.
            var festival = _world.Scheduler.ScheduleAt(new SimTime(1, 11, 0),
                _ => Line(new SimTime(1, 11, 0), "town    FESTIVAL announced (should never print)"),
                "festival-announcement");
            _world.Scheduler.ScheduleAt(new SimTime(1, 9, 0),
                _ => { _world.Scheduler.Cancel(festival); Line(new SimTime(1, 9, 0), "town    festival committee cancels the announcement"); },
                "festival-cancel");
        }

        private static void Commute(string agentId, string workLocation, int departHour, int departMinuteBase,
            int returnHour, int returnMinuteBase, ISimRandom rng)
        {
            int departJitter = rng.NextInt(0, 25);   // 0..24 simulated minutes
            int returnJitter = rng.NextInt(0, 35);   // 0..34 simulated minutes

            int departTotal = departHour * 60 + departMinuteBase + departJitter;
            int returnTotal = returnHour * 60 + returnMinuteBase - returnJitter;

            var id = new AgentId(agentId);
            var work = new LocationId(workLocation);
            var home = _world.Agents.Get(id).HomeLocationId;

            _world.Scheduler.ScheduleDailyAt(departTotal / 60 % 24, departTotal % 60,
                _ => _world.MoveAgent(id, work), $"{agentId}-commute-out");
            _world.Scheduler.ScheduleDailyAt(returnTotal / 60 % 24, returnTotal % 60,
                _ => _world.MoveAgent(id, home), $"{agentId}-commute-home");
        }

        private static string Describe(LocationId? location) => location.HasValue ? location.Value.Value : "(nowhere)";

        private static void Line(SimTime time, string message) =>
            Console.Out.WriteLine($"[{time}] {message}");
    }
}
