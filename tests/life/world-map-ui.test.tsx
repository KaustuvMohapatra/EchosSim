/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WorldMap } from "../../apps/life/src/ui/components/WorldMap.js";

afterEach(() => cleanup());

describe("Town Map keyboard navigation", () => {
  function mount() {
    const trigger = document.createElement("button");
    trigger.textContent = "Open map";
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const rendered = render(<WorldMap
      locations={[]} residents={[]} nowMinutes={0}
      onTravel={() => {}} onClose={onClose} />);
    return { trigger, onClose, ...rendered };
  }

  it("focuses the map close button and restores launcher focus on unmount", () => {
    const { trigger, unmount } = mount();
    const close = screen.getByRole("button", { name: "Close map" });
    expect(document.activeElement).toBe(close);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("wraps keyboard focus from first to last and last to first action", () => {
    const { trigger, unmount } = mount();
    const close = screen.getByRole("button", { name: "Close map" });
    const dialog = screen.getByRole("dialog", { name: "Town map" });
    const enabled = [...dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    expect(enabled.length).toBeGreaterThan(1);
    const last = enabled.at(-1)!;
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    unmount();
    trigger.remove();
  });
});
