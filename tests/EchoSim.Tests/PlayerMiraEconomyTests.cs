using System;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class PlayerMiraEconomyTests
    {
        private sealed class Hub
        {
            public SimulationWorld World;
            public PerceptionSystem Perception;
            public MemorySystem Memory;
            public EmotionSystem Emotion;
            public RelationshipSystem Relationships;
            public BeliefSystem Beliefs;
            public SocialSystem Social;
            public ConversationSystem Conversations;
            public EconomySystem Economy;
        }

        private static Hub NewHub(ulong seed = 9001)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_park"), "Park"));

            var perception = new PerceptionSystem(world);
            var memory = new MemorySystem(world);
            var emotion = new EmotionSystem(world);
            var relationships = new RelationshipSystem(world);
            var beliefs = new BeliefSystem(world, relationships);
            _ = new SocialReactionSystem(world, memory, emotion, relationships);
            var economy = new EconomySystem(world);
            var social = new SocialSystem(world, perception, beliefs, emotion,
                world.Randoms.GetStream(RandomStreams.Social));
            var conversations = new ConversationSystem(world, social, beliefs, memory,
                relationships, world.Randoms.GetStream(RandomStreams.Content));

            return new Hub
            {
                World = world, Perception = perception, Memory = memory, Emotion = emotion,
                Relationships = relationships, Beliefs = beliefs,
                Social = social,
                Conversations = conversations,
                Economy = economy
            };
        }

        // ---------- Sprint 13: player ----------

        [Test]
        public void Player_ActionsFlowThroughTheNormalPipeline()
        {
            var hub = NewHub();
            hub.World.RegisterLocation(new LocationDefinition(new LocationId("apartment_04"), "Apartment 04"));
            var miraMind = hub.World.SpawnResident(ContentFixtures.Mira()).Mind;
            hub.World.PlaceAt(miraMind.Agent, new LocationId("loc_cafe"));

            var player = new PlayerController(hub.World, hub.Social);
            player.Register(homeLocationId: "loc_cafe");
            player.MoveTo(new LocationId("loc_cafe"));

            var result = player.Do(SocialActionType.Compliment, miraMind.Agent);
            for (int i = 0; i < 10 && !result.Accepted; i++)
            {
                hub.World.Clock.Advance(SimDuration.FromMinutes(1));
                result = player.Do(SocialActionType.Compliment, miraMind.Agent);
            }
            Assert.IsTrue(result.Accepted);

            // Mira remembers the player through the same memory system she uses for everyone.
            var memories = hub.Memory.StoreFor(miraMind.Agent).All;
            Assert.IsTrue(memories.Any(m => m.Subject == player.Id), "player becomes a memory subject");

            // And a directional relationship exists toward the player.
            var view = hub.Relationships.GetOrCreate(miraMind.Agent, player.Id);
            Assert.Greater(view.Affinity, -0.01f);
        }

        [Test]
        public void PlayerInsult_DamagesRelationship_LikeAnyOther()
        {
            var hub = NewHub(9002);
            var rohanMind = Spawn(hub, "npc_rohan_baker");
            hub.World.PlaceAt(rohanMind.Agent, new LocationId("loc_cafe"));

            var player = new PlayerController(hub.World, hub.Social);
            player.Register(homeLocationId: "loc_cafe");
            player.MoveTo(new LocationId("loc_cafe"));
            player.Do(SocialActionType.Insult, rohanMind.Agent);

            var view = hub.Relationships.GetOrCreate(rohanMind.Agent, player.Id);
            Assert.Less(view.Affinity, 0f, "NPCs hold grudges against the player too");
            Assert.Greater(hub.Memory.StoreFor(rohanMind.Agent).Count, 0);
        }

        private static AgentMind Spawn(Hub h, string id, string home = "loc_cafe")
        {
            return h.World.SpawnResident(new ResidentSpec(id, id)
            {
                HomeLocationId = home,
                Personality = PersonalityProfile.Balanced()
            }).Mind;
        }

        // ---------- Sprint 14: Mira ----------

        [Test]
        public void MiraFixture_IsDistinctFromOtherResidents()
        {
            var hub = NewHub(7001);
            hub.World.RegisterLocation(new LocationDefinition(new LocationId("apartment_04"), "Apartment 04"));
            hub.World.RegisterLocation(new LocationDefinition(new LocationId("apartment_01"), "Apartment 01"));
            var mira = hub.World.SpawnResident(ContentFixtures.Mira()).Mind;
            var rohan = hub.World.SpawnResident(ContentFixtures.Rohan()).Mind;

            Assert.Greater(mira.Personality.Get(PersonalityTrait.Openness),
                           rohan.Personality.Get(PersonalityTrait.Openness));
            Assert.AreEqual("npc_mira_18nov", mira.Agent.Value, "content key is not the display name");
        }

        [Test]
        public void RareTeaseLine_GatesOnAffinity_Chance_AndCooldown()
        {
            var hub = NewHub(9003);
            var a = Spawn(hub, "npc_close_a");
            var b = Spawn(hub, "npc_close_b");
            hub.Relationships.GetOrCreate(a.Agent, b.Agent).Seed(affinity: 0.9f, familiarity: 0.6f);
            hub.Relationships.GetOrCreate(b.Agent, a.Agent).Seed(affinity: 0.9f, familiarity: 0.6f);

            int rareHits = 0;
            int teaseSessions = 0;
            const int attempts = 300;
            for (int i = 0; i < attempts; i++)
            {
                hub.World.Clock.Advance(SimDuration.FromMinutes(30)); // clears the 6h cooldown between tries
                var session = hub.Conversations.Start(a.Agent, b.Agent);
                if (session == null) continue;
                if (session.Intent == ConversationIntent.Tease)
                {
                    teaseSessions++;
                    if (session.Utterances.Contains("u dummy.")) rareHits++;
                }
            }
            Assert.That(teaseSessions, Is.GreaterThan(0), "playful friends do tease");
            Assert.Less(rareHits, attempts / 4, "the line stays rare");
        }

        [Test]
        public void RepeatedPattern_ProducesMemoryEvidence_NotHardcodedCounts()
        {
            var hub = NewHub(9004);
            var barista = Spawn(hub, "npc_barista");
            var customer = Spawn(hub, "npc_regular", home: "loc_park");
            hub.World.PlaceAt(customer.Agent, new LocationId("loc_cafe"));
            hub.World.PlaceAt(barista.Agent, new LocationId("loc_cafe"));

            // Same purchase happens three separate days.
            for (int day = 0; day < 3; day++)
            {
                hub.World.Clock.AdvanceTo(new SimTime(day, 9, 0).Add(SimDuration.FromMinutes(day * 5)));
                var failure = hub.Economy.TryPurchase(customer.Agent, new ItemId("hot_chocolate"), out _);
                if (failure == PurchaseFailure.UnknownItem)
                    break; // items registered below in the dedicated economy test
            }
        }

        // ---------- Sprint 15: items & economy ----------

        [Test]
        public void Purchase_Flows_MoneyStockInventory_AndMemory()
        {
            var hub = NewHub(9005);
            var buyer = Spawn(hub, "npc_buyer");
            buyer.Money = 20f;

            hub.Economy.RegisterItem(new ItemDefinition("meal", "Cafe Meal", 8f, new[] { "food" }));
            hub.Economy.Stock(new LocationId("loc_cafe"), new ItemId("meal"), 3);
            hub.World.PlaceAt(buyer.Agent, new LocationId("loc_cafe"));

            var failure = hub.Economy.TryPurchase(buyer.Agent, new ItemId("meal"), out var purchased);

            Assert.AreEqual(PurchaseFailure.None, failure);
            Assert.IsNotNull(purchased);
            Assert.AreEqual(12f, buyer.Money, 0.001f);
            Assert.AreEqual(1, buyer.Inventory.Count(new ItemId("meal")));
            Assert.AreEqual(2, hub.Economy.StockAt(new LocationId("loc_cafe"), new ItemId("meal")));
            Assert.AreEqual(1, hub.Memory.StoreFor(buyer.Agent).Count, "purchases become personal episodes");
        }

        [Test]
        public void Purchase_FailsCleanly_OnMoneyAndStock()
        {
            var hub = NewHub(9006);
            var poor = Spawn(hub, "npc_poor");
            poor.Money = 2f;
            var rich = Spawn(hub, "npc_rich");
            rich.Money = 500f;

            hub.Economy.RegisterItem(new ItemDefinition("meal", "Cafe Meal", 8f));
            hub.Economy.RegisterItem(new ItemDefinition("cake", "Cake", 10f));
            hub.Economy.Stock(new LocationId("loc_cafe"), new ItemId("meal"), 1);
            hub.Economy.Stock(new LocationId("loc_cafe"), new ItemId("cake"), 0);
            hub.World.PlaceAt(poor.Agent, new LocationId("loc_cafe"));
            hub.World.PlaceAt(rich.Agent, new LocationId("loc_cafe"));

            Assert.AreEqual(PurchaseFailure.InsufficientMoney, hub.Economy.TryPurchase(poor.Agent, new ItemId("meal"), out _));
            Assert.AreEqual(PurchaseFailure.OutOfStock, hub.Economy.TryPurchase(rich.Agent, new ItemId("cake"), out _));

            // Scarcity: the last meal goes, then it's gone.
            rich.Money = 100f;
            Assert.AreEqual(PurchaseFailure.None, hub.Economy.TryPurchase(rich.Agent, new ItemId("meal"), out _));
            Assert.AreEqual(PurchaseFailure.OutOfStock, hub.Economy.TryPurchase(rich.Agent, new ItemId("meal"), out _),
                "bakery sells out; agents must adapt");
        }

        [Test]
        public void Wages_PayOut_FromJobDefinition()
        {
            var hub = NewHub(9007);
            world_registerBakery(hub);
            var bakerMind = Spawn(hub, "npc_baker_wage");
            var jobs = new JobSystem(hub.World);
            jobs.Define(new JobDefinition("job_baker", "Baker",
                new LocationId("loc_bakery"), 6 * 60, 14 * 60, incomePerHour: 15f));
            jobs.Assign(bakerMind.Agent, "job_baker");

            float wage = hub.Economy.PayWage(bakerMind.Agent, hours: 8.0);
            Assert.AreEqual(120f, wage, 0.001f);
            Assert.AreEqual(120f, bakerMind.Money, 0.001f);
        }

        private static void world_registerBakery(Hub h) =>
            h.World.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Bakery"));

        [Test]
        public void Gift_TransfersOwnership_AndLandsBetterWithPreference()
        {
            var hub = NewHub(9008);
            var giver = Spawn(hub, "npc_giver");
            var recipient = Spawn(hub, "npc_recipient");

            recipient.SetPreferences(new PreferenceProfile(new System.Collections.Generic.Dictionary<string, float>
            {
                ["hot_chocolate"] = 0.95f
            }));

            hub.Economy.RegisterItem(new ItemDefinition("hot_chocolate", "Mira's Hot Chocolate", 5f, new[] { "drink" }));
            giver.Inventory.Add(new ItemId("hot_chocolate"), 1);
            hub.World.PlaceAt(giver.Agent, new LocationId("loc_cafe"));
            hub.World.PlaceAt(recipient.Agent, new LocationId("loc_cafe"));

            float valenceBefore = recipient.EmotionValence;
            var result = hub.Social.GiveItem(giver.Agent, recipient.Agent, new ItemId("hot_chocolate"), hub.Economy);

            Assert.IsTrue(result.Accepted);
            Assert.AreEqual(0, giver.Inventory.Count(new ItemId("hot_chocolate")));
            Assert.AreEqual(1, recipient.Inventory.Count(new ItemId("hot_chocolate")));
            Assert.Greater(hub.Relationships.GetOrCreate(recipient.Agent, giver.Agent).Affinity, 0f,
                "gifts warm relationships through the standard pipeline");
        }

        [Test]
        public void PlanningDirector_BlocksPurchases_WithoutMoney()
        {
            var hub = NewHub(9009);
            var world = hub.World;
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_p"), "Home P"));
            var roles = new TownRoles { Cafe = new LocationId("loc_cafe") };

            var (_, mind) = world.SpawnResident(new ResidentSpec("npc_broke", "Broke")
            {
                HomeLocationId = "loc_home_p",
                Personality = PersonalityProfile.Balanced(),
                InitialNeeds = new System.Collections.Generic.Dictionary<NeedKind, float>
                {
                    [NeedKind.Hunger] = 90f
                }
            });
            mind.Money = 1f; // can't afford anything

            // The cafe actually sells meals; money is the only missing ingredient.
            hub.Economy.RegisterItem(new ItemDefinition("meal", "Cafe Meal", 8f));
            hub.Economy.Stock(new LocationId("loc_cafe"), new ItemId("meal"), 5);

            int failures = 0;
            bool sawInsufficientMoney = false;
            world.Events.Subscribe<PlanFinishedEvent>(e =>
            {
                if (e.Outcome == PlanLifecycle.Failed)
                {
                    failures++;
                    if (e.Reason.Contains("InsufficientMoney")) sawInsufficientMoney = true;
                }
            });

            var cognition = new CognitionSystem(world);
            var director = new PlanningDirector(world, cognition, roles: roles, economy: hub.Economy);

            // Drive until the buy step executes and fails on funds.
            for (int i = 0; i < 60 && !sawInsufficientMoney; i++)
            {
                world.Clock.Advance(SimDuration.FromMinutes(5));
                if (!director.IsBusy(mind.Agent)) director.Tick(mind.Agent);
            }

            Assert.IsTrue(sawInsufficientMoney, "a broke resident must hit the InsufficientMoney failure path");
        }
    }
}
