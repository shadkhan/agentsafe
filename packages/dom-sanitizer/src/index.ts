import DOMPurify from "dompurify";
import type { Finding } from "@agentsafe/shared-types";

export interface SanitizationResult {
  sanitizedHtml: string;
  removedOrTransformedFindings: Finding[];
}

export function sanitizeDocument(document: Document, findings: Finding[]): SanitizationResult {
  const clone = document.cloneNode(true) as Document;
  const removedOrTransformedFindings: Finding[] = [];

  for (const finding of findings) {
    if (!shouldRemove(finding)) continue;
    const element = safeQuery(clone, finding.selector);
    if (element) {
      element.remove();
      removedOrTransformedFindings.push(finding);
    }
  }

  for (const node of Array.from(clone.querySelectorAll("script,style,noscript,template"))) node.remove();
  for (const element of Array.from(clone.querySelectorAll<HTMLElement>("*"))) {
    element.removeAttribute("style");
    element.removeAttribute("onload");
    element.removeAttribute("onclick");
    element.removeAttribute("onerror");
    element.removeAttribute("srcdoc");
    normalizeUnicodeText(element);
  }

  const dirty = clone.body?.innerHTML ?? clone.documentElement.innerHTML;
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  });
  return { sanitizedHtml: clean, removedOrTransformedFindings };
}

function shouldRemove(finding: Finding): boolean {
  return (
    !finding.visibleToUser ||
    finding.category === "encoded-content" ||
    finding.severity === "high" ||
    finding.severity === "critical"
  );
}

function safeQuery(document: Document, selector: string): Element | null {
  // Comment nodes and shadow-DOM paths have no equivalent in the cloned light DOM
  // this sanitizer walks: cloneNode does not copy shadow roots.
  if (selector === "comment()" || selector.includes(" >>> ")) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function normalizeUnicodeText(element: Element): void {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent) {
      // Zero-width, bidi controls, and the Unicode Tags block, which renders as
      // nothing but can carry a full ASCII instruction into a model's context.
      child.textContent = child.textContent.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069\u{E0000}-\u{E007F}]/gu, "");
    }
  }
}
