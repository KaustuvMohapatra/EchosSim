using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class WeatherTownEventStoryletTests
    {
        private sealed class Hub
        {
            public SimulationWorld World;
            public PerceptionSystem Perception;
            public MemorySystem Memory;
            public EmotionSystem Emotion;
            public RelationshipSystem Relationships;
            public BeliefSystem Beliefs;
            public WeatherSystem Weather;
            public CognitionSystem Cognition;
        }

        private static Hub NewHub(ulong seed = 16001)
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
            var weather = new WeatherSystem(world, world.Randoms.GetStream(RandomStreams.World));

            var cognition = new CognitionSystem(world);
            cognition.SetWeatherProvider(() => weather.Current);

            return new Hub
            {
                World = world, Perception = perception, Memory = memory, Emotion = emotion,
                Relationships = relationships, Beliefs = beliefs, Weather = weather, Cognition = cognition
            };
        }

        // ---------- Sprint 16: weather ----------

        [Test]
        public void WeatherRolls_AreDeterministicPerSeed()
        {
            var a = NewHub(16002);
            var b = NewHub(16002);

            var seqA = new List<WeatherState>();
            var seqB = new List<WeatherState>();
            for (int i = 0; i < 30; i++)
            {
                a.Weather.RollForNewDay(); seqA.Add(a.Weather.Current);
                b.Weather.RollForNewDay(); seqB.Add(b.Weather.Current);
            }
            CollectionAssert.AreEqual(seqA, seqB, "identical seeds must roll identical weather");
            Assert.Contains(WeatherState.Rain, seqA.Cast<object>().ToList() as System.Collections.IList,
                "a month of rolls should contain rain somewhere");
        }

        [Test]
        public void Rain_SuppressesExplore_UnlessYouLoveRain()
        {
            var hub = NewHub(16003);
            var rainHater = hub.World.SpawnResident(new ResidentSpec("npc_hater", "Hater")
            {
                HomeLocationId = "loc_park",
                Personality = PersonalityProfile.Balanced(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Fun] = 70f }
            }).Mind;

            hub.World.SpawnResident(new ResidentSpec("npc_lover", "Lover")
            {
                HomeLocationId = "loc_park",
                Personality = PersonalityProfile.Balanced().Edit().Set(PersonalityTrait.Curiosity, 1f).Build(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Fun] = 70f }
            }).Mind.SetPreferences(new PreferenceProfile(new Dictionary<string, float> { ["rain"] = 0.95f }));

            float exploreScore(AgentMind m)
            {
                hub.Cognition.Evaluate(m.Agent); // touch to warm nothing; pure evaluation below
                return hub.Cognition.Evaluate(m.Agent).Ranked.First(e => e.Goal.Value == "goal_explore").Final;
            }

            hub.Weather.Set(WeatherState.Clear);
            float haterClear = exploreScore(rainHater);
            hub.Weather.Set(WeatherState.HeavyRain);
            float haterRain = exploreScore(rainHater);
            Assert.Less(haterRain, haterClear - 0.05f, "heavy rain suppresses exploring");

            float loverRain = exploreScore(hub.World.Residents.Get(new AgentId("npc_lover")));
            Assert.Greater(loverRain, haterRain, "rain-lovers shrug it off via preferences");
        }

        // ---------- Sprint 17: town events ----------

        [Test]
        public void TownEvent_ActivatesInWindow_AndAnnounces()
        {
            var hub = NewHub(17001);
            var perception = new PerceptionSystem(hub.World);
            var events = new TownEventSystem(hub.World, perception);
            hub.World.SpawnResident(new ResidentSpec("npc_townsperson", "T")
            {
                HomeLocationId = "loc_park", Personality = PersonalityProfile.Balanced()
            });
            events.Define(new TownEventDefinition("market_day", "Market Day",
                new LocationId("loc_park"), SimDayOfWeek.Saturday, startMinuteOfDay: 9 * 60, durationMinutes: 300));

            var def = events.ActiveEventAt(new SimTime(5, 10, 15));
            Assert.IsNotNull(def, "Saturday 10:15 is inside the market window");
            Assert.IsNull(events.ActiveEventAt(new SimTime(4, 10, 15)), "Friday has no market");
            Assert.IsNull(events.ActiveEventAt(new SimTime(5, 8, 0)), "too early Saturday");

            int announcements = 0;
            hub.World.Events.Subscribe<ObservationRecordedEvent>(e =>
            {
                if (e.Observation.EventType == "town_event_market_day" &&
                    e.Observation.Source == PerceptionSource.Announcement)
                    announcements++;
            });
            hub.World.Clock.AdvanceTo(new SimTime(5, 9, 40));
            events.Update(hub.World.Clock.CurrentTime);

            Assert.AreEqual(1, announcements, "the market announcement reached residents exactly once");
        }

        [Test]
        public void Storylets_FireOnCondition_AndRespectCooldown()
        {
            var hub = NewHub(17002);
            var perception = new PerceptionSystem(hub.World);
            var memory = new MemorySystem(hub.World);
            var emotion = new EmotionSystem(hub.World);
            var relationships = new RelationshipSystem(hub.World);
            var beliefs = new BeliefSystem(hub.World, relationships);
            _ = new SocialReactionSystem(hub.World, memory, emotion, relationships);

            var engine = new StoryletEngine(hub.World, perception);
            engine.Register(new Storylet(
                "confide_about_third_party",
                ctx =>
                {
                    var relAB = relationships.GetOrCreate(ctx.Subject, ctx.Other);
                    if (relAB.Trust <= 0.75f) return false;
                    foreach (var rel in relationships.All())
                        if (rel.From == ctx.Subject && rel.Rel.Grievance > 0.6f && rel.To != ctx.Other)
                            return true;
                    return false;
                },
                cooldownHours: 12.0));

            var a = hub.World.SpawnResident(new ResidentSpec("npc_confider", "C")
            {
                HomeLocationId = "loc_park", Personality = PersonalityProfile.Balanced()
            }).Mind.Agent;
            var b = hub.World.SpawnResident(new ResidentSpec("npc_confided", "D")
            {
                HomeLocationId = "loc_park", Personality = PersonalityProfile.Balanced()
            }).Mind.Agent;
            var c = hub.World.SpawnResident(new ResidentSpec("npc_villain", "V")
            {
                HomeLocationId = "loc_park", Personality = PersonalityProfile.Balanced()
            }).Mind.Agent;

            // No trust yet -> no confiding.
            relationships.GetOrCreate(a, b).Seed(affinity: 0.9f, familiarity: 0.8f, trust: -0.9f);
            Assert.IsNull(engine.EvaluatePair(a, b), "no trust yet -> no confiding");

            // Deep trust in B plus a grievance against C unlocks the storylet.
            relationships.GetOrCreate(a, b).Seed(affinity: 0.9f, familiarity: 0.8f, trust: 0.95f);
            var grievance = relationships.GetOrCreate(a, c);
            grievance.Seed(affinity: -0.6f, grievance: 0.85f);

            string? fired = engine.EvaluatePair(a, b);
            Assert.AreEqual("confide_about_third_party", fired);
            Assert.AreEqual(1, engine.FiredCount);

            // Cooldown blocks immediate refiring even though conditions still hold.
            Assert.IsNull(engine.EvaluatePair(a, b));
            Assert.AreEqual(1, engine.FiredCount);
        }
    }
}
