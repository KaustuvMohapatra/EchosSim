using System;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    /// <summary>Simple logging abstraction so domain code never depends on Unity's Debug or Console.</summary>
    public interface ISimLog
    {
        void Info(string message);
        void Warn(string message);
        void Error(string message);
    }

    public sealed class NullSimLog : ISimLog
    {
        public static readonly NullSimLog Instance = new NullSimLog();
        private NullSimLog() { }
        public void Info(string message) { }
        public void Warn(string message) { }
        public void Error(string message) { }
    }

    public sealed class ConsoleSimLog : ISimLog
    {
        public static readonly ConsoleSimLog Instance = new ConsoleSimLog();
        private ConsoleSimLog() { }
        public void Info(string message) => Console.WriteLine(message);
        public void Warn(string message) => Console.WriteLine("[WARN] " + message);
        public void Error(string message) => Console.WriteLine("[ERROR] " + message);
    }
}
