using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Temporary emotional state: valence -1..1 and arousal 0..1 (spec §8.1),
    /// decaying toward neutral. Emotion feeds goal scoring through the existing
    /// EmotionValence term in goal contexts.
    /// </summary>
    public sealed class EmotionSystem
    {
        private readonly SimulationWorld _world;
        private readonly Dictionary<AgentId, float> _arousal = new Dictionary<AgentId, float>();

        /// <summary>Simulated minutes for emotions to halve.</summary>
        public double HalfLifeMinutes { get; set; } = 240.0;

        public EmotionSystem(SimulationWorld world)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _world.Scheduler.ScheduleRepeating(SimDuration.FromMinutes(30), _ => Tick(SimDuration.FromMinutes(30)), "emotion-decay");
        }

        private float ValenceOf(AgentId agent) => _world.Residents.TryGet(agent, out var m) ? m.EmotionValence : 0f;
        private void SetValence(AgentId agent, float v) { if (_world.Residents.TryGet(agent, out var m)) m.SetEmotion(v); }

        public float ArousalOf(AgentId agent) => _arousal.TryGetValue(agent, out var a) ? a : 0f;

        public void Apply(AgentId agent, float valenceDelta, float arousalDelta)
        {
            if (!_world.Residents.TryGet(agent, out _)) return;
            float current = ValenceOf(agent);
            SetValence(agent, Math.Clamp(current + valenceDelta, -1f, 1f));
            float arousal = ArousalOf(agent);
            _arousal[agent] = Math.Clamp(arousal + arousalDelta, 0f, 1f);
        }

        /// <summary>Exponential decay toward emotional baseline (0/0).</summary>
        public void Tick(SimDuration delta)
        {
            if (_world.Residents.Count == 0) return;
            double factor = Math.Pow(0.5, delta.TotalMinutes / HalfLifeMinutes);
            var ids = new List<AgentId>(_world.Residents.OrderedIds);
            foreach (var id in ids)
            {
                float v = ValenceOf(id);
                if (MathF.Abs(v) > 0.001f) SetValence(id, (float)(v * factor));

                if (_arousal.TryGetValue(id, out float a))
                {
                    a = (float)(a * factor);
                    if (a < 0.001f) _arousal.Remove(id); else _arousal[id] = a;
                }
            }
        }
    }
}
