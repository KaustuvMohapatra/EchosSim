/** Architecture guardrail: simulation packages must NEVER import Phaser or DOM APIs. */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SIMULATION_PACKAGES = [
  "packages/core/src",
  "packages/cognition/src",
  "packages/world/src",
  "packages/social/src",
  "packages/simulation/src",
  "packages/content/src",
  "packages/inspector/src",
];

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...collectTsFiles(full));
    else if (entry.endsWith(".ts")) results.push(full);
  }
  return results;
}

const ROOT = join(__dirname, "../..");

describe("engine independence", () => {
  it("simulation packages never import Phaser", () => {
    for (const pkg of SIMULATION_PACKAGES) {
      const files = collectTsFiles(join(ROOT, pkg));
      for (const file of files) {
        const content = readFileSync(file, "utf-8");
        expect(content).not.toMatch(/from\s+["']phaser/i);
        expect(content).not.toMatch(/import.*phaser/i);
        expect(content).not.toMatch(/require\(.*phaser/i);
      }
    }
  });

  it("simulation packages never import DOM APIs", () => {
    for (const pkg of SIMULATION_PACKAGES) {
      const files = collectTsFiles(join(ROOT, pkg));
      for (const file of files) {
        const content = readFileSync(file, "utf-8");
        // document/window are browser-only; fs is node-only (persistence may use it)
        expect(content).not.toMatch(/document\./);
        expect(content).not.toMatch(/window\./);
        expect(content).not.toMatch(/HTMLElement/);
        expect(content).not.toMatch(/from\s+["']fs["']/);
      }
    }
  });
});
