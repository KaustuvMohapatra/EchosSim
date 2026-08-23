using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Authored residents. Mira is a normal resident: her distinctiveness comes
    /// from authored personality values and preference data — never from special-
    /// case code paths (spec Sprint 14).
    /// </summary>
    public static class ContentFixtures
    {
        public const string MiraId = "npc_mira_18nov";

        public static ResidentSpec Mira() => new ResidentSpec(MiraId, "Mira")
        {
            HomeLocationId = "apartment_04",
            Personality = PersonalityProfile.MiraLike()
        };

        public static ResidentSpec Rohan() => new ResidentSpec("npc_rohan_baker", "Rohan")
        {
            HomeLocationId = "apartment_01",
            Personality = PersonalityProfile.Balanced().Edit()
                .Set(PersonalityTrait.Conscientiousness, 0.85f)
                .Set(PersonalityTrait.Patience, 0.70f)
                .Build()
        };
    }

    /// <summary>Authored like/dislike data used by weather, location scoring and gifts.</summary>
    public sealed class PreferenceProfile
    {
        private readonly Dictionary<string, float> _values;

        public PreferenceProfile(IDictionary<string, float>? values = null)
        {
            _values = new Dictionary<string, float>(values ?? (IDictionary<string, float>)new Dictionary<string, float>(), StringComparer.Ordinal);
        }

        /// <summary>Returns 0 when unspecified — preferences only shift, never dominate.</summary>
        public float Get(string key) => _values.TryGetValue(key, out var v) ? v : 0f;

        public IReadOnlyDictionary<string, float> Raw => _values;
    }
}
