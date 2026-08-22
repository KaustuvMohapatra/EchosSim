using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Initial weather states (spec Sprint 16).</summary>
    public enum WeatherState
    {
        Clear = 0,
        Cloudy = 1,
        Rain = 2,
        HeavyRain = 3
    }

    public readonly struct WeatherChangedEvent : ISimulationEvent
    {
        public WeatherState From { get; }
        public WeatherState To { get; }
        public SimTime AtTime { get; }

        public WeatherChangedEvent(WeatherState from, WeatherState to, SimTime atTime)
        {
            From = from; To = to; AtTime = atTime;
        }
    }

    /// <summary>
    /// Seeded daily weather rolls (deterministic given the world seed).
    /// Weather is global pressure: goals read it through the goal context and
    /// residents' preferences decide how much they care.
    /// </summary>
    public sealed class WeatherSystem
    {
        private readonly SimulationWorld _world;
        private readonly ISimRandom _rng;

        public WeatherState Current { get; private set; }

        public WeatherSystem(SimulationWorld world, ISimRandom rng)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
            Current = WeatherState.Clear;

            _world.Scheduler.ScheduleRepeating(SimDuration.FromDays(1),
                _ => RollForNewDay(), "weather-roll");
        }

        /// <summary>Markov-style daily transition table; pure function of state + dice.</summary>
        private WeatherState NextState(WeatherState current)
        {
            double roll = _rng.NextDouble();
            switch (current)
            {
                case WeatherState.Clear:
                    return roll < 0.60 ? WeatherState.Clear : roll < 0.90 ? WeatherState.Cloudy : WeatherState.Rain;
                case WeatherState.Cloudy:
                    return roll < 0.40 ? WeatherState.Clear : roll < 0.75 ? WeatherState.Cloudy : roll < 0.95 ? WeatherState.Rain : WeatherState.HeavyRain;
                case WeatherState.Rain:
                    return roll < 0.25 ? WeatherState.Cloudy : roll < 0.70 ? WeatherState.Rain : WeatherState.HeavyRain;
                default: // HeavyRain
                    return roll < 0.40 ? WeatherState.Rain : roll < 0.80 ? WeatherState.Cloudy : WeatherState.HeavyRain;
            }
        }

        public void RollForNewDay() => Set(NextState(Current));

        public void Set(WeatherState state)
        {
            if (state == Current) return;
            var old = Current;
            Current = state;
            _world.Events.Publish(new WeatherChangedEvent(old, state, _world.Clock.CurrentTime));
        }

        public bool IsRaining => Current >= WeatherState.Rain;
    }
}
