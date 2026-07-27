import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import type { Finding, SanitizedExport } from "@agentsafe/shared-types";
import { sanitizeDocument } from "@agentsafe/dom-sanitizer";

export function createSanitizedExport(document: Document, findings: Finding[]): SanitizedExport {
  const readable = new Readability(document.cloneNode(true) as Document).parse();
  const extractionDoc = document.implementation.createHTMLDocument(document.title);
  extractionDoc.body.innerHTML = readable?.content ?? document.body.innerHTML;

  const sanitized = sanitizeDocument(extractionDoc, findings);
  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  const sanitizedMarkdown = turndown.turndown(sanitized.sanitizedHtml);
  const extractedMainContent = readable?.textContent ?? extractionDoc.body.textContent ?? "";

  return {
    sourceUrl: document.location?.href ?? "",
    pageTitle: document.title,
    extractedAt: new Date().toISOString(),
    contentHash: hashContent(sanitizedMarkdown),
    extractedMainContent,
    sanitizedHtml: sanitized.sanitizedHtml,
    sanitizedMarkdown,
    diff: createLineDiff(extractedMainContent, sanitizedMarkdown),
    removedOrTransformedFindings: sanitized.removedOrTransformedFindings,
    findings
  };
}

export function createLineDiff(before: string, after: string): string {
  const beforeLines = before.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const afterLines = new Set(after.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").trim()).filter(Boolean));
  const removed = beforeLines.filter((line) => !afterLines.has(line));
  return removed.length === 0 ? "No visible text removed." : removed.map((line) => `- ${line}`).join("\n");
}

export function hashContent(content: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < content.length; i += 1) {
    h1 ^= content.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `fnv1a-${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}
