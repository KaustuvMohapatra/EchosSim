import { residentAtlasUrl } from "../../characters/residentAssets.js";

/** Match the world renderer's first 32x48 sprite frame in UI portraits. */
export function ResidentPortrait({ id, large = false }: {
  id: string;
  large?: boolean;
}) {
  return (
    <span aria-hidden="true"
      className={`resident-avatar resident-avatar--pixel${large ? " resident-avatar--pixel-large" : ""}`}
      style={{ backgroundImage: `url("${residentAtlasUrl(id)}")` }} />
  );
}
