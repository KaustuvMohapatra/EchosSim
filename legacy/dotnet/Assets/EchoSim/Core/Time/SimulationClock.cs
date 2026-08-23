using System;

namespace EchoSim.Core
{
    /// <summary>Named speed presets for the simulation clock.</summary>
    public static class SimulationSpeed
    {
        public const float Paused = 0f;
        public const float Half = 0.5f;
        public const float Normal = 1f;
        public const float Double = 2f;
        public const float Quadruple = 4f;
        public const float Octuple = 8f;
        public const float DebugSixteen = 16f;
    }

    /// <summary>
    /// Authoritative source of simulated time. Game systems must never read the wall clock.
    /// Headless simulation advances time deterministically through <see cref="Advance"/>.
    /// Real-time conversion (<see cref="ConvertRealSeconds"/>) exists for frame driven hosts.
    /// </summary>
    public sealed class SimulationClock
    {
        private SimTime _currentTime = SimTime.Epoch;
        private bool _paused;
        private float _scale = SimulationSpeed.Normal;

        /// <summary>Raised once after each successful advance, with the new time.</summary>
        public event Action<SimTime>? TimeAdvanced;
        public event Action<bool>? PauseStateChanged;
        public event Action<float>? ScaleChanged;

        public SimTime CurrentTime => _currentTime;
        public bool IsPaused => _paused;
        public float Scale => _scale;

        /// <summary>Advances simulated time by an exact duration (deterministic path).</summary>
        public void Advance(SimDuration delta)
        {
            if (_paused && delta.TotalMinutes > 0)
                throw new InvalidOperationException("Cannot advance a paused clock. Resume first.");
            if (delta.TotalMinutes == 0) return;
            _currentTime = _currentTime.Add(delta);
            TimeAdvanced?.Invoke(_currentTime);
        }

        /// <summary>Moves time forward to an explicit instant; backwards motion is rejected.</summary>
        public void AdvanceTo(SimTime target)
        {
            if (target < _currentTime)
                throw new ArgumentOutOfRangeException(nameof(target), "Simulation time cannot move backwards.");
            if (_paused && target != _currentTime)
                throw new InvalidOperationException("Cannot advance a paused clock. Resume first.");
            if (target == _currentTime) return;
            _currentTime = target;
            TimeAdvanced?.Invoke(_currentTime);
        }

        public void Pause()
        {
            if (_paused) return;
            _paused = true;
            PauseStateChanged?.Invoke(true);
        }

        public void Resume()
        {
            if (!_paused) return;
            _paused = false;
            PauseStateChanged?.Invoke(false);
        }

        /// <param name="scale">Non-negative finite multiplier of real seconds into simulated minutes.</param>
        public void SetScale(float scale)
        {
            if (float.IsNaN(scale) || float.IsInfinity(scale))
                throw new ArgumentOutOfRangeException(nameof(scale), "Scale must be finite.");
            if (scale < 0f)
                throw new ArgumentOutOfRangeException(nameof(scale), "Scale cannot be negative.");
            if (scale.Equals(_scale)) return;
            _scale = scale;
            ScaleChanged?.Invoke(scale);
        }

        /// <summary>
        /// Converts a span of host real time into simulated minutes under the current
        /// scale (0 while paused). Frame driven hosts feed this into <see cref="Advance"/>.
        /// Rounding is floor-to-minute so partial minutes never accumulate nondeterministically.
        /// </summary>
        public SimDuration ConvertRealSeconds(double realSeconds)
        {
            if (_paused) return SimDuration.FromMinutes(0);
            if (double.IsNaN(realSeconds) || double.IsInfinity(realSeconds) || realSeconds <= 0)
                return SimDuration.FromMinutes(0);
            double simMinutes = realSeconds * _scale;
            long wholeMinutes = (long)Math.Floor(simMinutes);
            return SimDuration.FromMinutes(wholeMinutes);
        }
    }
}
