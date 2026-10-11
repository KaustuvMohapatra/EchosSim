import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { ContextMenu } from "../../apps/life/src/ui/components/ContextMenu.js";
import type { LifeApp } from "../../apps/life/src/app/bootstrap.js";

function harness(buildMode: boolean, rotationResult = { ok: true, reason: undefined as string | undefined }) {
  const rotate = vi.fn(() => rotationResult);
  const remove = vi.fn(() => true);
  const useBuiltObject = vi.fn(() => ({ ok: true, feedback: "Played arcade." }));
  const flash = vi.fn();
  const close = vi.fn();
  const app = {
    buildMode,
    build: { get: () => ({ kind: "arcade" }), rotate, remove },
    interactions: {
      builtAffordance: () => ({ label: "Play arcade" }),
      useBuiltObject,
    },
  } as unknown as LifeApp;
  render(createElement(ContextMenu, {
    menu: { objectId: "built:built_1", x: 20, y: 90 },
    app,
    onClose: close,
    onFlash: flash,
  }));
  return { app, rotate, remove, useBuiltObject, flash, close };
}

describe("built furniture context menu", () => {
  it("offers interactions but never editing actions outside Build Mode", () => {
    const h = harness(false);
    expect(screen.getByRole("menuitem", { name: "Play arcade" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Rotate" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();

    fireEvent.click(screen.getByRole("menuitem", { name: "Play arcade" }));
    expect(h.useBuiltObject).toHaveBeenCalledWith("built_1");
    expect(h.flash).toHaveBeenCalledWith("Played arcade.");
    expect(h.rotate).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("offers editing while building and reflects successful changes", () => {
    const h = harness(true);
    expect(screen.queryByRole("menuitem", { name: "Play arcade" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rotate" }));
    expect(h.rotate).toHaveBeenCalledWith("built_1");
    expect(h.flash).toHaveBeenCalledWith("Furniture rotated.");
    expect(h.close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(h.remove).toHaveBeenCalledWith("built_1");
    expect(h.flash).toHaveBeenCalledWith("Furniture removed.");
  });

  it("surfaces failed rotation without claiming the edit succeeded", () => {
    const h = harness(true, { ok: false, reason: "Furniture overlaps another object." });
    fireEvent.click(screen.getByRole("menuitem", { name: "Rotate" }));
    expect(h.flash).toHaveBeenCalledWith("Furniture overlaps another object.");
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("ignores stale editing controls when Build Mode was exited", () => {
    const h = harness(true);
    h.app.buildMode = false;
    fireEvent.click(screen.getByRole("menuitem", { name: "Rotate" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(h.rotate).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });
});
