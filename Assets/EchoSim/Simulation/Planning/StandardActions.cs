using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Role locations used by shared actions (openness facts, work, gatherings).</summary>
    public sealed class TownRoles
    {
        public LocationId? Cafe { get; init; }
        public LocationId? Store { get; init; }
        public LocationId? Square { get; init; }
        public LocationId? Workplace { get; init; }

        public static TownRoles DetectByConvention(SimulationWorld world)
        {
            LocationId? Find(string needle)
            {
                foreach (var id in world.Locations.OrderedIds)
                    if (id.Value.Contains(needle, StringComparison.Ordinal)) return id;
                return null;
            }
            return new TownRoles { Cafe = Find("cafe"), Store = Find("store"), Square = Find("square"), Workplace = Find("work") };
        }

        public IEnumerable<LocationId?> Roles()
        {
            yield return Cafe;
            yield return Store;
            yield return Square;
            yield return Workplace;
        }
    }

    /// <summary>
    /// Builds concrete GOAP action instances for one resident (spec §3.4).
    /// Per-resident instantiation keeps home-relative facts ("at_home") uniform
    /// across residents while remaining pure data.
    /// </summary>
    public static class StandardActions
    {
        public const string HomeFact = "at_home";
        public const string HasMeal = "has_meal";
        public const string HasIngredients = "has_ingredients";
        public const string PantryStock = "pantry_stock";

        private static readonly string[] EphemeralFacts =
            { "just_ate", "rested", "relaxed", "socialized", "explored", "worked", "on_shift" };

        public static IReadOnlyList<string> EphemeralSet() => EphemeralFacts;

        public static string LocationKey(LocationId id) => "at_" + id.Value;

        /// <summary>All mutually exclusive location flags including the home alias.</summary>
        public static List<string> AllLocationFlags(SimulationWorld world)
        {
            var keys = new List<string> { HomeFact };
            foreach (var id in world.Locations.OrderedIds) keys.Add(LocationKey(id));
            return keys;
        }

        private static List<FactEffect> MoveEffects(SimulationWorld world, string primaryKey, bool includeHomeAlias)
        {
            var effects = new List<FactEffect>();
            foreach (var key in AllLocationFlags(world))
                effects.Add(FactEffect.SetFalse(key));
            effects.Add(FactEffect.SetTrue(primaryKey));
            if (includeHomeAlias && primaryKey != HomeFact)
                effects.Add(FactEffect.SetTrue(HomeFact));
            return effects;
        }

        public static List<PlanningAction> CreateForResident(
            SimulationWorld world, AgentState agent, TownRoles roles)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (agent == null) throw new ArgumentNullException(nameof(agent));

            var list = new List<PlanningAction>();
            var homeId = agent.HomeLocationId;
            bool hasHome = !string.IsNullOrEmpty(homeId.Value);

            // --- Movement ---
            if (hasHome)
            {
                list.Add(new PlanningAction(
                    new ActionId("act_go_home"), "GoHome",
                    preconditions: null,
                    effects: MoveEffects(world, LocationKey(homeId), includeHomeAlias: true),
                    baseCost: 0.60f, durationMinutes: 15));
            }

            foreach (var locId in world.Locations.OrderedIds)
            {
                if (hasHome && locId == homeId) continue;
                var displayName = "GoTo " + world.Locations.Get(locId).Definition.DisplayName;
                list.Add(new PlanningAction(
                    new ActionId("act_goto_" + locId.Value), displayName,
                    preconditions: null,
                    effects: MoveEffects(world, LocationKey(locId), includeHomeAlias: false),
                    baseCost: 1.00f, durationMinutes: 15,
                    requiredLocation: locId));
            }

            // --- Food chain ---
            if (roles.Cafe.HasValue)
            {
                var cafe = roles.Cafe.Value;
                list.Add(new PlanningAction(
                    new ActionId("act_buy_meal"), "BuyFood",
                    new[] { FactCondition.True(LocationKey(cafe)), FactCondition.True("cafe_open") },
                    new[] { FactEffect.SetTrue(HasMeal) },
                    baseCost: 1.00f, durationMinutes: 12,
                    requiredLocation: cafe,
                    dynamicCost: ctx => 0.80f, // menu price placeholder until Sprint 15 economy
                    interruptible: false));
            }

            if (roles.Store.HasValue)
            {
                var store = roles.Store.Value;
                list.Add(new PlanningAction(
                    new ActionId("act_buy_ingredients"), "BuyIngredients",
                    new[] { FactCondition.True(LocationKey(store)), FactCondition.True("store_open") },
                    new[] { FactEffect.SetTrue(HasIngredients) },
                    baseCost: 0.80f, durationMinutes: 20,
                    requiredLocation: store,
                    dynamicCost: ctx => 0.60f,
                    interruptible: false));
            }

            if (hasHome)
            {
                list.Add(new PlanningAction(
                    new ActionId("act_get_ingredients"), "GetFood",
                    new[]
                    {
                        FactCondition.True(HomeFact),
                        new FactCondition(PantryStock, FactOperator.AtLeast, 1)
                    },
                    new[]
                    {
                        FactEffect.SetTrue(HasIngredients),
                        new FactEffect(PantryStock, FactEffectMode.AddDelta, -1)
                    },
                    baseCost: 1.50f, durationMinutes: 5));

                list.Add(new PlanningAction(
                    new ActionId("act_cook_meal"), "CookFood",
                    new[] { FactCondition.True(HomeFact), FactCondition.True(HasIngredients) },
                    new[]
                    {
                        FactEffect.SetTrue(HasMeal),
                        FactEffect.SetFalse(HasIngredients)
                    },
                    baseCost: 2.50f, durationMinutes: 40,
                    relief: new[] { new ActivityRelief(NeedKind.Hunger, 8f) }));
            }

            list.Add(new PlanningAction(
                new ActionId("act_eat"), "Eat",
                new[] { FactCondition.True(HasMeal) },
                new[]
                {
                    FactEffect.SetTrue("just_ate"),
                    FactEffect.SetFalse(HasMeal)
                },
                baseCost: 0.30f, durationMinutes: 20,
                relief: new[] { new ActivityRelief(NeedKind.Hunger, 55f) }));

            // --- Rest & leisure ---
            if (hasHome)
            {
                list.Add(new PlanningAction(
                    new ActionId("act_sleep"), "Sleep",
                    new[] { FactCondition.True(HomeFact) },
                    new[] { FactEffect.SetTrue("rested") },
                    baseCost: 0.50f, durationMinutes: 420,
                    relief: new[]
                    {
                        new ActivityRelief(NeedKind.Energy, 70f),
                        new ActivityRelief(NeedKind.Comfort, 25f)
                    },
                    interruptible: false));
            }

            list.Add(new PlanningAction(
                new ActionId("act_relax"), "Relax",
                preconditions: null,
                new[] { FactEffect.SetTrue("relaxed") },
                baseCost: 1.20f, durationMinutes: 60,
                relief: new[]
                {
                    new ActivityRelief(NeedKind.Fun, 30f),
                    new ActivityRelief(NeedKind.Social, 4f)
                }));

            list.Add(new PlanningAction(
                new ActionId("act_explore"), "Explore",
                new[] { new FactCondition(HomeFact, FactOperator.AtMost, 0) },
                new[] { FactEffect.SetTrue("explored") },
                baseCost: 0.90f, durationMinutes: 45,
                relief: new[] { new ActivityRelief(NeedKind.Fun, 18f) }));

            // --- Social ---
            if (roles.Square.HasValue)
            {
                var square = roles.Square.Value;
                list.Add(new PlanningAction(
                    new ActionId("act_find_person"), "FindPerson",
                    new[] { FactCondition.True("cafe_or_square_reachable") }, // always true; documents intent
                    MoveEffects(world, LocationKey(square), includeHomeAlias: false),
                    baseCost: 0.80f, durationMinutes: 10,
                    requiredLocation: square));
            }

            list.Add(new PlanningAction(
                new ActionId("act_talk"), "Talk",
                new[] { FactCondition.True("social_target_nearby") },
                new[] { FactEffect.SetTrue("socialized") },
                baseCost: 0.50f, durationMinutes: 30,
                relief: new[] { new ActivityRelief(NeedKind.Social, 50f) }));

            // --- Work ---
            list.Add(new PlanningAction(
                new ActionId("act_work"), "Work",
                new[] { FactCondition.True("at_work"), FactCondition.True("on_shift") },
                new[] { FactEffect.SetTrue("worked") },
                baseCost: 0.50f, durationMinutes: 240,
                relief: new[]
                {
                    new ActivityRelief(NeedKind.Energy, -18f),
                    new ActivityRelief(NeedKind.Hunger, -12f)
                },
                interruptible: false));

            // --- Fallback ---
            list.Add(new PlanningAction(
                new ActionId("act_idle"), "Idle",
                preconditions: null,
                new[] { FactEffect.SetTrue("relaxed") },
                baseCost: 3.00f, durationMinutes: 30,
                relief: new[] { new ActivityRelief(NeedKind.Fun, 6f) }));

            return list;
        }
    }
}
