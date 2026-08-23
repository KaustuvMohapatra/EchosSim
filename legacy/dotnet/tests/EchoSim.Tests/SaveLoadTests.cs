using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class SaveLoadTests
    {
        private sealed class LivingTown
        {
            public SimulationWorld World;
            public PerceptionSystem Perception;
            public MemorySystem Memory;
            public EmotionSystem Emotion;
            public RelationshipSystem Relationships;
            public BeliefSystem Beliefs;
            public WeatherSystem Weather;
            public CognitionSystem Cognition;
            public PlanningDirector Director;
        }

        /// <summary>A town with jobs, hours, social history and live cognition — the hard case.</summary>
        private static LivingTown BuildTown(ulong seed)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe",
                hours: OpeningHours.FromClock(6, 0, 20, 0)));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Bakery"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_a"), "Home A"));

            var perception = new PerceptionSystem(world);
            var memory = new MemorySystem(world);
            var emotion = new EmotionSystem(world);
            var relationships = new RelationshipSystem(world);
            var beliefs = new BeliefSystem(world, relationships);
            _ = new SocialReactionSystem(world, memory, emotion, relationships);
            var weather = new WeatherSystem(world, world.Randoms.GetStream(RandomStreams.World));
            weather.Set(WeatherState.Rain);

            var cognition = new CognitionSystem(world);
            cognition.SetWeatherProvider(() => weather.Current);

            var roles = new TownRoles { Cafe = new LocationId("loc_cafe") };
            var director = new PlanningDirector(world, cognition, roles: roles,
                economy: null);

            // Two residents with a past.
            var rohan = world.SpawnResident(new ResidentSpec("npc_rohan", "Rohan")
            {
                HomeLocationId = "loc_home_a",
                Personality = PersonalityProfile.MiraLike().Edit().Set(PersonalityTrait.GrudgeRetention, 0.9f).Build(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 60f }
            }).Mind;
            var anika = world.SpawnResident(new ResidentSpec("npc_anika", "Anika")
            {
                HomeLocationId = "loc_home_a",
                Personality = PersonalityProfile.Balanced()
            }).Mind;

            world.PlaceAt(rohan.Agent, new LocationId("loc_cafe"));
            world.PlaceAt(anika.Agent, new LocationId("loc_cafe"));

            // Social history: an insult plus a belief about the player.
            perception.Publish("insult_incident",
                new[] { rohan.Agent, anika.Agent }, new LocationId("loc_cafe"), ObservationReach.SameLocation);
            beliefs.LearnDirect(rohan.Agent, "player", "is_trustworthy", -0.6f, 0.85f, new EventId(31337));

            return new LivingTown
            {
                World = world, Perception = perception, Memory = memory, Emotion = emotion,
                Relationships = relationships, Beliefs = beliefs, Weather = weather,
                Cognition = cognition, Director = director
            };
        }

        [Test]
        public void Capture_Restore_PreservesTheWholeSocialState()
        {
            var town = BuildTown(18001);
            var service = new SaveService(town.World, town.Memory, town.Beliefs, town.Relationships, town.Weather);
            var data = service.Capture();

            Assert.AreEqual(1, data.SchemaVersion);
            Assert.AreEqual(3, data.Locations.Count);
            Assert.AreEqual(2, data.Agents.Count);
            Assert.AreEqual(1, data.Relationships.Count, "the incident created at least one directional link");
            Assert.Greater(data.Memories.Count, 0, "incident memories captured");
            Assert.AreEqual(1, data.Beliefs.Count, "rohan's belief about the player captured");

            // Verify field-level fidelity on one agent.
            var rohanDto = data.Agents.Single(a => a.Id == "npc_rohan");
            Assert.AreEqual(60f, rohanDto.Needs["Hunger"], 0.01f);
            Assert.AreEqual("loc_cafe", rohanDto.Current);
            Assert.AreEqual(14, rohanDto.Personality.Length);
        }

        [Test]
        public void RoundTrip_LoadedTown_ContinuesIdentically()
        {
            const int continueMinutes = 240; // 4 more simulated hours after the save

            // Town A: run, save mid-flight, keep running, record its future log.
            var townA = BuildTown(18002);
            var serviceA = new SaveService(townA.World, townA.Memory, townA.Beliefs, townA.Relationships,
                townA.Weather, townA.Cognition, townA.Director);
            HeadlessSimulationRunner.RunFor(townA.World, SimDuration.FromHours(3), stepMinutes: 10);
            var snapshot = serviceA.Capture();

            var logA = new List<string>();
            townA.World.Events.Subscribe<AgentMovedEvent>(e => logA.Add($"move|{e.Agent}|{e.ToLocation}|{e.AtTime}"));
            townA.World.Events.Subscribe<PlanStartedEvent>(e => logA.Add($"plan|{e.Agent}|{e.Goal}|{e.AtTime}"));
            townA.World.Events.Subscribe<PlanFinishedEvent>(e => logA.Add($"fin|{e.Agent}|{e.Outcome}|{e.AtTime}"));

            // Town B: restore from the same snapshot, then run identically.
            var restored = SaveService.Restore(snapshot);
            var logB = new List<string>();
            restored.World.Events.Subscribe<AgentMovedEvent>(e => logB.Add($"move|{e.Agent}|{e.ToLocation}|{e.AtTime}"));
            restored.World.Events.Subscribe<PlanStartedEvent>(e => logB.Add($"plan|{e.Agent}|{e.Goal}|{e.AtTime}"));
            restored.World.Events.Subscribe<PlanFinishedEvent>(e => logB.Add($"fin|{e.Agent}|{e.Outcome}|{e.AtTime}"));

            var directorB = new PlanningDirector(restored.World, restored.Cognition,
                roles: new TownRoles { Cafe = new LocationId("loc_cafe") });
            foreach (var run in restored.ActiveRuns)
                directorB.RestoreRun(new AgentId(run.Agent), run.GoalId, run.StepActionIds,
                    run.NextStepIndex, run.RemainingMinutes);

            for (int m = 0; m < continueMinutes; m += 10)
            {
                townA.Cognition.AdvanceNeeds(SimDuration.FromMinutes(10));
                restored.Cognition.AdvanceNeeds(SimDuration.FromMinutes(10));
                townA.World.Clock.Advance(SimDuration.FromMinutes(10));
                restored.World.Clock.Advance(SimDuration.FromMinutes(10));
                townA.Director.TickAll();
                directorB.TickAll();
            }

            string divergence = "restored town diverged.\nA[0..5]: " + string.Join(" / ", logA.Take(5)) +
                                "\nB[0..5]: " + string.Join(" / ", logB.Take(5));
            CollectionAssert.AreEqual(logA, logB, divergence);
            Assert.AreEqual(restored.World.Clock.CurrentTime.TotalMinutes,
                townA.World.Clock.CurrentTime.TotalMinutes);
        }

        [Test]
        public void WriteRead_RoundTripsThroughDisk()
        {
            var town = BuildTown(18003);
            var service = new SaveService(town.World, town.Memory, town.Beliefs, town.Relationships, town.Weather);
            var original = service.Capture();

            string path = Path.Combine(Path.GetTempPath(), "echosim_tests", "save_" + Guid.NewGuid().ToString("N") + ".json");
            try
            {
                SaveService.WriteFile(path, original);
                Assert.IsTrue(File.Exists(path));
                Assert.IsTrue(File.ReadAllText(path).Contains("\"SchemaVersion\": 1"), "human-inspectable JSON");

                var loaded = SaveService.ReadFile(path);
                Assert.AreEqual(original.Seed, loaded.Seed);
                Assert.AreEqual(original.Agents.Count, loaded.Agents.Count);
                Assert.AreEqual(original.Memories.Count, loaded.Memories.Count);
                CollectionAssert.AreEqual(
                    original.Agents.Select(a => a.Id),
                    loaded.Agents.Select(a => a.Id));

                // Backup appears after a second overwrite.
                SaveService.WriteFile(path, loaded);
                Assert.IsTrue(File.Exists(path + ".bak"), "atomic replace keeps a backup");
            }
            finally
            {
                if (Directory.Exists(Path.GetDirectoryName(path)))
                    Directory.Delete(Path.GetDirectoryName(path)!, recursive: true);
            }
        }

        [Test]
        public void Missing_And_Corrupt_And_FutureVersion_Files_AreHandledGracefully()
        {
            string dir = Path.Combine(Path.GetTempPath(), "echosim_tests", "edge_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            try
            {
                Assert.Throws<FileNotFoundException>(() => SaveService.ReadFile(Path.Combine(dir, "nope.json")));

                string corrupt = Path.Combine(dir, "corrupt.json");
                File.WriteAllText(corrupt, "{ this is not json !!!");
                Assert.Throws<InvalidDataException>(() => SaveService.ReadFile(corrupt));

                string future = Path.Combine(dir, "future.json");
                File.WriteAllText(future, "{\"SchemaVersion\": 99}");
                Assert.Throws<UnsupportedSaveVersionException>(() => SaveService.ReadFile(future));
            }
            finally
            {
                Directory.Delete(dir, recursive: true);
            }
        }
    }
}
