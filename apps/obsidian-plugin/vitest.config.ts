import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The runtime provides `obsidian`; unit tests stand in a stub so the sync
      // engine can be exercised without a running Obsidian instance.
      obsidian: fileURLToPath(new URL("./src/test/obsidian-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
