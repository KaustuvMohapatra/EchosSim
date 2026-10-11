/**
 * Lightweight, deterministic pixel residents for Babylon Life.
 *
 * A single atlas per resident contains five pose rows (front, back, left,
 * right, seated), each with four animation frames. Nothing depends on browser
 * randomness or the simulation clock, and the atlas can later be replaced by
 * authored spritesheets without changing AgentLayer's presentation contract.
 */
import { DynamicTexture, Scene, Texture } from "@babylonjs/core";

export const PIXEL_FRAME_WIDTH = 32;
export const PIXEL_FRAME_HEIGHT = 48;
export const PIXEL_FRAMES = 4;
export const PIXEL_ROWS = 5;
export type PixelPose = "front" | "back" | "left" | "right" | "seated";

export const PIXEL_POSE_ROW: Readonly<Record<PixelPose, number>> = {
  front: 0, back: 1, left: 2, right: 3, seated: 4,
};

export interface ResidentPalette {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  accent: string;
  hairstyle: number;
}

const SKIN = ["#edb98f", "#d79870", "#bb7955", "#965a42", "#714332", "#f1c6aa"];
const HAIR = ["#211c26", "#443026", "#74422c", "#202b38", "#a36f41", "#5f343f"];
const SHIRTS = ["#67b9b2", "#e7aa6d", "#bd849c", "#82a4d5", "#9fb57e", "#d0a45d", "#b68fdb"];
const PANTS = ["#283d50", "#3e465c", "#504640", "#425e55", "#393449"];
const ACCENTS = ["#f6dfb0", "#f1b2ac", "#c5e7a1", "#dfd0f8"];

export function residentHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function paletteForResident(agentId: string): ResidentPalette {
  const n = residentHash(agentId);
  return {
    skin: SKIN[n % SKIN.length]!,
    hair: HAIR[(n >>> 3) % HAIR.length]!,
    shirt: SHIRTS[(n >>> 7) % SHIRTS.length]!,
    pants: PANTS[(n >>> 12) % PANTS.length]!,
    accent: ACCENTS[(n >>> 18) % ACCENTS.length]!,
    hairstyle: (n >>> 22) % 4,
  };
}

/** No external image fetch, no license ambiguity: first-pass sprites are drawn at native pixel resolution. */
export function makeResidentAtlas(scene: Scene, agentId: string): DynamicTexture {
  const texture = new DynamicTexture(
    "resident-atlas-" + agentId,
    { width: PIXEL_FRAME_WIDTH * PIXEL_FRAMES, height: PIXEL_FRAME_HEIGHT * PIXEL_ROWS },
    scene,
    false,
    Texture.NEAREST_SAMPLINGMODE,
  );
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  const palette = paletteForResident(agentId);
  for (let row = 0; row < PIXEL_ROWS; row++) {
    for (let frame = 0; frame < PIXEL_FRAMES; frame++) {
      ctx.save();
      ctx.translate(frame * PIXEL_FRAME_WIDTH, row * PIXEL_FRAME_HEIGHT);
      drawResident(ctx, palette, row, frame);
      ctx.restore();
    }
  }
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.update(false);
  texture.uScale = 1 / PIXEL_FRAMES;
  texture.vScale = 1 / PIXEL_ROWS;
  return texture;
}

function drawResident(
  ctx: CanvasRenderingContext2D,
  p: ResidentPalette,
  row: number,
  frame: number,
): void {
  const seated = row === PIXEL_POSE_ROW.seated;
  const lookingAway = row === PIXEL_POSE_ROW.back;
  const side = row === PIXEL_POSE_ROW.left || row === PIXEL_POSE_ROW.right;
  const goingLeft = row === PIXEL_POSE_ROW.left;
  const walk = seated ? 0 : [0, -2, 0, 2][frame]!;
  const swing = seated ? 0 : [0, -2, 0, 2][frame]!;
  const bob = seated ? 5 : frame % 2 === 1 ? 1 : 0;
  const ink = "#202833";
  const shade = "#172432";
  const skinShade = "#744c43";
  const hairX = side ? (goingLeft ? 10 : 12) : 10;

  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y + bob, w, h);
  };

  // Shadow silhouette and feet remain separate to keep the poses readable.
  if (seated) {
    px(6, 37, 20, 5, ink);
    px(7, 38, 8, 3, p.pants);
    px(17, 38, 8, 3, p.pants);
    px(5, 41, 9, 3, shade);
    px(18, 41, 9, 3, shade);
  } else {
    px(9 + walk, 32, 7, 11, ink);
    px(17 - walk, 32, 7, 11, ink);
    px(10 + walk, 33, 5, 9, p.pants);
    px(18 - walk, 33, 5, 9, p.pants);
    px(8 + walk, 42, 9, 3, shade);
    px(17 - walk, 42, 9, 3, shade);
  }

  // Sleeves and arms swing opposite the legs.
  px(5 - swing / 2, 23, 7, 13, ink);
  px(6 - swing / 2, 24, 5, 10, p.shirt);
  px(6 - swing / 2, 34, 5, 3, p.skin);
  px(21 + swing / 2, 23, 7, 13, ink);
  px(22 + swing / 2, 24, 5, 10, p.shirt);
  px(22 + swing / 2, 34, 5, 3, p.skin);

  // Tunic outline, hem, accent, collar.
  px(10, 21, 14, 16, ink);
  px(11, 22, 12, 13, p.shirt);
  px(11, 33, 12, 2, p.accent);
  px(14, 22, 6, 2, p.accent);

  // Head has a dark outline and tiny facial details.
  px(hairX - 1, 6, 15, 17, ink);
  px(hairX, 8, 13, 14, p.skin);
  px(hairX - 2, 13, 2, 5, p.skin);
  px(hairX + 13, 13, 2, 5, p.skin);
  px(hairX, 7, 13, 6, p.hair);

  if (p.hairstyle === 0) {
    px(hairX - 2, 8, 4, 10, p.hair);
  } else if (p.hairstyle === 1) {
    px(hairX + 10, 8, 4, 10, p.hair);
    px(hairX - 1, 5, 11, 3, p.hair);
  } else if (p.hairstyle === 2) {
    px(hairX - 2, 8, 4, 12, p.hair);
    px(hairX + 11, 8, 4, 12, p.hair);
  } else {
    px(hairX - 1, 5, 14, 5, p.hair);
    px(hairX + 7, 10, 5, 3, p.hair);
  }

  if (lookingAway) {
    px(hairX, 13, 13, 9, p.hair);
    px(hairX + 4, 21, 5, 1, p.accent);
  } else if (side) {
    const eyeX = goingLeft ? hairX + 3 : hairX + 9;
    px(eyeX, 14, 2, 2, ink);
    px(goingLeft ? hairX + 2 : hairX + 10, 19, 2, 1, skinShade);
  } else {
    px(hairX + 3, 14, 2, 2, ink);
    px(hairX + 9, 14, 2, 2, ink);
    px(hairX + 6, 18, 3, 1, skinShade);
  }
}
