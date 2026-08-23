/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgentList } from "../../apps/debug-ui/src/components/AgentList";
import { UtilityRow } from "../../apps/debug-ui/src/components/UtilityPanel";
import { PlanPanel } from "../../apps/debug-ui/src/components/PlanPanel";
import { EventTimeline } from "../../apps/debug-ui/src/components/EventTimeline";
import type {
  AgentSummary, PlanSnapshot, SimEventEntry, UtilityCandidate,
} from "@echosim/inspector";

const AGENTS: AgentSummary[] = [
  { id: "npc_mira", name: "Mira", locationId: "loc_cafe", locationName: "Corner Cafe",
    currentGoal: "goal_socialize", currentAction: "Talk", status: "Running", emotionValence: 0.2 },
  { id: "npc_rohan", name: "Rohan", locationId: "loc_bakery", locationName: "Bakery",
    currentGoal: "goal_eat", status: "Idle", emotionValence: -0.3 },
];

describe("AgentList", () => {
  it("renders residents and selects on click", () => {
    let picked = "";
    const { getByTestId } = render(
      <AgentList agents={AGENTS} selectedId="npc_mira" onSelect={(id) => (picked = id)} />);
    expect(getByTestId("agent-row-npc_mira")).toBeTruthy();
    expect(getByTestId("agent-row-npc_rohan")).toBeTruthy();
    fireEvent.click(getByTestId("agent-row-npc_rohan"));
    expect(picked).toBe("npc_rohan");
  });

  it("search filters by name and location filter narrows rows", () => {
    const { getByTestId } = render(
      <AgentList agents={AGENTS} selectedId={undefined} onSelect={() => {}} />);

    const search = getByTestId("agent-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "mira" } });
    expect(screen.queryByTestId("agent-row-npc_rohan")).toBeNull();
    expect(getByTestId("agent-row-npc_mira")).toBeTruthy();

    fireEvent.change(search, { target: { value: "" } });
    const locSelect = getByTestId("agent-location-filter") as HTMLSelectElement;
    fireEvent.change(locSelect, { target: { value: "Bakery" } });
    expect(getByTestId("agent-row-npc_rohan")).toBeTruthy();
    expect(screen.queryByTestId("agent-row-npc_mira")).toBeNull();
  });
});

const UTILITY: UtilityCandidate[] = [
  { goal: "goal_sleep", displayName: "Sleep", score: 1.25,
    breakdown: [
      { label: "Base", value: 0.5 },
      { label: "Energy need", value: 0.75 },
    ], criticalOverride: false, isCommittedGoal: true },
  { goal: "goal_explore", displayName: "Explore", score: 0.4,
    breakdown: [{ label: "Base", value: 0.4 }], criticalOverride: false,
    isCommittedGoal: false },
];

describe("UtilityRow", () => {
  it("shows final scores AND term breakdowns; highlights committed goal", () => {
    render(<UtilityRow utility={UTILITY} />);
    // Final scores
    expect(screen.getByText("1.250")).toBeTruthy();
    // Breakdown terms visible, not just totals
    expect(screen.getByText("Energy need")).toBeTruthy();
    expect(screen.getByText("+0.750")).toBeTruthy();
    // Committed marker
    expect(screen.getByText(/▸ Sleep/)).toBeTruthy();
  });
});

const PLAN: PlanSnapshot = {
  goalId: "goal_eat", revision: 7, hasPlan: true,
  steps: [
    { actionId: "act_goto_cafe", label: "GoTo Corner Cafe", durationMinutes: 15 },
    { actionId: "act_buy_meal", label: "BuyFood", durationMinutes: 12 },
    { actionId: "act_eat", label: "Eat", durationMinutes: 20 },
  ],
  nextStepIndex: 2, currentAction: "Eat", lifecycle: "Running",
  startedAtMinutes: 800, currentStepDueMinutes: 832,
  lastFailureDetail: "LocationClosed: loc_cafe closed",
  lastReplanReason: "action-failed", lastPlanOutcome: "planned",
  lastPlannerNodesExpanded: 42,
};

describe("PlanPanel", () => {
  it("shows revision, steps with progress markers and last failure", () => {
    render(<PlanPanel plan={PLAN} />);
    expect(screen.getByText("#7")).toBeTruthy();
    expect(screen.getByText(/GoTo Corner Cafe/)).toBeTruthy();
    expect(screen.getAllByText(/✓/).length).toBeGreaterThan(0);  // completed step marker
    expect(screen.getAllByText(/▸ Eat/).length).toBeGreaterThan(0); // current step
    const failure = screen.getByTestId("last-failure");
    expect(failure.textContent).toContain("LocationClosed");
    expect(screen.getByText("action-failed")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();      // nodes expanded
  });

  it("renders empty state when idle", () => {
    render(<PlanPanel plan={{ ...PLAN, hasPlan: false, revision: 0, steps: [], nextStepIndex: 0 }} />);
    expect(screen.queryByText("#7")).toBeNull();
  });
});

const EVENTS: SimEventEntry[] = [
  { seq: 1, atMinutes: 100, kind: "plan", type: "sim:plan-started", agent: "npc_mira",
    text: "npc_mira plans goal_sleep (1 steps)" },
  { seq: 2, atMinutes: 110, kind: "conversation", type: "sim:conversation", agent: "npc_mira",
    text: "[Gossip] npc_mira→npc_rohan: Did you hear about Anika?" },
  { seq: 3, atMinutes: 120, kind: "movement", type: "sim:agent-moved", agent: "npc_rohan",
    text: "npc_rohan arrived at loc_park" },
];

describe("EventTimeline", () => {
  it("lists events chronologically; filters by kind and text", () => {
    let toggled = false;
    const names = new Map([["npc_mira", "Mira"], ["npc_rohan", "Rohan"]]);
    const { getByTestId } = render(
      <EventTimeline events={EVENTS} paused={false}
        onTogglePause={() => { toggled = true; }} agentNames={names} />);

    expect(getByTestId("event-timeline").textContent).toContain("plans goal_sleep");

    const kind = getByTestId("timeline-kind") as HTMLSelectElement;
    fireEvent.change(kind, { target: { value: "conversation" } });
    expect(getByTestId("event-timeline").textContent).toContain("[Gossip]");
    expect(getByTestId("event-timeline").textContent).not.toContain("arrived at loc_park");

    fireEvent.change(kind, { target: { value: "" } });
    const search = getByTestId("timeline-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "rohan" } });
    expect(getByTestId("event-timeline").textContent).not.toContain("plans goal_sleep");

    fireEvent.click(getByTestId("timeline-pause"));
    expect(toggled).toBe(true);
  });
});
