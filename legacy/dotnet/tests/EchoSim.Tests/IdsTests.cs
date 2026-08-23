using System;
using EchoSim.Core;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class IdsTests
    {
        [Test]
        public void StringIds_WithSameValue_AreEqual()
        {
            Assert.AreEqual(new AgentId("npc_rohan"), new AgentId("npc_rohan"));
            Assert.AreEqual(new LocationId("loc_cafe"), new LocationId("loc_cafe"));
            Assert.AreEqual(new ActionId("act_eat"), new ActionId("act_eat"));
            Assert.IsTrue(new AgentId("a") == new AgentId("a"));
        }

        [Test]
        public void StringIds_CaseSensitive()
        {
            Assert.AreNotEqual(new AgentId("rohan"), new AgentId("Rohan"));
        }

        [Test]
        public void NumericIds_CompareByValue()
        {
            Assert.AreEqual(new MemoryId(7), new MemoryId(7));
            Assert.AreNotEqual(new MemoryId(7), new MemoryId(8));
            Assert.AreEqual(new EventId(42), new EventId(42));
            Assert.Less(new MemoryId(9).Value, new MemoryId(10).Value);
        }

        [Test]
        public void InvalidStringValues_AreRejected()
        {
            Assert.Throws<ArgumentException>(() => _ = new AgentId(""));
            Assert.Throws<ArgumentException>(() => _ = new AgentId("   "));
            Assert.Throws<ArgumentException>(() => _ = new AgentId(null!));
            Assert.Throws<ArgumentException>(() => _ = new LocationId(""));
            Assert.Throws<ArgumentException>(() => _ = new ActionId(null!));
            string tooLong = new string('x', 129);
            Assert.Throws<ArgumentException>(() => _ = new AgentId(tooLong));
        }

        [Test]
        public void NonPositiveNumericIds_AreRejected()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = new MemoryId(0));
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = new MemoryId(-5));
            Assert.Throws<ArgumentOutOfRangeException>(() => _ = new EventId(0));
        }

        [Test]
        public void TryParse_ReturnsFalseOnInvalidInput()
        {
            Assert.IsFalse(AgentId.TryParse("", out _));
            Assert.IsFalse(AgentId.TryParse(null, out _));
            Assert.IsTrue(AgentId.TryParse("npc_ok", out var ok));
            Assert.AreEqual("npc_ok", ok.Value);
        }

        [Test]
        public void DefaultStruct_IsDetectablyInvalid()
        {
            var empty = default(AgentId);
            Assert.IsNull(empty.Value);
        }

        [Test]
        public void HashCodes_MatchEquality()
        {
            Assert.AreEqual(new AgentId("x").GetHashCode(), new AgentId("x").GetHashCode());
            Assert.AreEqual(new MemoryId(11).GetHashCode(), new MemoryId(11).GetHashCode());
        }
    }
}
