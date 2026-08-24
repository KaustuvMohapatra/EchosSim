import { useState } from "react";
import { useLife } from "./useLife.js";
import { characterCard } from "./hudModel.js";
import { mapLots, DISTRICTS } from "../world/map.js";
import { SocialActionType } from "@echosim/social";
import type { LifeApp } from "../app/bootstrap.js";
import type { LifeSnapshot } from "../simulation/LifeModeAdapter.js";

const WEATHER_ICON = ["☀", "☁", "🌧", "⛈"] as const;

interface MenuState { objectId: string; x: number; y: number }
interface MenuActions {
  close(): void;
  flash(text: string): void;
  select(id: string): void;
}

function moodIcon(mood: string): string {
  switch (mood) {
    case "Happy": case "Playful": case "Good": return "🙂";
    case "Angry": return "😠";
    case "Tense": case "Downbeat": return "🙁";
    case "Exhausted": return "🥱";
    default: return "😐";
  }
}

function iconFor(status: string): string {
  switch (status) {
    case "walking": return "🚶";
    case "active": return "▶";
    case "done": return "✓";
    case "failed": return "✗";
    case "cancelled": return "⃠";
    default: return "…";
  }
}

const SOCIAL_ITEMS: Array<[string, SocialActionType]> = [
  ["Greet", SocialActionType.Greet], ["Talk", SocialActionType.Chat],
  ["Compliment", SocialActionType.Compliment], ["Tease", SocialActionType.Tease],
  ["Help", SocialActionType.Help], ["Apologize", SocialActionType.Apologize],
];

const BUILD_ITEMS: Array<{ kind: "chair" | "sofa" | "table" | "bookshelf" | "bench" | "bed" | "desk" | "counter"; label: string }> = [
  { kind: "chair", label: "Chair" }, { kind: "sofa", label: "Sofa" },
  { kind: "table", label: "Table" }, { kind: "bookshelf", label: "Shelf" },
  { kind: "bench", label: "Bench" }, { kind: "bed", label: "Bed" },
  { kind: "desk", label: "Desk" }, { kind: "counter", label: "Counter" },
];

