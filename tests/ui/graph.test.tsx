/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SocialGraphView } from "../../apps/debug-ui/src/components/SocialGraphView";
import { SimulationInspector } from "@echosim/inspector";
import type { SimulationInspector as InspectorType } from "@echosim/inspector";

function fakeInspector(): InspectorType {
  const real = {
    getRelationshipGraph: (opts: { egoOf?: string } = {}) => ({
      dimension: "affinity",
      nodes: [
        { id: "npc_mira", name: "Mira" },
        { id: "npc_rohan", name: "Rohan" },
      ],
      edges: [
        { from: "npc_mira", to: "npc_rohan", dimension: "affinity",
          magnitude: -0.6, label: "-0.60" },
      ],
      ...(opts.egoOf !== undefined ? { egoOf: opts.egoOf } : {}),
    }),
    getGossipChains: () => [
      { beliefSubjectKey: "npc_anika", predicate: "regard", stance: -0.7,
        confidence: 0.42, chain: ["npc_mira", "npc_rohan"] },
    ],
  };
  return real as unknown as InspectorType;
}

// SimulationInspector type guard only; component uses the two methods above.
void SimulationInspector;

describe("SocialGraphView", () => {
  it("renders nodes, directional edges and rumour chains", () => {
    const { getByTestId } = render(<SocialGraphView inspector={fakeInspector()} selectedId="npc_mira" />);
    const svg = getByTestId("graph-svg");
    expect(svg.querySelectorAll("circle")).toHaveLength(2);
    expect(svg.querySelectorAll("line")).toHaveLength(1);
    // Edge label shows magnitude.
    expect(svg.textContent).toContain("-0.60");
    // Gossip chain rendered origin → holder with subject summary.
    const chains = getAllByText(getByTestId("social-graph"), "gossip-chain");
    expect(chains).toHaveLength(1);
    expect(chains[0].textContent).toContain("mira → rohan");
    expect(chains[0].textContent).toContain("anika.regard");
  });

  it("dimension selector changes the requested dimension", () => {
    let captured: { dimension?: string } = {};
    const insp = {
      getRelationshipGraph: (opts: Record<string, unknown>) => {
        captured = opts;
        return { dimension: opts.dimension, nodes: [], edges: [] };
      },
      getGossipChains: () => [],
    } as unknown as InspectorType;
    render(<SocialGraphView inspector={insp} selectedId={undefined} />);
    fireEvent.change(screen.getByTestId("graph-dimension"), { target: { value: "trust" } });
    expect(captured.dimension).toBe("trust");
  });

  it("ego toggle passes the selected resident through", () => {
    let captured: { egoOf?: string } = {};
    const insp = {
      getRelationshipGraph: (opts: Record<string, unknown>) => {
        captured = opts;
        return { dimension: "affinity", nodes: [], edges: [] };
      },
      getGossipChains: () => [],
    } as unknown as InspectorType;
    render(<SocialGraphView inspector={insp} selectedId="npc_rohan" />);
    fireEvent.click(screen.getByTestId("graph-ego"));
    expect(captured.egoOf).toBe("npc_rohan");
  });
});

function getAllByText(el: Element, testId: string): HTMLElement[] {
  return Array.from(el.querySelectorAll(`[data-testid="${testId}"]`)) as HTMLElement[];
}

function getAllByTextWrapper() { void screen; }
void getAllByTextWrapper;
