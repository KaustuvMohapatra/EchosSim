using System;

namespace EchoSim.Core
{
    /// <summary>
    /// Strongly typed, stable identifier for an agent (NPC or player).
    /// Values are authored constants; never derived from display names.
    /// </summary>
    public readonly struct AgentId : IEquatable<AgentId>, IComparable<AgentId>
    {
        public string Value { get; }

        public AgentId(string value)
        {
            IdValidation.RequireValid(value, nameof(value));
            Value = value;
        }

        public static bool TryParse(string? value, out AgentId id)
        {
            if (!IdValidation.IsValid(value)) { id = default; return false; }
            id = new AgentId(value!);
            return true;
        }

        public bool Equals(AgentId other) => string.Equals(Value, other.Value, StringComparison.Ordinal);
        public int CompareTo(AgentId other) => string.CompareOrdinal(Value, other.Value);
        public override bool Equals(object? obj) => obj is AgentId other && Equals(other);
        public override int GetHashCode() => Value?.GetHashCode(StringComparison.Ordinal) ?? 0;
        public override string ToString() => Value ?? string.Empty;
        public static bool operator ==(AgentId left, AgentId right) => left.Equals(right);
        public static bool operator !=(AgentId left, AgentId right) => !left.Equals(right);
    }

    /// <summary>Strongly typed, stable identifier for a location.</summary>
    public readonly struct LocationId : IEquatable<LocationId>, IComparable<LocationId>
    {
        public string Value { get; }

        public LocationId(string value)
        {
            IdValidation.RequireValid(value, nameof(value));
            Value = value;
        }

        public static bool TryParse(string? value, out LocationId id)
        {
            if (!IdValidation.IsValid(value)) { id = default; return false; }
            id = new LocationId(value!);
            return true;
        }

        public bool Equals(LocationId other) => string.Equals(Value, other.Value, StringComparison.Ordinal);
        public int CompareTo(LocationId other) => string.CompareOrdinal(Value, other.Value);
        public override bool Equals(object? obj) => obj is LocationId other && Equals(other);
        public override int GetHashCode() => Value?.GetHashCode(StringComparison.Ordinal) ?? 0;
        public override string ToString() => Value ?? string.Empty;
        public static bool operator ==(LocationId left, LocationId right) => left.Equals(right);
        public static bool operator !=(LocationId left, LocationId right) => !left.Equals(right);
    }

    /// <summary>Strongly typed, stable identifier for a stored memory.</summary>
    public readonly struct MemoryId : IEquatable<MemoryId>, IComparable<MemoryId>
    {
        public long Value { get; }

        public MemoryId(long value)
        {
            if (value <= 0) throw new ArgumentOutOfRangeException(nameof(value), "MemoryId must be positive.");
            Value = value;
        }

        public bool Equals(MemoryId other) => Value == other.Value;
        public int CompareTo(MemoryId other) => Value.CompareTo(other.Value);
        public override bool Equals(object? obj) => obj is MemoryId other && Equals(other);
        public override int GetHashCode() => Value.GetHashCode();
        public override string ToString() => $"M{Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
        public static bool operator ==(MemoryId left, MemoryId right) => left.Equals(right);
        public static bool operator !=(MemoryId left, MemoryId right) => !left.Equals(right);
    }

    /// <summary>Strongly typed, stable identifier for a world event instance.</summary>
    public readonly struct EventId : IEquatable<EventId>, IComparable<EventId>
    {
        public long Value { get; }

        public EventId(long value)
        {
            if (value <= 0) throw new ArgumentOutOfRangeException(nameof(value), "EventId must be positive.");
            Value = value;
        }

        public bool Equals(EventId other) => Value == other.Value;
        public int CompareTo(EventId other) => Value.CompareTo(other.Value);
        public override bool Equals(object? obj) => obj is EventId other && Equals(other);
        public override int GetHashCode() => Value.GetHashCode();
        public override string ToString() => $"E{Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
        public static bool operator ==(EventId left, EventId right) => left.Equals(right);
        public static bool operator !=(EventId left, EventId right) => !left.Equals(right);
    }

    /// <summary>Strongly typed identifier for an action type definition.</summary>
    public readonly struct ActionId : IEquatable<ActionId>, IComparable<ActionId>
    {
        public string Value { get; }

        public ActionId(string value)
        {
            IdValidation.RequireValid(value, nameof(value));
            Value = value;
        }

        public bool Equals(ActionId other) => string.Equals(Value, other.Value, StringComparison.Ordinal);
        public int CompareTo(ActionId other) => string.CompareOrdinal(Value, other.Value);
        public override bool Equals(object? obj) => obj is ActionId other && Equals(other);
        public override int GetHashCode() => Value?.GetHashCode(StringComparison.Ordinal) ?? 0;
        public override string ToString() => Value ?? string.Empty;
        public static bool operator ==(ActionId left, ActionId right) => left.Equals(right);
        public static bool operator !=(ActionId left, ActionId right) => !left.Equals(right);
    }

    /// <summary>Strongly typed identifier for a goal definition.</summary>
    public readonly struct GoalId : IEquatable<GoalId>, IComparable<GoalId>
    {
        public string Value { get; }

        public GoalId(string value)
        {
            IdValidation.RequireValid(value, nameof(value));
            Value = value;
        }

        public bool Equals(GoalId other) => string.Equals(Value, other.Value, StringComparison.Ordinal);
        public int CompareTo(GoalId other) => string.CompareOrdinal(Value, other.Value);
        public override bool Equals(object? obj) => obj is GoalId other && Equals(other);
        public override int GetHashCode() => Value?.GetHashCode(StringComparison.Ordinal) ?? 0;
        public override string ToString() => Value ?? string.Empty;
        public static bool operator ==(GoalId left, GoalId right) => left.Equals(right);
        public static bool operator !=(GoalId left, GoalId right) => !left.Equals(right);
    }

    /// <summary>Shared validation rules for string based identifiers.</summary>
    internal static class IdValidation
    {
        public const int MaxLength = 128;

        public static bool IsValid(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return false;
            return value!.Length <= MaxLength;
        }

        public static void RequireValid(string? value, string paramName)
        {
            if (string.IsNullOrWhiteSpace(value))
                throw new ArgumentException("Identifier value must be a non-empty, non-whitespace string.", paramName);
            if (value.Length > MaxLength)
                throw new ArgumentException($"Identifier value exceeds {MaxLength} characters.", paramName);
        }
    }
}