function renderMenu(
  menu: MenuState,
  app: LifeApp,
  snap: LifeSnapshot | null,
  act: MenuActions,
): React.ReactElement {
  const itemStyle = styles.menuItem;

  // NPC menu.
  if (menu.objectId.startsWith("agent:")) {
    const targetId = menu.objectId.slice(6);
    const summary = snap?.agents.find((s) => s.id === targetId);
    const coLocated = summary?.locationId === app.adapter.playerLocationId();
    const rel = app.inspector.getRelationships(app.adapter.playerId)
      .find((r) => r.to === targetId);

    const socialButtons = coLocated
      ? SOCIAL_ITEMS.map(([label, action]) => (
          <button key={label} style={itemStyle}
            data-context-menu="1"
            onClick={() => {
              app.player.enqueueSocial(targetId, summary?.name ?? targetId, action);
              act.close();
            }}>
            {label}
          </button>))
      : [(
          <button key="visit" style={itemStyle} data-context-menu="1"
            onClick={() => {
              const lot = summary?.locationId;
              if (lot) {
                const lotName = summary?.locationName ?? lot;
                app.player.enqueueVisitAndSocial(
                  targetId, summary?.name ?? targetId, SocialActionType.Greet, lot, lotName);
                act.flash(`Heading over to ${summary?.name ?? "them"}…`);
              }
              act.close();
            }}>
            Walk over &amp; Greet
          </button>
        )];

    return (
      <div style={styles.menu} data-context-menu="1">
        <div style={styles.menuTitle}>
          {summary?.name}{rel && rel.label !== "Stranger" ? ` · ${rel.label}` : ""}
        </div>
        {socialButtons}
        {rel && (
          <div style={{ padding: "3px 9px", fontSize: 11, color: "#64748b" }}>
            affinity {rel.affinity >= 0 ? "+" : ""}{rel.affinity.toFixed(2)}
          </div>
        )}
      </div>
    );
  }

  // Built-object menu (build mode).
  if (menu.objectId.startsWith("built:")) {
    const objectId = menu.objectId.slice(6);
    return (
      <div style={styles.menu} data-context-menu="1">
        <div style={styles.menuTitle}>Furniture</div>
        <button style={itemStyle} data-context-menu="1"
          onClick={() => { app.build.rotate(objectId); act.close(); }}>Rotate</button>
        <button style={itemStyle} data-context-menu="1"
          onClick={() => { app.build.remove(objectId); act.flash("Removed."); act.close(); }}>
          Delete
        </button>
      </div>
    );
  }

  // Placed fixture menu.
  return (
    <div style={styles.menu} data-context-menu="1">
      <div style={styles.menuTitle}>
        {app.interactions.objectDef(menu.objectId)?.objectId.replace(/_/g, " ")}
      </div>
      {app.interactions.affordancesOf(menu.objectId).map((a) => (
        <button key={a.id} style={itemStyle} data-context-menu="1"
          onClick={() => {
            const r = app.interactions.use(menu.objectId, a.id);
            if (!r.ok) act.flash(r.feedback);
            act.close();
          }}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const life = useLife();
  const { hostRef, snap, app, selected, menu, closeMenu } = life;
  const [flash, setFlash] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const t = snap?.time;
  const mult = app?.speed ?? 1;
  const feedback = flash ?? app?.adapter.lastCommandFeedback ?? "";
  const camMode = app?.camera.mode ?? "life";

  const selectedSummary = snap?.agents.find((a) => a.id === selected);
  const playerSnap = app ? app.inspector.getAgent(app.adapter.playerId) : undefined;
  const playerCard = playerSnap ? characterCard(playerSnap) : null;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).dataset.contextMenu) closeMenu();
      }}>
      <canvas ref={hostRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                 display: "block", touchAction: "none" }} />

      {/* World map overlay (Sprint 45) */}
      {showMap && (
        <div style={styles.mapWrap} data-testid="world-map"
          onClick={() => setShowMap(false)}>
          <div style={styles.mapCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.menuTitle}>Town Map — click a lot to travel</div>
            <div style={{ position: "relative", width: 520, height: 380,
                          background: "#0d1526", border: "1px solid #1e2a45",
                          borderRadius: 8 }}>
              {mapLots().map((l) => (
                <button key={l.locationId}
                  title={`${l.locationId} — ${l.district?.name ?? "?"}`}
                  onClick={() => {
                    app?.player.enqueueMove(l.locationId, l.locationId);
                    setFlash(`Travelling to ${l.locationId}…`);
                    setShowMap(false);
                  }}
                  style={{
                    position: "absolute",
                    left: `${l.x * 100}%`, top: `${l.z * 100}%`,
                    width: `${Math.max(0.05, l.width) * 100}%`,
                    height: `${Math.max(0.05, l.depth) * 100}%`,
                    background: (l.district?.tint ?? "#64748b") + "33",
                    border: `1px solid ${l.district?.tint ?? "#64748b"}`,
                    borderRadius: 4, cursor: "pointer", fontSize: 9.5,
                    color: "#cbd5e1", overflow: "hidden",
                  }}>
                  {l.locationId.replace(/^(apt|loc)_/, "")}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, display: "flex", gap: 12 }}>
              {DISTRICTS.map((d) => (
                <span key={d.id} style={{ fontSize: 10.5, color: d.tint }}>
                  ■ {d.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div style={styles.hud}>
        <span style={{ fontWeight: 700, letterSpacing: 0.4, color: "#7dd3fc" }}>
          EchoSim Life
        </span>
        <span>{t ? `${t.dayName} ${t.hhmm} · Day ${t.day + 1}` : "…"}</span>
        <span>{t ? WEATHER_ICON[Math.min(3, weatherIndex(t.weather))] : ""}</span>
        <button style={button(camMode !== "life")} title="Cycle camera (C)"
          onClick={() => app?.camera.cycleMode()}>
          {camMode === "life" ? "🎥 orbit" : camMode === "follow" ? "🧍 follow" : "👁 close"}
        </button>
        <span style={{ flex: 1 }} />
        <button style={button(app?.buildMode ?? false)}
        <button style={button(false)} onClick={() => setShowMap(true)}>?? Map</button>
          onClick={() => app?.setBuildMode(!app.buildMode)}>
          🔨 Build
        </button>
        <button style={button(app?.running === false)} onClick={() => app?.togglePause()}>
          {app?.running ? "⏸" : "▶"}
        </button>
        {[1, 2, 4].map((m) => (
          <button key={m} style={button(mult === m)}
            onClick={() => app?.setSpeed(m as never)}>{m}×</button>
        ))}
      </div>

      {/* Context menus */}
      {menu && app && renderMenu(menu, app, snap ?? null, {
        close: closeMenu,
        flash: setFlash,
        select: setSelected,
      })}

      {/* Selection card */}
      {selectedSummary && (
        <div style={styles.card}>
          <b style={{ color: "#dbe7f5" }}>{selectedSummary.name}</b>
          <div style={{ color: "#8ea2bd", marginTop: 2 }}>
            {selectedSummary.locationName ?? ""} ·{" "}
            {(selectedSummary.currentGoal ?? "idle").replace(/^goal_/, "")}
          </div>
        </div>
      )}

      {/* Character card */}
      {playerCard && (
        <div style={styles.charCard} data-testid="character-card">
          <div style={styles.charHead}>
            <b style={{ color: "#fbbf24" }}>{playerCard.name}</b>
            <span>{moodIcon(playerCard.mood)} {playerCard.mood}</span>
            <span style={{ marginLeft: "auto", color: "#a7f3d0" }}>
              §{playerCard.money.toFixed(0)}
            </span>
          </div>
          {playerCard.needs.map((n) => (
            <div key={n.key} style={styles.needRow} title={`${n.key} — ${n.level}`}>
              <span style={styles.needName}>{n.key.slice(0, 4)}</span>
              <div style={styles.needTrack}>
                <div style={{
                  width: `${n.fill * 100}%`, height: "100%", borderRadius: 2,
                  background: n.level === "critical" ? "#ef4444"
                    : n.level === "warn" ? "#f59e0b" : "#34d399",
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action queue + autonomy */}
      <div style={styles.queue} data-testid="action-queue">
        <div style={styles.queueHead}>
          <span>Actions</span>
          <select aria-label="autonomy" value={app?.player.autonomy ?? "assisted"}
            onChange={(e) => app?.player.setAutonomy(
              e.target.value as "full-manual" | "assisted" | "autonomous")}>
            <option value="full-manual">manual</option>
            <option value="assisted">assisted</option>
            <option value="autonomous">auto</option>
          </select>
          {app && app.player.items().length > 0 && (
            <button style={styles.miniBtn} onClick={() => app.player.cancelAll()}>clear</button>
          )}
        </div>
        {(app?.player.items() ?? []).length === 0
          ? <div style={{ color: "#475569", padding: "2px 4px" }}>Idle</div>
          : app!.player.items().map((q) => (
              <div key={q.id} style={styles.queueItem}>
                <span>{iconFor(q.status)} {q.label}</span>
                <button style={styles.miniBtn}
                  onClick={() => app.player.cancel(q.id)}>✕</button>
              </div>
            ))}
      </div>

      {/* Build catalog */}
      {app?.buildMode && (
        <div style={styles.buildPanel} data-testid="build-panel">
          <div style={styles.menuTitle}>Build — pick, click lot</div>
          {BUILD_ITEMS.map((it) => (
            <button key={it.kind}
              style={{ ...styles.menuItem,
                ...(app.buildSelection === it.kind
                  ? { background: "#1e3a5f", color: "#7dd3fc" } : {}) }}
              onClick={() => app.setBuildSelection(
                app.buildSelection === it.kind ? null : it.kind)}>
              {it.label}
            </button>
          ))}
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <button style={styles.miniBtn} disabled={!app.build.canUndo}
              onClick={() => app.build.undo()}>↶</button>
            <button style={styles.miniBtn} disabled={!app.build.canRedo}
              onClick={() => app.build.redo()}>↷</button>
          </div>
        </div>
      )}

      {/* Feedback + status */}
      {feedback && <div style={styles.feedback}>{feedback}</div>}
      <div style={styles.status}>
        {snap
          ? `${snap.stats.activePlans} plans · ${snap.stats.conversations} chats · ${snap.stats.memories} memories`
          : "starting…"}
        <span style={{ marginLeft: 10, color: "#475569" }}>
          click lots to walk · F follow · C camera
        </span>
      </div>
    </div>
  );
}

function button(active: boolean | undefined): React.CSSProperties {
  return {
    background: active ? "#1e3a5f" : "rgba(22,33,62,.85)",
    border: "1px solid #24365e", color: active ? "#7dd3fc" : "#94a3b8",
    borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontSize: 12,
  };
}

function weatherIndex(name: string): number {
  return ["Clear", "Cloudy", "Rain", "HeavyRain"].indexOf(name);
}

const styles: Record<string, React.CSSProperties> = {
  hud: {
    position: "absolute", top: 10, left: 12, right: 12,
    display: "flex", gap: 14, alignItems: "center",
    background: "rgba(13,18,32,.78)", border: "1px solid rgba(36,54,94,.6)",
    borderRadius: 10, padding: "7px 12px", backdropFilter: "blur(6px)",
  },
  card: {
    position: "absolute", top: 58, right: 12, minWidth: 180,
    background: "rgba(13,18,32,.82)", border: "1px solid rgba(36,54,94,.6)",
    borderRadius: 10, padding: "8px 11px", fontSize: 12.5,
    backdropFilter: "blur(6px)",
  },
  charCard: {
    position: "absolute", left: 12, bottom: 42, width: 200,
    background: "rgba(13,18,32,.82)", border: "1px solid rgba(36,54,94,.6)",
    borderRadius: 10, padding: "8px 11px", backdropFilter: "blur(6px)",
  },
  charHead: {
    display: "flex", gap: 7, alignItems: "center", marginBottom: 6, fontSize: 12.5,
  },
  needRow: { display: "flex", gap: 6, alignItems: "center", margin: "3px 0" },
  needName: { width: 30, fontSize: 10, color: "#8ea2bd" },
  needTrack: {
    flex: 1, height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden",
  },
  queue: {
    position: "absolute", right: 12, bottom: 10, width: 230,
    background: "rgba(13,18,32,.8)", border: "1px solid rgba(36,54,94,.6)",
    borderRadius: 10, padding: 8, fontSize: 12, backdropFilter: "blur(6px)",
  },
  queueHead: { display: "flex", gap: 6, alignItems: "center", marginBottom: 4 },
  miniBtn: {
    background: "transparent", border: "1px solid #24365e", color: "#94a3b8",
    borderRadius: 4, fontSize: 10.5, padding: "1px 5px", cursor: "pointer",
  },
  queueItem: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "2px 4px", color: "#cbd5e1",
  },
  menu: {
    position: "absolute", zIndex: 30, minWidth: 140,
    background: "rgba(13,18,32,.94)", border: "1px solid rgba(36,54,94,.7)",
    borderRadius: 9, padding: 4, backdropFilter: "blur(8px)",
    display: "flex", flexDirection: "column", gap: 2,
  },
  menuTitle: {
    fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.6,
    color: "#64748b", padding: "3px 8px",
  },
  menuItem: {
    textAlign: "left", background: "transparent", border: "none",
    color: "#dbe7f5", padding: "5px 9px", borderRadius: 6,
    cursor: "pointer", fontSize: 12.5,
  },
  buildPanel: {
    position: "absolute", top: 58, left: 12, width: 150,
    background: "rgba(13,18,32,.9)", border: "1px solid rgba(36,54,94,.7)",
    borderRadius: 10, padding: 6, backdropFilter: "blur(8px)",
    display: "flex", flexDirection: "column", gap: 2,
  },
  mapWrap: {
    position: "absolute", inset: 0, zIndex: 40,
    background: "rgba(5,8,15,.72)", display: "flex",
    alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)",
  },
  mapCard: {
    background: "#101828", border: "1px solid rgba(36,54,94,.8)",
    borderRadius: 12, padding: 14,
  },
  feedback: {
    position: "absolute", bottom: 150, left: 12, right: 260,
    color: "#fde68a", fontSize: 12, textShadow: "0 1px 2px #000",
  },
  status: {
    position: "absolute", bottom: 10, left: 12,
    background: "rgba(13,18,32,.72)", border: "1px solid rgba(36,54,94,.5)",
    borderRadius: 8, padding: "5px 10px", fontSize: 11.5, color: "#8ea2bd",
    backdropFilter: "blur(6px)",
  },
};

