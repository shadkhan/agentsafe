import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";

export default defineConfig({
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: {
        "@agentsafe/shared-types": "../../packages/shared-types/src/index.ts",
        "@agentsafe/risk-engine": "../../packages/risk-engine/src/index.ts",
        "@agentsafe/scanner": "../../packages/scanner/src/index.ts",
        "@agentsafe/scanner-wasm": "../../packages/scanner-wasm/src/index.ts",
        "@agentsafe/webmcp-security": "../../packages/webmcp-security/src/index.ts",
        "@agentsafe/dom-sanitizer": "../../packages/dom-sanitizer/src/index.ts",
        "@agentsafe/markdown-exporter": "../../packages/markdown-exporter/src/index.ts"
      }
    }
  }),
  manifest: {
    name: "AgentSafe - Prompt Injection Detector",
    short_name: "AgentSafe",
    description: "Detect hidden AI instructions and copy sanitized webpage content safely.",
    permissions: ["activeTab", "sidePanel", "storage", "scripting", "downloads", "tabs"],
    host_permissions: [],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    action: {
      default_title: "Scan with AgentSafe"
    },
    side_panel: {
      default_path: "sidepanel.html"
    }
  }
});
