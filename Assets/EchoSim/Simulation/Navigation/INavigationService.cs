using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    public enum NavigationPathStatus
    {
        Idle,
        EnRoute,
        Arrived,
        Failed
    }

    public enum NavigationFailure
    {
        None,
        NoPath,
        DestinationBlocked,
        TargetDestroyed,
        Superseded,
        NoProgress
    }

    /// <summary>Live navigation state for one agent (spec §4.3).</summary>
    public sealed class NavigationState
    {
        public AgentId Agent { get; internal set; }
        public LocationId? Destination { get; internal set; }
        public NavigationPathStatus Status { get; internal set; }
        public NavigationFailure Failure { get; internal set; }
        /// <summary>Remaining simulated minutes under the authored travel table.</summary>
        public int RemainingMinutes { get; internal set; }
        public SimTime? ExpectedArrival { get; internal set; }
        /// <summary>Simulated minutes spent without progress (stuck detection input).</summary>
        public int StuckMinutes { get; internal set; }
    }

    public readonly struct NavigationRequestResult
    {
        public bool Accepted { get; }
        public NavigationFailure Failure { get; }

        private NavigationRequestResult(bool accepted, NavigationFailure failure)
        {
            Accepted = accepted;
            Failure = failure;
        }

        public static NavigationRequestResult Ok() => new NavigationRequestResult(true, NavigationFailure.None);
        public static NavigationRequestResult Rejected(NavigationFailure failure) => new NavigationRequestResult(false, failure);
    }

    public readonly struct NavigationArrival
    {
        public AgentId Agent { get; }
        public LocationId Destination { get; }
        public bool Success { get; }
        public NavigationFailure Failure { get; }

        private NavigationArrival(AgentId agent, LocationId destination, bool success, NavigationFailure failure)
        {
            Agent = agent;
            Destination = destination;
            Success = success;
            Failure = failure;
        }

        internal static NavigationArrival Arrived(AgentId a, LocationId d) => new NavigationArrival(a, d, true, NavigationFailure.None);
        internal static NavigationArrival Failed(AgentId a, LocationId d, NavigationFailure f) => new NavigationArrival(a, d, false, f);
    }

    /// <summary>
    /// Bridge between semantic movement and physical execution. Sprint 4 ships the
    /// timed headless implementation; the Unity NavMesh adapter will implement the
    /// same contract in a later sprint without touching planning or execution.
    /// </summary>
    public interface INavigationService
    {
        /// <summary>Starts (or replaces) an en-route move. Arrival is reported via callback.</summary>
        NavigationRequestResult BeginMove(AgentId agent, LocationId destination, Action<NavigationArrival> onArrive);

        /// <summary>Cancels any active move for the agent.</summary>
        bool Cancel(AgentId agent, NavigationFailure reason = NavigationFailure.Superseded);

        NavigationState GetState(AgentId agent);
    }
}
