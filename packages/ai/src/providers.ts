import {
  AiError,
  type DialogueGenerationRequest, type DialogueGenerationResult,
  type LanguageModelProvider, type ProviderKind,
  type ReflectionGenerationRequest, type ReflectionGenerationResult,
} from "./types.js";
import { validateDialogue, validateReflection } from "./validation.js";

/** Deterministic scripted provider for tests. Responses are pure functions of
 *  the request; a script can override per-call via the map. */
export class MockLanguageModelProvider implements LanguageModelProvider {
  readonly kind: ProviderKind = "mock";
  private dialogueScript:
    ((req: DialogueGenerationRequest) => unknown) | null = null;
  private reflectionScript:
    ((req: ReflectionGenerationRequest) => unknown) | null = null;
  calls = { dialogue: 0, reflection: 0 };

  scriptDialogue(fn: (req: DialogueGenerationRequest) => unknown): void {
    this.dialogueScript = fn;
  }
  scriptReflection(fn: (req: ReflectionGenerationRequest) => unknown): void {
    this.reflectionScript = fn;
  }

  async generateDialogue(
    request: DialogueGenerationRequest,
    _signal?: AbortSignal,
  ): Promise<DialogueGenerationResult> {
    this.calls.dialogue++;
    if (this.dialogueScript) return validateDialogue(this.dialogueScript(request), {
      maxUtterances: request.maxUtterances, maxChars: 4000,
    });
    return {
      utterances: [
        `(mock) ${request.speakerName} → ${request.listenerName}: about ${request.topicLabel}.`,
      ],
      tone: "neutral",
    };
  }

  async generateReflection(
    request: ReflectionGenerationRequest,
    _signal?: AbortSignal,
  ): Promise<ReflectionGenerationResult> {
    this.calls.reflection++;
    if (this.reflectionScript) return validateReflection(this.reflectionScript(request), {
      maxUtterances: 1, maxChars: 4000,
    });
    return { phrase: `(mock) ${request.concept} — noted.` };
  }
}

/** Deterministic offline rendering used when AI is disabled or as fallback.
 *  Mirrors the shape of the simulation's own template utterances. */
export class TemplateLanguageModelProvider implements LanguageModelProvider {
  readonly kind: ProviderKind = "template";

  async generateDialogue(
    request: DialogueGenerationRequest,
    _signal?: AbortSignal,
  ): Promise<DialogueGenerationResult> {
    const topic = request.topicLabel || "the neighbourhood";
    const name = request.listenerName;
    switch (request.intent) {
      case "Greet":
        return { utterances: [`Oh — hi, ${name}.`], tone: "warm" };
      case "Gossip":
        return {
          utterances: [`Did you hear about ${topic}?`, "That's what I heard."],
          tone: "conspiratorial",
        };
      case "Complain":
        return { utterances: [`It's ${topic} again. Honestly.`], tone: "weary" };
      case "Confront":
        return { utterances: [`${name}, we need to talk.`], tone: "tense" };
      case "Tease":
        return { utterances: [`Late again? Impressive, ${name}.`], tone: "playful" };
      case "Comfort":
        return { utterances: [`You're doing fine, ${name}. Really.`], tone: "gentle" };
      case "Apologize":
        return { utterances: [`I'm sorry about earlier, ${name}.`], tone: "sincere" };
      default:
        return { utterances: [`Nice weather for a walk, ${name}.`], tone: "friendly" };
    }
  }

  async generateReflection(
    request: ReflectionGenerationRequest,
    _signal?: AbortSignal,
  ): Promise<ReflectionGenerationResult> {
    const polarity = request.stance >= 0 ? "depend on" : "worry about";
    return {
      phrase: `I've learned I can ${polarity} ${request.subjectKey.replace(/^npc_/, "")}.`,
    };
  }
}

/** Minimal OpenAI-compatible chat-completions client over plain fetch.
 *  No vendor SDK types cross this boundary (Rule: contract isolation). */
export interface OpenAiCompatDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function extractJson(content: string): unknown {
  const trimmed = content.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new AiError("invalid-json", `content was not JSON: ${trimmed.slice(0, 80)}`);
  }
}

