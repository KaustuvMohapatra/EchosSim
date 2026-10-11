/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ResidentCreator } from "../../apps/life/src/ui/components/ResidentCreator.js";
import type { LifeLocationSummary } from "../../apps/life/src/simulation/LifeModeAdapter.js";

afterEach(() => cleanup());

const home = (id: string, name: string): LifeLocationSummary =>
  ({ id, name } as LifeLocationSummary);

function openCreator(locations: LifeLocationSummary[], onCreate = vi.fn()) {
  const view = render(
    <ResidentCreator residentIds={["player"]} locations={locations}
      onCreate={onCreate} onClose={() => {}} />,
  );
  fireEvent.change(screen.getByPlaceholderText("e.g. Rowan Park"), {
    target: { value: "Rowan Park" },
  });
  return { ...view, onCreate };
}

describe("Life resident creator home selection", () => {
  it("uses the first available home when the default apartment is absent", () => {
    const { onCreate } = openCreator([
      home("park", "Park"), home("apt_c", "Cedar Apartments"),
      home("apt_a", "Ash Apartments"),
    ]);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("apt_c");
    fireEvent.click(screen.getByRole("button", { name: "Add resident to town" }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: "Rowan Park", homeLocationId: "apt_c",
    }));
  });

  it("preserves an explicitly chosen home across location updates", () => {
    const props = {
      residentIds: ["player"],
      onCreate: vi.fn(),
      onClose: () => {},
    };
    const initial = [home("apt_a", "Ash"), home("apt_b", "Birch")];
    const { rerender } = render(<ResidentCreator {...props} locations={initial} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Rowan Park"), {
      target: { value: "Rowan Park" },
    });
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("apt_b");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "apt_a" } });
    rerender(<ResidentCreator {...props} locations={[...initial, home("apt_c", "Cedar")]} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("apt_a");
    fireEvent.click(screen.getByRole("button", { name: "Add resident to town" }));
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({
      homeLocationId: "apt_a",
    }));
  });

  it("falls back to a visible available home if the selected location disappears", () => {
    const props = {
      residentIds: ["player"],
      onCreate: vi.fn(),
      onClose: () => {},
    };
    const { rerender } = render(<ResidentCreator {...props}
      locations={[home("apt_a", "Ash"), home("apt_b", "Birch")]} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Rowan Park"), {
      target: { value: "Rowan Park" },
    });
    rerender(<ResidentCreator {...props} locations={[home("apt_a", "Ash")]} />);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("apt_a");
    fireEvent.click(screen.getByRole("button", { name: "Add resident to town" }));
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({
      homeLocationId: "apt_a",
    }));
  });

  it("disables creation when there are no homes", () => {
    const { onCreate } = openCreator([home("park", "Park")]);
    const button = screen.getByRole("button", { name: "Add resident to town" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.submit(button.closest("form")!);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
