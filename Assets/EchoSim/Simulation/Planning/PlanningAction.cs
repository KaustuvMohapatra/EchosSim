using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Context available to dynamic cost functions.</summary>
    public sealed class ActionCostContext
    {
        public SimulationWorld? World { get; }
        public AgentId Agent { get; }

        public ActionCostContext(SimulationWorld? world, AgentId agent)
        {
            World = world;
            Agent = agent;
        }

        public static ActionCostContext Anonymous { get; } = new ActionCostContext(null, default);
    }

    /// <summary>Flat need effect applied when an action completes successfully.</summary>
    public sealed class ActivityRelief
    {
        public NeedKind Kind { get; }
        /// <summary>Positive relieves the need; negative drains it.</summary>
        public float Amount { get; }

        public ActivityRelief(NeedKind kind, float amount)
        {
            Kind = kind;
            Amount = amount;
        }
    }

    /// <summary>
    /// A concrete, planner-consumable action. Precondition/effect facts drive search;
    /// the remaining metadata drives execution (duration, location binding, relief).
    /// </summary>
    public sealed class PlanningAction
    {
        public ActionId Id { get; }
        public string DisplayName { get; }
        public IReadOnlyList<FactCondition> Preconditions { get; }
        public IReadOnlyList<FactEffect> Effects { get; }
        public float BaseCost { get; }
        public Func<ActionCostContext, float>? DynamicCost { get; }
        public int DurationMinutes { get; }
        public IReadOnlyList<ActivityRelief> Relief { get; }
        public bool Interruptible { get; }
        /// <summary>Location this action must be performed at (null = anywhere).</summary>
        public LocationId? RequiredLocation { get; }
        /// <summary>True for travel actions whose executor time is the navigation ETA.</summary>
        public bool IsMovement { get; }

        public PlanningAction(ActionId id, string displayName,
            IEnumerable<FactCondition>? preconditions,
            IEnumerable<FactEffect>? effects,
            float baseCost,
            int durationMinutes = 0,
            LocationId? requiredLocation = null,
            IEnumerable<ActivityRelief>? relief = null,
            Func<ActionCostContext, float>? dynamicCost = null,
            bool interruptible = true,
            bool isMovement = false)
        {
            Id = id;
            DisplayName = displayName ?? throw new ArgumentNullException(nameof(displayName));
            if (!float.IsFinite(baseCost) || baseCost < 0f)
                throw new ArgumentOutOfRangeException(nameof(baseCost), "Action base cost must be finite and non-negative.");
            BaseCost = baseCost;

            var pres = preconditions?.ToList() ?? new List<FactCondition>();
            foreach (var p in pres)
                if (string.IsNullOrWhiteSpace(p.Key)) throw new ArgumentException("Empty precondition key.");

            Preconditions = pres;
            Effects = effects?.ToList() ?? new List<FactEffect>();
            if (durationMinutes < 0) throw new ArgumentOutOfRangeException(nameof(durationMinutes));
            DurationMinutes = durationMinutes;
            RequiredLocation = requiredLocation;
            Relief = relief?.ToList() ?? new List<ActivityRelief>();
            DynamicCost = dynamicCost;
            Interruptible = interruptible;
            IsMovement = isMovement;
        }

        public bool IsApplicableIn(PlannerWorldState state) => state.SatisfiesAll(Preconditions);

        public void ApplyEffectsTo(PlannerWorldState state)
        {
            for (int i = 0; i < Effects.Count; i++)
                Effects[i].ApplyTo(state);
        }

        /// <summary>Total planning cost: base + dynamic, guarded finite/non-negative.</summary>
        public float CostFor(ActionCostContext context)
        {
            float cost = BaseCost;
            if (DynamicCost != null) cost += DynamicCost(context);
            if (!float.IsFinite(cost)) throw new InvalidOperationException($"Action '{Id}' produced non-finite cost.");
            return cost < 0f ? 0f : cost;
        }

        public override string ToString() => $"{DisplayName}({Id})";
    }
}
