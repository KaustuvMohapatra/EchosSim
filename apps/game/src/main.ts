import { Town, PlanningDirector, EconomySystem } from "@echosim/simulation";
import { PersonalityProfile } from "@echosim/cognition";
import type { WeatherState } from "@echosim/cognition";
import Phaser from "phaser";

// ---- Build the simulation ----
const town = new Town(42069n);
town.registerLocation({ id: "loc_home_a", displayName: "Home A" });
town.registerLocation({ id: "loc_cafe", displayName: "Corner Cafe", hours: { openMinuteOfDay: 360, closeMinuteOfDay: 1200 } });
town.registerLocation({ id: "loc_park", displayName: "Park" });
town.registerLocation({ id: "loc_bakery", displayName: "Bakery", hours: { openMinuteOfDay: 300, closeMinuteOfDay: 840 } });

const residents = [
  { id: "npc_mira", name: "Mira", home: "loc_home_a", traits: PersonalityProfile.miraLike() },
  { id: "npc_rohan", name: "Rohan", home: "loc_home_a",
    traits: PersonalityProfile.balanced().edit().set(11 /* Ambition */, 0.85).build() },
  { id: "npc_anika", name: "Anika", home: "loc_cafe",
    traits: PersonalityProfile.balanced().edit().set(7 /* Sociability */, 0.9).build() },
];

for (const r of residents) {
  town.spawnResident({
    id: r.id, displayName: r.name, homeLocationId: r.home,
    personality: r.traits,
    initialNeeds: { [1 /* Hunger */]: 55 },
  });
}
town.attachRandoms(town.randoms());

const director = new PlanningDirector(town);

// Location positions on the map (grid coordinates)
const locPositions: Record<string, { x: number; y: number }> = {
  loc_home_a: { x: 200, y: 150 },
  loc_cafe: { x: 450, y: 250 },
  loc_park: { x: 650, y: 120 },
  loc_bakery: { x: 350, y: 400 },
};

// Agent visual state
interface AgentVisual {
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
}

let agentVisuals = new Map<string, AgentVisual>();

class TownScene extends Phaser.Scene {
  constructor() {
    super({ key: "TownScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Draw location nodes
    for (const [locId, pos] of Object.entries(locPositions)) {
      const def = town.locations.tryGet(locId as never);
      const name = def ? def.definition.displayName : locId;
      const isOpen = def?.isOpen ?? true;

      this.add.rectangle(pos.x, pos.y, 140, 80,
        isOpen ? 0x0f3460 : 0x444455).setStrokeStyle(2, isOpen ? 0x7dd3fc : 0x666666);
      this.add.text(pos.x, pos.y - 28, name, {
        fontSize: "13px", color: "#7dd3fc", fontStyle: "bold",
      }).setOrigin(0.5);
      if (!isOpen) {
        this.add.text(pos.x + 55, pos.y - 38, "CLOSED", {
          fontSize: "10px", color: "#f87171",
        });
      }
    }

    // Draw connections
    const pairs = [
      ["loc_home_a", "loc_cafe"], ["loc_cafe", "loc_park"],
      ["loc_bakery", "loc_cafe"], ["loc_home_a", "loc_bakery"],
    ];
    for (const [a, b] of pairs) {
      const pa = locPositions[a!], pb = locPositions[b!];
      if (pa && pb) {
        this.add.line(0, 0, pa.x, pa.y, pb.x, pb.y, 0x334155).setOrigin(0);
      }
    }

    // Spawn agent circles
    for (const r of residents) {
      const mind = town.residents.mind(r.id as never);
      const state = town.agentsById.get(r.id);
      const homePos = locPositions[r.home] ?? { x: 300, y: 300 };

      const color = r.id === "npc_mira" ? 0xc084fc :
                     r.id === "npc_rohan" ? 0xfb923c : 0x34d399;

      const circle = this.add.circle(homePos.x + (Math.random() - 0.5) * 60,
        homePos.y + (Math.random() - 0.5) * 30, 12, color)
        .setInteractive({ useHandCursor: true });

      const label = this.add.text(circle.x, circle.y + 18, r.name, {
        fontSize: "11px", color: "#94a3b8",
      }).setOrigin(0.5);

      agentVisuals.set(r.id, { circle, label, targetX: circle.x, targetY: circle.y });

      circle.on("pointerdown", () => showInspector(r.id));
    }

    // Simulation tick loop — advance 5 sim minutes every ~500ms real time
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        town.advanceNeeds({ totalMinutes: 5 });
        town.clock.advance({ totalMinutes: 5 });
        director.tickAll();
        updateAgentTargets();
        updateHUD();
      },
    });
  }

  update(): void {
    // Smooth movement toward targets
    for (const [, vis] of agentVisuals) {
      const dx = vis.targetX - vis.circle.x;
      const dy = vis.targetY - vis.circle.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        vis.circle.x += dx * 0.05;
        vis.circle.y += dy * 0.05;
        vis.label.setPosition(vis.circle.x, vis.circle.y + 18);
      }
    }
  }
}

