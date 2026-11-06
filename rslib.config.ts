import { defineConfig } from "@rslib/core";
export default defineConfig({
  source: { entry: { index: "./src/index.ts" } },
  lib: [{ format: "esm", syntax: "es2022", dts: true }],
  output: { target: "web", distPath: { root: "dist" } },
  tools: { rspack: { module: { rules: [{ resourceQuery: /raw/, type: "asset/source" }] } } },
});
