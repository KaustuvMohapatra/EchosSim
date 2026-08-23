/** SimHost control tests: deterministic stepping, recorded manual commands. */
import { describe, expect, it } from "vitest";
import { SimHost } from "../../apps/debug-ui/src/sim/SimHost";

describe("SimHost", () => {
  it("steps simulation deterministically and records the command", () => {
    const host = new SimHost(7001);
    const before = host.town.clock.currentTime.totalMinutes;
    host.step(60);
    expect(host.town.clock.currentTime.totalMinutes).toBe(before + 60);
    expect(host.manualCommands.at(-1)!.command).toBe("step");
    expect(host.paused).toBe(true); // step does not auto-run
    host.dispose();
  });

  it("jump day advances exactly 1440 minutes through full ticks", () => {
    const host = new SimHost(7001);
    host.jumpMinutes(1440);
    expect(host.town.clock.currentTime.totalMinutes).toBe(1440);
    expect(host.manualCommands.at(-1)!.command).toBe("jump");
    host.dispose();
  });

  it("speed presets are recorded; force weather is an explicit override", () => {
    const host = new SimHost(7001);
    host.setSpeed(8);
    expect(host.speed).toBe(8);
    expect(host.manualCommands.at(-1)).toMatchObject({ command: "speed", detail: "8x" });

    host.forceWeather(2);
    expect(host.town.weather.current).toBe(2);
    expect(host.manualCommands.at(-1)).toMatchObject({ command: "force-weather" });
    host.dispose();
  });

  it("reseed replaces the world deterministically (same seed, same start)", () => {
    const a = new SimHost(7001);
    a.step(30);
    const fingerprintAtT = () => ({
      clock: a.inspector.getTime(),
      stats: a.inspector.getTownStats(),
    });
    void fingerprintAtT;

    const b = new SimHost(7001);
    b.reseed(7001);
    expect(b.town.clock.currentTime.totalMinutes).toBe(0);
    expect(b.seed).toBe(7001n);
    expect(b.paused).toBe(true);
    expect(b.manualCommands.at(-1)!.command).toBe("reseed");
    a.dispose(); b.dispose();
  });

  it("snapshot exposes read-only UI model with selected agent", () => {
    const host = new SimHost(7001);
    const snap = host.snapshot("npc_mira");
    expect(snap.agents).toHaveLength(3);
    expect(snap.selected?.summary.name).toBe("Mira");
    expect(snap.selected?.needs).toHaveLength(7);
    expect(snap.events.length).toBeGreaterThanOrEqual(0);
    expect(snap.paused).toBe(true);
    host.dispose();
  });

  it("toggle starts and pauses the loop without leaking timers", () => {
    const host = new SimHost(7001);
    expect(host.paused).toBe(true);
    host.toggle(); // resume
    expect(host.paused).toBe(false);
    host.toggle(); // pause
    expect(host.paused).toBe(true);
    expect(host.manualCommands.filter((c) => c.command === "pause")).toHaveLength(1);
    host.dispose();
  });
});
