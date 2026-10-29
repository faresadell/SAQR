import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Integration tests talk to a REAL PostgreSQL database (DATABASE_URL). They TRUNCATE tables,
// so point DATABASE_URL at a throwaway test database, never at real data.
export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: [
      { find: "server-only", replacement: fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
});
