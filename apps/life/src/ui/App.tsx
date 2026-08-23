import { useLife } from "./useLife.js";

const WEATHER_ICON = ["☀", "☁", "🌧", "⛈"] as const;

export function App() {
  const { hostRef, snap, app } = useLife();
  const t = snap?.time;
  const mult = app?.speed ?? 1;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <CanvasHost canvasRef={hostRef} />

      {/* Top HUD — minimal, translucent (spec §111/§112). */}
      <div style={styles.hud}>
        <span style={{ fontWeight: 700, letterSpacing: 0.4, color: "#7dd3fc" }}>
          EchoSim Life
        </span>
        <span>{t ? `${t.dayName} ${t.hhmm} · Day ${t.day + 1}` : "…"}</span>
        <span aria-label="weather">
          {t ? WEATHER_ICON[min(3, weatherIndex(t.weather))] : ""}
        </span>
        <span style={{ color: "#94a3b8" }}>
          {snap ? `${snap.stats.residents} residents` : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button style={button(app?.running === false)} onClick={() => app?.togglePause()}>
          {app?.running ? "⏸" : "▶"}
        </button>
        {[1, 2, 4].map((m) => (
          <button key={m} style={button(mult === m)}
            onClick={() => app?.setSpeed(m as never)}>{m}×</button>
        ))}
      </div>

      {/* Bottom-left status strip. */}
      <div style={styles.status}>
        {snap
          ? `${snap.stats.activePlans} active plans · ${snap.stats.conversations} conversations · ${snap.stats.memories} memories`
          : "starting…"}
      </div>
    </div>
  );
}

function CanvasHost({ canvasRef }: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
}) {
  return (
    <canvas ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
               display: "block", touchAction: "none" }}
      onPointerDown={(e) => e.preventDefault()} />
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
  status: {
    position: "absolute", bottom: 10, left: 12,
    background: "rgba(13,18,32,.72)", border: "1px solid rgba(36,54,94,.5)",
    borderRadius: 8, padding: "5px 10px", fontSize: 11.5, color: "#8ea2bd",
    backdropFilter: "blur(6px)",
  },
};
