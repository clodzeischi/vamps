// The bank of map blocks (docs/design/levels.md): every JSON file in
// src/data/blocks/, drawn in the block editor (`npm run blocks`). A new file
// is picked up on the next build; a malformed one throws here, naming it.
import { fromFile, type BlockData } from "../tactical/map/blocks";

const files = import.meta.glob("./blocks/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

/** Each block with the name of its file (which must be its id). */
export const BLOCKS: [string, BlockData][] = Object.entries(files).map(([path, raw]) => [path.replace(/^.*\/|\.json$/g, ""), fromFile(raw)]);
