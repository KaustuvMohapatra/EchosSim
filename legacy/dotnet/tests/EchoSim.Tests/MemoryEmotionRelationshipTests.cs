using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class MemoryEmotionRelationshipTests
    {
        private static (SimulationWorld World, PerceptionSystem Perception, MemorySystem Memory, EmotionSystem Emotion, RelationshipSystem Relationships) NewWorld(ulong seed = 7001)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Bakery"));
            world.ConnectLocations(new LocationId("loc_cafe"), new LocationId("loc_bakery"));

            var perception = new PerceptionSystem(world);
            var memory = new MemorySystem(world);
            var emotion = new EmotionSystem(world);
            var relationships = new RelationshipSystem(world);
            _ = new SocialReactionSystem(world, memory, emotion, relationships);
            return (world, perception, memory, emotion, relationships);
        }

        private static AgentMind Spawn(SimulationWorld world, string id, string home = "loc_cafe", PersonalityProfile? personality = null)
        {
            return world.SpawnResident(new ResidentSpec(id, id)
            {
                HomeLocationId = home,
                Personality = personality ?? PersonalityProfile.Balanced()
            }).Mind;
        }

        // ---------- Sprint 7: memory ----------

        [Test]
        public void Noise_IsNotEncoded_ButIncidentsAre()
        {
            var (world, perception, memory, _, _) = NewWorld();
            Spawn(world, "npc_a");
            Spawn(world, "npc_b");

            perception.Publish("movement", new[] { new AgentId("npc_a") }, new LocationId("loc_cafe"), ObservationReach.SameLocation);
            perception.Publish("insult", new[] { new AgentId("npc_a"), new AgentId("npc_b") }, new LocationId("loc_cafe"), ObservationReach.SameLocation);

            var storeA = memory.StoreFor(new AgentId("npc_a")); // participant
            Assert.AreEqual(1, storeA.Count, "movement is noise; insult is remembered");
            Assert.AreEqual("insult", storeA.All[0].EventType);
            Assert.AreEqual(1, memory.StoreFor(new AgentId("npc_b")).Count,
                "both participants encode exactly the incident");
        }

        [Test]
        public void GrudgeRetention_AmplifiesNegativeMemoryImportance()
        {
            var (world, perception, memory, _, _) = NewWorld();
            var calm = Spawn(world, "npc_calm",
                personality: PersonalityProfile.Balanced().Edit().Set(PersonalityTrait.GrudgeRetention, 0f).Build());
            var salty = Spawn(world, "npc_salty",
                personality: PersonalityProfile.Balanced().Edit().Set(PersonalityTrait.GrudgeRetention, 1f).Build());
            var a = new AgentId("npc_a");
            var b = new AgentId("npc_b");
            world.SpawnResident(new ResidentSpec("npc_a", "a") { HomeLocationId = "loc_cafe" });
            world.SpawnResident(new ResidentSpec("npc_b", "b") { HomeLocationId = "loc_cafe" });

            perception.Publish("insult", new[] { a, b }, new LocationId("loc_cafe"), ObservationReach.SameLocation);

            float calmImportance = memory.StoreFor(calm.Agent).All.Single(m => m.EventType == "insult").Importance;
            float saltyImportance = memory.StoreFor(salty.Agent).All.Single(m => m.EventType == "insult").Importance;
            Assert.Greater(saltyImportance, calmImportance, "grudges burn deeper into memory");
        }

        [Test]
        public void Retrieval_RanksRecentAndRelevantMemoriesFirst_WithBreakdown()
        {
            var (world, perception, memory, _, _) = NewWorld();
            var witness = Spawn(world, "npc_witness");
            var a = new AgentId("npc_a");
            var b = new AgentId("npc_b");
            world.SpawnResident(new ResidentSpec("npc_a", "a") { HomeLocationId = "loc_cafe" });
            world.SpawnResident(new ResidentSpec("npc_b", "b") { HomeLocationId = "loc_cafe" });

            // Old insult from A...
            perception.Publish("insult", new[] { a, b }, new LocationId("loc_cafe"), ObservationReach.SameLocation);
            // ...then lots of harmless chatter.
            for (int i = 0; i < 6; i++)
            {
                world.Clock.Advance(SimDuration.FromMinutes(30));
                perception.Publish("chat", new[] { b }, new LocationId("loc_cafe"), ObservationReach.SameLocation);
            }
            world.Clock.Advance(SimDuration.FromHours(30)); // let the insult go stale

            var query = new RetrievalQuery { AboutAgent = a, Now = world.Clock.CurrentTime };
            var results = memory.Recall(witness.Agent, query, topN: 3);

            Assert.IsNotEmpty(results);
            StringAssert.Contains("insult", results[0].Memory.Summary ?? results[0].Memory.EventType,
                "the A-related insult should outrank generic chatter when asked about A");
            CollectionAssert.Contains(results[0].Breakdown.Select(l => l.Label), "ActorMatch");
            float sum = results[0].Breakdown.Sum(l => l.Value);
            Assert.AreEqual(sum, results[0].Score, 0.0002f, "breakdown sums to score");
        }

        [Test]
        public void Capacity_EvictsLeastImportant_First()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(7001));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            var perception = new PerceptionSystem(world);
            var memory = new MemorySystem(world);
            _ = new SocialReactionSystem(world, memory, new EmotionSystem(world), new RelationshipSystem(world));
            var witness = Spawn(world, "npc_witness");

            perception.LogCapacity = 500;
            var store = memory.StoreFor(witness.Agent);

            perception.Publish("insult", new[] { new AgentId("npc_x"), new AgentId("npc_y") }, new LocationId("loc_cafe"), ObservationReach.SameLocation);
            for (int i = 0; i < 60; i++)
            {
                world.Clock.Advance(SimDuration.FromMinutes(120)); // age chats beyond consolidation window
                perception.Publish("chat", new[] { new AgentId("npc_z") }, new LocationId("loc_cafe"), ObservationReach.SameLocation);
            }

            memory.ConsolidationFloor = 0.32f; // chats encode at ~0.306 after visual scaling
            int removed = memory.ConsolidateAll();
            Assert.Greater(removed, 0, "old unaccessed low-value memories consolidate away");
            Assert.Less(store.Count, 61);
            Assert.IsTrue(store.All.Any(m => m.EventType == "insult"), "important memories survive consolidation");
        }

        // ---------- Sprint 8: emotion ----------

        [Test]
        public void Emotion_Clamps_Decays_AndFeedsGoalScoring()
        {
            var (world, perception, memory, emotion, relationships) = NewWorld();
            var mind = Spawn(world, "npc_moodful");

            emotion.Apply(mind.Agent, +5f, 2f); // far beyond range
            Assert.AreEqual(1f, mind.EmotionValence, 0.001f, "valence clamps to +1");
            Assert.AreEqual(1f, emotion.ArousalOf(mind.Agent), 0.001f);

            emotion.Tick(SimDuration.FromMinutes(240 * 10)); // ~10 half-lives
            Assert.Less(Math.Abs(mind.EmotionValence), 0.01f, "decays toward neutral");

            // Insults darken mood via the reaction pipeline.
            var before = mind.EmotionValence;
            perception.Publish("insult", new[] { new AgentId("npc_a") , new AgentId("npc_b") },
                new LocationId("loc_cafe"), ObservationReach.Town);
            Assert.Less(mind.EmotionValence, before, "witnessing an insult darkens mood");

            _ = memory; _ = relationships;
        }

        // ---------- Sprint 9: relationships ----------

        [Test]
        public void Relationships_AreDirectional_AndEventDriven()
        {
            var (world, perception, _, _, relationships) = NewWorld();
            var rohan = Spawn(world, "npc_rohan").Agent;
            var anika = Spawn(world, "npc_anika").Agent;

            // Rohan insults Anika while both are at the cafe (Anika participates).
            perception.Publish("insult", new[] { rohan, anika }, new LocationId("loc_cafe"), ObservationReach.SameLocation);

            var rohanToAnika = relationships.GetOrCreate(rohan, anika);
            var anikaToRohan = relationships.GetOrCreate(anika, rohan);

            Assert.Less(anikaToRohan.Affinity, 0f, "target resents the insulter");
            Assert.Greater(anikaToRohan.Grievance, 0.1f, "grievance accumulates");
            Assert.AreNotEqual(rohanToAnika.Affinity, anikaToRohan.Affinity, "directional storage");
        }

        [Test]
        public void Witnessing_Harm_ColoursView_OfTheCulprit()
        {
            var (world, perception, _, _, relationships) = NewWorld();
            var culprit = Spawn(world, "npc_culprit").Agent;
            var victim = Spawn(world, "npc_victim").Agent;
            var watcher = Spawn(world, "npc_watcher").Agent;

            perception.Publish("insult_incident", new[] { culprit, victim }, new LocationId("loc_cafe"), ObservationReach.SameLocation);

            var watcherView = relationships.GetOrCreate(watcher, culprit);
            Assert.Less(watcherView.Affinity, 0f, "watcher thinks worse of the bully");
            Assert.GreaterOrEqual(relationships.GetOrCreate(watcher, victim).Affinity, -1f);
        }

        [Test]
        public void GrudgeHolders_HardenFaster_ThanPacifists()
        {
            var (world, perception, _, _, relationships) = NewWorld();
            var grudgeHolder = Spawn(world, "npc_grudge",
                personality: PersonalityProfile.Balanced().Edit().Set(PersonalityTrait.GrudgeRetention, 1f).Build()).Agent;
            var patient = Spawn(world, "npc_patient",
                personality: PersonalityProfile.Balanced().Edit().Set(PersonalityTrait.GrudgeRetention, 0f).Set(PersonalityTrait.Patience, 1f).Build()).Agent;
            var rude = Spawn(world, "npc_rude").Agent;

            perception.Publish("insult", new[] { rude, grudgeHolder }, new LocationId("loc_cafe"), ObservationReach.Town);
            perception.Publish("insult", new[] { rude, patient }, new LocationId("loc_cafe"), ObservationReach.Town);

            float grudgeGrievance = relationships.GetOrCreate(grudgeHolder, rude).Grievance;
            float patientGrievance = relationships.GetOrCreate(patient, rude).Grievance;
            Assert.Greater(grudgeGrievance, patientGrievance, "grudge retention scales negative impact");
        }

        [Test]
        public void Drift_SoftensGrievance_AndLabelsEvolve()
        {
            var (world, _, _, _, relationships) = NewWorld();
            var a = Spawn(world, "npc_a").Agent;
            var b = Spawn(world, "npc_b").Agent;
            var rel = relationships.GetOrCreate(b, a);

            rel.Seed(affinity: -0.7f, grievance: 0.9f);
            Assert.AreEqual(RelationshipLabel.Enemy, rel.Label());

            for (int i = 0; i < 200; i++) relationships.Drift(SimDuration.FromHours(4));
            Assert.Less(rel.Grievance, 0.3f, "grievances soften over days");
            Assert.AreEqual(RelationshipLabel.Rival, rel.Label(),
                "below the enemy threshold, but deep dislike persists — grudges fade slower than headlines");
        }
    }
}
