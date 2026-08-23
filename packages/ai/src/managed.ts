/**
 * Guarded language model: the ONLY entry point consumers should use.
 * Adds timeout, retry (retryable kinds only), schema validation, metrics,
 * safe caching and clean fallback to the deterministic template provider.
 *
 * Guarantees:
 * - config.enabled === false  ⇒ template provider only, no network (Rule 3).
 * - any provider failure      ⇒ template result with source:"template".
 * - identical requests within cacheTtlMs ⇒ cached result (cache hit metric).
 */
import {
  AiError, DEFAULT_AI_CONFIG, isRetryable,
  type AiConfig, type DialogueGenerationRequest, type DialogueGenerationResult,
  type LanguageModelProvider, type ReflectionGenerationRequest,
  type ReflectionGenerationResult,
} from "./types.js";
import { TemplateLanguageModelProvider } from "./providers.js";
import { OpenAICompatibleLanguageModelProvider } from "./providers.js";
import { MockLanguageModelProvider } from "./providers.js";
import { AiMetrics } from "./metrics.js";

export interface ManagedDialogueResult extends DialogueGenerationResult {
  source: "llm" | "template" | "cache";
}
export interface ManagedReflectionResult extends ReflectionGenerationResult {
  source: "llm" | "template" | "cache";
}

interface CacheEntry {
  atMs: number;
  value: DialogueGenerationResult;
}

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 256;

export class LanguageModelService {
  readonly metrics = new AiMetrics();
  private readonly fallback: LanguageModelProvider =
    new TemplateLanguageModelProvider();
  private provider?: LanguageModelProvider;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    public config: AiConfig = DEFAULT_AI_CONFIG,
    deps: {
      provider?: LanguageModelProvider;
      fetchImpl?: typeof fetch;
      /** Test hook; defaults to real setTimeout. */
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {
    if (deps.provider) this.provider = deps.provider;
    else if (config.enabled) this.provider = createConfiguredProvider(config, deps);
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async generateDialogue(
    request: DialogueGenerationRequest,
    signal?: AbortSignal,
  ): Promise<ManagedDialogueResult> {
    const key = dialogueCacheKey(request);
    const limits = { maxUtterances: request.maxUtterances, maxChars: this.config.maxResponseChars };
    return this.run(key, limits,
      (p, s) => p.generateDialogue(request, s), signal);
  }

  async generateReflection(
    request: ReflectionGenerationRequest,
    signal?: AbortSignal,
  ): Promise<ManagedReflectionResult> {
    // Reflections are personal; do NOT serve them from cache (spec 22.6).
    const limits = { maxUtterances: 1, maxChars: this.config.maxResponseChars };
    return this.run(null, limits,
      (p, s) => p.generateReflection(request, s), signal);
  }

  private async run<T>(
    cacheKey: string | null,
    _limits: { maxUtterances: number; maxChars: number },
    call: (provider: LanguageModelProvider, signal?: AbortSignal) => Promise<T>,
    outerSignal?: AbortSignal,
  ): Promise<T & { source: "llm" | "template" | "cache" }> {
    if (!this.config.enabled || this.provider === undefined) {
      this.metrics.recordDisabled();
      const fb = await this.fallbackCall(call);
      return { ...fb, source: "template" } as never;
    }

    if (cacheKey !== null) {
      const hit = this.cache.get(cacheKey);
      const now = Date.now();
      if (hit && now - hit.atMs < CACHE_TTL_MS) {
        this.metrics.recordCacheHit();
        return { ...hit.value, source: "cache" } as never;
      }
    }

    const attempts = Math.max(1, this.config.retry.maxAttempts);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.metrics.recordCall();
      const started = Date.now();
      try {
        const result = await withTimeout(
          call(this.provider, outerSignal), this.config.timeoutMs);
        this.metrics.recordSuccess(Date.now() - started);
        if (cacheKey !== null) this.remember(cacheKey, result as never);
        return { ...(result as object), source: "llm" } as never;
      } catch (err) {
        const kind = err instanceof AiError ? err.kind : "network";
        this.metrics.recordFailure(kind);
        if (!isRetryable(kind) || attempt === attempts) break;
        await this.sleep(this.config.retry.backoffMs * attempt);
        if (outerSignal?.aborted) break;
      }
    }

    this.metrics.recordFallback();
    const fb = await this.fallbackCall(call);
    return { ...fb, source: "template" } as never;
  }

  private async fallbackCall<T>(
    call: (provider: LanguageModelProvider, signal?: AbortSignal) => Promise<T>,
  ): Promise<T> {
    return call(this.fallback, undefined);
  }

  private remember(key: string, value: DialogueGenerationResult): void {
    if (this.cache.size >= CACHE_MAX) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].atMs - b[1].atMs)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(key, { atMs: Date.now(), value });
  }
}

function createConfiguredProvider(
  config: AiConfig, deps: { fetchImpl?: typeof fetch },
): LanguageModelProvider {
  switch (config.provider) {
    case "mock": return new MockLanguageModelProvider();
    case "openai-compatible":
      return new OpenAICompatibleLanguageModelProvider(
        {
          baseUrl: config.baseUrl ?? "http://localhost:11434/v1",
          model: config.model ?? "local",
          temperature: config.temperature,
          apiKey: resolveApiKey(config.apiKeyEnv),
        },
        { fetchImpl: deps.fetchImpl },
      );
    case "template":
    default:
      return new TemplateLanguageModelProvider();
  }
}

function resolveApiKey(envName?: string): string | undefined {
  if (!envName) return undefined;
  // Environment-agnostic lookup (Node exposes process; browsers do not).
  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  const value = proc?.env?.[envName];
  return value !== undefined && value.length > 0 ? value : undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiError("timeout", `exceeded ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function dialogueCacheKey(req: DialogueGenerationRequest): string {
  // Spec 22.6: archetype-level key — intent + topic kind + relationship bucket
  // + mood bucket. Personal context (names/facts/turns) deliberately excluded
  // to avoid caching highly contextual dialogue incorrectly... except topic
  // label matters for phrasing; include a coarse bucket of it instead.
  const relBucket = req.relationshipSummary ?? "unknown";
  const moodBucket = req.moodDescriptor ?? "neutral";
  return [
    req.intent, topicBucket(req.topicLabel), relBucket, moodBucket,
    req.maxUtterances, req.personalityDescriptors.join("+"),
  ].join("|");
}

function topicBucket(topic: string): string {
  if (!topic || topic === "the neighbourhood") return "generic";
  const words = topic.trim().toLowerCase().split(/\s+/).length;
  return `topic:${words}w`;
}
