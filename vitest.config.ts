import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["packages/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  },
  resolve: {
    alias: {
      "@agentsafe/shared-types": new URL("./packages/shared-types/src/index.ts", import.meta.url).pathname,
      "@agentsafe/browser-scanner-adapter": new URL("./packages/browser-scanner-adapter/src/index.ts", import.meta.url).pathname,
      "@agentsafe/risk-engine": new URL("./packages/risk-engine/src/index.ts", import.meta.url).pathname,
      "@agentsafe/scanner-wasm": new URL("./packages/scanner-wasm/src/index.ts", import.meta.url).pathname,
      "@agentsafe/webmcp-security": new URL("./packages/webmcp-security/src/index.ts", import.meta.url).pathname,
      "@agentsafe/dom-sanitizer": new URL("./packages/dom-sanitizer/src/index.ts", import.meta.url).pathname,
      "@agentsafe/markdown-exporter": new URL("./packages/markdown-exporter/src/index.ts", import.meta.url).pathname
    }
  }
});
