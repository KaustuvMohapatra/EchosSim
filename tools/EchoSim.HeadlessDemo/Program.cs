using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;

namespace EchoSim.HeadlessDemo
{
    /// <summary>
    /// Sprint 2 demo: personality-driven utility selection.
    /// Two residents with identical needs except the ones under test:
    ///   - r_extravert: sociability 0.95, elevated social need
    ///   - r_introvert: sociability 0.05, elevated hunger
    /// Decisions are logged hourly with explainable score breakdowns.
    /// Deterministic for a given seed.
    /// </summary>
    internal static class Program
    {
        private static void Main(string[] args)
        {
            ulong seed = args.Length > 0 && ulong.TryParse(args[0], out var s) ? s : 1234UL;
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed));
            Console.Out.WriteLine($"EchoSim sprint-2 demo | seed={seed} | start={world.Clock.CurrentTime}");

            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_a"), "Shared House"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Corner Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_library"), "Town Library"));

            var (_, extravert) = world.SpawnResident(new ResidentSpec("r_extravert", "Vera")
            {
                HomeLocationId = "loc_home_a",
                Personality = PersonalityProfile.Balanced().Edit()
                    .Set(PersonalityTrait.Sociability, 0.95f)
                    .Set(PersonalityTrait.Extraversion, 0.9f)
                    .Build(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Social] = 65f, [NeedKind.Hunger] = 30f }
            });

            var (_, introvert) = world.SpawnResident(new ResidentSpec("r_introvert", "Ivo")
            {
                HomeLocationId = "loc_home_a",
                Personality = PersonalityProfile.Balanced().Edit()
                    .Set(PersonalityTrait.Sociability, 0.05f)
                    .Set(PersonalityTrait.Extraversion, 0.15f)
                    .Build(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Social] = 20f, [NeedKind.Hunger] = 82f }
            });

            var cognition = new CognitionSystem(world);

            for (int hour = 0; hour < 10; hour++)
            {
                cognition.AdvanceNeeds(SimDuration.FromHours(1));
                world.Clock.Advance(SimDuration.FromHours(1));

                foreach (var pair in new[] { ("VERA", extravert), ("IVO ", introvert) })
                {
                    var decision = cognition.Decide(pair.Item2.Agent);
                    if (hour % 2 == 0 || decision.Effective.CriticalOverride)
                        LogDecision(pair.Item1, pair.Item2, decision);
                }
            }

            Console.Out.WriteLine("--- SUMMARY ---");
            foreach (var mind in new[] { extravert, introvert })
            {
                var needs = mind.Needs.All
                    .Select(n => n.Definition.Kind + "=" + n.Current.ToString("0", System.Globalization.CultureInfo.InvariantCulture));
                Console.Out.WriteLine($"{mind.Agent,-14} goal={mind.CurrentGoalId} needs: {string.Join(" ", needs)}");
            }
        }

        private static void LogDecision(string label, AgentMind mind, GoalDecision decision)
        {
            var e = decision.Effective;
            Console.Out.WriteLine(
                $"[{label}] pick={e.DisplayName,-9} score={e.Final.ToString("0.00", System.Globalization.CultureInfo.InvariantCulture)}" +
                (decision.KeptPrevious ? " kept(hysteresis)" : "") +
                (e.CriticalOverride ? " CRITICAL" : ""));
            foreach (var line in e.Breakdown.Take(3))
                Console.Out.WriteLine("           " + line);
        }
    }
}
