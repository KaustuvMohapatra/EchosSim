using System;
using System.Collections.Generic;

namespace EchoSim.Core
{
    /// <summary>
    /// Deterministic random source. Implementations must be platform independent:
    /// identical call sequences with identical seeds produce identical results
    /// on every runtime, so simulations are reproducible.
    /// </summary>
    public interface ISimRandom
    {
        ulong NextUInt64();
        double NextDouble();
        int NextInt(int minInclusive, int maxExclusive);
        bool Chance(double probability);
        T Pick<T>(IReadOnlyList<T> items);
        void Shuffle<T>(IList<T> items);
    }

    /// <summary>
    /// SplitMix64 based generator: tiny, fast, fully specified bit-for-bit across platforms.
    /// </summary>
    public sealed class SeededRandom : ISimRandom
    {
        private const double DoubleScale = 1.0 / 9007199254740992.0; // 2^53

        private ulong _state;

        public SeededRandom(ulong seed)
        {
            _state = seed;
        }

        public static ulong Mix(ulong value)
        {
            ulong z = value;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            return z ^ (z >> 31);
        }

        public ulong NextUInt64()
        {
            _state += 0x9E3779B97F4A7C15UL;
            return Mix(_state);
        }

        public double NextDouble() => (NextUInt64() >> 11) * DoubleScale;

        public int NextInt(int minInclusive, int maxExclusive)
        {
            if (maxExclusive <= minInclusive)
                throw new ArgumentOutOfRangeException(nameof(maxExclusive), "maxExclusive must be greater than minInclusive.");
            ulong range = (ulong)((long)maxExclusive - (long)minInclusive);
            if (range == 1) return minInclusive;
            ulong limit = ulong.MaxValue - (ulong.MaxValue % range); // rejection bound avoids modulo bias
            ulong value;
            do { value = NextUInt64(); } while (value >= limit);
            return (int)(minInclusive + (long)(value % range));
        }

        public bool Chance(double probability)
        {
            if (double.IsNaN(probability)) throw new ArgumentOutOfRangeException(nameof(probability));
            if (probability <= 0) return false;
            if (probability >= 1) return true;
            return NextDouble() < probability;
        }

        public T Pick<T>(IReadOnlyList<T> items)
        {
            if (items == null) throw new ArgumentNullException(nameof(items));
            if (items.Count == 0) throw new ArgumentException("Cannot pick from an empty collection.", nameof(items));
            return items[NextInt(0, items.Count)];
        }

        public void Shuffle<T>(IList<T> items)
        {
            if (items == null) throw new ArgumentNullException(nameof(items));
            for (int i = items.Count - 1; i > 0; i--)
            {
                int j = NextInt(0, i + 1);
                (items[i], items[j]) = (items[j], items[i]);
            }
        }
    }

    /// <summary>Canonical stream names used by the simulation.</summary>
    public static class RandomStreams
    {
        public const string World = "world";
        public const string Agents = "agents";
        public const string Events = "events";
        public const string Social = "social";
        public const string Content = "content";
    }

    /// <summary>
    /// Derives independent, reproducible random streams from a master seed plus stream name.
    /// Each system draws from its own stream so adding a consumer never perturbs other systems' sequences.
    /// </summary>
    public sealed class SimRandomProvider
    {
        private readonly ulong _masterSeed;
        private readonly Dictionary<string, ISimRandom> _streams;

        public SimRandomProvider(ulong masterSeed)
        {
            _masterSeed = masterSeed;
            _streams = new Dictionary<string, ISimRandom>(StringComparer.Ordinal);
        }

        public ulong MasterSeed => _masterSeed;

        public ISimRandom GetStream(string streamName)
        {
            if (string.IsNullOrWhiteSpace(streamName))
                throw new ArgumentException("Stream name required.", nameof(streamName));
            if (_streams.TryGetValue(streamName, out var existing)) return existing;
            var created = CreateStream(_masterSeed, streamName);
            _streams.Add(streamName, created);
            return created;
        }

        public static ISimRandom CreateStream(ulong masterSeed, string streamName)
        {
            ulong nameHash = Fnv1a64(streamName);
            return new SeededRandom(SeededRandom.Mix(masterSeed ^ nameHash));
        }

        internal static ulong Fnv1a64(string text)
        {
            const ulong offset = 14695981039346656037UL;
            const ulong prime = 1099511628211UL;
            ulong hash = offset;
            for (int i = 0; i < text.Length; i++)
            {
                hash ^= text[i];
                hash *= prime;
            }
            return hash;
        }
    }
}
