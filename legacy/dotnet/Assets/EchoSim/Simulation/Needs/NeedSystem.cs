using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>The seven initial needs.</summary>
    public enum NeedKind
    {
        Hunger = 0,
        Energy = 1,
        Social = 2,
        Fun = 3,
        Comfort = 4,
        Hygiene = 5,
        Safety = 6
    }

    /// <summary>
    /// Need convention: 0 = fully satisfied, 100 = critical.
    /// </summary>
    public sealed class NeedDefinition
    {
        public NeedKind Kind { get; }
        public float GrowthPerSimHour { get; }
        public float CriticalThreshold { get; }
        public float SatisfactionThreshold { get; }
        public float InterruptThreshold { get; }

        public NeedDefinition(NeedKind kind, float growthPerSimHour,
            float satisfactionThreshold, float criticalThreshold, float interruptThreshold)
        {
            if (growthPerSimHour < 0f) throw new ArgumentOutOfRangeException(nameof(growthPerSimHour));
            if (satisfactionThreshold < 0f || satisfactionThreshold > 100f) throw new ArgumentOutOfRangeException(nameof(satisfactionThreshold));
            if (criticalThreshold <= satisfactionThreshold || criticalThreshold > 100f)
                throw new ArgumentOutOfRangeException(nameof(criticalThreshold), "Must satisfy SatisfactionThreshold < CriticalThreshold <= 100.");
            if (interruptThreshold < criticalThreshold || interruptThreshold > 100f)
                throw new ArgumentOutOfRangeException(nameof(interruptThreshold), "Must satisfy CriticalThreshold <= InterruptThreshold <= 100.");
            Kind = kind;
            GrowthPerSimHour = growthPerSimHour;
            SatisfactionThreshold = satisfactionThreshold;
            CriticalThreshold = criticalThreshold;
            InterruptThreshold = interruptThreshold;
        }
    }

    /// <summary>Canonical default need tuning. Activities may layer modifiers on top.
    /// Interrupt thresholds are ordered: survival needs interrupt before comfort needs.</summary>
    public static class StandardNeeds
    {
        public static IReadOnlyList<NeedDefinition> Library() => new[]
        {
            new NeedDefinition(NeedKind.Hunger,  3.5f, 30f, 80f, 92f),
            new NeedDefinition(NeedKind.Energy,  2.8f, 22f, 85f, 95f),
            new NeedDefinition(NeedKind.Social,  1.9f, 25f, 75f, 93f),
            new NeedDefinition(NeedKind.Fun,     2.4f, 30f, 78f, 97f),
            new NeedDefinition(NeedKind.Comfort, 1.4f, 35f, 72f, 96f),
            new NeedDefinition(NeedKind.Hygiene, 1.7f, 32f, 79f, 96f),
            new NeedDefinition(NeedKind.Safety,  0.9f, 40f, 82f, 98f)
        };
    }

    /// <summary>Runtime value of one need.</summary>
    public sealed class NeedState
    {
        public NeedDefinition Definition { get; }
        public float Current { get; private set; }

        internal NeedState(NeedDefinition definition, float initial)
        {
            Definition = definition;
            Current = Clamp(initial);
        }

        private static float Clamp(float v) => v < 0f ? 0f : (v > 100f ? 100f : v);

        /// <summary>Save-load import: exact value assignment.</summary>
        internal void Force(float value) => Current = Clamp(value);

        /// <summary>Advances natural growth over a simulated span.</summary>
        public void Advance(SimDuration delta)
        {
            double hours = delta.TotalMinutes / 60.0;
            Current = Clamp((float)(Current + Definition.GrowthPerSimHour * hours));
        }

        /// <summary>Applies an activity effect: relief reduces the need, negative values drain it.</summary>
        public void Apply(float amount)
        {
            Current = Clamp(Current - amount);
        }

        public bool IsSatisfied => Current <= Definition.SatisfactionThreshold;
        public bool IsCritical => Current >= Definition.CriticalThreshold;
        public bool ShouldInterrupt => Current >= Definition.InterruptThreshold;

        public float Normalized => Current / 100f;
    }

    /// <summary>All needs of one resident.</summary>
    public sealed class NeedSet
    {
        private readonly Dictionary<NeedKind, NeedState> _needs = new Dictionary<NeedKind, NeedState>();

        public NeedSet(IReadOnlyList<NeedDefinition> definitions, IDictionary<NeedKind, float>? initialValues = null)
        {
            for (int i = 0; i < definitions.Count; i++)
            {
                var def = definitions[i];
                float initial = initialValues != null && initialValues.TryGetValue(def.Kind, out var v) ? v : 20f;
                _needs.Add(def.Kind, new NeedState(def, initial));
            }
        }

        public NeedState Get(NeedKind kind)
        {
            if (!_needs.TryGetValue(kind, out var state))
                throw new KeyNotFoundException($"No need '{kind}' in this set.");
            return state!;
        }

        public IEnumerable<NeedState> All => _needs.Values;

        public void Advance(SimDuration delta)
        {
            foreach (var need in _needs.Values) need.Advance(delta);
        }

        /// <summary>Applies relief/drain to one need.</summary>
        public void Relieve(NeedKind kind, float amount) => Get(kind).Apply(amount);

        /// <summary>Save-load import: sets a need's exact value.</summary>
        public void Force(NeedKind kind, float value) => Get(kind).Force(value);

        /// <summary>The need with the highest current value (null when empty).</summary>
        public NeedState? MostUrgent()
        {
            NeedState? best = null;
            foreach (var need in _needs.Values)
                if (best == null || need.Current > best.Current) best = need;
            return best;
        }

        /// <summary>The most urgent need whose interrupt threshold is breached, if any.</summary>
        public NeedState? FindInterrupting()
        {
            NeedState? best = null;
            foreach (var need in _needs.Values)
                if (need.ShouldInterrupt && (best == null || need.Current > best.Current)) best = need;
            return best;
        }
    }
}
