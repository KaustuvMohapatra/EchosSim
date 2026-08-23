/**
 * LLM provider contracts. Vendor SDK types must never leak past this module:
 * providers adapt their SDKs to these plain shapes, consumers program against
 * them only. The simulation never REQUIRES any of this (Rule 3).
 */

export type ProviderKind = "template" | "mock" | "openai-compatible";

export interface DialogueTurn { speaker: string; text: string }

export interface DialogueGenerationRequest {
  speakerId: string;
  speakerName: string;
  listenerName: string;
  /** Simulation-decided intent (ConversationIntent name). */
  intent: string;
  topicLabel: string;
  /** Concise stylistic descriptors generated from data (spec 22.3). */
  personalityDescriptors: readonly string[];
  moodDescriptor?: string;
  relationshipSummary?: string;
  /** Facts the model may reference; nothing else exists for it (spec 22.4). */
  knownFacts: readonly string[];
  recentTurns: readonly DialogueTurn[];
  maxUtterances: number;
}

export interface DialogueGenerationResult {
  utterances: string[];
  tone?: string;
}

export interface ReflectionGenerationRequest {
  agentId: string;
  agentName: string;
  /** Structural conclusion owned by the simulation (spec 23.6). */
  subjectKey: string;
  concept: string;
  stance: number;
  confidence: number;
  supportingSummaries: readonly string[];
}

export interface ReflectionGenerationResult {
  phrase: string;
}

export interface LanguageModelProvider {
  readonly kind: ProviderKind;
  generateDialogue(
    request: DialogueGenerationRequest,
    signal?: AbortSignal,
  ): Promise<DialogueGenerationResult>;
  generateReflection(
    request: ReflectionGenerationRequest,
    signal?: AbortSignal,
  ): Promise<ReflectionGenerationResult>;
}

export interface AiRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface AiConfig {
  /** Master switch. false ⇒ deterministic template path, zero network (Rule 3). */
  enabled: boolean;
  provider: ProviderKind;
  baseUrl?: string;
  model?: string;
  timeoutMs: number;
  temperature: number;
  maxResponseChars: number;
  retry: AiRetryPolicy;
  /** ENV VAR NAME holding the API key — never the key itself (spec 21.3). */
  apiKeyEnv?: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  provider: "template",
  timeoutMs: 8000,
  temperature: 0.7,
  maxResponseChars: 600,
  retry: { maxAttempts: 2, backoffMs: 250 },
};

export type AiFailureKind =
  | "timeout" | "aborted" | "rate-limited" | "server" | "network"
  | "invalid-json" | "schema-mismatch" | "empty-result" | "overlong";

export class AiError extends Error {
  constructor(readonly kind: AiFailureKind, message: string) {
    super(`[${kind}] ${message}`);
    this.name = "AiError";
  }
}

/** Which failures are worth another attempt. */
export function isRetryable(kind: AiFailureKind): boolean {
  return kind === "timeout" || kind === "rate-limited" ||
         kind === "server" || kind === "network";
}
