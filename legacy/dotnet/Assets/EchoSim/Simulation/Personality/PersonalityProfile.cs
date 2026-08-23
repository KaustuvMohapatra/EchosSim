using System;
using System.Collections.Generic;

namespace EchoSim.Simulation
{
    /// <summary>The fourteen personality parameters (all normalized 0..1).</summary>
    public enum PersonalityTrait
    {
        Openness = 0,
        Conscientiousness = 1,
        Extraversion = 2,
        Agreeableness = 3,
        EmotionalVolatility = 4,
        Curiosity = 5,
        Patience = 6,
        Sociability = 7,
        RiskTolerance = 8,
        Generosity = 9,
        Honesty = 10,
        Ambition = 11,
        GrudgeRetention = 12,
        RoutinePreference = 13
    }

    /// <summary>
    /// Immutable personality profile. Values are authored per resident and never
    /// mutated at runtime; behaviour variation must come from scoring, not edits.
    /// </summary>
    public sealed class PersonalityProfile
    {
        public const int TraitCount = 14;
        private readonly float[] _values;

        private PersonalityProfile(float[] values) { _values = values; }

        public float Get(PersonalityTrait trait)
        {
            int i = (int)trait;
            if ((uint)i >= TraitCount) throw new ArgumentOutOfRangeException(nameof(trait));
            return _values[i];
        }

        public bool TryGet(PersonalityTrait trait, out float value)
        {
            if ((uint)(int)trait >= TraitCount) { value = 0f; return false; }
            value = _values[(int)trait];
            return true;
        }

        public static PersonalityProfile Uniform(float value)
        {
            Validate(value, nameof(value));
            var v = new float[TraitCount];
            for (int i = 0; i < TraitCount; i++) v[i] = value;
            return new PersonalityProfile(v);
        }

        public static PersonalityProfile Balanced() => Uniform(0.5f);

        public Builder Edit() => new Builder(_values);

        public sealed class Builder
        {
            private readonly float[] _values;

            internal Builder(float[] source)
            {
                _values = (float[])source.Clone();
            }

            public Builder Set(PersonalityTrait trait, float value)
            {
                Validate(value, nameof(value));
                _values[(int)trait] = value;
                return this;
            }

            public PersonalityProfile Build()
            {
                var copy = (float[])_values.Clone();
                foreach (var v in copy) Validate(v, "trait");
                return new PersonalityProfile(copy);
            }
        }

        private static void Validate(float value, string param)
        {
            if (float.IsNaN(value) || value < 0f || value > 1f)
                throw new ArgumentOutOfRangeException(param, "Personality traits must be within [0,1].");
        }

        public IReadOnlyList<(PersonalityTrait Trait, float Value)> Describe()
        {
            var list = new List<(PersonalityTrait, float)>(TraitCount);
            for (int i = 0; i < TraitCount; i++)
                list.Add(((PersonalityTrait)i, _values[i]));
            return list;
        }

        /// <summary>Mira fixture personality (master spec Sprint 14 starting values).</summary>
        public static PersonalityProfile MiraLike() => new Builder(new float[TraitCount])
            .Set(PersonalityTrait.Openness, 0.89f)
            .Set(PersonalityTrait.Conscientiousness, 0.71f)
            .Set(PersonalityTrait.Extraversion, 0.62f)
            .Set(PersonalityTrait.Agreeableness, 0.68f)
            .Set(PersonalityTrait.EmotionalVolatility, 0.48f)
            .Set(PersonalityTrait.Curiosity, 0.90f)
            .Set(PersonalityTrait.Patience, 0.55f)
            .Set(PersonalityTrait.Sociability, 0.67f)
            .Set(PersonalityTrait.RiskTolerance, 0.49f)
            .Set(PersonalityTrait.Generosity, 0.78f)
            .Set(PersonalityTrait.Honesty, 0.75f)
            .Set(PersonalityTrait.Ambition, 0.78f)
            .Set(PersonalityTrait.GrudgeRetention, 0.68f)
            .Set(PersonalityTrait.RoutinePreference, 0.43f)
            .Build();
    }
}
