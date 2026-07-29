import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clickPanelButton,
  closeExtension,
  launchExtension,
  openSidePanel,
  runScan,
  REPO_ROOT,
  type ExtensionContext
} from "./support/extension";

/**
 * Captures the Chrome Web Store screenshot from the running extension.
 *
 * The panel images are real pixels from a real scan of a real page, composited
 * onto the 1280x800 canvas the store requires. A drawn mock would drift from the
 * product the moment the UI changes, and shipping one as a product screenshot
 * misrepresents what a user is installing.
 *
 * Runs only in the "capture" Playwright project, so `pnpm e2e` never rewrites a
 * published asset as a side effect. Regenerate with: pnpm capture:screenshot
 */
test("captures the store screenshot from the running side panel", async () => {
  const extension: ExtensionContext = await launchExtension();

  try {
    // Served from a documentation domain rather than a localhost fixture server:
    // findings display the frame URL they came from, and a random loopback port
    // in a store screenshot reads as a test artefact. The page, the scan, and the
    // findings are all real; only the origin is routed.
    const fixture = await readFile(path.join(REPO_ROOT, "fixtures/malicious/hidden-instruction.html"), "utf8");
    await extension.context.route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fixture })
    );

    const page = await extension.context.newPage();
    await page.goto("https://example.com/blog/product-review");
    const panel = await openSidePanel(extension, page);
    await panel.setViewportSize({ width: 380, height: 560 });

    const status = await runScan(panel);
    expect(status).toContain("page findings");

    const summaryShot = (await panel.screenshot()).toString("base64");

    // Scroll past the tab strip so the second panel shows findings rather than a
    // second copy of the same header.
    await clickPanelButton(panel, "Findings");
    await panel.evaluate(() => document.querySelector(".rule-chips")?.scrollIntoView({ block: "start" }));
    const findingsShot = (await panel.screenshot()).toString("base64");

    const composite = await extension.context.newPage();
    await composite.setViewportSize({ width: 1280, height: 800 });
    await composite.setContent(compositeHtml(summaryShot, findingsShot));
    await composite.waitForLoadState("networkidle");

    const target = path.join(REPO_ROOT, "docs/chrome-store/assets/agentsafe-store-screenshot-1280x800.png");
    await mkdir(path.dirname(target), { recursive: true });
    const image = await composite.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 800 } });
    await writeFile(target, image);

    expect(image.byteLength).toBeGreaterThan(10_000);
  } finally {
    await closeExtension(extension);
  }
});

function compositeHtml(summary: string, findings: string): string {
  return `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 1280px;
        height: 800px;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: linear-gradient(135deg, #f4f8fc 0%, #e2f1ee 100%);
        color: #182030;
        overflow: hidden;
      }
      .page { padding: 30px 48px; height: 800px; display: flex; flex-direction: column; }
      h1 { font-size: 38px; letter-spacing: -0.5px; }
      .tagline { font-size: 18px; color: #536074; margin-top: 5px; }
      .badges { display: flex; gap: 10px; margin-top: 14px; }
      .badge {
        padding: 7px 14px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        background: rgba(22, 85, 220, .1);
        color: #1655dc;
      }
      .badge.teal { background: rgba(15, 171, 150, .14); color: #0f8f7d; }
      .stage { display: flex; gap: 26px; margin-top: 20px; align-items: flex-start; }
      figure {
        background: #fff;
        border: 1px solid #dae1eb;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 16px 40px rgba(24, 32, 48, .12);
      }
      figure img { display: block; width: 380px; height: 560px; }
      .notes { flex: 1; padding-top: 4px; }
      .notes h2 { font-size: 17px; margin-bottom: 12px; }
      .notes li {
        list-style: none;
        font-size: 14px;
        line-height: 1.45;
        color: #3c4759;
        padding: 9px 0 9px 20px;
        border-bottom: 1px solid rgba(24, 32, 48, .07);
        position: relative;
      }
      .notes li::before { content: ""; position: absolute; left: 0; top: 16px; width: 8px; height: 8px; border-radius: 2px; background: #0fab96; }
      .notes li b { color: #182030; }
      .footnote { margin-top: auto; font-size: 12px; color: #6b7688; }
    </style>
    <div class="page">
      <h1>AgentSafe</h1>
      <p class="tagline">See what a page is telling your AI that it is not telling you.</p>
      <div class="badges">
        <span class="badge">Local only</span>
        <span class="badge teal">No backend, no telemetry</span>
        <span class="badge">Open source</span>
      </div>
      <div class="stage">
        <figure><img src="data:image/png;base64,${summary}" alt="AgentSafe summary tab" /></figure>
        <figure><img src="data:image/png;base64,${findings}" alt="AgentSafe findings tab" /></figure>
        <div class="notes">
          <h2>What a scan gives you</h2>
          <ul>
            <li><b>Hidden instructions surfaced.</b> Text concealed with CSS, metadata, comments, and Unicode tricks that a reader never sees.</li>
            <li><b>Every frame and shadow root.</b> Embedded widgets and web components are scanned, not skipped.</li>
            <li><b>Explained, not just flagged.</b> Each finding carries evidence, impact, confidence, and what to do next.</li>
            <li><b>Sanitized copy.</b> Export Markdown with the suspicious content removed, plus a diff of what changed.</li>
            <li><b>Yours to tune.</b> Ignore a rule per site when it does not apply.</li>
          </ul>
        </div>
      </div>
      <p class="footnote">Detection is advisory. AgentSafe can miss attacks and can flag benign content, so review the evidence before relying on a result.</p>
    </div>
  `;
}
