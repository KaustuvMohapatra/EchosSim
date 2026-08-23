using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class AffordanceTests
    {
        [Test]
        public void Lookup_FindsProvidersByAction_InRegistrationOrder()
        {
            var reg = new AffordanceRegistry();
            var cafe = new LocationId("loc_cafe");
            var bakery = new LocationId("loc_bakery");
            var buy = new ActionId("act_buy_meal");

            reg.Register(cafe, buy, "cafe counter");
            reg.Register(bakery, buy, "bakery counter");
            reg.Register(cafe, new ActionId("act_relax"), "lounge");

            var providers = reg.FindByAction(buy);
            Assert.AreEqual(2, providers.Count);
            Assert.AreEqual("loc_cafe", providers[0].Provider.Value, "registration order preserved");
            Assert.AreEqual("cafe counter", providers[0].ObjectName);
            Assert.IsTrue(reg.CanPerform(buy, bakery));
            Assert.IsFalse(reg.CanPerform(new ActionId("act_sleep"), bakery));
        }

        [Test]
        public void ForLocation_ListsEverythingOffered()
        {
            var reg = new AffordanceRegistry();
            var home = new LocationId("loc_home_a");
            reg.Register(home, new ActionId("act_sleep"), "bed");
            reg.Register(home, new ActionId("act_get_ingredients"), "fridge");

            Assert.AreEqual(2, reg.ForLocation(home).Count);
        }

        [Test]
        public void GatedFactory_OmitsActionsWithoutAffordance()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(4001));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_x"), "Home X"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            var roles = new TownRoles { Cafe = new LocationId("loc_cafe"), GateByAffordances = true };
            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_g", "G") { HomeLocationId = "loc_home_x" });
            var agentState = world.Agents.Get(mind.Agent);

            // No affordances registered yet.
            var gated = StandardActions.CreateForResident(world, agentState, roles);
            Assert.IsNull(gated.FirstOrDefault(a => a.Id.Value == "act_sleep"), "no bed -> no sleep action");
            Assert.IsNull(gated.FirstOrDefault(a => a.Id.Value == "act_buy_meal"), "no counter -> no buy");

            // Register affordances and compare.
            world.Affordances.Register(new LocationId("loc_home_x"), new ActionId("act_sleep"), "bed");
            world.Affordances.Register(new LocationId("loc_home_x"), new ActionId("act_get_ingredients"), "fridge");
            world.Affordances.Register(new LocationId("loc_cafe"), new ActionId("act_buy_meal"), "counter");
            var ungated = StandardActions.CreateForResident(world, agentState, roles);
            Assert.IsNotNull(ungated.FirstOrDefault(a => a.Id.Value == "act_sleep"));
            Assert.IsNotNull(ungated.FirstOrDefault(a => a.Id.Value == "act_buy_meal"));
        }
    }

    public class ReservationTests
    {
        [Test]
        public void Conflict_IsRejected_ForSecondClaimant()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(4002));
            var res = new ReservationService(world, sweepEveryMinutes: 1000); // no interference
            var seat = new ResourceId("seat:loc_cafe");
            var a = new AgentId("npc_a");
            var b = new AgentId("npc_b");
            var until = new SimTime(0, 2, 0);

            Assert.IsTrue(res.Reserve(seat, a, until));
            Assert.IsFalse(res.Reserve(seat, b, until), "second claimant must be denied while held");
            Assert.AreEqual(a, res.Holder(seat));
            Assert.AreEqual(1, res.TotalDenied);
        }

        [Test]
        public void Release_FreesResource_AndValidatesOwnership()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(4002));
            var res = new ReservationService(world, sweepEveryMinutes: 1000);
            var seat = new ResourceId("seat:1");
            var a = new AgentId("npc_a");
            var b = new AgentId("npc_b");

            res.Reserve(seat, a, new SimTime(0, 5, 0));
            Assert.IsFalse(res.Release(seat, b), "non-owner cannot release");
            Assert.IsTrue(res.Release(seat, a));
            Assert.IsTrue(res.Reserve(seat, b, new SimTime(0, 6, 0)), "freed resource can be claimed");
        }

        [Test]
        public void OwnerCanExtend_OwnHold()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(4002));
            var res = new ReservationService(world, sweepEveryMinutes: 1000);
            var seat = new ResourceId("seat:2");
            var a = new AgentId("npc_a");
            res.Reserve(seat, a, new SimTime(0, 1, 0));
            Assert.IsTrue(res.Reserve(seat, a, new SimTime(0, 3, 0)));
            Assert.AreEqual(a, res.Holder(seat));
        }

        [Test]
        public void Expire_SweepsStaleHolds_AtSimulatedTime()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(4002));
            var res = new ReservationService(world, sweepEveryMinutes: 1000);
            var seat = new ResourceId("seat:3");
            res.Reserve(seat, new AgentId("npc_a"), new SimTime(0, 1, 30));

            res.Expire(new SimTime(0, 1, 29));
            Assert.AreEqual(1, res.ActiveCount);

            res.Expire(new SimTime(0, 1, 31));
            Assert.AreEqual(0, res.ActiveCount);
            Assert.AreEqual(1, res.TotalExpired);
        }

        [Test]
        public void Contention_ReclaimsExpiredHold()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(4002));
            var res = new ReservationService(world, sweepEveryMinutes: 1000);
            var seat = new ResourceId("seat:4");
            var a = new AgentId("npc_a");
            var b = new AgentId("npc_b");

            res.Reserve(seat, a, new SimTime(0, 1, 0));
            world.Clock.Advance(SimDuration.FromHours(2)); // hold now stale
            Assert.IsTrue(res.Reserve(seat, b, new SimTime(0, 3, 0)), "expired hold is reclaimable without explicit release");
            Assert.AreEqual(b, res.Holder(seat));
        }
    }

    public class NavigationTests
    {
        private static SimulationWorld NewTown(out TimedNavigationService nav)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(4003));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_a"), "Home A"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_park"), "Park"));
            world.SpawnAgent("npc_w", "W", homeLocationId: "loc_home_a");
            nav = (TimedNavigationService)world.Navigation;
            nav.SetTravelTime(new LocationId("loc_home_a"), new LocationId("loc_cafe"), 20);
            return world;
        }

        [Test]
        public void Travel_TakesAuthoredMinutes_ThenArrives()
        {
            var world = NewTown(out var nav);
            var agent = new AgentId("npc_w");
            bool arrived = false;

            nav.BeginMove(agent, new LocationId("loc_cafe"), a => arrived = a.Success);
            var state = nav.GetState(agent);
            Assert.AreEqual(NavigationPathStatus.EnRoute, state.Status);
            Assert.AreEqual(20, state.RemainingMinutes);

            HeadlessSimulationRunner.RunFor(world, SimDuration.FromMinutes(19), stepMinutes: 5);
            Assert.IsFalse(arrived, "must still be en route at t+19");
            Assert.AreEqual("loc_home_a", world.Agents.Get(agent).CurrentLocationId.Value);

            HeadlessSimulationRunner.RunFor(world, SimDuration.FromMinutes(1));
            Assert.IsTrue(arrived);
            Assert.AreEqual("loc_cafe", world.Agents.Get(agent).CurrentLocationId.Value);
            Assert.AreEqual(NavigationPathStatus.Arrived, nav.GetState(agent).Status);
        }

        [Test]
        public void Supersede_CancelsPreviousTrip()
        {
            var world = NewTown(out var nav);
            var agent = new AgentId("npc_w");
            NavigationFailure? firstOutcome = null;

            nav.BeginMove(agent, new LocationId("loc_park"), a => { if (!a.Success) firstOutcome = a.Failure; });
            nav.BeginMove(agent, new LocationId("loc_cafe"), _ => { });

            Assert.AreEqual(NavigationFailure.Superseded, firstOutcome);
            HeadlessSimulationRunner.RunFor(world, SimDuration.FromHours(1));
            Assert.AreEqual("loc_cafe", world.Agents.Get(agent).CurrentLocationId.Value,
                "only the latest trip completes");
        }

        [Test]
        public void TargetDestroyed_ReportsTargetUnavailable()
        {
            var world = NewTown(out var nav);
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_pop_up"), "Pop-Up Market"));
            var agent = new AgentId("npc_w");
            NavigationArrival arrival = default;

            world.MoveAgent(agent, new LocationId("loc_home_a")); // ensure not standing there
            nav.SetTravelTime(new LocationId("loc_home_a"), new LocationId("loc_pop_up"), 10);
            nav.BeginMove(agent, new LocationId("loc_pop_up"), a => arrival = a);
            world.RemoveLocation(new LocationId("loc_pop_up"));

            HeadlessSimulationRunner.RunFor(world, SimDuration.FromMinutes(15));
            Assert.IsFalse(arrival.Success);
            Assert.AreEqual(NavigationFailure.TargetDestroyed, arrival.Failure);
        }

        [Test]
        public void DestinationBlocked_WhenCapacityFullOnArrival()
        {
            var world = NewTown(out var nav);
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_tiny"), "Tiny Shed", capacity: 1));
            world.SpawnAgent("npc_blocker", "B", startLocationId: "loc_tiny"); // fills capacity

            var agent = new AgentId("npc_w");
            nav.SetTravelTime(new LocationId("loc_home_a"), new LocationId("loc_tiny"), 5);
            NavigationArrival arrival = default;
            nav.BeginMove(agent, new LocationId("loc_tiny"), a => arrival = a);

            HeadlessSimulationRunner.RunFor(world, SimDuration.FromMinutes(10));
            Assert.IsFalse(arrival.Success);
            Assert.AreEqual(NavigationFailure.DestinationBlocked, arrival.Failure);
            Assert.AreEqual(NavigationPathStatus.Failed, nav.GetState(agent).Status);
        }

        [Test]
        public void StuckDetection_FiresAfterGracePeriod()
        {
            var world = NewTown(out var nav);
            var agent = new AgentId("npc_w");
            NavigationArrival? arrival = null;

            nav.BeginMove(agent, new LocationId("loc_cafe"), a => arrival = a);
            // Simulate a wedged trip: jump far past ETA + grace without the arrival tick firing.
            world.Clock.Advance(SimDuration.FromHours(3));
            nav.CheckForStuck(world.Clock.CurrentTime);

            Assert.IsNotNull(arrival);
            Assert.IsFalse(arrival!.Value.Success);
            Assert.AreEqual(NavigationFailure.NoProgress, arrival!.Value.Failure);
            Assert.Greater(nav.GetState(agent).Status == NavigationPathStatus.Failed ? 1 : 0, 0);
        }
    }
}