export class OpenAICompatibleLanguageModelProvider implements LanguageModelProvider {
  readonly kind: ProviderKind = "openai-compatible";
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly options: {
      baseUrl: string; model: string; apiKey?: string; temperature: number;
    },
    deps: OpenAiCompatDeps = {},
  ) {
    this.fetchFn = deps.fetchImpl ?? fetch.bind(globalThis);
  }

  async generateDialogue(
    request: DialogueGenerationRequest,
    signal?: AbortSignal,
  ): Promise<DialogueGenerationResult> {
    const system =
      "You write dialogue lines for characters in a social simulation. " +
      "Reply with STRICT JSON only: an array of objects like " +
      '[{"utterance":"...","tone":"playful"}]. ' +
      "Use only the KNOWN FACTS provided; do not invent new facts.";
    const user = renderDialoguePrompt(request);
    const raw = await this.complete(system, user, signal);
    return validateDialogue(extractJson(raw), {
      maxUtterances: request.maxUtterances, maxChars: 4000,
    });
  }

  async generateReflection(
    request: ReflectionGenerationRequest,
    signal?: AbortSignal,
  ): Promise<ReflectionGenerationResult> {
    const system =
      "You phrase a character's inner realisation in first person. " +
      'Reply with STRICT JSON only: {"phrase":"..."}.';
    const user =
      `Conclusion (fixed, do not change its meaning): ${request.subjectKey} — ` +
      `${request.concept}, stance ${request.stance.toFixed(2)}, confidence ` +
      `${request.confidence.toFixed(2)}.\n` +
      `Supporting moments:\n${request.supportingSummaries.map((s) => `- ${s}`).join("\n")}\n` +
      `Write one short sentence as ${request.agentName}.`;
    const raw = await this.complete(system, user, signal);
    return validateReflection(extractJson(raw), { maxUtterances: 1, maxChars: 2000 });
  }

  private async complete(
    system: string, user: string, signal?: AbortSignal,
  ): Promise<string> {
    let response: Response;
    try {
      response = await this.fetchFn(
        joinUrl(this.options.baseUrl, "/chat/completions"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.options.apiKey !== undefined
              ? { authorization: `Bearer ${this.options.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model: this.options.model,
            temperature: this.options.temperature,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal,
        },
      );
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw new AiError("aborted", "request aborted");
      }
      throw new AiError("network", String(err));
    }

    if (response.status === 429) {
      throw new AiError("rate-limited", "429 from endpoint");
    }
    if (response.status >= 500) {
      throw new AiError("server", `${response.status} from endpoint`);
    }
    if (!response.ok) {
      throw new AiError("server", `unexpected status ${response.status}`);
    }
    let body: ChatCompletionResponse;
    try {
      body = await response.json() as ChatCompletionResponse;
    } catch {
      throw new AiError("invalid-json", "endpoint returned non-JSON body");
    }
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new AiError("empty-result", "no completion content");
    }
    return content;
  }
}

function joinUrl(base: string, path: string): string {
  return base.endsWith("/") ? base.slice(0, -1) + path : base + path;
}

export function renderDialoguePrompt(req: DialogueGenerationRequest): string {
  return [
    `Scene: ${req.speakerName} speaks to ${req.listenerName}.`,
    `Intent (fixed): ${req.intent}. Topic: ${req.topicLabel}.`,
    req.relationshipSummary ? `Relationship: ${req.relationshipSummary}.` : "",
    req.moodDescriptor ? `Mood: ${req.moodDescriptor}.` : "",
    `Voice: ${req.personalityDescriptors.join(", ") || "neutral"}.`,
    `KNOWN FACTS:\n${req.knownFacts.map((f) => `- ${f}`).join("\n") || "- (none)"}`,
    req.recentTurns.length > 0
      ? `Recent turns:\n${req.recentTurns.map((t) => `${t.speaker}: ${t.text}`).join("\n")}`
      : "",
    `Write at most ${req.maxUtterances} short utterance(s). Do not introduce facts not present above.`,
  ].filter(Boolean).join("\n");
}
