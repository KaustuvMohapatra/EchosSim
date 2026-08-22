using System;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Normalized utility curves. Inputs are always clamped to [0,1];
    /// outputs are finite by construction (non-finite results throw).
    /// </summary>
    public abstract class UtilityCurve
    {
        public abstract float Evaluate(float input01);

        protected static float Clamp01(float v) => v < 0f ? 0f : (v > 1f ? 1f : v);

        protected static float Guard(float value, string curve)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
                throw new InvalidOperationException($"Utility curve '{curve}' produced a non-finite value.");
            return value;
        }
    }

    public sealed class LinearCurve : UtilityCurve
    {
        public override float Evaluate(float input01) => Guard(Clamp01(input01), "linear");
        public override string ToString() => "linear";
    }

    /// <summary>Accelerating urgency: x^exponent.</summary>
    public sealed class QuadraticCurve : UtilityCurve
    {
        private readonly float _exponent;
        public QuadraticCurve(float exponent = 2f)
        {
            if (exponent < 0.25f || exponent > 8f) throw new ArgumentOutOfRangeException(nameof(exponent));
            _exponent = exponent;
        }
        public override float Evaluate(float input01) => Guard(MathF.Pow(Clamp01(input01), _exponent), "quadratic");
        public override string ToString() => "quadratic^" + _exponent.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }

    /// <summary>S-curve: low urgency stays low until near the midpoint.</summary>
    public sealed class LogisticCurve : UtilityCurve
    {
        private readonly float _midpoint;
        private readonly float _steepness;

        public LogisticCurve(float midpoint = 0.6f, float steepness = 10f)
        {
            if (midpoint <= 0f || midpoint >= 1f) throw new ArgumentOutOfRangeException(nameof(midpoint));
            if (steepness < 1f || steepness > 30f) throw new ArgumentOutOfRangeException(nameof(steepness));
            _midpoint = midpoint;
            _steepness = steepness;
        }

        public override float Evaluate(float input01)
        {
            float x = Clamp01(input01);
            return Guard(1f / (1f + MathF.Exp(-_steepness * (x - _midpoint))), "logistic");
        }

        public override string ToString() => "logistic(" + _midpoint.ToString(System.Globalization.CultureInfo.InvariantCulture) + ")";
    }

    /// <summary>Inverted: high input lowers the term (e.g., fatigue penalties).</summary>
    public sealed class InverseCurve : UtilityCurve
    {
        public override float Evaluate(float input01) => Guard(1f - Clamp01(input01), "inverse");
        public override string ToString() => "inverse";
    }

    /// <summary>Smooth step: 0 below the edge, 1 above it.</summary>
    public sealed class ThresholdCurve : UtilityCurve
    {
        private readonly float _edge;
        private const float Softness = 0.05f;

        public ThresholdCurve(float edge)
        {
            if (edge < Softness || edge > 1f - Softness) throw new ArgumentOutOfRangeException(nameof(edge));
            _edge = edge;
        }

        public override float Evaluate(float input01)
        {
            float x = Clamp01(input01);
            float t = (x - (_edge - Softness)) / (2f * Softness);
            t = Clamp01(t);
            return Guard(t * t * (3f - 2f * t), "threshold"); // smoothstep
        }

        public override string ToString() => "threshold@" + _edge.ToString(System.Globalization.CultureInfo.InvariantCulture);
    }
}
