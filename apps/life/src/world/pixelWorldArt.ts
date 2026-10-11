/** Original deterministic pixel textures for EchoSim's Babylon 2.5D world. */
import {
  Color3, DynamicTexture, Material, Scene, StandardMaterial, Texture,
} from "@babylonjs/core";
import type { LotPlacement } from "./layout.js";

function hash(a: number, b: number, salt = 0): number {
  let n = Math.imul(a + 811, 374761393) ^ Math.imul(b + 1327, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function paintTexture(
  scene: Scene, name: string, width: number, height: number,
  painter: (ctx: CanvasRenderingContext2D) => void,
  alpha = false,
): DynamicTexture {
  const texture = new DynamicTexture(name, { width, height }, scene, false, Texture.NEAREST_SAMPLINGMODE);
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.imageSmoothingEnabled = false;
  painter(context);
  texture.hasAlpha = alpha;
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.update(false);
  return texture;
}

export function worldMaterial(
  scene: Scene, name: string, texture: DynamicTexture,
  opacity = false,
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseTexture = texture;
  m.specularColor = Color3.Black();
  m.backFaceCulling = false;
  if (opacity) {
    m.useAlphaFromDiffuseTexture = true;
    m.transparencyMode = Material.MATERIAL_ALPHATEST;
    m.alphaCutOff = 0.5;
    m.disableLighting = true;
    m.emissiveColor = Color3.White();
  }
  return m;
}

export function grassMaterial(scene: Scene): StandardMaterial {
  const tex = paintTexture(scene, "pixel-grass", 64, 64, (ctx) => {
    ctx.fillStyle = "#587f61"; ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) {
      const h = hash(x, y);
      ctx.fillStyle = ["#608768", "#4e7758", "#6a916d", "#557e60"][h % 4]!;
      ctx.fillRect(x, y, 4, 4);
      if (h % 11 === 0) {
        ctx.fillStyle = "#96a679"; ctx.fillRect(x + 2, y, 1, 2);
      }
    }
  });
  tex.uScale = 18; tex.vScale = 14;
  return worldMaterial(scene, "pixel-grass-mat", tex);
}

export function pavementMaterial(scene: Scene): StandardMaterial {
  const tex = paintTexture(scene, "pixel-cobblestone", 64, 64, (ctx) => {
    ctx.fillStyle = "#4e5c5f"; ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 12) {
      const xx = x + (y % 16 ? -6 : 0), h = hash(x, y, 8);
      ctx.fillStyle = ["#929285", "#a1a092", "#888f87", "#a5a798", "#777f7a"][h % 5]!;
      ctx.fillRect(xx + 1, y + 1, 10, 6);
      ctx.fillStyle = "#b2ad9a"; ctx.fillRect(xx + 2, y + 1, 6, 1);
      ctx.fillStyle = "#717c77"; ctx.fillRect(xx + 1, y + 6, 10, 1);
    }
  });
  tex.uScale = 2; tex.vScale = 9;
  return worldMaterial(scene, "pixel-pavement-mat", tex);
}

export function roofMaterial(scene: Scene): StandardMaterial {
  const tex = paintTexture(scene, "pixel-roof", 64, 64, (ctx) => {
    ctx.fillStyle = "#354e5e"; ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 12) {
      const xx = x + (y % 16 ? -6 : 0);
      ctx.fillStyle = ["#476372", "#526c79", "#3f5a69"][hash(x, y, 15) % 3]!;
      ctx.fillRect(xx + 1, y + 1, 10, 6);
      ctx.fillStyle = "#647e88"; ctx.fillRect(xx + 1, y + 1, 9, 1);
    }
  });
  tex.uScale = 3; tex.vScale = 3;
  return worldMaterial(scene, "pixel-roof-mat", tex);
}

function tint(lot: LotPlacement): string {
  const [r, g, b] = lot.color;
  return `rgb(${Math.round(r * 200 + 42)},${Math.round(g * 193 + 43)},${Math.round(b * 180 + 45)})`;
}

