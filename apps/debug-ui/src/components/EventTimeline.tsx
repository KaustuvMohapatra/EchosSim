import { useMemo, useState } from "react";
import type { SimEventEntry, SimEventKind } from "@echosim/inspector";

export interface EventTimelineProps {
  events: readonly SimEventEntry[];
  paused: boolean;
  onTogglePause(): void;
  agentNames: ReadonlyMap<string, string>;
}

const KIND_COLORS: Record<SimEventKind, string> = {
  movement: "#64748b",
  plan: "#7dd3fc",
  step: "#475569",
  weather: "#a5b4fc",
  conversation: "#fbbf24",
  social: "#f472b6",
  other: "#94a3b8",
};

export function EventTimeline({ events, paused, onTogglePause, agentNames }: EventTimelineProps) {
  const [follow, setFollow] = useState(true);
  const [kindFilter, setKindFilter] = useState<"" | SimEventKind>("");
  const [textFilter, setTextFilter] = useState("");

  const visible = useMemo(() => {
    return events.filter((e) => {
      if (kindFilter && e.kind !== kindFilter) return false;
      if (textFilter) {
        const q = textFilter.toLowerCase();
        const name = e.agent ? agentNames.get(e.agent)?.toLowerCase() ?? "" : "";
        if (!e.text.toLowerCase().includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [events, kindFilter, textFilter, agentNames]);

  return (
    <div data-testid="event-timeline" style={styles.wrap}>
      <div style={styles.header}>
        <span>
          Timeline <span style={{ color: "#475569" }}>({visible.length})</span>
        </span>
        <span style={{ display: "flex", gap: 6, alignItems: "center", textTransform: "none" }}>
          <input
            data-testid="timeline-search"
            placeholder="filter…"
            style={styles.input}
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
          <select
            data-testid="timeline-kind"
            style={styles.select}
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as "" | SimEventKind)}
          >
            <option value="">all</option>
            {Object.keys(KIND_COLORS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <label style={{ fontSize: 11, color: "#64748b" }}>
            <input type="checkbox" checked={follow} onChange={() => setFollow(!follow)} /> follow
          </label>
          <button style={styles.button} onClick={onTogglePause} data-testid="timeline-pause">
            {paused ? "▶ resume" : "⏸ pause"}
          </button>
        </span>
      </div>
      <div ref={(el) => { if (el && follow) el.scrollTop = el.scrollHeight; }}
        style={styles.scroller}>
        {visible.map((e) => (
          <div key={e.seq} style={styles.row}>
            <span style={styles.time}>{fmtTime(e.atMinutes)}</span>
            <span style={{ ...styles.kind, color: KIND_COLORS[e.kind] }}>{e.kind}</span>
            <span style={styles.text}>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtTime(total: number): string {
  const day = Math.floor(total / 1440);
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, "0");
  const mm = String(Math.floor(total % 60)).padStart(2, "0");
  return `D${day + 1} ${hh}:${mm}`;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex", flexDirection: "column", height: "100%",
    borderTop: "1px solid #1e2a45", background: "#0b1220",
  },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "6px 10px", fontSize: 11, textTransform: "uppercase",
    letterSpacing: 0.5, color: "#7dd3fc", borderBottom: "1px solid #1e2a45",
  },
  scroller: { flex: 1, overflowY: "auto", padding: "2px 0" },
  row: { display: "flex", gap: 8, padding: "1px 10px", fontSize: 12 },
  time: { color: "#475569", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  kind: { width: 84, flexShrink: 0 },
  text: { color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  input: {
    width: 110, padding: "3px 6px", background: "#0b1220",
    border: "1px solid #1e2a45", color: "#e2e8f0", borderRadius: 4, fontSize: 11,
  },
  select: {
    padding: "3px", background: "#0b1220", color: "#e2e8f0",
    border: "1px solid #1e2a45", borderRadius: 4, fontSize: 11,
  },
  button: {
    background: "#16213e", border: "1px solid #24365e", color: "#7dd3fc",
    borderRadius: 4, fontSize: 11, padding: "3px 8px", cursor: "pointer",
  },
};
