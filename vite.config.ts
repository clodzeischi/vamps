import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { blockFiles } from "./scripts/block-files.mjs";

// base "./" keeps every asset URL relative, so the build works on GitHub Pages
// under any repository name.
export default defineConfig({
  base: "./",
  plugins: [react(), blockFiles()],
  build: { chunkSizeWarningLimit: 1500 }, // three.js alone is ~600 kB
});
