using System;
using System.Collections.Generic;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class WorldTests
    {
        private static SimulationWorld NewWorld()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed: 1234));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_a"), "Home A"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe", capacity: 2));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Bakery"));
            return world;
        }

        [Test]
        public void Bootstrap_IsDeterministic()
        {
            var a = SimulationBootstrap.CreateWorld(new SimulationConfiguration(1234, new SimTime(0, 8, 0)));
            var b = SimulationBootstrap.CreateWorld(new SimulationConfiguration(1234, new SimTime(0, 8, 0)));
            Assert.AreEqual(a.Clock.CurrentTime, b.Clock.CurrentTime);
            Assert.AreEqual(a.Randoms.MasterSeed, b.Randoms.MasterSeed);

            // identical stream draws from identically constructed worlds
            Assert.AreEqual(
                a.Randoms.GetStream(RandomStreams.Agents).NextUInt64(),
                b.Randoms.GetStream(RandomStreams.Agents).NextUInt64());
        }

        [Test]
        public void SpawnAgent_RegistersAndPublishesEvent()
        {
            var world = NewWorld();
            AgentSpawnedEvent? spawned = null;
            world.Events.Subscribe<AgentSpawnedEvent>(e => spawned = e);

            var agent = world.SpawnAgent("npc_rohan", "Rohan", homeLocationId: "loc_home_a");

            Assert.IsNotNull(agent);
            Assert.AreEqual("npc_rohan", agent.Identity.Id.Value);
            Assert.AreEqual("Rohan", agent.Identity.DisplayName);
            Assert.IsTrue(world.Agents.TryGet(new AgentId("npc_rohan"), out _));
            Assert.AreEqual(1, world.Agents.Count);
            Assert.IsNotNull(spawned);
            Assert.AreEqual("npc_rohan", spawned!.Value.Agent.Value);
        }

        [Test]
        public void DuplicateAgentIds_AreRejected()
        {
            var world = NewWorld();
            world.SpawnAgent("npc_x", "X");
            Assert.Throws<InvalidOperationException>(() => world.SpawnAgent("npc_x", "X again"));
        }

        [Test]
        public void MoveAgent_UpdatesOccupancyAndPublishesEvent()
        {
            var world = NewWorld();
            world.SpawnAgent("npc_a", "A", homeLocationId: "loc_home_a");
            var moved = new List<AgentMovedEvent>();
            world.Events.Subscribe<AgentMovedEvent>(moved.Add);

            world.MoveAgent(new AgentId("npc_a"), new LocationId("loc_cafe"));

            Assert.AreEqual(0, world.Locations.Get(new LocationId("loc_home_a")).OccupiedCount);
            Assert.AreEqual(1, world.Locations.Get(new LocationId("loc_cafe")).OccupiedCount);
            Assert.AreEqual("loc_cafe", world.Agents.Get(new AgentId("npc_a")).CurrentLocationId.Value);
            Assert.AreEqual(1, moved.Count);
            Assert.AreEqual("loc_home_a", moved[0].FromLocation!.Value.Value);
            Assert.AreEqual("loc_cafe", moved[0].ToLocation.Value);
        }

        [Test]
        public void MoveToSameLocation_IsNoOp()
        {
            var world = NewWorld();
            world.SpawnAgent("npc_a", "A", homeLocationId: "loc_home_a");
            int moves = 0;
            world.Events.Subscribe<AgentMovedEvent>(_ => moves++);

            bool changed = world.MoveAgent(new AgentId("npc_a"), new LocationId("loc_home_a"));

            Assert.IsFalse(changed);
            Assert.AreEqual(0, moves);
            Assert.AreEqual(1, world.Locations.Get(new LocationId("loc_home_a")).OccupiedCount);
        }

        [Test]
        public void Capacity_IsEnforced()
        {
            var world = NewWorld(); // cafe capacity = 2
            world.SpawnAgent("npc_1", "1", startLocationId: "loc_cafe");
            world.SpawnAgent("npc_2", "2", startLocationId: "loc_cafe");

            world.SpawnAgent("npc_3", "3"); // not placed yet
            Assert.Throws<InvalidOperationException>(
                () => world.MoveAgent(new AgentId("npc_3"), new LocationId("loc_cafe")));
        }

        [Test]
        public void UnknownIds_ProduceClearErrors()
        {
            var world = NewWorld();
            world.SpawnAgent("npc_a", "A");

            Assert.Throws<KeyNotFoundException>(() => world.MoveAgent(new AgentId("npc_ghost"), new LocationId("loc_cafe")));
            Assert.Throws<KeyNotFoundException>(() => world.PlaceAt(new AgentId("npc_a"), new LocationId("loc_nowhere")));
        }

        [Test]
        public void ClosedLocation_RejectsArrivals()
        {
            var world = NewWorld();
            world.SpawnAgent("npc_a", "A", homeLocationId: "loc_home_a");
            world.Locations.Get(new LocationId("loc_cafe")).SetOpen(false);

            Assert.Throws<InvalidOperationException>(
                () => world.MoveAgent(new AgentId("npc_a"), new LocationId("loc_cafe")));
        }

        [Test]
        public void HeadlessRunner_AdvancesInSteps_AndSchedulerKeepsUp()
        {
            var world = NewWorld();
            var hits = new List<SimTime>();
            world.Scheduler.ScheduleDailyAt(6, 0, t => hits.Add(t), "dawn");

            HeadlessSimulationRunner.RunFor(world, SimDuration.FromDays(3), stepMinutes: 10);

            Assert.AreEqual(3, hits.Count);
            Assert.AreEqual(SimDuration.FromDays(3), world.Clock.CurrentTime - SimTime.Epoch);
        }
    }
}
