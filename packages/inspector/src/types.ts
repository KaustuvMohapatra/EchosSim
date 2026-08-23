/**
 * Read models for debug inspection. Every type is a plain snapshot: rendering
 * layers consume these without ever touching simulation internals.
 */

export interface AgentSummary {
  id: string;
  name: string;
  locationId?: string;
  locationName?: string;
  currentGoal?: string;
  currentAction?: string;
  /** Short lifecycle label: "Idle", "Running", "Starting", ... */
  status: string;
  emotionValence: number;
}

export interface UtilityLine { label: string; value: number }
export interface UtilityCandidate {
  goal: string;
  displayName: string;
  score: number;
  breakdown: readonly UtilityLine[];
  criticalOverride: boolean;
  isCommittedGoal: boolean;
}

export interface PlanStepView {
  actionId: string;
  label: string;
  durationMinutes: number;
}

export interface PlanSnapshot {
  goalId?: string;
  /** Generation token of the active run (0 when idle). */
  revision: number;
  hasPlan: boolean;
  steps: readonly PlanStepView[];
  nextStepIndex: number;
  currentAction?: string;
  lifecycle?: string;
  startedAtMinutes?: number;
  currentStepDueMinutes?: number;
  lastFailureDetail?: string;
  lastReplanReason?: string;
  lastPlanOutcome?: string;
  lastPlannerNodesExpanded: number;
}

export interface NeedSnapshot {
  kind: number;
  name: string;
  value: number;
  satisfied: boolean;
  critical: boolean;
  interrupting: boolean;
}

export interface TraitSnapshot { name: string; value: number }

export interface JobSnapshot {
  id: string; title: string; workplace: string;
  shiftStartMinuteOfDay: number; shiftEndMinuteOfDay: number;
  incomePerHour: number;
}

export interface MemoryInspectorEntry {
  id: number;
  timestampMinutes: number;
  summary: string;
  type: string;
  subject: string;
  where?: string;
  importance: number;
  valence: number;
  confidence: number;
  source: string;
  accessCount: number;
  /** Retrieval score at query time (non-mutating peek). */
  retrievalScore?: number;
}

export interface RelationshipDimension {
  familiarity: number; affinity: number; trust: number; respect: number;
  attraction: number; fear: number; grievance: number; obligation: number;
}
export interface RelationshipSnapshot extends RelationshipDimension {
  from: string;
  to: string;
  label: string;
}

export interface BeliefSnapshot {
  subjectKey: string;
  predicate: string;
  stance: number;
  confidence: number;
  hopCount: number;
  sourceAgent?: string;
  learnedAtMinutes: number;
}

export interface SuppressionTimerView {
  goal: string;
  untilMinutes: number;
}

export interface AgentInspectorSnapshot {
  summary: AgentSummary;
  homeLocationId?: string;
  traits: readonly TraitSnapshot[];
  needs: readonly NeedSnapshot[];
  emotionValence: number;
  money: number;
  committedGoalId?: string;
  job?: JobSnapshot;
  utility: readonly UtilityCandidate[];
  plan: PlanSnapshot;
  memories: readonly MemoryInspectorEntry[];
  relationships: readonly RelationshipSnapshot[];
  beliefs: readonly BeliefSnapshot[];
  suppressions: readonly SuppressionTimerView[];
}

export type SimEventKind =
  | "movement" | "plan" | "step" | "weather" | "conversation" | "social" | "other";

export interface SimEventEntry {
  seq: number;
  atMinutes: number;
  kind: SimEventKind;
  type: string;
  agent?: string;
  location?: string;
  text: string;
}

export interface EventFilter {
  agent?: string;
  /** Prefix match on event channel, e.g. "sim:plan". */
  typePrefix?: string;
  kind?: SimEventKind;
  sinceMinute?: number;
  untilMinute?: number;
  textContains?: string;
  limit?: number;
}

export interface TimeInfo {
  totalMinutes: number;
  day: number;
  dayName: string;
  hhmm: string;
  weather: string;
}

export interface TownStats {
  residents: number;
  locations: number;
  activePlans: number;
  memories: number;
  relationships: number;
  beliefs: number;
  conversations: number;
  plansSucceeded: number;
  plansFailed: number;
  replans: number;
}

/**
 * The only surface a presentation layer may use to read simulation state.
 * Implementations must be side-effect free.
 */
export interface SimulationInspectorAPI {
  getAgents(): AgentSummary[];
  getAgent(id: string): AgentInspectorSnapshot | undefined;
  getEvents(filter?: EventFilter): SimEventEntry[];
  getRelationships(id: string): RelationshipSnapshot[];
  getMemories(
    id: string,
    opts?: {
      sort?: "recency" | "importance" | "retrieval";
      aboutAgent?: string;
      limit?: number;
    },
  ): MemoryInspectorEntry[];
}

export const NEED_NAMES = [
  "Hunger", "Energy", "Social", "Fun", "Comfort", "Hygiene", "Safety",
] as const;

export const TRAIT_NAMES = [
  "Openness", "Conscientiousness", "Extraversion", "Agreeableness",
  "EmotionalVolatility", "Curiosity", "Patience", "Sociability",
  "RiskTolerance", "Generosity", "Honesty", "Ambition", "GrudgeRetention",
  "RoutinePreference",
] as const;

export const WEATHER_NAMES = ["Clear", "Cloudy", "Rain", "HeavyRain"] as const;

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function relationshipLabelOf(r: RelationshipDimension): string {
  if (r.grievance >= 0.6 && r.affinity <= -0.2) return "Enemy";
  if (r.affinity <= -0.35) return "Rival";
  if (r.familiarity < 0.15) return "Stranger";
  if (r.attraction >= 0.6) return "Crush";
  if (r.affinity >= 0.6 && r.trust >= 0.5) return "CloseFriend";
  if (r.affinity >= 0.3) return "Friend";
  return "Acquaintance";
}
