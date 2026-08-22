using System;
using System.Collections.Generic;
using System.Linq;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Plan executor lifecycle (spec §3.6).</summary>
    public enum PlanLifecycle
    {
        Created,
        Starting,
        Running,
        Succeeded,
        Failed,
        Cancelled
    }

    /// <summary>Structured action failure taxonomy (spec §3.7).</summary>
    public enum ActionFailureType
    {
        PathUnavailable,
        TargetUnavailable,
        LocationClosed,
        ResourceUnavailable,
        ReservationDenied,
        Interrupted,
        Timeout,
        InsufficientMoney
    }

    public readonly struct PlanStartedEvent : ISimulationEvent
    {
        public AgentId Agent { get; }
        public GoalId Goal { get; }
        public int StepCount { get; }
        public float TotalCost { get; }
        public SimTime AtTime { get; }

        public PlanStartedEvent(AgentId agent, GoalId goal, int stepCount, float totalCost, SimTime atTime)
        {
            Agent = agent; Goal = goal; StepCount = stepCount; TotalCost = totalCost; AtTime = atTime;
        }
    }

    public readonly struct PlanStepCompletedEvent : ISimulationEvent
    {
        public AgentId Agent { get; }
        public ActionId Action { get; }
        public int StepIndex { get; }
        public SimTime AtTime { get; }

        public PlanStepCompletedEvent(AgentId agent, ActionId action, int stepIndex, SimTime atTime)
        {
            Agent = agent; Action = action; StepIndex = stepIndex; AtTime = atTime;
        }
    }

    public readonly struct PlanFinishedEvent : ISimulationEvent
    {
        public AgentId Agent { get; }
        public GoalId Goal { get; }
        public PlanLifecycle Outcome { get; }
        public string Reason { get; }
        public SimTime AtTime { get; }

        public PlanFinishedEvent(AgentId agent, GoalId goal, PlanLifecycle outcome, string reason, SimTime atTime)
        {
            Agent = agent; Goal = goal; Outcome = outcome; Reason = reason; AtTime = atTime;
        }
    }

    /// <summary>
    /// Test/diagnostic hook: intercept a step before it starts and optionally fail it.
    /// </summary>
    public interface IPlanIntervention
    {
        ActionFailureType? Intercept(AgentId agent, PlanningAction nextAction);
    }

    /// <summary>A plan currently executing for one resident.</summary>
    public sealed class ActiveExecution
    {
        public AgentId Agent { get; internal set; }
        public GoalId Goal { get; internal set; }
        public GoapPlan Plan { get; internal set; } = null!;
        public int NextStepIndex { get; internal set; }
        public PlanLifecycle Lifecycle { get; internal set; }
        public ActionFailureType? LastFailure { get; internal set; }
        public SimTime StartedAt { get; internal set; }
        /// <summary>Incremented whenever a run is replaced/cancelled/failed; stale callbacks no-op.</summary>
        public long Generation { get; internal set; }
        /// <summary>Absolute due time of the in-flight step (save/load + diagnostics).</summary>
        public long CurrentStepDueMinutes { get; internal set; }
    }

    /// <summary>
    /// Orchestrates decide → plan → execute for every resident, with critical
    /// interruption, structured failures and bounded replanning (spec §3.8).
    /// Execution consumes simulated minutes via the scheduler, so needs keep
    /// evolving while plans run.
    /// </summary>
    public sealed class PlanningDirector
    {
        private readonly SimulationWorld _world;
        private readonly CognitionSystem _cognition;
        private readonly GoapPlanner _planner;
        private readonly TownRoles _roles;
        private readonly Dictionary<AgentId, ActiveExecution> _active = new Dictionary<AgentId, ActiveExecution>();
        private readonly Dictionary<AgentId, long> _generation = new Dictionary<AgentId, long>();

        public IPlanIntervention? Intervention { get; set; }
        /// <summary>Backoff applied to a goal after a planning failure (spec §3.8: replan, not spam).</summary>
        public int PlanningFailureBackoffMinutes { get; set; } = 90;

        // Metrics (spec §3.9).
        public long TotalPlansCreated { get; private set; }
        public long TotalPlansSucceeded { get; private set; }
        public long TotalPlansFailed { get; private set; }
        public long TotalReplans { get; private set; }
        public long TotalStepsExecuted { get; private set; }
        public int NodesExpandedLastPlan { get; private set; }

        public PlanningDirector(SimulationWorld world, CognitionSystem cognition,
            GoapPlanner? planner = null, TownRoles? roles = null,
            OpeningHoursSystem? hours = null, JobSystem? jobs = null,
            EconomySystem? economy = null)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _cognition = cognition ?? throw new ArgumentNullException(nameof(cognition));
            _planner = planner ?? new GoapPlanner();
            _roles = roles ?? TownRoles.DetectByConvention(_world);
            _hours = hours;
            _jobs = jobs;
            _economy = economy;
        }

        private readonly OpeningHoursSystem? _hours;
        private readonly JobSystem? _jobs;
        private readonly EconomySystem? _economy;

        public bool IsBusy(AgentId agent) => _active.ContainsKey(agent);
        public ActiveExecution? PeekActive(AgentId agent) => _active.TryGetValue(agent, out var run) ? run : null;

        /// <summary>Runs one decision cycle for every resident (staggering arrives in Sprint 27).</summary>
        public void TickAll()
        {
            var ids = new List<AgentId>(_world.Residents.OrderedIds);
            for (int i = 0; i < ids.Count; i++) Tick(ids[i]);
        }

        public void Tick(AgentId agent)
        {
            if (_active.TryGetValue(agent, out var running))
            {
                if (!ShouldInterrupt(running)) return;
                CancelRun(agent, "critical-interruption");
                TotalReplans++;
            }

            StartFreshCycle(agent);
        }

        private bool ShouldInterrupt(ActiveExecution running)
        {
            var mind = _world.Residents.Get(running.Agent);
            var interrupting = mind.Needs.FindInterrupting();
            if (interrupting == null) return false;

            var goalDef = _cognition.FindGoal(running.Goal);
            if (goalDef == null) return true;
            foreach (var kind in goalDef.ReliefNeeds)
                if (kind == interrupting.Definition.Kind) return false; // current goal already fixes it
            return true;
        }

        private void StartFreshCycle(AgentId agent)
        {
            var mind = _world.Residents.Get(agent);
            var now = _world.Clock.CurrentTime;

            var decision = _cognition.Decide(agent);
            var goalDef = _cognition.FindGoal(decision.Effective.Goal)
                ?? throw new InvalidOperationException($"Selected goal '{decision.Effective.Goal}' has no definition.");

            // Utility-only goals (no planner binding) complete trivially.
            if (goalDef.DesiredFacts == null || goalDef.DesiredFacts.Count == 0)
            {
                _world.Events.Publish(new PlanStartedEvent(agent, goalDef.Id, 0, 0f, now));
                _world.Events.Publish(new PlanFinishedEvent(agent, goalDef.Id, PlanLifecycle.Succeeded, "utility-goal", now));
                TotalPlansCreated++;
                TotalPlansSucceeded++;
                return;
            }

            var agentState = _world.Agents.Get(agent);
            var actions = StandardActions.CreateForResident(_world, agentState, _roles, mind.Job);
            var start = new PlannerStateBuilder(_world, _roles, _hours, _jobs).Build(agentState, mind);
            var result = _planner.Plan(start, goalDef.DesiredFacts, actions, new ActionCostContext(_world, agent));

            NodesExpandedLastPlan = result.Metrics.NodesExpanded;
            TotalPlansCreated++;

            if (!result.Success || result.Plan == null)
            {
                TotalPlansFailed++;
                _cognition.SuppressGoal(agent, goalDef.Id,
                    now.Add(SimDuration.FromMinutes(PlanningFailureBackoffMinutes)));
                _world.Events.Publish(new PlanStartedEvent(agent, goalDef.Id, 0, 0f, now));
                _world.Events.Publish(new PlanFinishedEvent(agent, goalDef.Id, PlanLifecycle.Failed,
                    "planning:" + result.Metrics.FailureReason, now));
                return; // wait for the next tick to try again
            }

            if (result.Plan.Steps.Count == 0)
            {
                // The world already satisfies the goal (e.g., GoHome while home).
                // An empty plan is a no-op success, never an executable run.
                TotalPlansSucceeded++;
                _world.Events.Publish(new PlanStartedEvent(agent, goalDef.Id, 0, 0f, now));
                _world.Events.Publish(new PlanFinishedEvent(agent, goalDef.Id, PlanLifecycle.Succeeded,
                    "already-satisfied", now));
                return;
            }

            var run = new ActiveExecution
            {
                Agent = agent,
                Goal = goalDef.Id,
                Plan = result.Plan,
                NextStepIndex = 0,
                Lifecycle = PlanLifecycle.Starting,
                StartedAt = now,
                Generation = NextGeneration(agent)
            };
            _active[agent] = run;

            _world.Events.Publish(new PlanStartedEvent(agent, goalDef.Id, result.Plan.Steps.Count, result.Plan.TotalCost, now));
            ExecuteNextStep(agent);
        }

        private long NextGeneration(AgentId agent)
        {
            long gen = (_generation.TryGetValue(agent, out var g) ? g : 0) + 1;
            _generation[agent] = gen;
            return gen;
        }

        private void ExecuteNextStep(AgentId agent)
        {
            if (!_active.TryGetValue(agent, out var run))
                return; // cancelled while a completion was pending

            var action = run.Plan.Steps[run.NextStepIndex];

            var intercepted = Intervention?.Intercept(agent, action);
            if (intercepted.HasValue)
            {
                FailStep(agent, intercepted.Value, "intervention");
                return;
            }

            // Critical check between steps: cancel and yield. The next external
            // Tick decides afresh — never replan synchronously, or the loop could
            // spin without simulated time advancing.
            if (action.Interruptible && ShouldInterrupt(run))
            {
                CancelRun(agent, "critical-interruption-between-steps");
                TotalReplans++;
                return;
            }

            // Movement: real travel through the navigation service when the target
            // differs; step completion arrives with arrival (spec §4.2/§4.3).
            if (action.IsMovement && action.RequiredLocation.HasValue)
            {
                var dest = action.RequiredLocation.Value;
                var agentState = _world.Agents.Get(agent);
                if (!agentState.HasLocation || agentState.CurrentLocationId != dest)
                {
                    long gen = run.Generation;
                    int idx = run.NextStepIndex;
                    var request = _world.Navigation.BeginMove(agent, dest, arrival =>
                    {
                        if (arrival.Success)
                            CompleteStepIfCurrent(agent, gen, idx);
                        else
                            FailStep(agent, MapNavigationFailure(arrival.Failure), arrival.Failure.ToString());
                    });
                    if (!request.Accepted)
                    {
                        FailStep(agent, ActionFailureType.PathUnavailable, "navigation rejected");
                        return;
                    }
                    run.Lifecycle = PlanLifecycle.Running;
                    return;
                }
                // Already at destination: fall through to instant completion below.
            }
            else if (action.RequiredLocation.HasValue)
            {
                // Non-movement on-site action: the planner guarantees presence.
                var target = action.RequiredLocation.Value;
                var runtimeState = _world.Locations.Get(target);
                if (!runtimeState.IsOpen)
                {
                    FailStep(agent, ActionFailureType.LocationClosed, target.Value + " closed");
                    return;
                }
                var agentState = _world.Agents.Get(agent);
                if (!agentState.HasLocation || agentState.CurrentLocationId != target)
                {
                    FailStep(agent, ActionFailureType.TargetUnavailable,
                        "not at required location " + target.Value);
                    return;
                }
            }

            // Seat reservation for cafe consumption steps (spec §4.7 / §3.7).
            if (_roles.Cafe.HasValue && action.RequiredLocation == _roles.Cafe &&
                (action.Id.Value == "act_buy_meal" || action.Id.Value == "act_eat"))
            {
                var seat = new ResourceId("seat:" + _roles.Cafe.Value.Value);
                int hold = Math.Max(action.DurationMinutes, 1) + 15;
                var until = _world.Clock.CurrentTime.Add(SimDuration.FromMinutes(hold));
                if (!_world.Reservations.Reserve(seat, agent, until))
                {
                    FailStep(agent, ActionFailureType.ReservationDenied, "no free seat at " + _roles.Cafe.Value.Value);
                    return;
                }
                _heldSeats[agent] = seat;
            }

            // Real purchases (Sprint 15): money and stock gate the buy steps.
            if (_economy != null && (action.Id.Value == "act_buy_meal" || action.Id.Value == "act_buy_ingredients"))
            {
                string itemName = action.Id.Value == "act_buy_meal" ? "meal" : "ingredients";
                var failure = _economy.TryPurchase(agent, new ItemId(itemName), out _);
                if (failure != PurchaseFailure.None)
                    FailStep(agent,
                        failure == PurchaseFailure.InsufficientMoney
                            ? ActionFailureType.InsufficientMoney
                            : ActionFailureType.ResourceUnavailable,
                        failure.ToString());
                return;
            }

            run.Lifecycle = PlanLifecycle.Running;

            if (action.DurationMinutes <= 0)
            {
                CompleteStep(agent);
                return;
            }

            long generation = run.Generation;
            int stepIndex = run.NextStepIndex;
            run.CurrentStepDueMinutes =
                _world.Clock.CurrentTime.TotalMinutes + action.DurationMinutes;
            _world.Scheduler.ScheduleIn(SimDuration.FromMinutes(action.DurationMinutes),
                _ => CompleteStepIfCurrent(agent, generation, stepIndex),
                label: agent.Value + ":" + action.Id.Value);
        }

        /// <summary>Save-load export: every run still executing.</summary>
        public IReadOnlyList<ActiveExecution> ActiveRunsSnapshot()
        {
            var list = new List<ActiveExecution>();
            foreach (var kv in _active)
                if (kv.Value.Lifecycle == PlanLifecycle.Running ||
                    kv.Value.Lifecycle == PlanLifecycle.Starting)
                    list.Add(kv.Value);
            return list;
        }

        /// <summary>
        /// Save-load import: resurrects an executing plan (matched against the
        /// resident's current action catalog) and re-arms its remaining step time.
        /// </summary>
        public void RestoreRun(AgentId agent, string goalId,
            IReadOnlyList<string> stepActionIds, int nextStepIndex, int remainingMinutes)
        {
            var agentState = _world.Agents.Get(agent);
            var mind = _world.Residents.Get(agent);
            var catalog = StandardActions.CreateForResident(_world, agentState, _roles, mind.Job);

            var steps = new List<PlanningAction>();
            foreach (var id in stepActionIds)
                steps.Add(catalog.First(a => a.Id.Value == id)); // loud failure on catalog drift

            var run = new ActiveExecution
            {
                Agent = agent,
                Goal = new GoalId(goalId),
                Plan = new GoapPlan(steps, 0f),
                NextStepIndex = nextStepIndex,
                Lifecycle = PlanLifecycle.Running,
                StartedAt = _world.Clock.CurrentTime,
                Generation = NextGeneration(agent),
                CurrentStepDueMinutes = _world.Clock.CurrentTime.TotalMinutes + remainingMinutes
            };
            _active[agent] = run;

            long generation = run.Generation;
            int stepIndex = run.NextStepIndex;
            if (remainingMinutes <= 0)
                CompleteStepIfCurrent(agent, generation, stepIndex);
            else
                _world.Scheduler.ScheduleIn(SimDuration.FromMinutes(remainingMinutes),
                    _ => CompleteStepIfCurrent(agent, generation, stepIndex),
                    label: "restore:" + agent.Value);
        }

        private readonly Dictionary<AgentId, ResourceId> _heldSeats = new Dictionary<AgentId, ResourceId>();

        private static ActionFailureType MapNavigationFailure(NavigationFailure failure) => failure switch
        {
            NavigationFailure.DestinationBlocked => ActionFailureType.LocationClosed,
            NavigationFailure.TargetDestroyed => ActionFailureType.TargetUnavailable,
            NavigationFailure.NoProgress => ActionFailureType.Timeout,
            _ => ActionFailureType.PathUnavailable
        };

        /// <summary>
        /// Scheduled completions are stamped with the run's generation and step index;
        /// anything stale (plan cancelled/replaced meanwhile) is discarded instead of
        /// consuming a step of an unrelated newer plan.
        /// </summary>
        private void CompleteStepIfCurrent(AgentId agent, long generation, int stepIndex)
        {
            if (!_active.TryGetValue(agent, out var run)) return;
            if (run.Generation != generation || run.NextStepIndex != stepIndex) return;
            CompleteStep(agent);
        }

        private void CompleteStep(AgentId agent)
        {
            if (!_active.TryGetValue(agent, out var run)) return;

            var action = run.Plan.Steps[run.NextStepIndex];
            var mind = _world.Residents.Get(agent);

            for (int i = 0; i < action.Relief.Count; i++)
                mind.Needs.Relieve(action.Relief[i].Kind, action.Relief[i].Amount);

            // Wages for completed work (Sprint 15).
            if (_economy != null && action.Id.Value == "act_work")
                _economy.PayWage(agent, action.DurationMinutes / 60.0);

            // Persist non-ephemeral, non-location facts into resident memory.
            var ephemeral = new HashSet<string>(StandardActions.EphemeralSet(), StringComparer.Ordinal);
            for (int i = 0; i < action.Effects.Count; i++)
            {
                var effect = action.Effects[i];
                if (effect.Key.StartsWith("at_", StringComparison.Ordinal)) continue;
                if (ephemeral.Contains(effect.Key)) continue;
                mind.PlannerMemory[effect.Key] =
                    effect.Mode == FactEffectMode.Assign ? effect.Value : mind.PlannerMemory.TryGetValue(effect.Key, out var cur) ? cur + effect.Value : effect.Value;
            }

            TotalStepsExecuted++;
            run.NextStepIndex++;
            _world.Events.Publish(new PlanStepCompletedEvent(agent, action.Id, run.NextStepIndex - 1, _world.Clock.CurrentTime));

            if (run.NextStepIndex >= run.Plan.Steps.Count)
            {
                run.Lifecycle = PlanLifecycle.Succeeded;
                TotalPlansSucceeded++;
                FinishRun(agent, run.Goal, PlanLifecycle.Succeeded, "plan-complete");
                return;
            }

            ExecuteNextStep(agent);
        }

        private void FailStep(AgentId agent, ActionFailureType failureType, string detail)
        {
            TotalPlansFailed++;
            if (_active.TryGetValue(agent, out var run))
            {
                run.Lifecycle = PlanLifecycle.Failed;
                run.LastFailure = failureType;
                FinishRun(agent, run.Goal, PlanLifecycle.Failed, failureType + ": " + detail);
            }

            // Retry policy: yield here; the next external Tick starts a fresh
            // decision cycle. Bounded by the host loop, not by recursion.
            TotalReplans++;
        }

        private static ActionFailureType Classify(InvalidOperationException ex)
        {
            string message = ex.Message ?? string.Empty;
            if (message.Contains("closed", StringComparison.Ordinal)) return ActionFailureType.LocationClosed;
            if (message.Contains("capacity", StringComparison.Ordinal)) return ActionFailureType.TargetUnavailable;
            return ActionFailureType.PathUnavailable;
        }

        private void CancelRun(AgentId agent, string reason)
        {
            if (_active.TryGetValue(agent, out var run))
            {
                run.Lifecycle = PlanLifecycle.Cancelled;
                FinishRun(agent, run.Goal, PlanLifecycle.Cancelled, reason);
            }
        }

        private void FinishRun(AgentId agent, GoalId goal, PlanLifecycle outcome, string reason)
        {
            if (_active.ContainsKey(agent)) _active.Remove(agent);
            ReleaseHeldSeat(agent);
            // Invalidate any callbacks still pending for this run.
            NextGeneration(agent);
            _world.Events.Publish(new PlanFinishedEvent(agent, goal, outcome, reason, _world.Clock.CurrentTime));
        }

        private void ReleaseHeldSeat(AgentId agent)
        {
            if (_heldSeats.TryGetValue(agent, out var seat))
            {
                _heldSeats.Remove(agent);
                _world.Reservations.Release(seat, agent);
            }
        }
    }
}
