/**
 * Hand-rolled schema validation for provider responses (the repo does not use
 * a schema library; keep zero-dependency). All validators return the parsed
 * value or throw AiError("schema-mismatch"|"empty-result"|"overlong").
 */
import {
  AiError,
  type DialogueGenerationResult, type ReflectionGenerationResult,
} from "./types.js";

export interface ValidationLimits {
  maxUtterances: number;
  maxChars: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanString(v: unknown, field: string, limits: ValidationLimits): string {
  if (typeof v !== "string") {
    throw new AiError("schema-mismatch", `${field} must be a string`);
  }
  const s = v.trim();
  if (s.length === 0) throw new AiError("empty-result", `${field} empty`);
  if (s.length > limits.maxChars) {
    throw new AiError("overlong", `${field} exceeds ${limits.maxChars} chars`);
  }
  return s;
}

/** Expected dialogue shape: { utterances: string[], tone?: string }. */
export function validateDialogue(
  raw: unknown, limits: ValidationLimits,
): DialogueGenerationResult {
  // Also accept array form [{utterance, tone?}, ...] per spec 21.5 example.
  let list: unknown[] | undefined;
  let tone: string | undefined;

  if (Array.isArray(raw)) list = raw;
  else if (isRecord(raw) && Array.isArray(raw["utterances"])) {
    list = raw["utterances"] as unknown[];
    const t = raw["tone"];
    if (t !== undefined) tone = cleanString(t, "tone", limits);
  }

  if (!list || list.length === 0) {
    throw new AiError("empty-result", "no utterances in response");
  }
  if (list.length > limits.maxUtterances) {
    throw new AiError("schema-mismatch",
      `expected <= ${limits.maxUtterances} utterances, got ${list.length}`);
  }

  const utterances: string[] = [];
  for (const item of list) {
    if (isRecord(item)) {
      utterances.push(cleanString(item["utterance"], "utterance", limits));
      if (tone === undefined && typeof item["tone"] === "string") {
        tone = cleanString(item["tone"], "tone", limits);
      }
    } else {
      utterances.push(cleanString(item, "utterance", limits));
    }
  }
  if (utterances.length === 0) throw new AiError("empty-result", "no utterances");

  const result: DialogueGenerationResult = { utterances };
  if (tone !== undefined) result.tone = tone;
  return result;
}

/** Expected reflection shape: { phrase: string } or plain string. */
export function validateReflection(
  raw: unknown, limits: ValidationLimits,
): ReflectionGenerationResult {
  if (typeof raw === "string") {
    return { phrase: cleanString(raw, "phrase", limits) };
  }
  if (isRecord(raw)) {
    return { phrase: cleanString(raw["phrase"], "phrase", limits) };
  }
  throw new AiError("schema-mismatch", "reflection must be {phrase} or string");
}
