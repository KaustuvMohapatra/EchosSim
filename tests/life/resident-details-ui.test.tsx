/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { RelationshipSnapshot } from "@echosim/inspector";
import { ResidentDetails } from "../../apps/life/src/ui/components/ResidentDetails.js";

afterEach(cleanup);

const relationship = (from: string, to: string): RelationshipSnapshot => ({
  from, to, label: "Friend", familiarity: 0.5, affinity: 0.6,
  trust: 0.4, respect: 0.2, attraction: 0, fear: 0,
  grievance: 0, obligation: 0,
});

describe("ResidentDetails directional connections", () => {
  it("shows both incoming and outgoing contacts, never the resident as their own connection", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <ResidentDetails
          names={new Map([["mira", "Mira"], ["anika", "Anika"], ["rohan", "Rohan"]])}
          locations={new Map()}
          presence={{ id: "mira", name: "Mira", visibility: "unknown" }}
          knowledge={{
            viewerId: "mira", targetId: "mira", privateAccess: true,
            relationships: [
              relationship("mira", "anika"),
              relationship("rohan", "mira"),
              relationship("mira", "mira"),
            ],
            memories: [],
          }}
          nowMinutes={0}
          controlled={false}
          canControl={false}
          followed={false}
          onControl={() => {}}
          onControlMember={() => {}}
          onFollow={() => {}}
          onClose={() => {}}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Connections" }));
      const section = document.querySelector(".profile-list");
      expect(section).not.toBeNull();
      const rows = within(section as HTMLElement).getAllByText("Friend");
      expect(rows).toHaveLength(2);
      expect(within(section as HTMLElement).getByText("Anika")).toBeTruthy();
      expect(within(section as HTMLElement).getByText("Rohan")).toBeTruthy();
      expect(within(section as HTMLElement).queryByText("Mira")).toBeNull();
      expect(error.mock.calls.some((args) => args.join(" ").includes("same key"))).toBe(false);
    } finally {
      error.mockRestore();
    }
  });
});
