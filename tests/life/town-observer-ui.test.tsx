/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TownObserver } from "../../apps/life/src/ui/components/TownObserver.js";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof TownObserver>;
const locations = [
  { id: "cafe", name: "Cafe", isOpen: true },
  { id: "park", name: "Park", isOpen: false },
  { id: "library", name: "Library", isOpen: true },
] as Props["locations"];
const attractions = [
  { objectId: "obj_cafe", lotId: "cafe", kind: "easel", dx: 0, dz: 0, rot: 0 },
  { objectId: "obj_park", lotId: "park", kind: "easel", dx: 0, dz: 0, rot: 0 },
  { objectId: "obj_library", lotId: "library", kind: "easel", dx: 0, dz: 0, rot: 0 },
] as Props["attractions"];

function mount(currentLocationId?: string) {
  const onVisitAttraction = vi.fn();
  render(<TownObserver
    live={[]} town={[]} following={[]} names={new Map()} followedCount={0}
    locations={locations} residents={[]} currentLocationId={currentLocationId}
    attractions={attractions} onVisitAttraction={onVisitAttraction}
    onOpenMap={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole("button", { name: "Objects" }));
  return onVisitAttraction;
}

describe("Town Observer attraction visits", () => {
  it("does not queue a pointless trip to a venue where the player already is", () => {
    const visit = mount("cafe");
    expect(screen.getByRole("button", { name: "Here now" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Here now" }));
    expect(visit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Closed" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Visit" }));
    expect(visit).toHaveBeenCalledWith("library", "Library");
  });

  it("allows travel when the previously visited venue is no longer current", () => {
    const visit = mount("library");
    expect(screen.getByRole("button", { name: "Here now" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Visit" }));
    expect(visit).toHaveBeenCalledWith("cafe", "Cafe");
  });
});
