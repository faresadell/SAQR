import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only (no database). Integration tests run with `npm run test:integration`.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], exclude: ["**/*.integration.test.ts", "node_modules/**"], environment: "node" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
