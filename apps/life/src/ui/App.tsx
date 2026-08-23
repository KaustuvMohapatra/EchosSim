import { useLife } from "./useLife.js";

const WEATHER_ICON = ["☀", "☁", "🌧", "⛈"] as const;

export function App() {
  const { hostRef, snap, app, selected } = useLife();
  const t = snap?.time;
  const mult = app?.speed ?? 1;
  const feedback = app?.adapter.lastCommandFeedback ?? "";
  const camMode = app?.camera.mode ?? "life";

  const selectedSummary = snap?.agents.find((a) => a.id === selected);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={hostRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
                 display: "block", touchAction: "none" }} />

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

const styles: Record<string, React.CSSProperties> = {
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
