import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { blockFiles } from "./scripts/block-files.mjs";

// base "./" keeps every asset URL relative, so the build works on GitHub Pages
// under any repository name.
export default defineConfig({
  base: "./",
  plugins: [react(), blockFiles()],
  build: {
    chunkSizeWarningLimit: 1500,
    // The libraries in a file of their own, which browsers keep from one deploy to the next.
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: "vendor", test: /node_modules/ }] } },
    },
  },
});
