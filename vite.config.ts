import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const rendererRoot = path.resolve(projectRoot, "src/renderer");

export default defineConfig({
  root: rendererRoot,
  plugins: [vue(), tailwindcss()],
  publicDir: false,
  optimizeDeps: {
    exclude: ["pdfjs-dist"]
  },
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src")
    }
  },
  server: {
    fs: {
      allow: [projectRoot]
    }
  },
  build: {
    outDir: path.resolve(projectRoot, "dist/web"),
    emptyOutDir: true,
    sourcemap: false
  }
});
