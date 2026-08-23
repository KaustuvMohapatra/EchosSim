import { useSim } from "./api/useSim.js";
import { HeaderBar } from "./components/HeaderBar.js";
import { AgentList } from "./components/AgentList.js";
import { AgentInspector } from "./components/AgentInspector.js";
import { EventTimeline } from "./components/EventTimeline.js";

export default function App() {
  const { host, snap, selectedId, setSelectedId } = useSim(7001n);

  const agentNames = new Map(snap.agents.map((a) => [a.id, a.name]));
  const stats = snap.stats;

  return (
    <div style={styles.app}>
      <HeaderBar host={host} snap={snap} />

      <div style={styles.main}>
        {/* Left: agents */}
        <div style={styles.left}>
          <AgentList
            agents={snap.agents}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Center: inspector */}
        <div style={styles.center}>
          {snap.selected ? (
            <AgentInspector agent={snap.selected} />
          ) : (
            <div style={{ padding: 20, color: "#475569" }}>
              Select a resident to inspect.
            </div>
          )}
        </div>

        {/* Right: town stats */}
        <div style={styles.right}>
          <div style={styles.statsTitle}>Town</div>
          <Stat label="Residents" value={stats.residents} />
          <Stat label="Active plans" value={stats.activePlans} />
          <Stat label="Plans ✓" value={stats.plansSucceeded} />
          <Stat label="Plans ✗" value={stats.plansFailed} />
          <Stat label="Replans" value={stats.replans} />
          <Stat label="Memories" value={stats.memories} />
          <Stat label="Relationships" value={stats.relationships} />
          <Stat label="Beliefs" value={stats.beliefs} />
          <Stat label="Conversations" value={stats.conversations} />
          <div style={{ flex: 1 }} />
          <div style={styles.manual}>
            Manual commands: {host.manualCommands.length}
            {host.manualCommands.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {host.manualCommands.slice(-4).map((c, i) => (
                  <div key={i} style={{ fontSize: 10, color: "#475569" }}>
                    {c.command} {c.detail ?? ""} @D{Math.floor(c.atSimMinutes / 1440) + 1}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: timeline */}
      <div style={styles.timeline}>
        <EventTimeline
          events={snap.events}
          paused={snap.paused}
          onTogglePause={() => host.toggle()}
          agentNames={agentNames}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.statRow}>
      <span>{label}</span>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: "flex", flexDirection: "column", height: "100vh",
    background: "#0b1220", color: "#e2e8f0",
    fontFamily: "'Segoe UI', system-ui, sans-serif", fontSize: 13,
  },
  main: {
    display: "flex", flex: 1, minHeight: 0,
    borderTop: "1px solid #1e2a45",
  },
  left: {
    width: 380, minWidth: 280, borderRight: "1px solid #1e2a45",
    background: "#101828", overflow: "hidden",
  },
  center: { flex: 1, overflow: "hidden", background: "#0d1526" },
  right: {
    width: 200, borderLeft: "1px solid #1e2a45",
    background: "#101828", padding: 10,
    display: "flex", flexDirection: "column", gap: 2, fontSize: 12,
  },
  statsTitle: {
    fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5,
    color: "#7dd3fc", marginBottom: 6,
  },
  statRow: {
    display: "flex", justifyContent: "space-between",
    color: "#94a3b8", padding: "2px 0",
  },
  statValue: { fontVariantNumeric: "tabular-nums", color: "#e2e8f0" },
  manual: { borderTop: "1px solid #1e2a45", paddingTop: 6, color: "#64748b", fontSize: 11 },
  timeline: { height: 180 },
};
