import { expect, test } from "@playwright/test";
import path from "node:path";
import {
  clickPanelButton,
  closeExtension,
  launchExtension,
  openSidePanel,
  readFindings,
  readSummary,
  runScan,
  REPO_ROOT,
  type ExtensionContext
} from "./support/extension";
import { startFixtureServer, type FixtureServer } from "./support/fixture-server";

/**
 * Drives the packaged MV3 build in Chromium: the extension loads, the side panel
 * boots, the scan Worker starts, the WASM scanner initializes under the shipped
 * CSP, and findings come back for a real page over a real origin. Unit tests
 * cannot cover any of that.
 */
test.describe("packaged extension scans real pages", () => {
  let extension: ExtensionContext;
  let server: FixtureServer;

  test.beforeAll(async () => {
    server = await startFixtureServer(path.join(REPO_ROOT, "fixtures"));
    extension = await launchExtension();
  });

  test.afterAll(async () => {
    await closeExtension(extension);
    await server.close();
  });

  test("reports hidden instructions, metadata, and comments on a malicious page", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/hidden-instruction.html`);
    const panel = await openSidePanel(extension, page);

    const status = await runScan(panel);
    expect(status).toContain("page findings");

    const summary = await readSummary(panel, status);
    expect(summary.findingCount).toBeGreaterThan(0);
    expect(summary.metrics.critical + summary.metrics.high).toBeGreaterThan(0);
    expect(summary.risk).toBeGreaterThanOrEqual(60);

    const findings = await readFindings(panel);
    expect(findings.map((finding) => finding.ruleId)).toContain("instruction-override");
    expect(findings.some((finding) => !finding.visibleToUser)).toBe(true);
    expect(findings.map((finding) => finding.category)).toContain("metadata");

    await clickPanelButton(panel, "Hidden Content");
    await expect(panel.locator(".finding").first()).toBeVisible();

    await page.close();
    await panel.close();
  });

  test("decodes encoded and unicode payloads end to end", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/unicode-and-encoded.html`);
    const panel = await openSidePanel(extension, page);

    const status = await runScan(panel);
    expect(status).toContain("page findings");
    const summary = await readSummary(panel, status);
    expect(summary.metrics.unicode).toBeGreaterThan(0);

    const ruleIds = (await readFindings(panel)).map((finding) => finding.ruleId);
    expect(ruleIds).toContain("bidi-control");
    expect(ruleIds).toContain("base64-instruction");

    await page.close();
    await panel.close();
  });

  test("flags data-carrying URLs in text and in link attributes", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/exfiltration-urls.html`);
    const panel = await openSidePanel(extension, page);

    const status = await runScan(panel);
    expect(status).toContain("page findings");

    const findings = await readFindings(panel);
    const ruleIds = findings.map((finding) => finding.ruleId);
    expect(ruleIds).toContain("markdown-image-exfiltration");
    expect(ruleIds).toContain("url-parameter-exfiltration");

    // The tracking pixel's URL lives in an attribute, never in a text node.
    expect(findings.some((finding) => finding.selector.toLowerCase().includes("img"))).toBe(true);

    // The ordinary documentation link is visible and uncorroborated, so the
    // low-specificity URL rule must not report it.
    expect(findings.some((finding) => finding.selector.toLowerCase().includes("a:nth-of-type"))).toBe(false);

    await page.close();
    await panel.close();
  });

  test("finds instructions inside embedded frames and shadow roots", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/iframe-and-shadow.html`);
    const panel = await openSidePanel(extension, page);

    const status = await runScan(panel);
    expect(status).toContain("page findings");

    const findings = await readFindings(panel);
    const frameUrls = findings.map((finding) => finding.frameUrl ?? "");
    expect(frameUrls.some((url) => url.includes("iframe-child.html"))).toBe(true);

    // A shadow-DOM selector is recorded relative to its root and joined to the
    // host, because querySelector cannot cross the boundary.
    expect(findings.some((finding) => finding.selector.includes(" >>> "))).toBe(true);

    await page.close();
    await panel.close();
  });

  test("highlights a finding that lives inside a shadow root", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/iframe-and-shadow.html`);
    const panel = await openSidePanel(extension, page);
    await runScan(panel);

    const hidden = (await readFindings(panel)).filter((finding) => !finding.visibleToUser);
    const shadowIndex = hidden.findIndex((finding) => finding.selector.includes(" >>> "));
    expect(shadowIndex, "expected a hidden shadow-DOM finding to highlight").toBeGreaterThanOrEqual(0);

    await clickPanelButton(panel, "Hidden Content");
    await panel.evaluate((index) => {
      const buttons = Array.from(document.querySelectorAll("button")).filter((button) => button.title === "Highlight");
      buttons[index]?.click();
    }, shadowIndex);

    // The style must land inside the shadow root: shadow trees do not inherit
    // document styles, so a document-level stylesheet would leave the highlight
    // class inert.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const host = document.getElementById("shadow-host");
            return Boolean(host?.shadowRoot?.querySelector("#agentsafe-highlight-style"));
          }),
        { timeout: 15_000 }
      )
      .toBe(true);

    await page.close();
    await panel.close();
  });

  // Precision guard. Both fixtures trip a low-specificity rule on visible text
  // (`Use browser ...` and a literal ``` fence). Neither is evidence of risk on
  // its own, so neither should reach a severity a reviewer must triage.
  for (const fixture of ["article", "documentation"]) {
    test(`keeps the benign ${fixture} fixture below triage severity`, async () => {
      const page = await extension.context.newPage();
      await page.goto(`${server.url}/benign/${fixture}.html`);
      const panel = await openSidePanel(extension, page);

      const status = await runScan(panel);
      expect(status).toContain("page findings");

      const summary = await readSummary(panel, status);
      expect(summary.risk).toBeLessThan(35);

      const severities = (await readFindings(panel)).map((finding) => finding.severity);
      expect(severities).not.toContain("critical");
      expect(severities).not.toContain("high");
      expect(severities).not.toContain("medium");

      await page.close();
      await panel.close();
    });
  }

  test("ignores a rule for the site from the finding card", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/hidden-instruction.html`);
    const panel = await openSidePanel(extension, page);
    await runScan(panel);

    const before = await readFindings(panel);
    const targetRule = before[0]?.ruleId;
    expect(targetRule).toBeTruthy();
    const otherRules = new Set(before.map((finding) => finding.ruleId).filter((ruleId) => ruleId !== targetRule));

    await clickPanelButton(panel, "Findings");
    await clickPanelButton(panel, "Ignore this rule on this site");
    await expect(panel.locator("p.status").first()).toContainText(`Ignoring ${targetRule}`);

    const after = await readFindings(panel);
    expect(after.map((finding) => finding.ruleId)).not.toContain(targetRule);
    // Scoping is per rule: everything else must keep reporting.
    for (const ruleId of otherRules) expect(after.map((finding) => finding.ruleId)).toContain(ruleId);

    // The exception is stored, so a rescan stays quiet about that rule.
    const stored = await panel.evaluate(async () => {
      const api = (globalThis as unknown as { chrome: typeof chrome }).chrome;
      const value = await api.storage.local.get(["agentsafe.settings"]);
      return (value["agentsafe.settings"] as { scopedExceptions?: unknown[] })?.scopedExceptions ?? [];
    });
    expect(stored).toHaveLength(1);

    await runScan(panel);
    expect((await readFindings(panel)).map((finding) => finding.ruleId)).not.toContain(targetRule);

    await page.close();
    await panel.close();
  });

  test("produces sanitized export content the user can copy", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/hidden-instruction.html`);
    const panel = await openSidePanel(extension, page);
    await runScan(panel);

    await clickPanelButton(panel, "Sanitized Content");
    const sanitized = await panel.locator("textarea").first().inputValue();
    expect(sanitized).toContain("This visible paragraph should survive sanitization.");
    expect(sanitized.toLowerCase()).not.toContain("ignore previous instructions");

    await page.close();
    await panel.close();
  });

  test("highlights a finding in the scanned page", async () => {
    const page = await extension.context.newPage();
    await page.goto(`${server.url}/malicious/hidden-instruction.html`);
    const panel = await openSidePanel(extension, page);
    await runScan(panel);

    await clickPanelButton(panel, "Findings");
    await clickPanelButton(panel, "Highlight selected finding");

    await expect(page.locator("#agentsafe-highlight-style")).toHaveCount(1, { timeout: 15_000 });

    await page.close();
    await panel.close();
  });
});
