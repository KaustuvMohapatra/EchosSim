using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using EchoSim.Core;

namespace EchoSim.Simulation
{
    // ---------------- DTO layer (spec Sprint 18): never serialize domain internals ----------------

    public sealed class SaveDataV1
    {
        public int SchemaVersion { get; set; } = 1;
        public ulong Seed { get; set; }
        public long TimeMinutes { get; set; }
        public string Weather { get; set; } = "Clear";

        public List<LocationDto> Locations { get; set; } = new List<LocationDto>();
        public List<AgentDto> Agents { get; set; } = new List<AgentDto>();
        public List<RelationshipDto> Relationships { get; set; } = new List<RelationshipDto>();
        public List<MemoryDto> Memories { get; set; } = new List<MemoryDto>();
        public List<BeliefDto> Beliefs { get; set; } = new List<BeliefDto>();
        public List<SuppressionDto> Suppressions { get; set; } = new List<SuppressionDto>();
        public List<ActiveRunDto> ActiveRuns { get; set; } = new List<ActiveRunDto>();
    }

    /// <summary>An executing plan frozen mid-step (restored with its remaining time).</summary>
    public sealed class ActiveRunDto
    {
        public string Agent { get; set; } = "";
        public string GoalId { get; set; } = "";
        public int NextStepIndex { get; set; }
        /// <summary>Simulated minutes until the in-flight step completes.</summary>
        public int RemainingMinutes { get; set; }
        public List<string> StepActionIds { get; set; } = new List<string>();
    }

    /// <summary>Planning-failure backoff timers survive saves so restored towns stay cautious.</summary>
    public sealed class SuppressionDto
    {
        public string Agent { get; set; } = "";
        public string Goal { get; set; } = "";
        public long UntilMinutes { get; set; }
    }

