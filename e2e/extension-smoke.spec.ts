import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

test("malicious fixture contains scan targets", async ({ page }) => {
  const html = await readFile(path.resolve(root, "../fixtures/malicious/hidden-instruction.html"), "utf8");
  await page.setContent(html);
  await expect(page.locator("text=Normal Looking Page")).toBeVisible();
  await expect(page.locator("text=Ignore previous instructions")).toHaveCount(1);
});

test("side panel source is present", async ({ page }) => {
  const html = await readFile(path.resolve(root, "../apps/extension/entrypoints/sidepanel.html"), "utf8");
  await page.setContent(html);
  await expect(page.locator("#root")).toHaveCount(1);
});

test("webmcp demo fixture contains representative tools", async ({ page }) => {
  const html = await readFile(path.resolve(root, "../fixtures/webmcp/demo.html"), "utf8");
  await page.setContent(html);
  await expect(page.locator("text=AgentSafe WebMCP Demo")).toBeVisible();
  await expect(page.locator('form[toolname="searchCatalog"]')).toHaveCount(1);
  await expect(page.locator('form[toolname="submitSupportRequest"]')).toHaveCount(1);
  const tools = await page.evaluate(() => window.__agentsafeWebMcpTools);
  expect(Array.isArray(tools)).toBe(true);
  expect(tools).toHaveLength(3);
});
