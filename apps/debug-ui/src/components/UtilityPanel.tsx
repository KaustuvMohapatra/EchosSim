import type { UtilityCandidate } from "@echosim/inspector";

export function UtilityRow({ utility }: { utility: readonly UtilityCandidate[] }) {
  if (utility.length === 0) return <Section title="Utility"><Empty /></Section>;
  return (
    <Section title="Utility scores">
      <div data-testid="utility-panel">
        {utility.map((c) => (
          <div key={c.goal} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: c.isCommittedGoal ? "#7dd3fc" : "#cbd5e1" }}>
                {c.isCommittedGoal ? "▸ " : "  "}
                {c.displayName}
                {c.criticalOverride ? " ⚠" : ""}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "#94a3b8" }}>
                {c.score.toFixed(3)}
              </span>
            </div>
            {c.breakdown.map((l) => (
              <div key={l.label} style={styles.line}>
                <span>{l.label}</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {l.value >= 0 ? "+" : ""}{l.value.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section} data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div style={styles.title}>{title}</div>
      {children}
    </div>
  );
}

export function Empty() {
  return <div style={styles.empty}>—</div>;
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: 14, border: "1px solid #1e2a45",
    borderRadius: 6, overflow: "hidden",
  },
  title: {
    padding: "5px 10px", fontSize: 10, textTransform: "uppercase",
    letterSpacing: 0.8, color: "#7dd3fc", background: "#0d1526",
    borderBottom: "1px solid #1e2a45",
  },
  line: {
    display: "flex", justifyContent: "space-between", paddingLeft: 18,
    paddingRight: 10, fontSize: 11, color: "#64748b",
  },
  empty: { padding: "4px 10px", color: "#475569", fontSize: 12 },
};
