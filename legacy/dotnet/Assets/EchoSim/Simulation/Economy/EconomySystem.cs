using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    public sealed class ItemDefinition
    {
        public ItemId Id { get; }
        public string Name { get; }
        public float Price { get; }
        public IReadOnlyList<string> Tags { get; }

        public ItemDefinition(string id, string name, float price, IEnumerable<string>? tags = null)
        {
            Id = new ItemId(id);
            if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Item name required.", nameof(name));
            if (price < 0f) throw new ArgumentOutOfRangeException(nameof(price));
            Name = name;
            Price = price;
            Tags = tags != null ? new List<string>(tags) : Array.Empty<string>();
        }

        public bool HasTag(string tag)
        {
            for (int i = 0; i < Tags.Count; i++)
                if (string.Equals(Tags[i], tag, StringComparison.Ordinal)) return true;
            return false;
        }
    }

    /// <summary>Simple bounded inventory.</summary>
    public sealed class Inventory
    {
        private readonly Dictionary<ItemId, int> _stacks = new Dictionary<ItemId, int>();

        public int Count(ItemId id) => _stacks.TryGetValue(id, out var n) ? n : 0;

        public void Add(ItemId id, int quantity = 1)
        {
            if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));
            _stacks[id] = Count(id) + quantity;
        }

        public bool Remove(ItemId id, int quantity = 1)
        {
            int have = Count(id);
            if (have < quantity) return false;
            if (have == quantity) _stacks.Remove(id);
            else _stacks[id] = have - quantity;
            return true;
        }

        public IReadOnlyDictionary<ItemId, int> Snapshot => _stacks;
    }

    public enum PurchaseFailure
    {
        None,
        UnknownItem,
        NotSoldHere,
        OutOfStock,
        InsufficientMoney,
        LocationClosed
    }

    /// <summary>
    /// Light economy (spec Sprint 15): prices, shop stock, money, wages, purchases.
    /// Deliberately not an economic simulator.
    /// </summary>
    public sealed class EconomySystem
    {
        private readonly SimulationWorld _world;
        private readonly Dictionary<ItemId, ItemDefinition> _items = new Dictionary<ItemId, ItemDefinition>();
        private readonly Dictionary<LocationId, Dictionary<ItemId, int>> _stock =
            new Dictionary<LocationId, Dictionary<ItemId, int>>();

        public EconomySystem(SimulationWorld world)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
        }

        public void RegisterItem(ItemDefinition item) => _items.Add(item.Id, item);

        public ItemDefinition GetItem(ItemId id)
        {
            if (!_items.TryGetValue(id, out var item))
                throw new KeyNotFoundException($"Unknown item '{id}'.");
            return item!;
        }

        public void Stock(LocationId shop, ItemId item, int count)
        {
            if (!_stock.TryGetValue(shop, out var list))
            {
                list = new Dictionary<ItemId, int>();
                _stock.Add(shop, list);
            }
            list[item] = count;
        }

        public int StockAt(LocationId shop, ItemId item) =>
            _stock.TryGetValue(shop, out var l) && l.TryGetValue(item, out var n) ? n : 0;

        /// <summary>
        /// Attempts a purchase at the agent's current location.
        /// Emits an observable 'purchase' event on success so memories form naturally.
        /// </summary>
        public PurchaseFailure TryPurchase(AgentId agent, ItemId itemId, out ItemDefinition? purchased)
        {
            purchased = null;
            if (!_items.TryGetValue(itemId, out var item)) return PurchaseFailure.UnknownItem;

            var agentState = _world.Agents.Get(agent);
            if (!agentState.HasLocation) return PurchaseFailure.NotSoldHere;

            var here = agentState.CurrentLocationId;
            var runtime = _world.Locations.Get(here);
            if (!runtime.IsOpen) return PurchaseFailure.LocationClosed;
            if (!_stock.TryGetValue(here, out var list) || !list.ContainsKey(itemId)) return PurchaseFailure.NotSoldHere;

            int available = list[itemId];
            if (available < 1) return PurchaseFailure.OutOfStock;

            var mind = _world.Residents.Get(agent);
            if (mind.Money < item.Price) return PurchaseFailure.InsufficientMoney;

            mind.Money -= item.Price;
            mind.Inventory.Add(itemId, 1);
            available--;
            list[itemId] = available; // explicit zero keeps OutOfStock distinct from never-stocked

            purchased = item;
            _world.Events.Publish(MakePurchaseObservation(agent, here, item));
            return PurchaseFailure.None;
        }

        private ObservationRecordedEvent MakePurchaseObservation(AgentId agent, LocationId where, ItemDefinition item)
        {
            // Purchases are personal episodes: encode directly into the buyer's memory log
            // via the same observation channel other systems use.
            var evt = new ObservableEvent(new EventId(PurchaseEventCounter++), "purchase",
                new[] { agent }, where, _world.Clock.CurrentTime, ObservationReach.SameLocation);
            var observation = new Observation(agent, evt, 1f, PerceptionSource.DirectParticipation);
            return new ObservationRecordedEvent(observation);
        }

        private long _purchaseEventCounter = 500_000;
        private long PurchaseEventCounter { get => _purchaseEventCounter; set => _purchaseEventCounter = value; }

        /// <summary>Pays a wage for completed work time.</summary>
        public float PayWage(AgentId agent, double hours)
        {
            var mind = _world.Residents.Get(agent);
            if (mind.Job == null) return 0f;
            float wage = (float)(mind.Job.IncomePerHour * hours);
            mind.Money += wage;
            return wage;
        }
    }
}
