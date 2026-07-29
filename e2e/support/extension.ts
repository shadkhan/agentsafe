import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "../..");
const BUILD_DIR = path.join(REPO_ROOT, "apps/extension/.output/chrome-mv3");
const TEST_EXTENSION_DIR = path.join(REPO_ROOT, "test-results/e2e-extension");

export interface ExtensionContext {
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
}

/**
 * Copies the production build and grants it static host permissions.
 *
 * The shipped manifest deliberately has none: it relies on `activeTab`, which
 * Chrome only grants after a real click on the extension action, and on
 * `chrome.permissions.request`, which requires a user gesture. Neither is
 * available to an automated click inside an extension page. Everything else
 * under test — the worker bundle, the WASM binary, the rules, the UI — is the
 * production artifact, byte for byte.
 */
export async function prepareTestExtension(): Promise<string> {
  if (!existsSync(path.join(BUILD_DIR, "manifest.json"))) {
    throw new Error(
      `Missing extension build at ${BUILD_DIR}. Run "pnpm --filter @agentsafe/extension build" before "pnpm e2e".`
    );
  }
  await rm(TEST_EXTENSION_DIR, { recursive: true, force: true });
  await cp(BUILD_DIR, TEST_EXTENSION_DIR, { recursive: true });

  const manifestPath = path.join(TEST_EXTENSION_DIR, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions = ["<all_urls>"];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return TEST_EXTENSION_DIR;
}

export async function launchExtension(): Promise<ExtensionContext> {
  const extensionPath = await prepareTestExtension();
  const userDataDir = await mkdtemp(path.join(tmpdir(), "agentsafe-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  });

  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, extensionId: new URL(worker.url()).host, userDataDir };
}

export async function closeExtension(extension: ExtensionContext): Promise<void> {
  await extension.context.close();
  await rm(extension.userDataDir, { recursive: true, force: true });
}

/**
 * Opens the side panel document as a background tab. The panel resolves its
 * target through `chrome.tabs.query({ active: true, currentWindow: true })`, so
 * the page under test must stay the active tab while the panel drives the scan.
 */
export async function openSidePanel(extension: ExtensionContext, pageUnderTest: Page): Promise<Page> {
  const panel = await extension.context.newPage();
  await panel.goto(`chrome-extension://${extension.extensionId}/sidepanel.html`);
  await panel.locator("button.primary").waitFor();
  await pageUnderTest.bringToFront();
  return panel;
}

/**
 * Clicks by dispatching in-page, never through Playwright input. A real click
 * focuses the panel tab, which makes the panel target itself instead of the page
 * under test, and page injection then fails on a chrome-extension:// URL.
 */
export async function clickPanelButton(panel: Page, label: string): Promise<void> {
  const clicked = await panel.evaluate((name) => {
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === name || candidate.title === name
    );
    button?.click();
    return Boolean(button);
  }, label);
  if (!clicked) throw new Error(`No side panel button matched "${label}".`);
}

export interface PanelFinding {
  ruleId: string;
  category: string;
  severity: string;
  visibleToUser: boolean;
  selector: string;
  frameUrl?: string;
}

/** Reads the scan the panel cached for the active tab, rather than re-parsing the UI. */
export async function readFindings(panel: Page): Promise<PanelFinding[]> {
  return panel.evaluate(async () => {
    const api = (globalThis as unknown as { chrome: typeof chrome }).chrome;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const key = `agentsafe.scan.${tab?.id}`;
    const stored = await api.storage.session.get([key]);
    const cached = stored[key] as { scan?: { findings?: PanelFinding[] } } | undefined;
    return (cached?.scan?.findings ?? []).map((finding) => ({
      ruleId: finding.ruleId,
      category: finding.category,
      severity: finding.severity,
      visibleToUser: finding.visibleToUser,
      selector: finding.selector,
      frameUrl: finding.frameUrl
    }));
  });
}

export async function runScan(panel: Page): Promise<string> {
  // A programmatic click keeps the scanned page in front; Playwright's own click
  // would focus the panel tab and change which tab the panel targets.
  await panel.evaluate(() => document.querySelector<HTMLButtonElement>("button.primary")?.click());
  await panel
    .locator("p.status")
    .filter({ hasText: /page findings|Scan failed|Scan cancelled|Scan skipped/ })
    .first()
    .waitFor({ timeout: 90_000 });
  return (await panel.locator("p.status").first().textContent()) ?? "";
}

export interface PanelSummary {
  risk: number;
  metrics: Record<string, number>;
  findingCount: number;
}

export async function readSummary(panel: Page, status: string): Promise<PanelSummary> {
  const summary = await panel.evaluate(() => {
    const metrics: Record<string, number> = {};
    for (const metric of Array.from(document.querySelectorAll(".metric"))) {
      const label = metric.querySelector("span")?.textContent?.trim();
      if (label) metrics[label] = Number(metric.querySelector("strong")?.textContent ?? "0");
    }
    return { risk: Number(document.querySelector(".score span")?.textContent ?? "0"), metrics };
  });
  return { ...summary, findingCount: Number(/(\d+) page findings/.exec(status)?.[1] ?? "-1") };
}
