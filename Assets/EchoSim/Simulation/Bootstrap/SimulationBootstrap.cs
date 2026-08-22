using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Configuration for a new simulation run. The seed is the single source of randomness.</summary>
    public sealed class SimulationConfiguration
    {
        public ulong Seed { get; }
        public SimTime StartTime { get; }
        public ISimLog Log { get; }

        public SimulationConfiguration(ulong seed, SimTime? startTime = null, ISimLog? log = null)
        {
            Seed = seed;
            StartTime = startTime ?? SimTime.Epoch;
            Log = log ?? NullSimLog.Instance;
        }
    }

    /// <summary>
    /// Composition root: creates every service in a fixed order so construction
    /// itself is deterministic. Headless (no Unity) — used by tests, tools and CI,
    /// and later hosted by the Unity bootstrap scene.
    /// </summary>
    public static class SimulationBootstrap
    {
        public static SimulationWorld CreateWorld(SimulationConfiguration configuration)
        {
            if (configuration == null) throw new ArgumentNullException(nameof(configuration));

            var clock = new SimulationClock();
            if (configuration.StartTime != SimTime.Epoch)
                clock.AdvanceTo(configuration.StartTime);

            var randoms = new SimRandomProvider(configuration.Seed);
            var events = new EventBus();
            var scheduler = new SimulationScheduler(clock);

            return new SimulationWorld(clock, randoms, events, scheduler);
        }
    }

    /// <summary>
    /// Drives a world forward in fixed steps so scheduled operations execute with
    /// bounded lateness. Purely deterministic given identical calls.
    /// </summary>
    public static class HeadlessSimulationRunner
    {
        public const long DefaultStepMinutes = 10;

        public static void RunFor(SimulationWorld world, SimDuration duration, long stepMinutes = DefaultStepMinutes)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));
            if (stepMinutes <= 0) throw new ArgumentOutOfRangeException(nameof(stepMinutes));
            long remaining = duration.TotalMinutes;
            while (remaining > 0)
            {
                long step = remaining < stepMinutes ? remaining : stepMinutes;
                world.Clock.Advance(SimDuration.FromMinutes(step));
                remaining -= step;
            }
        }

        public static void RunUntil(SimulationWorld world, SimTime target, long stepMinutes = DefaultStepMinutes)
        {
            var now = world.Clock.CurrentTime;
            if (target <= now) return;
            RunFor(world, target - now, stepMinutes);
        }
    }
}
