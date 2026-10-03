import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

/** Builds three entry points into dist/ with stable names so manifest.json can reference them. */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        background: fileURLToPath(new URL("./src/background/index.ts", import.meta.url)),
        content: fileURLToPath(new URL("./src/content/index.ts", import.meta.url)),
        overlay: fileURLToPath(new URL("./src/overlay/index.ts", import.meta.url)),
        popup: fileURLToPath(new URL("./src/popup/index.html", import.meta.url)),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        // Content scripts cannot load ES module chunks; keep each entry self-contained.
        manualChunks: undefined,
      },
    },
  },
});
