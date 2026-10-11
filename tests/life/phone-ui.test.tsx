/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PhonePanel } from "../../apps/life/src/ui/components/PhonePanel.js";
import type { LifePersonalSnapshot } from "../../apps/life/src/simulation/LifeModeAdapter.js";

const life = {
  agentId: "player",
  contacts: [
    { id: "mira", name: "Mira" },
    { id: "anika", name: "Anika" },
  ],
  messages: [], calendar: [], invitations: [],
  skills: [], households: [], habits: [],
} as unknown as LifePersonalSnapshot;

function mount(onSend = vi.fn(() => true)) {
  render(<PhonePanel life={life} locations={new Map()} nowMinutes={0}
    onSend={onSend} onRespond={() => {}} onTravel={() => {}}
    onClose={() => {}} />);
  return onSend;
}

describe("phone conversation drafts", () => {
  it("keeps separate unsent drafts when switching recipients", () => {
    const send = mount();
    const composer = screen.getByRole("textbox", { name: "Message text" });
    const select = screen.getByRole("combobox", { name: "Conversation" });
    fireEvent.change(composer, { target: { value: "Private note for Mira" } });
    fireEvent.change(select, { target: { value: "anika" } });
    expect(composer).toHaveProperty("value", "");
    fireEvent.change(composer, { target: { value: "Hello Anika" } });
    fireEvent.change(select, { target: { value: "mira" } });
    expect(composer).toHaveProperty("value", "Private note for Mira");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(send).toHaveBeenCalledWith("mira", "Private note for Mira");
    expect(composer).toHaveProperty("value", "");
    fireEvent.change(select, { target: { value: "anika" } });
    expect(composer).toHaveProperty("value", "Hello Anika");
  });

  it("preserves the intended draft on failed delivery", () => {
    const send = mount(vi.fn(() => false));
    const composer = screen.getByRole("textbox", { name: "Message text" });
    fireEvent.change(composer, { target: { value: "Try again" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(send).toHaveBeenCalledWith("mira", "Try again");
    expect(composer).toHaveProperty("value", "Try again");
  });
});
