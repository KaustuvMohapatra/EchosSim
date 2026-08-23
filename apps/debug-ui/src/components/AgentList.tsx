import { useMemo, useState } from "react";
import type { AgentSummary } from "@echosim/inspector";

export interface AgentListProps {
  agents: readonly AgentSummary[];
  selectedId: string | undefined;
  onSelect(id: string): void;
}

export function AgentList({ agents, selectedId, onSelect }: AgentListProps) {
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  const locations = useMemo(
    () => [...new Set(agents.map((a) => a.locationName).filter(Boolean))] as string[],
    [agents],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (locationFilter && a.locationName !== locationFilter) return false;
      return true;
    });
  }, [agents, query, locationFilter]);

  return (
    <div style={styles.wrap} data-testid="agent-list">
      <div style={styles.header}>
        Residents
        <span style={{ float: "right", textTransform: "none" }}>
          {visible.length}/{agents.length}
        </span>
      </div>
      <div style={styles.controls}>
        <input
          data-testid="agent-search"
          placeholder="Search name…"
          style={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          data-testid="agent-location-filter"
          style={styles.select}
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Location</th>
            <th style={styles.th}>Goal</th>
            <th style={styles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((a) => (
            <tr
              key={a.id}
              onClick={() => onSelect(a.id)}
              data-testid={`agent-row-${a.id}`}
              style={{
                ...styles.row,
                ...(a.id === selectedId ? styles.selected : {}),
                cursor: "pointer",
              }}
            >
              <td style={{ ...styles.td, fontWeight: 600 }}>
                {a.name}
                <span
                  title={`valence ${a.emotionValence.toFixed(2)}`}
                  style={{
                    marginLeft: 6, fontSize: 10,
                    color: a.emotionValence < -0.05 ? "#f87171"
                      : a.emotionValence > 0.05 ? "#34d399" : "#94a3b8",
                  }}
                >
                  {a.emotionValence >= 0 ? "▲" : "▼"}
                </span>
              </td>
              <td style={styles.td}>{a.locationName ?? "—"}</td>
              <td style={styles.td}>{shortGoal(a.currentGoal)}</td>
              <td style={styles.td}>{a.currentAction ?? (a.status === "Idle" ? "—" : a.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortGoal(goal?: string): string {
  if (!goal) return "—";
  return goal.replace(/^goal_/, "");
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { overflowY: "auto", height: "100%" },
  header: {
    padding: "8px 10px", fontSize: 11, textTransform: "uppercase",
    letterSpacing: 0.5, color: "#7dd3fc", borderBottom: "1px solid #1e2a45",
    position: "sticky", top: 0, background: "#101828", zIndex: 1,
  },
  controls: { display: "flex", gap: 4, padding: 6 },
  input: {
    flex: 1, minWidth: 0, padding: "4px 8px", background: "#0b1220",
    border: "1px solid #1e2a45", color: "#e2e8f0", borderRadius: 4, fontSize: 12,
  },
  select: {
    padding: "4px", background: "#0b1220", color: "#e2e8f0",
    border: "1px solid #1e2a45", borderRadius: 4, fontSize: 11,
  },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: {
    textAlign: "left", color: "#64748b", fontWeight: 500,
    padding: "4px 8px", borderBottom: "1px solid #1e2a45",
  },
  td: { padding: "5px 8px", color: "#cbd5e1", whiteSpace: "nowrap" },
  row: {},
  selected: { background: "#1e293b" },
};
