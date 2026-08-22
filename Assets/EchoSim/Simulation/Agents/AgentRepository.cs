using System;
using System.Collections.Generic;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>
    /// Registry of agents. Iteration order is insertion order (deterministic).
    /// </summary>
    public sealed class AgentRepository
    {
        private readonly Dictionary<AgentId, AgentState> _agents = new Dictionary<AgentId, AgentState>();
        private readonly List<AgentId> _order = new List<AgentId>();

        public IReadOnlyList<AgentId> OrderedIds => _order;
        public int Count => _order.Count;

        public void Add(AgentState agent)
        {
            if (_agents.ContainsKey(agent.Identity.Id))
                throw new InvalidOperationException($"Duplicate agent id '{agent.Identity.Id}'.");
            _agents.Add(agent.Identity.Id, agent);
            _order.Add(agent.Identity.Id);
        }

        public bool TryGet(AgentId id, out AgentState agent) => _agents.TryGetValue(id, out agent!);

        public AgentState Get(AgentId id)
        {
            if (!_agents.TryGetValue(id, out var agent))
                throw new KeyNotFoundException($"Unknown agent '{id}'.");
            return agent!;
        }
    }
}
