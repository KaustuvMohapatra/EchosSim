using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;
using EchoSim.Simulation;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class PersonalityTests
    {
        [Test]
        public void Traits_AreValidated()
        {
            var b = PersonalityProfile.Balanced().Edit();
            Assert.Throws<ArgumentOutOfRangeException>(() => b.Set(PersonalityTrait.Sociability, -0.01f));
            Assert.Throws<ArgumentOutOfRangeException>(() => b.Set(PersonalityTrait.Sociability, 1.01f));
            Assert.DoesNotThrow(() => b.Build());
        }

        [Test]
        public void Builder_ProducesImmutableProfile()
        {
            var baseProfile = PersonalityProfile.Balanced();
            var edited = baseProfile.Edit().Set(PersonalityTrait.Curiosity, 0.9f).Build();
            Assert.AreEqual(0.5f, baseProfile.Get(PersonalityTrait.Curiosity), "source must stay untouched");
            Assert.AreEqual(0.9f, edited.Get(PersonalityTrait.Curiosity));
        }

        [Test]
        public void MiraFixture_HasExpectedSignatureTraits()
        {
            var mira = PersonalityProfile.MiraLike();
            Assert.AreEqual(0.89f, mira.Get(PersonalityTrait.Openness));
            Assert.AreEqual(0.90f, mira.Get(PersonalityTrait.Curiosity));
            Assert.AreEqual(0.68f, mira.Get(PersonalityTrait.GrudgeRetention));
        }
    }

    public class NeedTests
    {
        private static NeedSet NewSet(IDictionary<NeedKind, float>? initial = null) =>
            new NeedSet(StandardNeeds.Library(), initial);

        [Test]
        public void Needs_GrowTowardCritical_AndClampAt100()
        {
            var set = NewSet(new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 0f });
            set.Advance(SimDuration.FromHours(10)); // hunger grows 3.5/h -> 35
            Assert.AreEqual(35f, set.Get(NeedKind.Hunger).Current, 0.001f);

            set.Advance(SimDuration.FromHours(1000));
            Assert.AreEqual(100f, set.Get(NeedKind.Hunger).Current, "needs clamp at 100");
        }

        [Test]
        public void Relief_ReducesNeed_AndClampsAtZero()
        {
            var set = NewSet(new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 50f });
            set.Relieve(NeedKind.Hunger, 60f);
            Assert.AreEqual(0f, set.Get(NeedKind.Hunger).Current);
        }

        [Test]
        public void Thresholds_ClassifyCorrectly()
        {
            var set = NewSet(new Dictionary<NeedKind, float>
            {
                [NeedKind.Hunger] = 25f, // below satisfaction (30)
                [NeedKind.Energy] = 82f  // critical (>=85? no: 82 < 85) but above satisfaction
            });
            Assert.IsTrue(set.Get(NeedKind.Hunger).IsSatisfied);
            Assert.IsFalse(set.Get(NeedKind.Energy).IsSatisfied);
            Assert.IsFalse(set.Get(NeedKind.Energy).IsCritical);

            set.Relieve(NeedKind.Energy, -5f); // drain to 87
            Assert.IsTrue(set.Get(NeedKind.Energy).IsCritical);
            Assert.IsFalse(set.Get(NeedKind.Energy).ShouldInterrupt, "87 < interrupt 95");
            set.Relieve(NeedKind.Energy, -9f); // 96
            Assert.IsTrue(set.Get(NeedKind.Energy).ShouldInterrupt);
        }

        [Test]
        public void MostUrgent_And_FindInterrupting_Work()
        {
            var set = NewSet(new Dictionary<NeedKind, float>
            {
                [NeedKind.Energy] = 90f,   // most urgent overall, below its interrupt threshold (95)
                [NeedKind.Hygiene] = 88f   // breaches hygiene's interrupt threshold (87)
            });
            Assert.AreEqual(NeedKind.Energy, set.MostUrgent()!.Definition.Kind);
            Assert.AreEqual(NeedKind.Hygiene, set.FindInterrupting()!.Definition.Kind);
        }
    }

    public class UtilityGoalTests
    {
        private static SimulationWorld NewWorld()
        {
            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(2001));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_home_a"), "Home A"));
            world.RegisterLocation(new LocationDefinition(new LocationId("loc_cafe"), "Cafe"));
            return world;
        }

        [Test]
        public void DifferentPersonalities_ProduceDifferentUtility()
        {
            var world = NewWorld();
            var social = world.SpawnResident(new ResidentSpec("r_social", "Social")
            {
                HomeLocationId = "loc_home_a",
                Personality = PersonalityProfile.Balanced().Edit().Set(PersonalityTrait.Sociability, 1.0f).Build(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Social] = 60f }
            }).Mind;
            var introvert = world.SpawnResident(new ResidentSpec("r_intro", "Intro")
            {
                HomeLocationId = "loc_home_a",
                Personality = PersonalityProfile.Balanced().Edit().Set(PersonalityTrait.Sociability, 0.0f).Build(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Social] = 60f }
            }).Mind;

            var cognition = new CognitionSystem(world);
            Func<AgentMind, float> scoreFor = m => cognition.Evaluate(m.Agent).Ranked.First(e => e.Goal.Value == "goal_socialize").Final;

            Assert.Greater(scoreFor(social), scoreFor(introvert), "sociability must raise Socialize utility");
        }

        [Test]
        public void HigherNeed_ProducesHigherScore_Deterministically()
        {
            var world = NewWorld();
            var a = world.SpawnResident(new ResidentSpec("r_a", "A")
            {
                HomeLocationId = "loc_home_a",
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 20f }
            }).Mind;
            var b = world.SpawnResident(new ResidentSpec("r_b", "B")
            {
                HomeLocationId = "loc_home_a",
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 85f }
            }).Mind;

            var cognition = new CognitionSystem(world);
            Func<AgentMind, float> eat = m => cognition.Evaluate(m.Agent).Ranked.First(e => e.Goal.Value == "goal_eat").Final;

            float first = eat(b);
            float second = eat(b);
            Assert.AreEqual(first, second, "scoring must be deterministic for identical state");
            Assert.Greater(first, eat(a));
            Assert.IsFalse(float.IsNaN(first));
        }

        [Test]
        public void CriticalHunger_OverridesEverything_AndBypassesInertia()
        {
            var world = NewWorld();
            var r = world.SpawnResident(new ResidentSpec("r_crit", "Crit")
            {
                HomeLocationId = "loc_home_a",
                InitialNeeds = new Dictionary<NeedKind, float>
                {
                    [NeedKind.Hunger] = 95f,   // > interrupt threshold 92
                    [NeedKind.Energy] = 20f,
                    [NeedKind.Social] = 10f,
                    [NeedKind.Fun] = 10f
                }
            }).Mind;

            var cognition = new CognitionSystem(world);
            var decision = cognition.Decide(r.Agent);

            Assert.AreEqual("goal_eat", decision.Effective.Goal.Value);
            Assert.IsTrue(decision.Effective.CriticalOverride);
        }

        [Test]
        public void GoalInertia_KeepsCommittedGoal_UntilReliefNeedSatisfied()
        {
            var world = NewWorld();
            var r = world.SpawnResident(new ResidentSpec("r_inertia", "Inertia")
            {
                HomeLocationId = "loc_home_a",
                InitialNeeds = new Dictionary<NeedKind, float>
                {
                    [NeedKind.Social] = 55f,  // drives Socialize
                    [NeedKind.Fun] = 40f      // would drive Relax close behind
                }
            }).Mind;

            var cognition = new CognitionSystem(world);
            var d1 = cognition.Decide(r.Agent);
            Assert.AreEqual("goal_socialize", d1.Effective.Goal.Value, "setup: socialize should win");

            // Small time step; social need still far above satisfaction threshold (25).
            cognition.AdvanceNeeds(SimDuration.FromMinutes(30));
            var d2 = cognition.Decide(r.Agent);
            Assert.IsTrue(d2.KeptPrevious, "commitment must hold while relief need is unsatisfied");
            Assert.AreEqual("goal_socialize", d2.Effective.Goal.Value);

            // Simulate full relief: below satisfaction threshold the commitment releases.
            r.Needs.Get(NeedKind.Social).Apply(100f); // to zero
            var d3 = cognition.Decide(r.Agent);
            Assert.IsFalse(d3.KeptPrevious, "expired commitment must release");
        }

        [Test]
        public void TieBreaking_IsStableAndDeterministic()
        {
            var world = NewWorld();
            var r = world.SpawnResident(new ResidentSpec("r_tie", "Tie")
            {
                HomeLocationId = "loc_home_a",
                InitialNeeds = new Dictionary<NeedKind, float>
                { [NeedKind.Hunger] = 0f, [NeedKind.Energy] = 0f, [NeedKind.Social] = 0f,
                  [NeedKind.Fun] = 0f, [NeedKind.Comfort] = 0f, [NeedKind.Hygiene] = 0f, [NeedKind.Safety] = 0f }
            }).Mind;

            var cognition = new CognitionSystem(world);
            var result = cognition.Evaluate(r.Agent);

            // All needs satisfied: base scores decide; verify strict descending or ordinal tie-break.
            for (int i = 1; i < result.Ranked.Count; i++)
            {
                var prev = result.Ranked[i - 1];
                var cur = result.Ranked[i];
                Assert.GreaterOrEqual(prev.Final, cur.Final, "ranked order must be non-increasing by score");
                if (prev.Final == cur.Final)
                    Assert.Less(string.CompareOrdinal(prev.Goal.Value, cur.Goal.Value), 0, "ties break by id ordinal");
            }

            var again = cognition.Evaluate(r.Agent);
            CollectionAssert.AreEqual(result.Ranked.Select(e => e.Goal.Value), again.Ranked.Select(e => e.Goal.Value));
        }

        [Test]
        public void ScoreBreakdown_IsExplainableAndSumsCorrectly()
        {
            var world = NewWorld();
            var r = world.SpawnResident(new ResidentSpec("r_explain", "Explain")
            {
                HomeLocationId = "loc_home_a",
                Personality = PersonalityProfile.Balanced(),
                InitialNeeds = new Dictionary<NeedKind, float> { [NeedKind.Hunger] = 66f }
            }).Mind;

            var result = new CognitionSystem(world).Evaluate(r.Agent);
            var eat = result.Ranked.First(e => e.Goal.Value == "goal_eat");

            float sum = eat.Breakdown.Sum(l => l.Value);
            Assert.AreEqual(sum, eat.Final, 0.0001f, "breakdown lines must sum to final score");
            CollectionAssert.Contains(eat.Breakdown.Select(l => l.Label), "Base");
            CollectionAssert.Contains(eat.Breakdown.Select(l => l.Label), "Hunger");

            // Format sanity for debug tooling later.
            StringAssert.Contains("+", eat.Breakdown[0].ToString());
        }

        [Test]
        public void Curves_MonotonicAndFinite()
        {
            UtilityCurve[] curves =
            {
                new LinearCurve(), new QuadraticCurve(), new LogisticCurve(), new InverseCurve(), new ThresholdCurve(0.6f)
            };
            foreach (var curve in curves)
            {
                bool inverted = curve is InverseCurve;
                float prev = curve.Evaluate(0f);
                Assert.AreEqual(inverted ? 1f : 0f, prev, 0.02f, $"{curve} at input 0");
                for (int i = 1; i <= 20; i++)
                {
                    float v = curve.Evaluate(i / 20f);
                    Assert.IsFalse(float.IsNaN(v), $"{curve} NaN at {i}");
                    if (!inverted)
                        Assert.GreaterOrEqual(v, prev - 0.001f, $"{curve} must be monotonic up");
                    prev = v;
                }
                Assert.AreEqual(inverted ? 0f : 1f, curve.Evaluate(1f), 0.05f, $"{curve} endpoint");
            }
        }

        [Test]
        public void SchedulePressure_FlowsThroughCustomTerm()
        {
            var world = NewWorld();
            var r = world.SpawnResident(new ResidentSpec("r_work", "Worker") { HomeLocationId = "loc_home_a" }).Mind;
            var cognition = new CognitionSystem(world);

            cognition.SetSchedulePressureProvider((agent, time) => agent.Value == "r_work" ? 1f : 0f);
            float pressured = cognition.Evaluate(r.Agent).Ranked.First(e => e.Goal.Value == "goal_work").Final;

            cognition.SetSchedulePressureProvider((agent, time) => 0f);
            float idle = cognition.Evaluate(r.Agent).Ranked.First(e => e.Goal.Value == "goal_work").Final;

            Assert.Greater(pressured, idle, "schedule pressure must raise Work utility via custom term");
        }
    }
}
