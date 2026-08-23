using System;
using System.Collections.Generic;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class PerceptionTests
    {
        private static (SimulationWorld World, PerceptionSystem Perception) NewCafeScene()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(6001));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Bakery"));   // adjacent to cafe
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_library"), "Library")); // NOT adjacent
            world.ConnectLocations(new LocationId("loc_cafe"), new LocationId("loc_bakery"));

            world.SpawnResident(new ResidentSpec("npc_actor", "Actor") { HomeLocationId = "loc_cafe" });
            world.SpawnResident(new ResidentSpec("npc_witness", "Witness") { HomeLocationId = "loc_cafe" });
            world.SpawnResident(new ResidentSpec("npc_bakeryside", "Baker") { HomeLocationId = "loc_bakery" });
            world.SpawnResident(new ResidentSpec("npc_faraway", "Far") { HomeLocationId = "loc_library" });

            var perception = new PerceptionSystem(world);
            return (world, perception);
        }

        [Test]
        public void Participant_AlwaysObserves_WithDirectSource()
        {
            var (world, perception) = NewCafeScene();
            var actor = new AgentId("npc_actor");
            var target = new AgentId("npc_witness");

            perception.Publish("insult", new[] { actor, target }, new LocationId("loc_cafe"), ObservationReach.SameLocation);

            var obs = perception.ObservationsOf(target);
            Assert.AreEqual(1, obs.Count);
            Assert.AreEqual(PerceptionSource.DirectParticipation, obs[0].Source);
            Assert.AreEqual(1f, obs[0].Confidence, 0.001f);

            // Even a participant located elsewhere would observe directly:
            // the actor is at the cafe but the event still involves them.
            var actorObs = perception.ObservationsOf(actor);
            Assert.AreEqual(1, actorObs.Count);
        }

        [Test]
        public void CoLocated_NonParticipant_Observes_Visually()
        {
            var (world, perception) = NewCafeScene();

            perception.Publish("insult", new[] { new AgentId("npc_actor") },
                new LocationId("loc_cafe"), ObservationReach.SameLocation);

            var witnessObs = perception.ObservationsOf(new AgentId("npc_witness"));
            Assert.AreEqual(1, witnessObs.Count, "co-located resident sees it");
            Assert.AreEqual(PerceptionSource.VisualNearby, witnessObs[0].Source);
            Assert.AreEqual(0.9f, witnessObs[0].Confidence, 0.001f);
        }

        [Test]
        public void DistantAgent_DoesNotObserve_SameLocationEvent()
        {
            var (world, perception) = NewCafeScene();

            perception.Publish("quiet_chat", new[] { new AgentId("npc_actor"), new AgentId("npc_witness") },
                new LocationId("loc_cafe"), ObservationReach.SameLocation);

            Assert.AreEqual(0, perception.ObservationsOf(new AgentId("npc_faraway")).Count,
                "an agent in another, unconnected location must not perceive a quiet event");
            Assert.AreEqual(0, perception.ObservationsOf(new AgentId("npc_bakeryside")).Count,
                "adjacency alone does not carry quiet events");
        }

        [Test]
        public void AudibleReach_CarriesToAdjacent_ButNoFurther()
        {
            var (world, perception) = NewCafeScene();

            perception.Publish("shouting_match", new[] { new AgentId("npc_actor") },
                new LocationId("loc_cafe"), ObservationReach.Nearby);

            var bakerySide = perception.ObservationsOf(new AgentId("npc_bakeryside"));
            Assert.AreEqual(1, bakerySide.Count, "adjacent location hears loud events");
            Assert.AreEqual(PerceptionSource.AudibleNearby, bakerySide[0].Source);
            Assert.AreEqual(0.7f, bakerySide[0].Confidence, 0.001f);

            Assert.AreEqual(0, perception.ObservationsOf(new AgentId("npc_faraway")).Count,
                "non-adjacent locations hear nothing");
        }

        [Test]
        public void Announcement_ReachesWholePopulation()
        {
            var (world, perception) = NewCafeScene();
            var everyone = new[]
            {
                new AgentId("npc_actor"), new AgentId("npc_witness"),
                new AgentId("npc_bakeryside"), new AgentId("npc_faraway")
            };

            perception.Announce("town_festival", Array.Empty<AgentId>(), new LocationId("loc_square_placeholder"));

            foreach (var id in everyone)
            {
                var log = perception.ObservationsOf(id);
                Assert.AreEqual(1, log.Count, $"{id} must receive the announcement");
                Assert.AreEqual(PerceptionSource.Announcement, log[0].Source);
                Assert.GreaterOrEqual(log[0].Confidence, 0.9f);
            }
        }

        [Test]
        public void Movement_IsAutoObserved_ByCoLocatedOnly()
        {
            var (world, perception) = NewCafeScene();
            var mover = new AgentId("npc_actor");

            world.MoveAgent(mover, new LocationId("loc_bakery")); // fires AgentMovedEvent

            // Witness stayed at cafe: sees nothing (the arrival is AT the bakery).
            Assert.AreEqual(0, perception.ObservationsOf(new AgentId("npc_witness")).Count);
            // Bakery-side resident observes the arrival visually.
            var bakerySide = perception.ObservationsOf(new AgentId("npc_bakeryside"));
            Assert.AreEqual(1, bakerySide.Count);
            Assert.AreEqual("movement", bakerySide[0].EventType);
        }

        [Test]
        public void LogCapacity_RingsOldestOut()
        {
            var (world, perception) = NewCafeScene();
            perception.LogCapacity = 5;
            var agent = new AgentId("npc_witness");

            for (int i = 0; i < 12; i++)
            {
                world.Clock.Advance(SimDuration.FromMinutes(1));
                perception.Publish("tick_event", Array.Empty<AgentId>(), new LocationId("loc_cafe"), ObservationReach.SameLocation);
            }

            var log = perception.ObservationsOf(agent);
            Assert.AreEqual(5, log.Count, "ring buffer caps retention");
            Assert.AreEqual(new EventId(8), log[0].Event, "oldest retained is #8 after 12 events");
        }
    }
}
