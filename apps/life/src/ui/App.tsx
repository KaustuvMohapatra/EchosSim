import { useState } from "react";
import { useLife } from "./useLife.js";

const WEATHER_ICON = ["☀", "☁", "🌧", "⛈"] as const;

export function App() {
  const life = useLife();
  const { hostRef, snap, app, selected, menu, closeMenu } = life;
  const [flash, setFlash] = useState<string | null>(null);
  const t = snap?.time;
  const mult = app?.speed ?? 1;
  const feedback = flash ?? app?.adapter.lastCommandFeedback ?? "";
  const camMode = app?.camera.mode ?? "life";

  const selectedSummary = snap?.agents.find((a) => a.id === selected);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).dataset.contextMenu) closeMenu();
      }}>
      <canvas ref={hostRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                 display: "block", touchAction: "none" }} />

      {/* Object context menu (Sprint 38). */}
      {menu && app && (
        <div style={{ ...styles.menu, left: menu.x, top: menu.y }}
          data-context-menu="1"
          data-testid="object-menu">
          <div style={styles.menuTitle}>
            {app.interactions.objectDef(menu.objectId)?.objectId.replace(/_/g, " ")}
          </div>
          {app.interactions.affordancesOf(menu.objectId).map((a) => (
            <button key={a.id} style={styles.menuItem}
              data-context-menu="1"
              onClick={() => {
                const r = app.interactions.use(menu.objectId, a.id);
                if (!r.ok) setFlash(r.feedback);
                closeMenu();
              }}>
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Top HUD */}
      <div style={styles.hud}>
        <span style={{ fontWeight: 700, letterSpacing: 0.4, color: "#7dd3fc" }}>
          EchoSim Life
        </span>
        <span>{t ? `${t.dayName} ${t.hhmm} · Day ${t.day + 1}` : "…"}</span>
        <span aria-label="weather">
          {t ? WEATHER_ICON[min(3, weatherIndex(t.weather))] : ""}
        </span>
        <button style={button(camMode !== "life")} title="Cycle camera (C)"
          onClick={() => app?.camera.cycleMode()}>
          {camMode === "life" ? "🎥 orbit" : camMode === "follow" ? "🧍 follow" : "👁 shoulder"}
        </button>
        <span style={{ flex: 1 }} />
        <button style={button(app?.running === false)} onClick={() => app?.togglePause()}>
          {app?.running ? "⏸" : "▶"}
        </button>
        {[1, 2, 4].map((m) => (
          <button key={m} style={button(mult === m)}
            onClick={() => app?.setSpeed(m as never)}>{m}×</button>
        ))}
      </div>

      {/* Selection card */}
      {selectedSummary && (
        <div style={styles.card}>
          <b style={{ color: "#dbe7f5" }}>{selectedSummary.name}</b>
          <div style={{ color: "#8ea2bd", marginTop: 2 }}>
            {selectedSummary.locationName ?? ""} ·{" "}
            {(selectedSummary.currentGoal ?? "idle").replace(/^goal_/, "")}
          </div>
          {selectedSummary.currentAction && (
            <div style={{ color: "#64748b" }}>→ {selectedSummary.currentAction}</div>
          )}
        </div>
      )}

      {/* Action queue + autonomy (Sprint 39) */}
      <div style={styles.queue} data-testid="action-queue">
        <div style={styles.queueHead}>
          <span>Actions</span>
          <select aria-label="autonomy" style={styles.select as React.CSSProperties}
            value={app?.player.autonomy ?? "assisted"}
            onChange={(e) =>
              app?.player.setAutonomy(e.target.value as "full-manual" | "assisted" | "autonomous")}>
            <option value="full-manual">manual</option>
            <option value="assisted">assisted</option>
            <option value="autonomous">auto</option>
          </select>
          {app && app.player.items().length > 0 && (
            <button style={styles.miniBtn}
              onClick={() => app.player.cancelAll()}>clear</button>
          )}
        </div>
        {(app?.player.items() ?? []).length === 0 ? (
          <div style={{ color: "#475569", padding: "2px 4px" }}>Idle</div>
        ) : (
          app!.player.items().map((q) => (
            <div key={q.id} style={styles.queueItem}>
              <span>{iconFor(q.status)} {q.label}</span>
              <button style={styles.miniBtn} title="cancel"
                onClick={() => app?.player.cancel(q.id)}>✕</button>
            </div>
          ))
        )}
      </div>

      {/* Feedback strip */}
      {feedback && <div style={styles.feedback}>{feedback}</div>}

      {/* Status */}
      <div style={styles.status}>
        {snap
          ? `${snap.stats.activePlans} active plans · ${snap.stats.conversations} conversations`
          : "starting…"}
        <span style={{ marginLeft: 10, color: "#475569" }}>
          click ground-lots to walk · F follow · C camera
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
function min(a: number, b: number): number { return Math.min(a, b); }

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

const styles: Record<string, React.CSSProperties> = {
  queue: {
    position: "absolute", right: 12, bottom: 10, width: 230,
    background: "rgba(13,18,32,.8)", border: "1px solid rgba(36,54,94,.6)",
    borderRadius: 10, padding: 8, fontSize: 12, backdropFilter: "blur(6px)",
  },
  queueHead: { display: "flex", gap: 6, alignItems: "center", marginBottom: 4 },
  select: {
    background: "#16213e", border: "1px solid #24365e", color: "#94a3b8",
    borderRadius: 5, fontSize: 11, padding: "2px 4px", flex: 1,
  },
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
  hud: {
    position: "absolute", top: 10, left: 12, right: 12,
    display: "flex", gap: 14, alignItems: "center",
    background: "rgba(13,18,32,.78)", border: "1px solid rgba(36,54,94,.6)",
    borderRadius: 10, padding: "7px 12px",
    backdropFilter: "blur(6px)",
  },
  card: {
    position: "absolute", top: 58, right: 12, minWidth: 180,
    background: "rgba(13,18,32,.82)", border: "1px solid rgba(36,54,94,.6)",
    borderRadius: 10, padding: "8px 11px", fontSize: 12.5,
    backdropFilter: "blur(6px)",
  },
  feedback: {
    position: "absolute", bottom: 42, left: 12, right: 12,
    color: "#fde68a", fontSize: 12,
    textShadow: "0 1px 2px #000",
  },
  status: {
    position: "absolute", bottom: 10, left: 12,
    background: "rgba(13,18,32,.72)", border: "1px solid rgba(36,54,94,.5)",
    borderRadius: 8, padding: "5px 10px", fontSize: 11.5, color: "#8ea2bd",
    backdropFilter: "blur(6px)",
  },
};
