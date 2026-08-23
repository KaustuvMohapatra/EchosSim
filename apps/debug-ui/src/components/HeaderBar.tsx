import type { SimHost, UiSnapshot } from "../sim/SimHost.js";

export function HeaderBar({ host, snap }: { host: SimHost; snap: UiSnapshot }) {
  const speeds = [1, 2, 4, 8, 16] as const;
  return (
    <div style={styles.wrap}>
      <span style={styles.title}>EchoSim Debug</span>

      <span style={styles.time} data-testid="clock">
        {snap.time.dayName} {snap.time.hhmm} · Day {snap.time.day + 1} · {snap.time.weather}
      </span>

      <span style={{ flex: 1 }} />

      <button style={btn(host.paused)} onClick={() => host.toggle()} data-testid="btn-toggle">
        {host.paused ? "▶ Run" : "⏸ Pause"}
      </button>
      <button style={btn(false)} onClick={() => host.step(10)} data-testid="btn-step">Step</button>
      <span style={styles.group}>
        {speeds.map((s) => (
          <button key={s} style={speedBtn(host.speed === s)}
            onClick={() => host.setSpeed(s)} data-testid={`btn-speed-${s}`}>
            {s}×
          </button>
        ))}
      </span>
      <button style={btn(false)} onClick={() => host.jumpMinutes(60)}>+1h</button>
      <button style={btn(false)} onClick={() => host.jumpMinutes(1440)} data-testid="btn-jump-day">+1d</button>
      <select
        style={styles.select}
        value=""
        onChange={(e) => { const v = Number(e.target.value) as 0 | 1 | 2 | 3; if (!Number.isNaN(v)) host.forceWeather(v); }}
        data-testid="weather-select"
      >
        <option value="" disabled>Weather…</option>
        <option value="0">Clear</option>
        <option value="1">Cloudy</option>
        <option value="2">Rain</option>
        <option value="3">HeavyRain</option>
      </select>
    </div>
  );
}

function btn(active: boolean): React.CSSProperties {
  return {
    background: active ? "#1e3a5f" : "#16213e",
    border: "1px solid #24365e", color: "#7dd3fc", borderRadius: 4,
    fontSize: 12, padding: "4px 10px", cursor: "pointer",
  };
}

function speedBtn(active: boolean): React.CSSProperties {
  return {
    ...btn(active),
    padding: "4px 6px",
    color: active ? "#fbbf24" : "#64748b",
  };
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex", gap: 8, alignItems: "center",
    padding: "8px 12px", borderBottom: "1px solid #1e2a45", background: "#101828",
  },
  title: { fontWeight: 700, color: "#7dd3fc", letterSpacing: 0.5 },
  time: { color: "#cbd5e1", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  group: { display: "flex", gap: 2 },
  select: {
    background: "#16213e", border: "1px solid #24365e", color: "#94a3b8",
    borderRadius: 4, fontSize: 11, padding: "4px",
  },
};
