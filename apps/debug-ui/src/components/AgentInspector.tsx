import type { AgentInspectorSnapshot } from "@echosim/inspector";
import { Section, Empty } from "./UtilityPanel.js";
import { UtilityRow } from "./UtilityPanel.js";
import { PlanPanel } from "./PlanPanel.js";
import { MemoriesPanel, RelationshipsPanel, BeliefsPanel } from "./SocialPanels.js";

export function AgentInspector({ agent }: { agent: AgentInspectorSnapshot }) {
  return (
    <div data-testid="agent-inspector" style={{ overflowY: "auto", height: "100%", padding: 10 }}>
      <div style={styles.nameRow}>
        <span style={styles.name}>{agent.summary.name}</span>
        <span style={styles.sub}>
          {agent.summary.locationName ?? "unplaced"} · {agent.summary.status}
          {agent.job ? ` · ${agent.job.title}` : ""}
        </span>
      </div>

      <Section title="Current goal">
        <div style={styles.value} data-testid="current-goal">
          {agent.committedGoalId ?? "— none —"}
        </div>
      </Section>

      <NeedsPanel needs={agent.needs} emotion={agent.emotionValence} />
      <PlanPanel plan={agent.plan} />
      <UtilityRow utility={agent.utility} />
      <MemoriesPanel memories={agent.memories} />
      <RelationshipsPanel relationships={agent.relationships} />
      <BeliefsPanel beliefs={agent.beliefs} />

      <Section title="Personality">
        <div style={styles.grid2}>
          {agent.traits.map((t) => (
            <div key={t.name} style={styles.trait}>
              <span>{t.name}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{t.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Timers / suppressions">
        {agent.suppressions.length === 0 ? <Empty /> : (
          agent.suppressions.map((s) => (
            <div key={s.goal} style={styles.rowBetween}>
              <span>{s.goal}</span>
              <span>until {fmtMinutes(s.untilMinutes)}</span>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function NeedsPanel({ needs, emotion }: {
  needs: AgentInspectorSnapshot["needs"]; emotion: number;
}) {
  return (
    <Section title="Needs">
      {needs.map((n) => (
        <div key={n.kind} style={{ marginBottom: 4 }}>
          <div style={styles.rowBetween}>
            <span>
              {n.name}
              {n.critical ? " ⚠" : n.interrupting ? " ❗" : ""}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(n.value)}</span>
          </div>
          <div style={styles.barTrack}>
            <div style={{
              ...styles.barFill,
              width: `${n.value}%`,
              background: n.critical ? "#ef4444"
                : n.value > 55 ? "#f59e0b" : "#22c55e",
            }} />
          </div>
        </div>
      ))}
      <div style={styles.rowBetween}>
        <span>Mood</span>
        <span style={{ color: emotion < -0.05 ? "#f87171" : emotion > 0.05 ? "#34d399" : "#94a3b8" }}>
          {emotion >= 0 ? "+" : ""}{emotion.toFixed(2)}
        </span>
      </div>
    </Section>
  );
}

function fmtMinutes(total: number): string {
  const hh = String(Math.floor((total % 1440) / 60)).padStart(2, "0");
  const mm = String(Math.floor(total % 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

const styles: Record<string, React.CSSProperties> = {
  nameRow: { marginBottom: 10 },
  name: { fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginRight: 8 },
  sub: { fontSize: 11, color: "#64748b" },
  value: { padding: "4px 10px", color: "#cbd5e1", fontSize: 13 },
  rowBetween: {
    display: "flex", justifyContent: "space-between",
    padding: "2px 10px", fontSize: 12, color: "#94a3b8",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 8px", padding: 8 },
  trait: { display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b" },
  barTrack: { height: 5, background: "#1e293b", borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%" },
};
