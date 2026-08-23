import type {
  AgentInspectorSnapshot, BeliefSnapshot, MemoryInspectorEntry,
  RelationshipSnapshot,
} from "@echosim/inspector";
import { Section, Empty } from "./UtilityPanel.js";

export function MemoriesPanel({ memories }: { memories: readonly MemoryInspectorEntry[] }) {
  return (
    <Section title="Memory (recent)">
      {memories.length === 0 ? <Empty /> : (
        <table style={styles.table}>
          <tbody>
            {memories.slice(0, 12).map((m) => (
              <tr key={m.id} title={`${m.type} · conf ${m.confidence.toFixed(2)} · ${m.source}`}>
                <td style={styles.td}>{m.summary}</td>
                <td style={{
                  ...styles.tdRight,
                  color: m.valence < 0 ? "#f87171" : "#94a3b8",
                }}>
                  {m.importance.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function RelationshipsPanel({ relationships }: {
  relationships: readonly RelationshipSnapshot[];
}) {
  return (
    <Section title="Relationships">
      {relationships.length === 0 ? <Empty /> : (
        <table style={styles.table}>
          <thead>
            <tr>
              {["Who", "Label", "Aff", "Trust", "Grv"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {relationships.map((r) => (
              <tr key={r.to}>
                <td style={styles.td}>{short(r.to)}</td>
                <td style={{ ...styles.td, color: labelColor(r.label) }}>{r.label}</td>
                <td style={numTd(r.affinity)}>{r.affinity.toFixed(2)}</td>
                <td style={numTd(r.trust)}>{r.trust.toFixed(2)}</td>
                <td style={numTd(-r.grievance)}>{r.grievance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function BeliefsPanel({ beliefs }: { beliefs: readonly BeliefSnapshot[] }) {
  return (
    <Section title="Beliefs">
      {beliefs.length === 0 ? <Empty /> : (
        <table style={styles.table}>
          <thead>
            <tr>
              {["About", "Stance", "Conf", "Hops"].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {beliefs.map((b) => (
              <tr key={`${b.subjectKey}|${b.predicate}`}>
                <td style={styles.td}>
                  {short(b.subjectKey)}.{b.predicate}
                  {b.hopCount === 0 ? "" : " 🗣"}
                  {b.sourceAgent !== undefined
                    ? <span style={{ color: "#475569" }}> via {short(b.sourceAgent)}</span>
                    : null}
                </td>
                <td style={numTd(b.stance)}>{b.stance.toFixed(2)}</td>
                <td style={styles.td}>{b.confidence.toFixed(2)}</td>
                <td style={styles.td}>{b.hopCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function short(id: string): string {
  return id.replace(/^npc_/, "");
}

function numTd(v: number): React.CSSProperties {
  return {
    padding: "3px 6px", fontSize: 11,
    fontVariantNumeric: "tabular-nums",
    color: v < -0.05 ? "#f87171" : v > 0.05 ? "#34d399" : "#94a3b8",
  };
}

function labelColor(label: string): string {
  switch (label) {
    case "Enemy": case "Rival": return "#f87171";
    case "CloseFriend": case "Friend": case "Crush": return "#34d399";
    default: return "#94a3b8";
  }
}

const styles: Record<string, React.CSSProperties> = {
  table: { width: "100%", borderCollapse: "collapse", padding: "0 6px" },
  th: {
    textAlign: "left", color: "#475569", fontWeight: 500, fontSize: 10,
    padding: "1px 6px",
  },
  td: { padding: "3px 6px", fontSize: 11, color: "#cbd5e1" },
  tdRight: {
    padding: "3px 6px", fontSize: 11, textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
};
