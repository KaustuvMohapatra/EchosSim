import { useMemo, useState } from "react";
import type { SimulationInspector, GraphSnapshot, GossipChain } from "@echosim/inspector";

const DIMENSIONS = [
  "affinity", "trust", "respect", "fear", "grievance",
  "attraction", "familiarity", "obligation",
] as const;

interface Props {
  inspector: SimulationInspector;
  selectedId: string | undefined;
}

/** Deterministic circular layout keyed by node id order. */
function layout(nodes: { id: string }[], width: number, height: number) {
  const pos = new Map<string, { x: number; y: number }>();
  const R = Math.min(width, height) / 2 - 46;
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, nodes.length) - Math.PI / 2;
    pos.set(n.id, {
      x: width / 2 + R * Math.cos(angle),
      y: height / 2 + R * Math.sin(angle),
    });
  });
  return pos;
}

export function SocialGraphView({ inspector, selectedId }: Props) {
  const [dimension, setDimension] = useState<(typeof DIMENSIONS)[number]>("affinity");
  const [minMagnitude, setMinMagnitude] = useState(0.05);
  const [egoMode, setEgoMode] = useState(false);
  const egoOf = egoMode && selectedId !== undefined ? selectedId : undefined;

  const graph: GraphSnapshot = useMemo(
    () => inspector.getRelationshipGraph({
      dimension, minMagnitude, ...(egoOf !== undefined ? { egoOf, hops: 1 as const } : {}),
    }),
    [inspector, dimension, minMagnitude, egoOf],
  );
  const chains: GossipChain[] = useMemo(() => inspector.getGossipChains(12), [inspector]);

  const W = 560, H = 380;
  const pos = layout(graph.nodes, W, H);

  return (
    <div data-testid="social-graph" style={{ padding: 10, height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={styles.controls}>
        <label>
          Dimension{" "}
          <select data-testid="graph-dimension" value={dimension}
            onChange={(e) => setDimension(e.target.value as typeof dimension)}
            style={styles.select}>
            {DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>
          Min |magnitude|{" "}
          <input data-testid="graph-min" type="number" min={0} max={1} step={0.05}
            value={minMagnitude}
            onChange={(e) => setMinMagnitude(Number(e.target.value))}
            style={{ ...styles.select, width: 64 }} />
        </label>
        <label style={{ color: "#94a3b8" }}>
          <input type="checkbox" data-testid="graph-ego" checked={egoMode}
            onChange={() => setEgoMode(!egoMode)} /> ego view
          {selectedId ? ` (${selectedId})` : ""}
        </label>
      </div>

      <svg data-testid="graph-svg" width={W} height={H} style={styles.svg} role="img"
        aria-label={`relationship graph by ${dimension}`}>
        {/* edges first so nodes overlay */}
        {graph.edges.map((e) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          const positive = e.magnitude >= 0;
          const width = 0.75 + Math.abs(e.magnitude) * 4;
          // shorten the line toward the target so the arrowhead is visible
          const dx = b.x - a.x, dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const t = 16 / len;
          const ex = b.x - dx * t, ey = b.y - dy * t;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <g key={`${e.from}>${e.to}`}>
              <line x1={a.x} y1={a.y} x2={ex} y2={ey}
                stroke={positive ? "#34d399" : "#f87171"}
                strokeWidth={width}
                markerEnd="url(#arrow)" opacity={0.85} />
              <text x={mx} y={my - 4} fill="#64748b" fontSize={9}
                textAnchor="middle">{e.label}</text>
            </g>
          );
        })}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const isEgo = n.id === egoOf;
          const r = isEgo ? 18 : 14;
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={r}
                fill={isEgo ? "#1e3a5f" : "#16213e"}
                stroke={n.id === selectedId ? "#fbbf24" : "#7dd3fc"} strokeWidth={2} />
              <text x={p.x} y={p.y + 3} textAnchor="middle" fontSize={10}
                fill="#e2e8f0">{n.name}</text>
            </g>
          );
        })}
      </svg>

      <div>
        <div style={styles.sectionTitle}>
          Rumour chains ({chains.length})
          <span style={{ fontSize: 10, marginLeft: 6 }}>
            origin → … → holder
          </span>
        </div>
        {chains.length === 0 ? (
          <div style={{ color: "#475569", fontSize: 12 }}>No rumours in flight.</div>
        ) : chains.map((c, i) => (
          <div key={i} data-testid="gossip-chain" style={{ fontSize: 12, padding: "1px 0" }}>
            {c.chain.map((id) => id.replace(/^npc_/, "")).join(" → ")}
            <span style={{ color: "#475569" }}>
              {" "}· {c.beliefSubjectKey.replace(/^npc_/, "")}.{c.predicate}
              {" "}stance {c.stance.toFixed(2)} conf {c.confidence.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  controls: { display: "flex", gap: 14, alignItems: "center", fontSize: 12 },
  select: {
    background: "#0b1220", border: "1px solid #1e2a45", color: "#e2e8f0",
    borderRadius: 4, padding: "3px 6px", fontSize: 12,
  },
  svg: { background: "#0d1526", border: "1px solid #1e2a45", borderRadius: 6 },
  sectionTitle: {
    fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5,
    color: "#7dd3fc", marginBottom: 4,
  },
};
