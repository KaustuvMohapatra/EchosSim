import { describe, it, expect } from "vitest";
import { NeedKind, PersonalityProfile, PersonalityTrait } from "@echosim/cognition";
import { NavigationPathStatus } from "@echosim/world";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import { WorldObjectDirector } from "../../apps/life/src/simulation/WorldObjectDirector.js";
import { BuildController, resetBuildIds } from "../../apps/life/src/build/BuildController.js";
import { lotOf } from "../../apps/life/src/world/layout.js";

const bounds = (id: string) => {
  const lot = lotOf(id);
  return lot ? { x1: lot.x - lot.width / 2, x2: lot.x + lot.width / 2,
    z1: lot.z - lot.depth / 2, z2: lot.z + lot.depth / 2 } : undefined;
};
function scenario() {
  resetBuildIds();
  const adapter = new LifeModeAdapter({ seed: 7001n });
  const personality = PersonalityProfile.balanced().edit()
    .set(PersonalityTrait.Curiosity, 0.98)
    .set(PersonalityTrait.Sociability, 0.12)
    .set(PersonalityTrait.Ambition, 0.4).build();
  adapter.createResident({
    id: "test_artist", name: "The Artist", personality, homeLocationId: "apt_b",
  });
  const mind = adapter.town.residents.mind("test_artist");
  mind.needs.force(NeedKind.Fun, 76);
  mind.needs.force(NeedKind.Energy, 20);
  mind.needs.force(NeedKind.Hunger, 20);
  mind.needs.force(NeedKind.Safety, 20);
  const build = new BuildController(bounds);
  const studio = lotOf("studio")!, cafe = lotOf("cafe")!;
  expect(build.place("easel", "studio", studio.x, studio.z).ok).toBe(true);
  expect(build.place("arcade", "cafe", cafe.x, cafe.z).ok).toBe(true);
  adapter.town.locations.get("studio" as never).forceOpen(true);
  adapter.town.locations.get("cafe" as never).forceOpen(true);
  const director = new WorldObjectDirector(adapter, build, () => "player");
  return { adapter, build, director, mind };
}

describe("Living World Phase 04: resident attraction", () => {
  it("ranks new venues from actual installed objects, traits and needs", () => {
    const { adapter, build, director, mind } = scenario();
    adapter.town.clock.advance({ totalMinutes: 10 * 60 });
    const choice = director.recommendAttraction("test_artist");
    expect(choice).toBeDefined();
    expect(choice?.kind).toBe("easel");
    expect(choice?.lotId).toBe("studio");
    expect(choice?.score).toBeGreaterThan(0.31);
    mind.needs.force(NeedKind.Energy, 80);
    expect(director.recommendAttraction("test_artist")).toBeUndefined();
    mind.needs.force(NeedKind.Energy, 20);
    const artId = build.list().find((p) => p.kind === "easel")!.objectId;
    build.remove(artId);
    expect(director.recommendAttraction("test_artist")?.kind).toBe("arcade");
    director.dispose(); adapter.dispose();
  });

  it("creates a genuine sim navigation trip before applying benefits and memories", () => {
    const { adapter, director, build } = scenario();
    adapter.town.clock.advance({ totalMinutes: 8 * 60 });
    let started = false;
    for (let day = 0; day < 6 && !started; day++) {
      for (const hour of [8, 10, 12, 14, 16, 18, 20]) {
        const now = adapter.town.clock.currentTime.totalMinutes;
        const next = day * 1440 + hour * 60;
        if (next > now) adapter.town.clock.advance({ totalMinutes: next - now });
        if (adapter.director.externalIdleActivity?.("test_artist", false)) {
          started = true;
          break;
        }
      }
    }
    expect(started).toBe(true);
    const travelling = adapter.town.navigation.getState("test_artist");
    expect(travelling.status).toBe(NavigationPathStatus.EnRoute);
    expect(adapter.town.memory.storeFor("test_artist").all
      .filter(m => m.eventType === "world_object")).toHaveLength(0);
    const destination = travelling.destination;
    const targetObject = build.list().find(p => p.lotId === destination);
    expect(targetObject).toBeDefined();
    expect(["studio", "cafe"]).toContain(destination);
    const travel = adapter.town.navigation.getTravelTime("apt_b", destination!);
    adapter.town.clock.advance({ totalMinutes: travel + 2 });
    expect(adapter.town.agentsById.get("test_artist")?.currentLocationId).toBe(destination);
    const memories = adapter.town.memory.storeFor("test_artist").all
      .filter(m => m.eventType === "world_object");
    expect(memories).toHaveLength(1);
    expect(memories[0]?.subject).toBe(targetObject?.objectId);
    expect(adapter.town.stories.all().some(story =>
      story.text.includes("painted") || story.text.includes("played"))).toBe(true);
    director.dispose(); adapter.dispose();
  });

  it("never interrupts critical needs and skips unavailable or non-existent equipment", () => {
    const { adapter, director, build, mind } = scenario();
    adapter.town.clock.advance({ totalMinutes: 11 * 60 });
    mind.needs.force(NeedKind.Hunger, 99);
    expect(director.recommendAttraction("test_artist")).toBeUndefined();
    expect(adapter.director.externalIdleActivity?.("test_artist", true)).toBe(false);
    expect(adapter.town.navigation.getState("test_artist").status)
      .not.toBe(NavigationPathStatus.EnRoute);
    mind.needs.force(NeedKind.Hunger, 20);
    for (const p of build.list()) build.remove(p.objectId);
    expect(director.recommendAttraction("test_artist")).toBeUndefined();
    director.dispose(); adapter.dispose();
  });

  it("does not create extra simulation effects without installed attractions", () => {
    const { adapter, director, build } = scenario();
    for (const p of build.list()) build.remove(p.objectId);
    const existing = adapter.town.memory.storeFor("test_artist").all.length;
    adapter.town.clock.advance({ totalMinutes: 11 * 60 });
    expect(adapter.director.externalIdleActivity?.("test_artist", false)).toBe(false);
    expect(adapter.town.memory.storeFor("test_artist").all).toHaveLength(existing);
    director.dispose(); adapter.dispose();
  });
});
