import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  define: {
    "__BASE_PATH__": JSON.stringify(""),
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    globals: true,
    include: [
      "server/__tests__/**/*.test.ts",
      "client/src/__tests__/**/*.test.ts",
      "client/src/__tests__/**/*.test.tsx",
    ],
    setupFiles: ["client/src/__tests__/setup.ts"],
  },
});
