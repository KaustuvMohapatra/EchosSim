using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class SocialBeliefConversationTests
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
        }

        private static Hub NewHub(ulong seed = 8001)
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(seed));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_bakery"), "Bakery"));
            world.ConnectLocations(new LocationId("loc_cafe"), new LocationId("loc_bakery"));

            var perception = new PerceptionSystem(world);
            var memory = new MemorySystem(world);
            var emotion = new EmotionSystem(world);
            var relationships = new RelationshipSystem(world);
            var beliefs = new BeliefSystem(world, relationships);
            _ = new SocialReactionSystem(world, memory, emotion, relationships);
            var rng = world.Randoms.GetStream(RandomStreams.Social);
            var social = new SocialSystem(world, perception, beliefs, emotion, rng);
            var conversations = new ConversationSystem(world, social, beliefs, memory, relationships, rng);

            return new Hub
            {
                World = world, Perception = perception, Memory = memory, Emotion = emotion,
                Relationships = relationships, Beliefs = beliefs, Social = social, Conversations = conversations
            };
        }

        private static void SpawnPair(Hub h)
        {
            Spawn(h, "npc_rohan");
            Spawn(h, "npc_anika");
        }

        private static AgentMind Spawn(Hub h, string id, string home = "loc_cafe")
        {
            return h.World.SpawnResident(new ResidentSpec(id, id.Substring(4))
            {
                HomeLocationId = home,
                Personality = PersonalityProfile.Balanced()
            }).Mind;
        }

        // ---------- Sprint 10 ----------

        [Test]
        public void SocialActions_RequireCoLocation()
        {
            var hub = NewHub();
            Spawn(hub, "npc_rohan", home: "loc_cafe");
            Spawn(hub, "npc_anika", home: "loc_bakery");

            var result = hub.Social.Attempt(new AgentId("npc_rohan"), new AgentId("npc_anika"),
                SocialActionType.Chat);

            Assert.IsFalse(result.Accepted);
            Assert.AreEqual("not co-located", result.Reason);
        }

        [Test]
        public void ConversationLock_BlocksParallelConversations()
        {
            var hub = NewHub();
            SpawnPair(hub);
            var rohan = new AgentId("npc_rohan");
            var anika = new AgentId("npc_anika");

            // Rohan is locked into a chat with Anika.
            var first = hub.Social.Attempt(rohan, anika, SocialActionType.Chat);
            Assert.IsTrue(first.Accepted);

            // While locks are held... but they are released immediately after each attempt,
            // so simulate a third party grabbing Rohan's conversation lock.
            var rohanLock = new ResourceId("conv:" + rohan.Value);
            var until = hub.World.Clock.CurrentTime.Add(SimDuration.FromMinutes(30));
            Assert.IsTrue(hub.World.Reservations.Reserve(rohanLock, anika, until));

            var blocked = hub.Social.Attempt(anika, rohan, SocialActionType.Chat);
            Assert.IsFalse(blocked.Accepted, "a resident already in a conversation cannot start another");
            StringAssert.Contains("busy", blocked.Reason);
        }

        [Test]
        public void Insult_FlowsThroughPipeline_InToMemoryAndRelationship()
        {
            var hub = NewHub();
            SpawnPair(hub);
            var rohan = new AgentId("npc_rohan");
            var anika = new AgentId("npc_anika");

            var result = hub.Social.Attempt(rohan, anika, SocialActionType.Insult);
            Assert.IsTrue(result.Accepted, "insults are never 'declined'");

            // Perception -> memory for both parties.
            Assert.AreEqual(1, hub.Memory.StoreFor(rohan).Count);
            Assert.AreEqual(1, hub.Memory.StoreFor(anika).Count);

            // Relationship damage on the target side.
            var anikaView = hub.Relationships.GetOrCreate(anika, rohan);
            Assert.Less(anikaView.Affinity, 0f);
            Assert.Greater(anikaView.Grievance, 0f);
            Assert.Less(hub.World.Residents.Get(anika).EmotionValence, 0f, "being insulted stings immediately");
        }

        [Test]
        public void UrgentNeeds_MakeListeners_Decline()
        {
            var hub = NewHub(8002);
            Spawn(hub, "npc_busy").Needs.Advance(SimDuration.FromHours(40)); // several needs critical
            var chatter = Spawn(hub, "npc_chatty");

            bool everAccepted = false;
            for (int i = 0; i < 5 && !everAccepted; i++)
            {
                var r = hub.Social.Attempt(chatter.Agent, new AgentId("npc_busy"), SocialActionType.Chat);
                everAccepted = r.Accepted;
                hub.World.Clock.Advance(SimDuration.FromMinutes(1));
            }
            Assert.IsFalse(everAccepted, "an overwhelmed resident declines small talk");
        }

        // ---------- Sprint 11: beliefs & rumours ----------

        [Test]
        public void Rumour_HopDecaysConfidence_AndRecordsProvenance()
        {
            var hub = NewHub(8003);
            var r = Spawn(hub, "npc_rohan").Agent;
            var a = Spawn(hub, "npc_anika").Agent;
            var m = Spawn(hub, "npc_mira").Agent;
            var origin = new EventId(777);

            hub.Beliefs.LearnDirect(r, "player", "is_rude", stance: -0.8f, confidence: 0.9f, sourceEvent: origin);

            Assert.IsTrue(hub.Beliefs.TryTransfer(r, a, "player", "is_rude", origin));
            var anikaBelief = hub.Beliefs.About(a, "player").Single(b => b.Predicate == "is_rude");
            Assert.AreEqual(1, anikaBelief.HopCount);
            Assert.AreEqual(r, anikaBelief.SourceAgent, "provenance records who said it");
            Assert.Less(anikaBelief.Confidence, 0.9f, "each hop decays confidence");

            Assert.IsTrue(hub.Beliefs.TryTransfer(a, m, "player", "is_rude", origin));
            var miraBelief = hub.Beliefs.About(m, "player").Single();
            Assert.AreEqual(2, miraBelief.HopCount);
            Assert.AreEqual(a, miraBelief.SourceAgent);
            Assert.Less(miraBelief.Confidence, anikaBelief.Confidence, "two hops decay further");
        }

        [Test]
        public void Rumour_LoopsAreCut()
        {
            var hub = NewHub(8003);
            var r = Spawn(hub, "npc_r").Agent;
            var a = Spawn(hub, "npc_a2").Agent;
            var origin = new EventId(42);

            hub.Beliefs.LearnDirect(r, "x", "y", -0.5f, 0.8f, origin);
            Assert.IsTrue(hub.Beliefs.TryTransfer(r, a, "x", "y", origin));

            // Anika tries to tell Rohan back the same chain — nothing new learned.
            Assert.IsFalse(hub.Beliefs.TryTransfer(a, r, "x", "y", origin),
                "A telling B then B telling A must not refresh the belief");
        }

        [Test]
        public void DirectExperience_OverridesWeakRumour()
        {
            var hub = NewHub(8003);
            var victim = Spawn(hub, "npc_victim").Agent;
            var origin = new EventId(9);

            // Victim hears a rumour that the player is rude...
            hub.Beliefs.LearnDirect(Spawn(hub, "npc_gossiper").Agent, "player", "is_rude", -0.7f, 0.6f, origin);
            hub.Beliefs.TryTransfer(new AgentId("npc_gossiper"), victim, "player", "is_rude", origin);
            Assert.Less(hub.Beliefs.About(victim, "player").Single().Stance, -0.4f);

            // ...then experiences kindness first-hand.
            var beforeConfidence = hub.Beliefs.About(victim, "player").Single().Confidence;
            hub.Beliefs.ReconcileWithDirectExperience(victim, "player", "is_rude", experiencedStance: +0.6f);

            var belief = hub.Beliefs.About(victim, "player").Single();
            Assert.Greater(belief.Stance, 0f, "lived evidence flips weak hearsay");
            Assert.AreEqual(0, belief.HopCount, "now it is first-hand knowledge");
            Assert.Greater(belief.Confidence, beforeConfidence, "first-hand knowledge is firmer than hearsay");
        }

        [Test]
        public void Knowledge_DoesNotTeleport()
        {
            var hub = NewHub(8003);
            var witness = Spawn(hub, "npc_witness").Agent;
            var absent = Spawn(hub, "npc_absent", home: "loc_bakery").Agent;

            // Something happens at the cafe; only cafe folks observe.
            hub.Perception.Publish("insult", new[] { witness }, new LocationId("loc_cafe"), ObservationReach.SameLocation);

            Assert.AreEqual(0, hub.Beliefs.TotalBeliefs - hub.Beliefs.StoreFor(absent).Count >= 0 ? hub.Beliefs.StoreFor(absent).Count : -1,
                "absent resident holds no beliefs about events they never perceived");
            Assert.AreEqual(0, hub.Beliefs.StoreFor(absent).Count);
        }

        // ---------- Sprint 12: conversations ----------

        [Test]
        public void Conversation_ProducesDeterministicUtterances_AndGossipTransfersBelief()
        {
            var hub = NewHub(8004);
            var gossiper = Spawn(hub, "npc_gossipy").Agent;
            var listener = Spawn(hub, "npc_listener").Agent;

            hub.Beliefs.LearnDirect(gossiper, "npc_thirdparty", "lost_a_bet",
                stance: -0.5f, confidence: 0.8f, sourceEvent: new EventId(31));

            var s1 = hub.Conversations.Start(gossiper, listener);
            Assert.IsNotNull(s1);
            Assert.IsNotEmpty(s1!.Utterances);

            // Same world state replays identically in a twin world.
            var twinHub = NewHub(8004);
            var tg = Spawn(twinHub, "npc_gossipy").Agent;
            var tl = Spawn(twinHub, "npc_listener").Agent;
            twinHub.Beliefs.LearnDirect(tg, "npc_thirdparty", "lost_a_bet", -0.5f, 0.8f, new EventId(31));
            var s2 = twinHub.Conversations.Start(tg, tl);

            CollectionAssert.AreEqual(s1.Utterances, s2!.Utterances, "seeded variation is deterministic");
            StringAssert.Contains("thirdparty", s1.TopicLabel.ToLowerInvariant());
        }

        [Test]
        public void GossipIntent_TransfersBeliefAcrossMinds()
        {
            var hub = NewHub(8005);
            var knower = Spawn(hub, "npc_knower").Agent;
            var friend = Spawn(hub, "npc_friend").Agent;

            hub.Relationships.GetOrCreate(knower, friend).Seed(affinity: 0.6f);
            // A strong NEGATIVE first-hand belief guarantees the complain/gossip
            // branch of intent selection — no dice involved.
            hub.Beliefs.LearnDirect(knower, "npc_stranger", "lost_a_bet",
                stance: -0.8f, confidence: 0.9f, sourceEvent: new EventId(55));

            var session = hub.Conversations.Start(knower, friend);
            Assert.IsNotNull(session);
            Assert.IsNotNull(session!.TransferredBelief, "gossip intent carries knowledge across minds");
            Assert.AreEqual(1, hub.Beliefs.StoreFor(friend).Count);
            var transferred = hub.Beliefs.StoreFor(friend).All.Single();
            Assert.AreEqual(knower, transferred.SourceAgent, "listener knows WHO told them");
            Assert.AreEqual(1, transferred.HopCount);
        }

        [Test]
        public void Conversation_ReturnsNull_WhenNotCoLocated()
        {
            var hub = NewHub(8005);
            Spawn(hub, "npc_l", home: "loc_cafe");
            Spawn(hub, "npc_r2", home: "loc_bakery");
            Assert.IsNull(hub.Conversations.Start(new AgentId("npc_l"), new AgentId("npc_r2")));
        }
    }
}