    public sealed class LocationDto
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public int Capacity { get; set; }
        public bool IsOpen { get; set; }
        public int OccupiedCount { get; set; }
        public int? OpenMinute { get; set; }
        public int? CloseMinute { get; set; }
    }

    public sealed class AgentDto
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Home { get; set; } = "";
        public string Current { get; set; } = "";
        public float Money { get; set; }
        public float EmotionValence { get; set; }
        public int RoutineOffsetMinutes { get; set; }
        public string? JobId { get; set; }
        public string? CurrentGoalId { get; set; }
        public Dictionary<string, long> LastSelectedMinutes { get; set; } = new Dictionary<string, long>();
        public float[] Personality { get; set; } = Array.Empty<float>();
        public Dictionary<string, float> Needs { get; set; } = new Dictionary<string, float>();
        public Dictionary<string, int> PlannerFacts { get; set; } = new Dictionary<string, int>();
        public Dictionary<string, int> Inventory { get; set; } = new Dictionary<string, int>();
    }

    public sealed class RelationshipDto
    {
        public string From { get; set; } = "";
        public string To { get; set; } = "";
        public float Familiarity { get; set; }
        public float Affinity { get; set; }
        public float Trust { get; set; }
        public float Respect { get; set; }
        public float Attraction { get; set; }
        public float Fear { get; set; }
        public float Grievance { get; set; }
        public float Obligation { get; set; }
    }

    public sealed class MemoryDto
    {
        public long Id { get; set; }
        public string OwnerId { get; set; } = "";
        public long TimestampMinutes { get; set; }
        public string EventType { get; set; } = "";
        public string Subject { get; set; } = "";
        public string? Where { get; set; }
        public string Summary { get; set; } = "";
        public float Importance { get; set; }
        public float Valence { get; set; }
        public float Confidence { get; set; }
        public string Source { get; set; } = "";
        public long SourceEventId { get; set; }
        public int AccessCount { get; set; }
        public long LastAccessMinutes { get; set; }
    }

    public sealed class BeliefDto
    {
        public long Id { get; set; }
        public string Owner { get; set; } = "";
        public string SubjectKey { get; set; } = "";
        public string Predicate { get; set; } = "";
        public float Stance { get; set; }
        public float Confidence { get; set; }
        public int HopCount { get; set; }
        public string? SourceAgent { get; set; }
        public long? SourceEventId { get; set; }
        public long LearnedAtMinutes { get; set; }
    }

    public sealed class UnsupportedSaveVersionException : Exception
    {
        public int FoundVersion { get; }
        public UnsupportedSaveVersionException(int found) : base(
            "Save schema version " + found.ToString(CultureInfo.InvariantCulture) + " is not supported by this build.")
        { FoundVersion = found; }
    }

    /// <summary>Explicit migration chain: v(n) -> v(n+1). v1 is current.</summary>
    public static class SaveMigrator
    {
        public static void MigrateToCurrent(SaveDataV1 data)
        {
            switch (data.SchemaVersion)
            {
                case 1:
                    return; // current
                default:
                    throw new UnsupportedSaveVersionException(data.SchemaVersion);
            }
        }
    }

    /// <summary>
    /// Captures and restores the living town (spec Sprint 18). IDs are authoritative;
    /// no Unity object references ever enter the file. Writes are atomic with backup.
    /// </summary>
    public sealed class SaveService
    {
        private readonly SimulationWorld _world;
        private readonly MemorySystem _memory;
        private readonly BeliefSystem _beliefs;
        private readonly RelationshipSystem _relationships;
        private readonly WeatherSystem? _weather;
        private readonly CognitionSystem? _cognition;
        private readonly PlanningDirector? _director;

        public SaveService(SimulationWorld world, MemorySystem memory,
            BeliefSystem beliefs, RelationshipSystem relationships,
            WeatherSystem? weather = null, CognitionSystem? cognition = null,
            PlanningDirector? director = null)
        {
            _world = world ?? throw new ArgumentNullException(nameof(world));
            _memory = memory ?? throw new ArgumentNullException(nameof(memory));
            _beliefs = beliefs ?? throw new ArgumentNullException(nameof(beliefs));
            _relationships = relationships ?? throw new ArgumentNullException(nameof(relationships));
            _weather = weather;
            _cognition = cognition;
            _director = director;
        }

        public SaveDataV1 Capture()
        {
            var data = new SaveDataV1
            {
                Seed = _world.Randoms.MasterSeed,
                TimeMinutes = _world.Clock.CurrentTime.TotalMinutes,
                Weather = _weather != null ? _weather.Current.ToString() : "Clear"
            };

            foreach (var locId in _world.Locations.OrderedIds)
            {
                var rt = _world.Locations.Get(locId);
                data.Locations.Add(new LocationDto
                {
                    Id = locId.Value,
                    Name = rt.Definition.DisplayName,
                    Capacity = rt.Definition.Capacity,
                    IsOpen = rt.IsOpen,
                    OccupiedCount = rt.OccupiedCount,
                    OpenMinute = rt.Definition.Hours?.OpenMinuteOfDay,
                    CloseMinute = rt.Definition.Hours?.CloseMinuteOfDay
                });
            }

            foreach (var mind in _world.Residents.AllInOrder())
            {
                var agent = _world.Agents.Get(mind.Agent);
                var dto = new AgentDto
                {
                    Id = mind.Agent.Value,
                    Name = agent.Identity.DisplayName,
                    Home = agent.HomeLocationId.Value ?? "",
                    Current = agent.HasLocation ? agent.CurrentLocationId.Value : "",
                    Money = mind.Money,
                    EmotionValence = mind.EmotionValence,
                    RoutineOffsetMinutes = mind.RoutineOffsetMinutes,
                    JobId = mind.Job?.Id,
                    Personality = new float[PersonalityProfile.TraitCount]
                };
                for (int i = 0; i < PersonalityProfile.TraitCount; i++)
                    dto.Personality[i] = mind.Personality.Get((PersonalityTrait)i);
                foreach (var need in mind.Needs.All)
                    dto.Needs[need.Definition.Kind.ToString()] = need.Current;
                foreach (var kv in mind.PlannerMemory)
                    dto.PlannerFacts[kv.Key] = kv.Value;
                foreach (var kv in mind.Inventory.Snapshot)
                    dto.Inventory[kv.Key.Value] = kv.Value;
                dto.CurrentGoalId = mind.CurrentGoalId?.Value;
                foreach (var kv in mind.LastSelectedAt)
                    dto.LastSelectedMinutes[kv.Key.Value] = kv.Value.TotalMinutes;
                data.Agents.Add(dto);
            }

            if (_cognition != null)
            {
                foreach (var s in _cognition.SuppressionsSnapshot())
                    data.Suppressions.Add(new SuppressionDto
                    {
                        Agent = s.Agent.Value, Goal = s.Goal.Value,
                        UntilMinutes = s.Until.TotalMinutes
                    });
            }

            if (_director != null)
            {
                foreach (var run in _director.ActiveRunsSnapshot())
                {
                    var dto = new ActiveRunDto
                    {
                        Agent = run.Agent.Value,
                        GoalId = run.Goal.Value,
                        NextStepIndex = run.NextStepIndex,
                        RemainingMinutes = (int)Math.Max(0, run.CurrentStepDueMinutes - _world.Clock.CurrentTime.TotalMinutes),
                        StepActionIds = new List<string>()
                    };
                    foreach (var step in run.Plan.Steps)
                        dto.StepActionIds.Add(step.Id.Value);
                    data.ActiveRuns.Add(dto);
                }
            }

            foreach (var rel in _relationships.All())
            {
                data.Relationships.Add(new RelationshipDto
                {
                    From = rel.From.Value, To = rel.To.Value,
                    Familiarity = rel.Rel.Familiarity, Affinity = rel.Rel.Affinity, Trust = rel.Rel.Trust,
                    Respect = rel.Rel.Respect, Attraction = rel.Rel.Attraction, Fear = rel.Rel.Fear,
                    Grievance = rel.Rel.Grievance, Obligation = rel.Rel.Obligation
                });
            }

            foreach (var owner in _memory.OwnerIds())
            {
                foreach (var m in _memory.StoreFor(owner).All)
                {
                    data.Memories.Add(new MemoryDto
                    {
                        Id = m.Id.Value,
                        OwnerId = owner.Value,
                        TimestampMinutes = m.Timestamp.TotalMinutes,
                        EventType = m.EventType,
                        Subject = m.Subject.Value ?? "",
                        Where = m.Where?.Value,
                        Summary = m.Summary,
                        Importance = m.Importance,
                        Valence = m.Valence,
                        Confidence = m.Confidence,
                        Source = m.Source.ToString(),
                        SourceEventId = m.SourceEvent.Value,
                        AccessCount = m.AccessCount,
                        LastAccessMinutes = m.LastAccess.TotalMinutes
                    });
                }
            }

            foreach (var pair in _beliefs.OwnersWithStores())
            {
                foreach (var b in pair.Value.All)                {
                    data.Beliefs.Add(new BeliefDto
                    {
                        Id = b.Id.Value,
                        Owner = b.Owner.Value,
                        SubjectKey = b.SubjectKey,
                        Predicate = b.Predicate,
                        Stance = b.Stance,
                        Confidence = b.Confidence,
                        HopCount = b.HopCount,
                        SourceAgent = b.SourceAgent?.Value,
                        SourceEventId = b.SourceEvent?.Value,
                        LearnedAtMinutes = b.LearnedAt.TotalMinutes
                    });
                }
            }

            return data;
        }

        private static string need_key(NeedKind kind) => kind.ToString();

        /// <summary>Atomic write: temp file, validate, replace, keep .bak.</summary>
        public static void WriteFile(string path, SaveDataV1 data)
        {
            if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("Path required.", nameof(path));
            string json = Newtonsoft.Json.JsonConvert.SerializeObject(data, Newtonsoft.Json.Formatting.Indented);

            string dir = Path.GetDirectoryName(Path.GetFullPath(path))!;
            Directory.CreateDirectory(dir);
            string temp = path + ".tmp";
            File.WriteAllText(temp, json);

            // Validate the temp parses back before replacing the real save.
            Newtonsoft.Json.JsonConvert.DeserializeObject<SaveDataV1>(File.ReadAllText(temp));

            if (File.Exists(path))
            {
                string backup = path + ".bak";
                if (File.Exists(backup)) File.Delete(backup);
                File.Copy(path, backup);
                File.Delete(path);
            }
            File.Move(temp, path);
        }

        public static SaveDataV1 ReadFile(string path)
        {
            if (!File.Exists(path))
                throw new FileNotFoundException("Save file not found.", path);

            string json = File.ReadAllText(path);
            SaveDataV1 data;
            try
            {
                data = Newtonsoft.Json.JsonConvert.DeserializeObject<SaveDataV1>(json)
                       ?? throw new InvalidDataException("Empty save file.");
            }
            catch (Newtonsoft.Json.JsonException ex)
            {
                throw new InvalidDataException("Corrupt save file: " + ex.Message, ex);
            }

            SaveMigrator.MigrateToCurrent(data);
            return data;
        }

        /// <summary>
        /// Rebuilds a living town from save data. Systems are recreated fresh and
        /// populated through the same internal import hooks the runtime uses —
        /// no bus events fire during reconstruction.
        /// </summary>
        public static RestoredTown Restore(SaveDataV1 data)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            SaveMigrator.MigrateToCurrent(data);

            var world = SimulationBootstrap.CreateWorld(new SimulationConfiguration(
                seed: data.Seed,
                startTime: new SimTime(data.TimeMinutes)));

            var perception = new PerceptionSystem(world);
            var memory = new MemorySystem(world);
            var emotion = new EmotionSystem(world);
            var relationships = new RelationshipSystem(world);
            var beliefs = new BeliefSystem(world, relationships);
            _ = new SocialReactionSystem(world, memory, emotion, relationships);

            var weather = new WeatherSystem(world, world.Randoms.GetStream(RandomStreams.World));
            if (Enum.TryParse(data.Weather, out WeatherState weatherState))
                weather.Set(weatherState);

            var cognition = new CognitionSystem(world);
            cognition.SetWeatherProvider(() => weather.Current);

            // Locations (occupancy is rebuilt by placing agents below).
            foreach (var loc in data.Locations)
            {
                OpeningHours? hours = null;
                if (loc.OpenMinute.HasValue && loc.CloseMinute.HasValue)
                    hours = new OpeningHours(loc.OpenMinute.Value, loc.CloseMinute.Value);
                world.RegisterLocation(new LocationDefinition(new LocationId(loc.Id), loc.Name, loc.Capacity, hours));
                world.Locations.Get(new LocationId(loc.Id)).ForceOpen(loc.IsOpen);
            }

            // Residents: identity, personality, needs, placement, wallet, facts, inventory.
            foreach (var agentDto in data.Agents)
            {
                var builder = PersonalityProfile.Balanced().Edit();
                for (int i = 0; i < agentDto.Personality.Length && i < PersonalityProfile.TraitCount; i++)
                    builder.Set((PersonalityTrait)i, agentDto.Personality[i]);

                var mind = world.SpawnResident(new ResidentSpec(agentDto.Id, agentDto.Name)
                {
                    HomeLocationId = string.IsNullOrEmpty(agentDto.Home) ? null : agentDto.Home,
                    Personality = builder.Build()
                }).Mind;

                foreach (var kv in agentDto.Needs)
                    if (Enum.TryParse(kv.Key, out NeedKind kind))
                        mind.Needs.Force(kind, kv.Value);

                mind.Money = agentDto.Money;
                mind.SetEmotion(agentDto.EmotionValence);
                mind.SetRoutineOffset(agentDto.RoutineOffsetMinutes);

                if (!string.IsNullOrEmpty(agentDto.Current) &&
                    agentDto.Current != agentDto.Home)
                    world.PlaceAt(mind.Agent, new LocationId(agentDto.Current));

                foreach (var kv in agentDto.PlannerFacts)
                    mind.PlannerMemory[kv.Key] = kv.Value;
                foreach (var kv in agentDto.Inventory)
                    mind.Inventory.Add(new ItemId(kv.Key), kv.Value);
            }

            // Memories: capture writes a flat list with an owner id per entry.
            foreach (var m in data.Memories)
            {
                if (string.IsNullOrEmpty(m.OwnerId)) continue;
                var where = string.IsNullOrEmpty(m.Where) ? (LocationId?)null : new LocationId(m.Where);
                var mem = new EpisodicMemory(
                    new MemoryId(m.Id), new SimTime(m.TimestampMinutes), m.EventType,
                    new AgentId(m.Subject), where, m.Summary, m.Importance, m.Valence,
                    m.Confidence, ParseSource(m.Source), new EventId(m.SourceEventId));
                mem.AccessCount = m.AccessCount;
                mem.LastAccess = new SimTime(m.LastAccessMinutes);
                memory.ImportMemory(new AgentId(m.OwnerId), mem);
            }

            // Beliefs.
            foreach (var b in data.Beliefs)
            {
                beliefs.StoreFor(new AgentId(b.Owner)).Import(new Belief(
                    new MemoryId(b.Id), new AgentId(b.Owner), b.SubjectKey, b.Predicate,
                    b.Stance, b.Confidence, b.HopCount,
                    string.IsNullOrEmpty(b.SourceAgent) ? null : new AgentId(b.SourceAgent),
                    b.SourceEventId.HasValue ? new EventId(b.SourceEventId.Value) : null,
                    new SimTime(b.LearnedAtMinutes)));
            }

            // Relationships.
            foreach (var r in data.Relationships)
            {
                var snapshot = new Relationship();
                snapshot.ImportFull(r.Familiarity, r.Affinity, r.Trust, r.Respect,
                    r.Attraction, r.Fear, r.Grievance, r.Obligation);
                relationships.Import(new AgentId(r.From), new AgentId(r.To), snapshot);
            }

            // Cognition timers: commitments, selection cooldowns, suppression backoffs.
            foreach (var agentDto in data.Agents)
            {
                cognition.RestoreResidentState(new AgentId(agentDto.Id),
                    agentDto.CurrentGoalId, agentDto.LastSelectedMinutes, data.Suppressions);
            }

            return new RestoredTown(world, perception, memory, emotion, relationships, beliefs, weather, cognition, data.ActiveRuns);
        }

        private static PerceptionSource ParseSource(string s) =>
            Enum.TryParse(s, out PerceptionSource source) ? source : PerceptionSource.VisualNearby;
    }

    /// <summary>The fully wired town returned by restore.</summary>
    public sealed class RestoredTown
    {
        public SimulationWorld World { get; }
        public PerceptionSystem Perception { get; }
        public MemorySystem Memory { get; }
        public EmotionSystem Emotion { get; }
        public RelationshipSystem Relationships { get; }
        public BeliefSystem Beliefs { get; }
        public WeatherSystem Weather { get; }
        public CognitionSystem Cognition { get; }
        /// <summary>In-flight plans; hand to PlanningDirector.RestoreRun after creating it.</summary>
        public IReadOnlyList<ActiveRunDto> ActiveRuns { get; }

        internal RestoredTown(SimulationWorld world, PerceptionSystem perception,
            MemorySystem memory, EmotionSystem emotion, RelationshipSystem relationships,
            BeliefSystem beliefs, WeatherSystem weather, CognitionSystem cognition,
            IReadOnlyList<ActiveRunDto> activeRuns)
        {
            World = world; Perception = perception; Memory = memory; Emotion = emotion;
            Relationships = relationships; Beliefs = beliefs; Weather = weather;
            Cognition = cognition; ActiveRuns = activeRuns;
        }
    }
}
