import { defineConfig } from "@rsbuild/core";
import { join } from "node:path";
import { runtimeDist } from "./scripts/runtime-path";

export default defineConfig({
  source: { entry: { index: "./demo/index.ts" } },
  html: { template: "./demo/index.html" },
  output: {
    distPath: { root: "dist-demo" },
    copy: ["skulpt.min.js", "skulpt-stdlib.js", "skulpt-stdlib-*.json"].map(name =>
      ({ from: join(runtimeDist, name), to: "skulpt/[name][ext]" })),
  },
  tools: { rspack: { module: { rules: [{ resourceQuery: /raw/, type: "asset/source" }] } } },
  server: { host: "127.0.0.1" },
});
