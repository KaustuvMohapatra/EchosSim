using System;
using System.Collections.Generic;

namespace EchoSim.Core
{
    /// <summary>Marker for typed simulation events. Events are immutable value types.</summary>
    public interface ISimulationEvent
    {
    }

    /// <summary>Aggregate counters for diagnostics.</summary>
    public struct EventBusStatistics
    {
        public long PublishedEvents;
        public long HandlerInvocations;
        public long FaultedHandlers;
    }

    /// <summary>
    /// Typed publish/subscribe bus for simulation events.
    /// Instance owned (no global singleton); single threaded by contract.
    /// Iteration is snapshot based: subscribing or unsubscribing while publishing is safe.
    /// </summary>
    public sealed class EventBus
    {
        private readonly Dictionary<Type, Delegate[]> _handlersByType = new Dictionary<Type, Delegate[]>();
        private EventBusStatistics _statistics;

        /// <summary>Raised (outside of publish) when a handler threw; the fault is also counted.</summary>
        public event Action<Type, Exception>? HandlerFaulted;

        public EventBusStatistics Statistics => _statistics;

        public IDisposable Subscribe<TEvent>(Action<TEvent> handler) where TEvent : struct, ISimulationEvent
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            var type = typeof(TEvent);
            AddHandler(type, handler);
            return new Subscription<TEvent>(this, handler);
        }

        public void Unsubscribe<TEvent>(Action<TEvent> handler) where TEvent : struct, ISimulationEvent
        {
            if (handler == null) throw new ArgumentNullException(nameof(handler));
            RemoveHandler(typeof(TEvent), handler);
        }

        public void Publish<TEvent>(TEvent evt) where TEvent : struct, ISimulationEvent
        {
            var type = typeof(TEvent);
            Delegate[]? snapshot;
            lock (_handlersByType) // copy-on-write arrays make the read itself allocation free
            {
                _handlersByType.TryGetValue(type, out snapshot);
            }

            _statistics.PublishedEvents++;
            if (snapshot == null || snapshot.Length == 0) return;

            Exception? firstFault = null;
            for (int i = 0; i < snapshot.Length; i++)
            {
                try
                {
                    ((Action<TEvent>)snapshot[i])(evt);
                    _statistics.HandlerInvocations++;
                }
                catch (Exception ex)
                {
                    _statistics.FaultedHandlers++;
                    if (firstFault == null) firstFault = ex;
                    HandlerFaulted?.Invoke(type, ex);
                }
            }

            if (firstFault != null)
                throw new EventBusException($"One or more handlers faulted while publishing {type.Name}.", firstFault);
        }

        public int GetSubscriberCount<TEvent>() where TEvent : struct, ISimulationEvent
        {
            lock (_handlersByType)
            {
                return _handlersByType.TryGetValue(typeof(TEvent), out var arr) ? arr.Length : 0;
            }
        }

        private void AddHandler(Type type, Delegate handler)
        {
            lock (_handlersByType)
            {
                _handlersByType.TryGetValue(type, out var existing);
                int oldLength = existing?.Length ?? 0;
                var next = new Delegate[oldLength + 1];
                if (existing != null) Array.Copy(existing, next, oldLength);
                next[oldLength] = handler;
                _handlersByType[type] = next;
            }
        }

        private void RemoveHandler(Type type, Delegate handler)
        {
            lock (_handlersByType)
            {
                if (!_handlersByType.TryGetValue(type, out var existing)) return;
                int index = Array.IndexOf(existing, handler);
                if (index < 0) return;
                var next = new Delegate[existing.Length - 1];
                Array.Copy(existing, 0, next, 0, index);
                Array.Copy(existing, index + 1, next, index, existing.Length - index - 1);
                if (next.Length == 0) _handlersByType.Remove(type); else _handlersByType[type] = next;
            }
        }

        private sealed class Subscription<TEvent> : IDisposable where TEvent : struct, ISimulationEvent
        {
            private EventBus? _bus;
            private readonly Action<TEvent> _handler;

            public Subscription(EventBus bus, Action<TEvent> handler)
            {
                _bus = bus;
                _handler = handler;
            }

            public void Dispose()
            {
                var bus = _bus;
                if (bus == null) return;
                _bus = null;
                bus.Unsubscribe(_handler);
            }
        }
    }

    internal interface IEventBusInternal
    {
        IDisposable Subscribe<TEvent>(Action<TEvent> handler) where TEvent : struct, ISimulationEvent;
        int GetSubscriberCount(Type eventType);
    }

    public sealed class EventBusException : Exception
    {
        public EventBusException(string message, Exception inner) : base(message, inner) { }
    }
}
