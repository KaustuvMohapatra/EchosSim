using System;
using System.Collections.Generic;
using EchoSim.Core;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class SimRandomTests
    {
        [Test]
        public void SameSeed_ProducesIdenticalSequences()
        {
            var a = new SeededRandom(1234UL);
            var b = new SeededRandom(1234UL);
            for (int i = 0; i < 1000; i++)
                Assert.AreEqual(a.NextUInt64(), b.NextUInt64(), $"divergence at draw {i}");
        }

        [Test]
        public void DifferentSeeds_Diverge()
        {
            var a = new SeededRandom(1UL);
            var b = new SeededRandom(2UL);
            bool differ = false;
            for (int i = 0; i < 64; i++)
            {
                if (a.NextUInt64() != b.NextUInt64()) { differ = true; break; }
            }
            Assert.IsTrue(differ);
        }

        [Test]
        public void NextDouble_InRange()
        {
            var rng = new SeededRandom(99UL);
            for (int i = 0; i < 10_000; i++)
            {
                double d = rng.NextDouble();
                Assert.GreaterOrEqual(d, 0.0);
                Assert.Less(d, 1.0);
                Assert.IsFalse(double.IsNaN(d));
            }
        }

        [Test]
        public void NextInt_RespectsBounds()
        {
            var rng = new SeededRandom(7UL);
            int minSeen = int.MaxValue, maxSeen = int.MinValue;
            for (int i = 0; i < 20_000; i++)
            {
                int v = rng.NextInt(3, 8);
                Assert.GreaterOrEqual(v, 3);
                Assert.Less(v, 8);
                minSeen = Math.Min(minSeen, v);
                maxSeen = Math.Max(maxSeen, v);
            }
            Assert.AreEqual(3, minSeen, "min bound should be reachable");
            Assert.AreEqual(7, maxSeen, "maxExclusive-1 should be reachable");
        }

        [Test]
        public void NextInt_SingleValueRange_ReturnsMin()
        {
            var rng = new SeededRandom(5UL);
            for (int i = 0; i < 50; i++)
                Assert.AreEqual(4, rng.NextInt(4, 5));
        }

        [Test]
        public void Chance_BoundariesAndDistribution()
        {
            var rng = new SeededRandom(2024UL);
            Assert.IsFalse(rng.Chance(0.0));
            Assert.IsTrue(rng.Chance(1.0));
            int hits = 0;
            for (int i = 0; i < 10_000; i++) if (rng.Chance(0.25)) hits++;
            Assert.That(hits, Is.InRange(2200, 2800), "25% chance over 10k draws");
        }

        [Test]
        public void Streams_DerivedFromSameMaster_AreIndependentButReproducible()
        {
            ulong master = 1234UL;

            string[] names = { RandomStreams.World, RandomStreams.Agents, RandomStreams.Events, RandomStreams.Social, RandomStreams.Content };

            // Reproducibility across provider instances
            var p1 = new SimRandomProvider(master);
            var p2 = new SimRandomProvider(master);
            foreach (var name in names)
            {
                var s1 = p1.GetStream(name);
                var s2 = p2.GetStream(name);
                for (int i = 0; i < 500; i++)
                    Assert.AreEqual(s1.NextUInt64(), s2.NextUInt64(), $"stream '{name}' diverged at {i}");
            }

            // Distinct streams produce distinct sequences
            var worldSeq = Draw(new SimRandomProvider(master), RandomStreams.World, 100);
            var socialSeq = Draw(new SimRandomProvider(master), RandomStreams.Social, 100);
            CollectionAssert.AreNotEqual(worldSeq, socialSeq);
        }

        private static List<ulong> Draw(SimRandomProvider p, string stream, int count)
        {
            var list = new List<ulong>(count);
            var rng = p.GetStream(stream);
            for (int i = 0; i < count; i++) list.Add(rng.NextUInt64());
            return list;
        }

        [Test]
        public void Shuffle_IsDeterministic_AndPreservesElements()
        {
            var a = MakeList(16);
            var b = MakeList(16);
            var rngA = new SeededRandom(42UL);
            var rngB = new SeededRandom(42UL);
            rngA.Shuffle(a);
            rngB.Shuffle(b);
            CollectionAssert.AreEqual(a, b);

            a.Sort();
            for (int i = 0; i < 16; i++) Assert.AreEqual(i + 1, a[i]);
        }

        private static List<int> MakeList(int n)
        {
            var l = new List<int>(n);
            for (int i = 1; i <= n; i++) l.Add(i);
            return l;
        }

        [Test]
        public void Pick_FromSingleItemList_AlwaysReturnsIt()
        {
            var rng = new SeededRandom(11UL);
            var items = new[] { "only" };
            for (int i = 0; i < 10; i++)
                Assert.AreEqual("only", rng.Pick(items));
        }
    }
}
