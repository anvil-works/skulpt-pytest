import { defineConfig } from "@rstest/core";
export default defineConfig({
  include: ["tests/*.test.ts"], testTimeout: 30000,
  tools: { rspack: { module: { rules: [{ resourceQuery: /raw/, type: "asset/source" }] } } },
});
