using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>One advertised capability of a location or object (spec §4.5).</summary>
    public readonly struct Affordance
    {
        public ActionId Action { get; }
        public LocationId Provider { get; }
        /// <summary>Optional concrete object name ("bed", "cafe counter", "bookshelf").</summary>
        public string? ObjectName { get; }

        public Affordance(ActionId action, LocationId provider, string? objectName = null)
        {
            Action = action;
            Provider = provider;
            ObjectName = objectName;
        }

        public override string ToString() =>
            ObjectName == null ? $"{Action}@{Provider}" : $"{Action}@{Provider}:{ObjectName}";
    }

    /// <summary>
    /// Registry answering "which providers can satisfy this action?" — the planner
    /// and action factory query this instead of hard-coding scene names (spec §4.6).
    /// </summary>
    public sealed class AffordanceRegistry
    {
        private readonly List<Affordance> _all = new List<Affordance>();

        public void Register(LocationId provider, ActionId action, string? objectName = null)
            => _all.Add(new Affordance(action, provider, objectName));

        /// <summary>Deterministic: registration order preserved.</summary>
        public IReadOnlyList<Affordance> FindByAction(ActionId action)
        {
            var result = new List<Affordance>();
            foreach (var a in _all)
                if (a.Action == action) result.Add(a);
            return result;
        }

        public IReadOnlyList<Affordance> ForLocation(LocationId provider)
        {
            var result = new List<Affordance>();
            foreach (var a in _all)
                if (a.Provider == provider) result.Add(a);
            return result;
        }

        public bool CanPerform(ActionId action, LocationId provider)
        {
            foreach (var a in _all)
                if (a.Action == action && a.Provider == provider) return true;
            return false;
        }

        public int Count => _all.Count;

        public override string ToString() => string.Join(", ", _all.Select(a => a.ToString()));
    }

    /// <summary>
    /// Resource reservations with ownership, expiry and conflict rejection
    /// (spec §4.7). Expiry sweeps run on the simulation scheduler.
    /// </summary>
    public sealed class ReservationService
    {
        private sealed class Hold
        {
            public AgentId Owner;
            public SimTime Until;
        }

        private readonly SimulationWorld _world;
        private readonly Dictionary<ResourceId, Hold> _holds = new Dictionary<ResourceId, Hold>();

        public long TotalGranted { get; private set; }
        public long TotalDenied { get; private set; }
        public long TotalExpired { get; private set; }
        public long TotalReleased { get; private set; }

        public ReservationService(SimulationWorld world, int sweepEveryMinutes = 5)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _world.Scheduler.ScheduleRepeating(SimDuration.FromMinutes(sweepEveryMinutes),
                t => Expire(t), "reservation-expiry");
        }

        /// <summary>
        /// Attempts to reserve a resource until the given instant.
        /// Returns false when someone else currently holds it.
        /// Re-reserving your own hold extends it.
        /// </summary>
        public bool Reserve(ResourceId resource, AgentId owner, SimTime until)
        {
            if (_holds.TryGetValue(resource, out var existing))
            {
                if (existing.Owner == owner) { existing.Until = until; TotalGranted++; return true; }
                if (existing.Until > _world.Clock.CurrentTime) { TotalDenied++; return false; }
                TotalExpired++; // reclaim expired holds on contention
            }
            _holds[resource] = new Hold { Owner = owner, Until = until };
            TotalGranted++;
            return true;
        }

        public bool Release(ResourceId resource, AgentId owner)
        {
            if (!_holds.TryGetValue(resource, out var hold) || hold.Owner != owner) return false;
            _holds.Remove(resource);
            TotalReleased++;
            return true;
        }

        public bool IsHeldBy(ResourceId resource, AgentId owner)
            => _holds.TryGetValue(resource, out var h) && h.Owner == owner;

        public AgentId? Holder(ResourceId resource)
            => _holds.TryGetValue(resource, out var h) ? h.Owner : (AgentId?)null;

        /// <summary>Drops expired holds. Called by the scheduler sweep.</summary>
        public void Expire(SimTime now)
        {
            List<ResourceId>? expired = null;
            foreach (var kv in _holds)
                if (kv.Value.Until <= now) (expired ??= new List<ResourceId>()).Add(kv.Key);
            if (expired == null) return;
            foreach (var id in expired)
            {
                _holds.Remove(id);
                TotalExpired++;
            }
        }

        public int ActiveCount => _holds.Count;
    }
}
