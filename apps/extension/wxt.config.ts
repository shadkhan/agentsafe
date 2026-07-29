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
        "@agentsafe/browser-scanner-adapter": "../../packages/browser-scanner-adapter/src/index.ts",
        "@agentsafe/risk-engine": "../../packages/risk-engine/src/index.ts",
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
    // The side panel API requires Chrome 114.
    minimum_chrome_version: "114",
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
    },
    permissions: ["activeTab", "sidePanel", "storage", "scripting", "tabs"],
    host_permissions: [],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    action: {
      default_title: "Scan with AgentSafe",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "128": "icon/128.png"
      }
    },
    side_panel: {
      default_path: "sidepanel.html"
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
    }
  }
});
