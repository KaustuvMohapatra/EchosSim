using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Immutable authored description of a location.</summary>
    public sealed class LocationDefinition
    {
        public LocationId Id { get; }
        public string DisplayName { get; }
        public int Capacity { get; }

        public LocationDefinition(LocationId id, string displayName, int capacity = int.MaxValue)
        {
            Id = id;
            if (string.IsNullOrWhiteSpace(displayName))
                throw new ArgumentException("Display name required.", nameof(displayName));
            if (capacity < 1)
                throw new ArgumentOutOfRangeException(nameof(capacity), "Capacity must be at least 1.");
            DisplayName = displayName;
            Capacity = capacity;
        }

        public override string ToString() => $"{DisplayName} ({Id})";
    }

    /// <summary>Mutable runtime state of a location. Sprint 1: occupancy only.</summary>
    public sealed class LocationRuntimeState
    {
        public LocationId Id { get; }
        public LocationDefinition Definition { get; }
        public bool IsOpen { get; private set; }
        public int OccupiedCount { get; internal set; }

        public LocationRuntimeState(LocationDefinition definition)
        {
            Definition = definition ?? throw new ArgumentNullException(nameof(definition));
            Id = definition.Id;
            IsOpen = true;
        }

        /// <summary>Opens or closes the location (opening-hours systems drive this).</summary>
        public void SetOpen(bool open) => IsOpen = open;

        internal void OnAgentEntered()
        {
            if (OccupiedCount >= Definition.Capacity)
                throw new InvalidOperationException($"Location '{Id}' is at capacity ({Definition.Capacity}).");
            OccupiedCount++;
        }

        internal void OnAgentLeft()
        {
            if (OccupiedCount <= 0)
                throw new InvalidOperationException($"Location '{Id}' occupancy underflow.");
            OccupiedCount--;
        }
    }

    /// <summary>
    /// Registry of locations. Iteration order is insertion order, which is deterministic
    /// because world construction is deterministic.
    /// </summary>
    public sealed class LocationRepository
    {
        private readonly Dictionary<LocationId, LocationRuntimeState> _states = new Dictionary<LocationId, LocationRuntimeState>();
        private readonly List<LocationId> _order = new List<LocationId>();

        public IReadOnlyList<LocationId> OrderedIds => _order;
        public int Count => _order.Count;

        public void Add(LocationDefinition definition)
        {
            if (_states.ContainsKey(definition.Id))
                throw new InvalidOperationException($"Duplicate location id '{definition.Id}'.");
            _states.Add(definition.Id, new LocationRuntimeState(definition));
            _order.Add(definition.Id);
        }

        public bool TryGet(LocationId id, out LocationRuntimeState state) => _states.TryGetValue(id, out state!);

        public LocationRuntimeState Get(LocationId id)
        {
            if (!_states.TryGetValue(id, out var state))
                throw new KeyNotFoundException($"Unknown location '{id}'.");
            return state!;
        }

        internal void Remove(LocationId id)
        {
            if (!_states.Remove(id))
                throw new KeyNotFoundException($"Unknown location '{id}'.");
            _order.Remove(id);
        }
    }
}
