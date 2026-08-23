using System;
using System.Collections.Generic;
using EchoSim.Core;

class Program
{
    static void Main()
    {
        var rng = new SeededRandom(1234UL);
        Console.WriteLine("U64:");
        for (int i = 0; i < 5; i++) Console.WriteLine(rng.NextUInt64());
        Console.WriteLine("Dbl:");
        for (int i = 0; i < 5; i++) Console.WriteLine(rng.NextDouble().ToString("R"));
        Console.WriteLine("Int:");
        for (int i = 0; i < 8; i++) Console.WriteLine(rng.NextInt(3, 8));
        Console.WriteLine("Streams:");
        foreach (var name in new[] { "world", "agents", "social" })
        {
            var s = new SimRandomProvider(1234UL).GetStream(name);
            Console.WriteLine($"{name}:{s.NextUInt64()}");
        }
    }
}
