import { describe, expect, it, vi } from "vitest";
import { NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { AgentLayer } from "../../apps/life/src/characters/AgentLayer.js";

describe("Babylon resident seating presentation", () => {
  it("drops an interrupted walk and hides an old activity badge while seated", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const seatedAt = new Map<string, { x: number; z: number }>();
    const adapter = {
      playerId: "player",
      seatedAt,
      town: { events: { subscribe: () => () => undefined } },
      residentPresenceFor: () => [],
      worldPresenceFor: () => [],
    };
    const layer = new AgentLayer(scene, adapter as never);
    const root = { position: new Vector3(0, 1.275, 0) };
    const pose = { uOffset: 0, vOffset: 0 };
    const visual = {
      root, texture: pose, waypoints: [{ x: 20, z: 0 }],
      elapsed: 0, facing: "front",
      poseRow: -1, poseFrame: -1,
      badge: { isVisible: true },
      activity: { kind: "bench", timeLeft: 4, headedToObject: true, arrived: true },
    };
    // Inject a minimal visual to exercise the actual render loop without
    // allocating browser-only DynamicTextures in Babylon's NullEngine.
    (layer as unknown as { visuals: Map<string, unknown> }).visuals.set("npc", visual);
    seatedAt.set("npc", { x: 5, z: 7 });
    layer.renderFrame(1 / 60);
    expect(root.position).toEqual(new Vector3(5, 0.94, 7));
    expect(visual.waypoints).toEqual([]);
    expect(visual.activity).toBeUndefined();
    expect(visual.badge.isVisible).toBe(false);
    seatedAt.delete("npc");
    layer.renderFrame(1 / 60);
    expect(root.position.x).toBe(5);
    expect(root.position.z).toBe(7);
    expect(root.position.y).toBe(1.275);
    (layer as unknown as { visuals: Map<string, unknown> }).visuals.clear();
    layer.dispose();
    scene.dispose();
    engine.dispose();
  });
});
