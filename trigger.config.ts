import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_krnvhjbohzlcfyficusz",
  runtime: "node",
  logLevel: "log",
  maxDuration: 86400, // 24 hours — blast task uses wait.until for multi-day drips
  dirs: ["src/trigger"],
});
