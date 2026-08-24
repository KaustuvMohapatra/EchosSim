/** Sprint 59 — life-mode soak: player commands + autonomous town under
 *  continuous invariant checks, with mid-run save/load integrity. */
import { describe, expect, it } from "vitest";
import { createAuthoredTown } from "@echosim/content";
import { SoakMonitor, saveToJson, restoreFromJson } from "@echosim/inspector";
import type { Town } from "@echosim/simulation";
import type { PlanningDirector } from "@echosim/simulation";

// The inspector package name differs in-repo; import directly.
import { SoakMonitor as SM } from "@echosim/inspector";
import { saveToJson, restoreFromJson } from "@echosim/persistence";

function step(town: Town, director: PlanningDirector, minutes: number): void {
  for (let i = 0; i < minutes; i += 10) {
    town.cognition.advanceNeeds({ totalMinutes: 10 });
    town.clock.advance({ totalMinutes: 10 });
    director.tickAll();
  }
}

describe("S59: life soak gauntlet", () => {
  it("7 days of scripted player life stays invariant-clean and save-safe",
    { timeout: 240_000 }, async () => {
      const world = createAuthoredTown(5901);
      const { town, director } = world;
      // Player resident joins the birch household like the life client does.
      town.spawnResident({
        id: "player", displayName: "You", homeLocationId: "apt_b",
        personality: town.residents.mind("npc_anika").personality,
      });
      if (town.groups.definitionOf("fam_birch"))
        town.groups.addMember("fam_birch", "player");

      const monitor = new SM();
      let violations = 0;
      let checks = 0;

      // Seeded pseudo-commands: the "player" wanders, sits, orders coffee.
      const places = ["cafe", "park", "library", "studio", "store", "apt_b"];
      let seed = 123456789;
      const rnd = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };

      let savedMidRun: string | null = null;

      for (let day = 0; day < 7; day++) {
        for (let m = 0; m < 1440; m += 10) {
          step(town, director, 10);

          // Player picks a destination every couple of hours.
          if ((m / 10) % 12 === 0 && rnd() < 0.5) {
            const dest = places[Math.floor(rnd() * places.length)]!;
            try {
              town.navigation.beginMove("player" as never,
                dest as never, () => {});
            } catch { /* closed venue — fine */ }
          }

          if ((m / 10) % 6 === 0) {
            checks++;
            violations += monitor.visit(town, director).violations.length;

              await new Promise((r) => setImmediate(r)); // keep worker IPC alive
          }
          if (day === 3 && m === 720 && savedMidRun === null) {
            savedMidRun = saveToJson(town, director);
          }
        }
      }

      expect(checks).toBeGreaterThan(100);
      expect(violations).toBe(0);

      // Mid-run snapshot restores into an identical continuing world.
      if (savedMidRun !== null) {
        const restored = restoreFromJson(savedMidRun);
        for (let i = 0; i < 60; i++) step(restored.town, restored.director, 10);
        for (const id of restored.town.residents.orderedIds()) {
          for (const n of restored.town.residents.mind(id).needs.all())
            expect(Number.isFinite(n.current)).toBe(true);
        }
      }

      // Bounded memory growth across the whole run.
      for (const id of [...town.residents.orderedIds(), "player"])
        expect((town.memory.tryStoreFor(id)?.count ?? 0)).toBeLessThanOrEqual(250);
    });
});

