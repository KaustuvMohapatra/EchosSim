using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Comparison operator for planner facts.</summary>
    public enum FactOperator
    {
        /// <summary>fact[key] >= value</summary>
        AtLeast,
        /// <summary>fact[key] <= value</summary>
        AtMost
    }

    /// <summary>A partial-match condition over the planner world state.</summary>
    public readonly struct FactCondition : IEquatable<FactCondition>
    {
        public string Key { get; }
        public FactOperator Operator { get; }
        public int Value { get; }

        public FactCondition(string key, FactOperator op, int value)
        {
            Key = key ?? throw new ArgumentNullException(nameof(key));
            Operator = op;
            Value = value;
        }

        public static FactCondition True(string key) => new FactCondition(key, FactOperator.AtLeast, 1);

        public bool IsSatisfiedBy(PlannerWorldState state) => Operator switch
        {
            FactOperator.AtLeast => state.Get(Key) >= Value,
            FactOperator.AtMost => state.Get(Key) <= Value,
            _ => throw new InvalidOperationException("Unknown fact operator.")
        };

        public bool Equals(FactCondition other) =>
            string.Equals(Key, other.Key, StringComparison.Ordinal) && Operator == other.Operator && Value == other.Value;
        public override string ToString() =>
            $"{Key} {(Operator == FactOperator.AtLeast ? ">=" : "<=")} {Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
    }

    /// <summary>How an action mutates the planner state.</summary>
    public enum FactEffectMode
    {
        /// <summary>fact[key] = value</summary>
        Assign,
        /// <summary>fact[key] += value</summary>
        AddDelta
    }

    public readonly struct FactEffect
    {
        public string Key { get; }
        public FactEffectMode Mode { get; }
        public int Value { get; }

        public FactEffect(string key, FactEffectMode mode, int value)
        {
            Key = key ?? throw new ArgumentNullException(nameof(key));
            Mode = mode;
            Value = value;
        }

        public static FactEffect SetTrue(string key) => new FactEffect(key, FactEffectMode.Assign, 1);
        public static FactEffect SetFalse(string key) => new FactEffect(key, FactEffectMode.Assign, 0);

        public void ApplyTo(PlannerWorldState state)
        {
            if (Mode == FactEffectMode.Assign) state.Set(Key, Value);
            else state.Set(Key, state.Get(Key) + Value);
        }

        public override string ToString() =>
            Mode == FactEffectMode.Assign
                ? $"{Key}:={Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}"
                : $"{Key}+={Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
    }

    /// <summary>
    /// Compact planner world state: string-keyed integer facts.
    /// Hashing is canonical (sorted keys) so identical states collide identically.
    /// </summary>
    public sealed class PlannerWorldState
    {
        private readonly Dictionary<string, int> _facts;

        public PlannerWorldState()
        {
            _facts = new Dictionary<string, int>(StringComparer.Ordinal);
        }

        private PlannerWorldState(Dictionary<string, int> facts)
        {
            _facts = facts;
        }

        public PlannerWorldState Clone() => new PlannerWorldState(new Dictionary<string, int>(_facts, StringComparer.Ordinal));

        public int Get(string key) => _facts.TryGetValue(key, out var v) ? v : 0;

        public void Set(string key, int value) => _facts[key] = value;

        public bool IsTrue(string key) => Get(key) > 0;

        public bool SatisfiesAll(IReadOnlyList<FactCondition> conditions)
        {
            for (int i = 0; i < conditions.Count; i++)
                if (!conditions[i].IsSatisfiedBy(this)) return false;
            return true;
        }

        /// <summary>FNV-1a hash over canonically sorted facts.</summary>
        public string ComputeHash()
        {
            const ulong offset = 14695981039346656037UL;
            const ulong prime = 1099511628211UL;
            ulong hash = offset;

            foreach (var key in SortedKeys())
            {
                unchecked
                {
                    foreach (char c in key) { hash ^= c; hash *= prime; }
                    hash ^= (byte)'=';
                    hash *= prime;
                    foreach (char c in _facts[key].ToString(System.Globalization.CultureInfo.InvariantCulture))
                    {
                        hash ^= c;
                        hash *= prime;
                    }
                    hash ^= (byte)';';
                    hash *= prime;
                }
            }
            return hash.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        private List<string> SortedKeys() => _facts.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();

        public override string ToString()
        {
            var parts = SortedKeys().Select(k => k + "=" + _facts[k].ToString(System.Globalization.CultureInfo.InvariantCulture));
            return "{" + string.Join(", ", parts) + "}";
        }
    }
}
