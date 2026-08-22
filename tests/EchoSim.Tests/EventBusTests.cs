using System;
using System.Collections.Generic;
using EchoSim.Core;
using NUnit.Framework;

namespace EchoSim.Tests
{
    public class EventBusTests
    {
        private readonly struct TestEvent : ISimulationEvent
        {
            public int Payload { get; }
            public TestEvent(int payload) { Payload = payload; }
        }

        private readonly struct OtherEvent : ISimulationEvent
        {
        }

        [Test]
        public void Publish_ReachesSubscribers()
        {
            var bus = new EventBus();
            int received = 0;
            using (bus.Subscribe<TestEvent>(e => received += e.Payload))
            {
                bus.Publish(new TestEvent(5));
                bus.Publish(new TestEvent(7));
            }
            Assert.AreEqual(12, received);
        }

        [Test]
        public void Unsubscribe_StopsDelivery()
        {
            var bus = new EventBus();
            int received = 0;
            Action<TestEvent> handler = e => received++;
            bus.Subscribe(handler);
            bus.Publish(new TestEvent(1));
            bus.Unsubscribe(handler);
            bus.Publish(new TestEvent(2));
            Assert.AreEqual(1, received);
            Assert.AreEqual(0, bus.GetSubscriberCount<TestEvent>());
        }

        [Test]
        public void SubscriptionDispose_Unsubscribes()
        {
            var bus = new EventBus();
            IDisposable sub = bus.Subscribe<TestEvent>(_ => { });
            Assert.AreEqual(1, bus.GetSubscriberCount<TestEvent>());
            sub.Dispose();
            Assert.AreEqual(0, bus.GetSubscriberCount<TestEvent>());
        }

        [Test]
        public void Events_AreTypedSeparately()
        {
            var bus = new EventBus();
            int testHits = 0, otherHits = 0;
            bus.Subscribe<TestEvent>(_ => testHits++);
            bus.Subscribe<OtherEvent>(_ => otherHits++);
            bus.Publish(new TestEvent(0));
            Assert.AreEqual(1, testHits);
            Assert.AreEqual(0, otherHits);
        }

        [Test]
        public void UnsubscribeDuringPublish_IsSafe()
        {
            var bus = new EventBus();
            IDisposable second = bus.Subscribe<TestEvent>(_ => { });
            int firstCalls = 0;
            Action<TestEvent> first = _ =>
            {
                firstCalls++;
                second.Dispose(); // mutates the handler list mid-publish
            };
            bus.Subscribe(first);
            Assert.DoesNotThrow(() => bus.Publish(new TestEvent(0)));
            Assert.AreEqual(1, firstCalls);
        }

        [Test]
        public void SubscribeDuringPublish_DoesNotReceiveCurrentEvent()
        {
            var bus = new EventBus();
            bool lateReceived = false;
            Action<TestEvent>? lateHandler = null;
            IDisposable? lateSub = null;

            IDisposable first = bus.Subscribe<TestEvent>(_ =>
            {
                lateHandler ??= _e => lateReceived = true; // C# 9: no target-typed assignment needed here
                lateSub ??= bus.Subscribe(lateHandler!);
            });

            try
            {
                bus.Publish(new TestEvent(0));
                Assert.IsFalse(lateReceived, "handler added during publish must not see the in-flight event");
                bus.Publish(new TestEvent(0));
                Assert.IsTrue(lateReceived, "handler added during publish receives subsequent events");
            }
            finally
            {
                first.Dispose();
                lateSub?.Dispose();
            }
        }

        [Test]
        public void FaultingHandler_StillLetsOthersRun_AndSurfacesError()
        {
            var bus = new EventBus();
            int afterFault = 0;
            bus.Subscribe<TestEvent>(_ => throw new InvalidOperationException("boom"));
            bus.Subscribe<TestEvent>(_ => afterFault++);

            Assert.Throws<EventBusException>(() => bus.Publish(new TestEvent(0)));
            Assert.AreEqual(1, afterFault, "healthy handler must still execute");
            Assert.AreEqual(1, bus.Statistics.FaultedHandlers);
        }

        [Test]
        public void Statistics_TrackPublishesAndInvocations()
        {
            var bus = new EventBus();
            using (bus.Subscribe<TestEvent>(_ => { }))
            {
                bus.Publish(new TestEvent(0));
                bus.Publish(new TestEvent(0));
            }
            bus.Publish(new TestEvent(0)); // no subscribers: still counts as published
            Assert.AreEqual(3, bus.Statistics.PublishedEvents);
            Assert.AreEqual(2, bus.Statistics.HandlerInvocations);
        }
    }
}