function updateAgentTargets(): void {
  for (const r of residents) {
    const vis = agentVisuals.get(r.id);
    if (!vis) continue;
    const state = town.agentsById.get(r.id);
    if (state?.currentLocationId) {
      const pos = locPositions[state.currentLocationId];
      if (pos) {
        vis.targetX = pos.x + (hashOffset(r.id) % 80 - 40);
        vis.targetY = pos.y + (hashOffset(r.id + "y") % 40 - 20);
      }
    }
  }
}

function hashOffset(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function updateHUD(): void {
  const t = town.clock.currentTime;
  const dayN = Math.floor(t.totalMinutes / 1440);
  const hh = String(Math.floor((t.totalMinutes % 1440) / 60)).padStart(2, "0");
  const mm = String(t.totalMinutes % 60).padStart(2, "0");
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayName = days[dayN % 7];
  const weatherNames = ["☀ Clear", "☁ Cloudy", "🌧 Rain", "⛈ HeavyRain"];
  const hud = document.getElementById("hud");
  if (hud) hud.textContent = `${dayName} ${hh}:${mm} | Day ${dayN} | ${weatherNames[town.weather.current]}`;
}

function showInspector(agentId: string): void {
  const panel = document.getElementById("inspector");
  if (!panel) return;
  const mind = town.residents.mind(agentId as never);

  let html = `<h3>${mind.displayName}</h3>`;

  html += `<div class="section"><div class="label">Current Goal</div><div class="value">${mind.currentGoalId ?? "—"}</div></div>`;

  html += `<div class="section"><div class="label">Needs</div>`;
  for (const n of mind.needs.all()) {
    const kindName = ["Hunger","Energy","Social","Fun","Comfort","Hygiene","Safety"][n.definition.kind];
    const color = n.current > 80 ? "#f87171" : n.current > 50 ? "#fbbf24" : "#34d399";
    html += `<div style="display:flex;justify-content:space-between"><span>${kindName}</span><span>${Math.round(n.current)}</span></div>`;
    html += `<div class="bar"><div class="fill" style="width:${n.current}%;background:${color}"></div></div>`;
  }
  html += `</div>`;

  html += `<div class="section"><div class="label">Mood</div><div class="value">${mind.emotionValence >= 0 ? "+" : ""}${mind.emotionValence.toFixed(2)} valence</div></div>`;

  html += `<div class="section"><div class="label">Money</div><div class="value">${mind.money.toFixed(2)}</div></div>`;

  html += `<div class="section"><div class="label">Memories</div>`;
  const store = town.memory.storeFor(mind.agent);
  const recent = store.all.slice(-3).reverse();
  if (recent.length === 0) html += `<div class="value">None yet</div>`;
  for (const m of recent)
    html += `<div class="value" style="font-size:12px">${m.summary} (${m.importance.toFixed(2)})</div>`;
  html += `</div>`;

  panel.innerHTML = html;
}

// ---- Phaser config ----
new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth - 340,
  height: window.innerHeight,
  parent: "game-container",
  backgroundColor: "#1a1a2e",
  scene: [TownScene],
});
