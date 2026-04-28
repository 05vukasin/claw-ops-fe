import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // Exclude Next.js build output and node_modules from test discovery.
    exclude: ["node_modules", ".next", "out", "build"],
  },
  resolve: {
    alias: {
      // Mirror the tsconfig paths alias so test imports resolve correctly.
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
