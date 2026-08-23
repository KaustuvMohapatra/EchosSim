import type { PlanSnapshot } from "@echosim/inspector";
import { Section, Empty } from "./UtilityPanel.js";

export function PlanPanel({ plan }: { plan: PlanSnapshot }) {
  return (
    <Section title="Plan">
      <div data-testid="plan-panel" style={{ padding: "4px 0" }}>
        <div style={styles.rowBetween}>
          <span>Revision</span><span>#{plan.revision}</span>
        </div>
        {plan.lastReplanReason && (
          <div style={styles.rowBetween}>
            <span>Last replan</span><span>{plan.lastReplanReason}</span>
          </div>
        )}
        {plan.lastPlanOutcome && (
          <div style={styles.rowBetween}>
            <span>Planner result</span><span>{plan.lastPlanOutcome}</span>
          </div>
        )}
        {plan.lastPlannerNodesExpanded > 0 && (
          <div style={styles.rowBetween}>
            <span>Nodes expanded</span><span>{plan.lastPlannerNodesExpanded}</span>
          </div>
        )}
        {!plan.hasPlan ? <Empty /> : (
          <ol style={styles.planList}>
            {plan.steps.map((s, i) => {
              const done = i < plan.nextStepIndex;
              const current = i === plan.nextStepIndex;
              return (
                <li key={`${s.actionId}-${i}`}
                  style={{
                    color: done ? "#34d399" : current ? "#fbbf24" : "#64748b",
                    fontWeight: current ? 600 : 400,
                  }}>
                  {done ? "✓ " : current ? "▸ " : ""}
                  {s.label}
                  <span style={{ color: "#475569" }}> ({s.durationMinutes}m)</span>
                </li>
              );
            })}
          </ol>
        )}
        {plan.lastFailureDetail && (
          <div style={styles.failure} data-testid="last-failure">
            ✗ {plan.lastFailureDetail}
          </div>
        )}
      </div>
    </Section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  rowBetween: {
    display: "flex", justifyContent: "space-between",
    padding: "2px 10px", fontSize: 12, color: "#94a3b8",
  },
  planList: {
    margin: "4px 10px", paddingLeft: 18, fontSize: 12, lineHeight: 1.5,
  },
  failure: {
    margin: "4px 10px", padding: "3px 8px", fontSize: 11,
    background: "#450a0a", color: "#fca5a5", borderRadius: 4,
  },
};
