import { fileURLToPath, URL } from "node:url";
import path from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(projectRoot, "tests/unit/setup.ts")],
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/shared/domain/**/*.ts", "src/renderer/stores/**/*.ts"]
    }
  }
});