export function facadeMaterial(scene: Scene, lot: LotPlacement): StandardMaterial {
  const tex = paintTexture(scene, `pixel-facade-${lot.locationId}`, 96, 80, (ctx) => {
    ctx.fillStyle = "#222e3b"; ctx.fillRect(0, 0, 96, 80);
    ctx.fillStyle = tint(lot); ctx.fillRect(2, 2, 92, 76);
    // Stucco/brick with tiny highlighted mortar patterns.
    for (let y = 5; y < 77; y += 7) for (let x = (y % 14 ? 4 : 10); x < 91; x += 13) {
      ctx.fillStyle = "rgba(252,237,211,.13)"; ctx.fillRect(x, y, 8, 1);
      ctx.fillStyle = "rgba(17,32,44,.16)"; ctx.fillRect(x + 8, y + 1, 1, 5);
    }
    const floors = lot.height >= 8 ? 3 : lot.height >= 6 ? 2 : 1;
    for (let floor = 0; floor < floors; floor++) {
      const y = 13 + floor * (floors === 3 ? 17 : 22);
      for (let col = 0; col < 3; col++) {
        const x = 15 + col * 29;
        if (floor === floors - 1 && col === 1) continue; // door
        ctx.fillStyle = "#293a49"; ctx.fillRect(x - 2, y - 2, 16, 15);
        ctx.fillStyle = "#e6b96e"; ctx.fillRect(x, y, 12, 10);
        ctx.fillStyle = "#799daf"; ctx.fillRect(x + 1, y + 1, 10, 7);
        ctx.fillStyle = "#ecbf78"; ctx.fillRect(x + 1, y + 1, 3, 7);
        ctx.fillStyle = "#2d3c4c"; ctx.fillRect(x + 5, y, 2, 10);
        ctx.fillStyle = "#d4c3a6"; ctx.fillRect(x - 3, y + 11, 18, 2);
      }
    }
    ctx.fillStyle = "#263441"; ctx.fillRect(40, 59, 18, 21);
    ctx.fillStyle = "#655343"; ctx.fillRect(42, 61, 14, 19);
    ctx.fillStyle = "#9b7c54"; ctx.fillRect(44, 62, 10, 18);
    ctx.fillStyle = "#f1c878"; ctx.fillRect(51, 70, 2, 2);
    const shop = ["cafe","bakery","store","bookstore","restaurant","studio"].includes(lot.locationId);
    if (shop) {
      ctx.fillStyle = "#273443"; ctx.fillRect(3, 48, 90, 9);
      for (let x = 4; x < 93; x += 10) {
        ctx.fillStyle = x % 20 < 10 ? "#e4b667" : "#be796c";
        ctx.fillRect(x, 49, 9, 7);
      }
    }
  });
  return worldMaterial(scene, `pixel-facade-mat-${lot.locationId}`, tex);
}

export function treeMaterial(scene: Scene, variant = 0): StandardMaterial {
  const tex = paintTexture(scene, `pixel-tree-${variant}`, 32, 48, (ctx) => {
    const colors = variant === 1
      ? ["#a66e5b", "#d19263", "#e7b47a", "#785647"]
      : variant === 2
        ? ["#669c86", "#87b3a1", "#9ec9ad", "#456a61"]
        : ["#457c5d", "#64a06e", "#85b67a", "#35644e"];
    ctx.clearRect(0, 0, 32, 48);
    ctx.fillStyle = "#5b4139"; ctx.fillRect(13, 29, 6, 17);
    ctx.fillStyle = "#92664c"; ctx.fillRect(15, 30, 2, 15);
    ctx.fillStyle = "#294a43";
    ctx.fillRect(7, 9, 20, 26); ctx.fillRect(3, 15, 26, 14);
    ctx.fillStyle = colors[0]!; ctx.fillRect(7, 10, 20, 22); ctx.fillRect(4, 16, 25, 12);
    ctx.fillStyle = colors[1]!; ctx.fillRect(7, 9, 16, 14); ctx.fillRect(5, 16, 11, 9);
    ctx.fillStyle = colors[2]!; ctx.fillRect(10, 10, 9, 5); ctx.fillRect(6, 18, 6, 6);
    ctx.fillStyle = colors[3]!; ctx.fillRect(21, 21, 7, 8); ctx.fillRect(16, 28, 8, 5);
  }, true);
  return worldMaterial(scene, `pixel-tree-mat-${variant}`, tex, true);
}

export function flowerMaterial(scene: Scene): StandardMaterial {
  const tex = paintTexture(scene, "pixel-flowers", 24, 24, (ctx) => {
    ctx.clearRect(0, 0, 24, 24);
    for (let i = 0; i < 7; i++) {
      const x = 3 + hash(i, 5) % 17, y = 9 + hash(i, 13) % 8;
      ctx.fillStyle = "#376d4d"; ctx.fillRect(x, y, 2, 24 - y);
      ctx.fillStyle = ["#e8a3a5", "#e1cb85", "#bed4f0", "#d6b7e6"][i % 4]!;
      ctx.fillRect(x - 2, y - 2, 6, 4);
      ctx.fillStyle = "#f0d28e"; ctx.fillRect(x, y - 1, 2, 2);
    }
  }, true);
  return worldMaterial(scene, "pixel-flowers-mat", tex, true);
}
