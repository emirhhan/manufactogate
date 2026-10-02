import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

/** Builds the page-side extract bundle as a single classic script (no modules in injected scripts). */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL("./src/extract/index.ts", import.meta.url)),
      name: "__mgx_bundle",
      formats: ["iife"],
      fileName: () => "extract.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
