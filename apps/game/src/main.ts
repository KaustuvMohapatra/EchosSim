/** Bootstrap: wires DOM panels, controls, and the scene together. */
import Phaser from "phaser";
import { SocialActionType } from "@echosim/social";
import type { AgentSummary } from "@echosim/inspector";
import { director, inspector, PLAYER_ID, town } from "./sim.js";
import { issueMoveCommand, issueSocialCommand } from "./commands.js";
import { TownScene, locationRects, locPositions, visuals } from "./scene.js";

const $ = (id: string): HTMLElement => document.getElementById(id)!;

let selectedId: string | null = PLAYER_ID;
let paused = false;
const SPEEDS = [1, 2, 4] as const;
let speedIndex = 0;
const agentSummaries = new Map<string, AgentSummary>();
const STEP_MINUTES = 10;

function hashOffset(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function nameOf(id: string): string {
  return town.residents.tryMind(id)?.displayName ?? id;
}
function setFeedback(text: string): void { $("feedback").textContent = text; }
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function shortGoal(s: AgentSummary): string {
  return (s.currentGoal ?? "idle").replace(/^goal_/, "") +
    (s.currentAction ? ` · ${s.currentAction.toLowerCase()}` : "");
}

function refresh(): void {
  agentSummaries.clear();
  for (const s of inspector.getAgents()) agentSummaries.set(s.id, s);

  // HUD.
  const t = inspector.getTime();
  $("hud").textContent =
    `${t.dayName} ${t.hhmm} · Day ${t.day + 1} · ${t.weather}` +
    (paused ? " · PAUSED" : ` · ${SPEEDS[speedIndex]!}×`);

  // Locations open/closed + occupancy.
  for (const { rect, locId } of locationRects) {
    const rt = town.locations.get(locId as never);
    rect.fillColor = rt.isOpen ? 0x14264a : 0x33384a;
    (rect.getData("status") as Phaser.GameObjects.Text | null)
      ?.setText(rt.isOpen ? `${rt.occupiedCount} here` : "CLOSED");
  }

  // Weather presentation.
  scene?.syncWeather(town.weather.current);

  renderAgentList();
  renderSelected();
}

function renderAgentList(): void {
  const el = $("agents");
  const rows: string[] = [];
  for (const s of agentSummaries.values()) {
    if (s.id === PLAYER_ID) continue;
    rows.push(
      `<button class="agent${s.id === selectedId ? " sel" : ""}" data-id="${s.id}"` +
      ` aria-label="select ${escapeHtml(s.name)}">` +
      `<b>${escapeHtml(s.name)}</b> <span class="dim">${escapeHtml(s.locationName ?? "")}</span><br>` +
      `<span class="dim">${escapeHtml(shortGoal(s))}</span></button>`);
  }
  el.innerHTML = rows.join("");
  for (const node of el.querySelectorAll<HTMLElement>(".agent"))
    node.onclick = () => { selectedId = node.dataset["id"]!; refresh(); };
}

function renderSelected(): void {
  const box = $("selected");
  const target = selectedId && selectedId !== PLAYER_ID ? selectedId : undefined;
  if (!target) {
    box.innerHTML =
      "<i>Select a resident to interact.</i><br><br>" +
      "<span class='dim'>Click any building to walk there. " +
      "Residents remember how you treat them.</span>";
    return;
  }
  const snap = inspector.getAgent(target);
  if (!snap) { box.innerHTML = "<i>Gone.</i>"; return; }
  const rel = snap.relationships.find((r) => r.to === PLAYER_ID);
  const label = rel?.label ?? "Stranger";
  box.innerHTML =
    `<h3>${escapeHtml(snap.summary.name)}</h3>` +
    `<div class="kv"><span>Doing</span><span>${escapeHtml(shortGoal(snap.summary))}</span></div>` +
    `<div class="kv"><span>Mood</span><span>${snap.emotionValence >= 0 ? "+" : ""}${snap.emotionValence.toFixed(2)}</span></div>` +
    `<div class="kv"><span>Toward you</span><span>${label}</span></div>`;
}

// ---------------- Controls ----------------
$("btn-pause").onclick = () => {
  paused = !paused;
  ($("btn-pause") as HTMLButtonElement).textContent = paused ? "▶" : "⏸";
  refresh();
};
for (const [idx, mult] of SPEEDS.entries()) {
  ($(`btn-x${mult}`) as HTMLButtonElement).onclick = () => {
    speedIndex = idx; refresh();
  };
}
for (const action of [
  SocialActionType.Greet, SocialActionType.Chat, SocialActionType.Compliment,
  SocialActionType.Tease, SocialActionType.Help, SocialActionType.Apologize,
]) {
  const btn = $(`cmd-${SocialActionType[action].toLowerCase()}`);
  if (!btn) continue;
  btn.onclick = () => {
    if (!selectedId || selectedId === PLAYER_ID) { setFeedback("Select a resident first."); return; }
    setFeedback(issueSocialCommand(town, PLAYER_ID, selectedId, action));
    refresh();
  };
}

$("btn-ambient").onclick = () => {
  ambientOn = !ambientOn;
  ($("btn-ambient") as HTMLButtonElement).textContent =
    ambientOn ? "🔊 ambience" : "🔇 ambience";
};
let ambientOn = false;
let audioCtx: AudioContext | null = null;
setInterval(() => {
  if (!ambientOn || paused || reducedMotionPrefers()) return;
  audioCtx ??= new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 120 + (hashOffset(String(Date.now())) % 40);
  osc.type = "sine";
  gain.gain.setValueAtTime(0.012, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.6);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(); osc.stop(audioCtx.currentTime + 1.7);
}, 2600);
function reducedMotionPrefers(): boolean {
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------------- Scene wiring ----------------
let scene: TownScene | null = null;

new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth - 340,
  height: window.innerHeight,
  parent: "game-container",
  backgroundColor: "#101728",
  scene: [TownScene],
  callbacks: {
    postBoot: (game) => {
      scene = game.scene.getScene("TownScene") as TownScene;
      scene.events.on("agent-selected", (id: string) => {
        selectedId = id; refresh();
      });
      scene.events.on("player-move", (locId: string) => {
        issueMoveCommand(town, PLAYER_ID, locId);
        setFeedback(`Walking to ${nameOf(locId)}…`.replace(nameOf(locId),
          town.locations.get(locId as never).definition.displayName));
        setTimeout(refresh, 900); // arrival lands on a scheduler tick
      });
      scene.events.on("sim-beat", () => {
        if (paused) return;
        const minutes = STEP_MINUTES * SPEEDS[speedIndex]!;
        for (let i = 0; i < minutes; i += STEP_MINUTES) {
          town.cognition.advanceNeeds({ totalMinutes: STEP_MINUTES });
          town.clock.advance({ totalMinutes: STEP_MINUTES });
          director.tickAll();
        }
        refresh();
      });
      refresh();
    },
  },
});

void locPositions; void visuals;
