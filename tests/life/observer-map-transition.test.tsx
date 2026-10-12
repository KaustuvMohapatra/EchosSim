/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TownObserver } from "../../apps/life/src/ui/components/TownObserver.js";

describe("Town Observer map navigation", () => {
  it("calls through to open the town map from the map tab", () => {
    const onOpenMap = vi.fn();
    render(<TownObserver
      live={[]} town={[]} following={[]} names={new Map()}
      followedCount={0} locations={[]} residents={[]}
      attractions={[]} onVisitAttraction={() => {}}
      onOpenMap={onOpenMap} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    fireEvent.click(screen.getByRole("button", { name: "Open town map" }));
    expect(onOpenMap).toHaveBeenCalledOnce();
  });
});
