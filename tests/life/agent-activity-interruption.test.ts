import { describe, expect, it } from "vitest";
import { NullEngine, Scene } from "@babylonjs/core";
import { AgentLayer } from "../../apps/life/src/characters/AgentLayer.js";
import { LifeModeAdapter } from "../../apps/life/src/simulation/LifeModeAdapter.js";
import { standingPoint } from "../../apps/life/src/world/pedestrianPaths.js";

describe("Life resident activity interruption", () => {
  it("cancels stale object approaches and badges on a destination change", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const adapter = new LifeModeAdapter({ seed: 7001n });
    const layer = new AgentLayer(scene, adapter, () => "player", () => true);
    try {
      layer.update();
      const visuals = (layer as unknown as {
        visuals: Map<string, {
          activity?: { headedToObject: boolean; arrived: boolean };
          waypoints: { x: number; z: number }[];
          badge: { isVisible: boolean };
          locationId?: string;
        }>;
      }).visuals;
      const visual = visuals.get("npc_mira");
      expect(visual).toBeDefined();
      if (!visual) return;
      visual.activity = { headedToObject: true, arrived: false };
      visual.badge.isVisible = true;
      visual.waypoints = [{ x: 999, z: 999 }];
      const current = visual.locationId;
      const next = current === "cafe" ? "park" : "cafe";
      adapter.town.moveAgent("npc_mira" as never, next as never);
      layer.update();
      expect(visual.activity).toBeUndefined();
      expect(visual.badge.isVisible).toBe(false);
      expect(visual.locationId).toBe(next);
      expect(visual.waypoints).not.toContainEqual({ x: 999, z: 999 });
      expect(visual.waypoints.at(-1)).toEqual(standingPoint(next, "npc_mira"));
    } finally {
      layer.dispose();
      adapter.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
