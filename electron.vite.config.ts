import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const rendererRoot = path.resolve(projectRoot, "src/renderer");

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["zod"] })],
    build: {
      outDir: path.resolve(projectRoot, "out/main"),
      rollupOptions: {
        input: path.resolve(projectRoot, "electron/main.ts"),
        output: { entryFileNames: "index.js" }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: path.resolve(projectRoot, "out/preload"),
      rollupOptions: {
        input: path.resolve(projectRoot, "electron/preload.ts"),
        output: { entryFileNames: "preload.cjs", format: "cjs" }
      }
    }
  },
  renderer: {
    root: rendererRoot,
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(projectRoot, "src")
      }
    },
    build: {
      outDir: path.resolve(projectRoot, "out/renderer"),
      emptyOutDir: true,
      minify: "esbuild",
      sourcemap: true
    }
  }
});
