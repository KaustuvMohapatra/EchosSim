/**
 * HUD read-model helpers (Sprint 41): shape inspector data into
 * presentation-friendly values. Engine-free and pure.
 */
import { NEED_NAMES } from "@echosim/inspector";
import type { AgentInspectorSnapshot } from "@echosim/inspector";

export interface NeedView {
  key: string;
  /** 0 (satisfied) → 1 (critical) — bars fill toward warning. */
  fill: number;
  level: "good" | "warn" | "critical";
}

export function needViews(agent: AgentInspectorSnapshot): NeedView[] {
  return agent.needs.map((n) => ({
    key: n.name,
    fill: Math.max(0, Math.min(1, n.value / 100)),
    level: n.critical ? "critical" : n.value > 55 ? "warn" : "good",
  }));
}

/** Broad mood word derived from existing state — no second emotion system. */
export function moodOf(agent: AgentInspectorSnapshot): string {
  const v = agent.emotionValence;
  if (agent.needs.some((n) => n.critical && n.kind === 1 /* Energy */))
    return "Exhausted";
  if (v <= -0.5) return "Angry";
  if (v <= -0.2) return "Tense";
  if (v < -0.05) return "Downbeat";
  if (v >= 0.45) return "Happy";
  if (v >= 0.15) {
    const fun = agent.needs.find((n) => n.name === "Fun");
    if (fun && fun.value > 60) return "Playful";
    return "Good";
  }
  const focusNeed = agent.needs.find((n) => n.name === "Comfort");
  if (focusNeed && focusNeed.value < 30) return "Focused";
  return "Fine";
}

export interface CharacterCardModel {
  name: string;
  money: number;
  mood: string;
  needs: NeedView[];
  locationName?: string;
}

export function characterCard(agent: AgentInspectorSnapshot): CharacterCardModel {
  return {
    name: agent.summary.name,
    money: agent.money,
    mood: moodOf(agent),
    needs: needViews(agent),
    ...(agent.summary.locationName !== undefined
      ? { locationName: agent.summary.locationName } : {}),
  };
}

export { NEED_NAMES };
