import { scoreFinding, summarizeFindings } from "@agentsafe/risk-engine";
import type { Finding, RuleSignal, ScanResult, ScannerSettings } from "@agentsafe/shared-types";
import { defaultSettings } from "@agentsafe/shared-types";
import { containsInstruction, suspiciousCommentOrMeta } from "./rules";

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/;
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/;
const BASE64ISH_RE = /\b(?:[A-Za-z0-9+/]{24,}={0,2})\b/g;

export function scanDocument(document: Document, settings: ScannerSettings = defaultSettings): ScanResult {
  const findings: Finding[] = [];
  const url = document.location?.href ?? "";
  const title = document.title || "";
  if (isDomainAllowed(url, settings.domainAllowlist)) {
    return {
      context: { url, title, scannedAt: new Date().toISOString(), settings },
      findings,
      summary: summarizeFindings(findings)
    };
  }

  const allowedPhrase = (text: string) =>
    settings.phraseAllowlist.some((phrase) => phrase.trim() && text.toLowerCase().includes(phrase.toLowerCase()));
  const categoryEnabled = (finding: Pick<Finding, "category">) => settings.enabledCategories.includes(finding.category);

  for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
    const originalText = element.textContent ?? "";
    const rawText = originalText.replace(/\s+/g, " ").trim();
    if (!rawText || allowedPhrase(rawText)) continue;
    const style = document.defaultView?.getComputedStyle(element) ?? globalThis.getComputedStyle?.(element);
    const css = style ? collectHidingCss(style, element) : {};
    const ariaHidden = element.getAttribute("aria-hidden") === "true";
    if (ariaHidden && !settings.includeAriaHidden) continue;
    if (ariaHidden) css.ariaHidden = "true";
    const visibleToUser = Object.keys(css).length === 0;
    const likelyInExtractedText = element.closest("script,style,noscript,template") === null;
    const selector = getSelector(element);

    const hiddenSignals = Object.keys(css).map(cssSignal).filter(Boolean) as RuleSignal[];
    const instructionRules = containsInstruction(rawText);
    const unicodeSignals: RuleSignal[] = [];
    if (ZERO_WIDTH_RE.test(originalText)) unicodeSignals.push("zero-width-unicode");
    if (BIDI_RE.test(originalText)) unicodeSignals.push("bidi-control");

    const decoded = findDecodedInstruction(rawText);
    const signals = [
      ...hiddenSignals,
      ...(ariaHidden && instructionRules.length > 0 ? ["aria-hidden-instruction" as const] : []),
      ...instructionRules.map((rule) => rule.id),
      ...unicodeSignals,
      ...(decoded ? ["base64-instruction" as const] : [])
    ];
    if (signals.length === 0) continue;

    const category = chooseCategory(signals, element);
    const scored = scoreFinding({
      hiddenSignals: hiddenSignals.length,
      instructionSignals: instructionRules.length,
      unicodeSignals: unicodeSignals.length,
      encodedSignals: decoded ? 1 : 0,
      metadataSignals: 0,
      exfiltrationSignals: instructionRules.filter((rule) => rule.category === "exfiltration").length,
      visibleToUser,
      likelyInExtractedText,
      sensitivity: settings.sensitivity
    });
    const finding: Finding = {
      id: stableId(selector, signals.join(","), rawText),
      ruleId: signals[0],
      category,
      severity: scored.severity,
      confidence: scored.confidence,
      selector,
      evidence: excerpt(rawText),
      decodedEvidence: decoded ? excerpt(decoded) : undefined,
      explanation: buildExplanation(signals, visibleToUser),
      recommendedAction: recommendedAction(category),
      visibleToUser,
      likelyInExtractedText,
      signals,
      cssProperties: Object.keys(css).length ? css : undefined
    };
    if (categoryEnabled(finding)) findings.push(finding);
  }

  findings.push(...scanComments(document, settings));
  findings.push(...scanMeta(document, settings));

  return {
    context: {
      url,
      title,
      scannedAt: new Date().toISOString(),
      settings
    },
    findings,
    summary: summarizeFindings(findings)
  };
}

function collectHidingCss(style: CSSStyleDeclaration, element: HTMLElement): Record<string, string> {
  const css: Record<string, string> = {};
  if (style.display === "none") css.display = style.display;
  if (style.visibility === "hidden" || style.visibility === "collapse") css.visibility = style.visibility;
  if (Number.parseFloat(style.opacity || "1") <= 0.03) css.opacity = style.opacity;
  if (Number.parseFloat(style.fontSize || "16") <= 1) css.fontSize = style.fontSize;
  const clipValue = [style.clip, style.clipPath, element.style.clip, element.style.clipPath].filter(Boolean).join(" ");
  if (/rect\(\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*\)|inset\(50%\)/i.test(clipValue)) {
    css.clip = clipValue;
  }
  const width = Number.parseFloat(style.width || "");
  const height = Number.parseFloat(style.height || "");
  if ((width === 0 || height === 0) && (element.textContent?.trim().length ?? 0) > 0) {
    css.box = `${style.width || element.offsetWidth}x${style.height || element.offsetHeight}`;
  }
  const left = Number.parseFloat(style.left || "0");
  const top = Number.parseFloat(style.top || "0");
  if ((style.position === "absolute" || style.position === "fixed") && (left < -999 || top < -999 || left > 20000 || top > 20000)) {
    css.position = `${style.position}; left:${style.left}; top:${style.top}`;
  }
  const contrast = contrastRatio(style.color, style.backgroundColor);
  if (contrast !== null && contrast < 1.15) css.contrast = `${contrast.toFixed(2)}:1`;
  return css;
}

function cssSignal(property: string): RuleSignal | undefined {
  const map: Record<string, RuleSignal> = {
    display: "display-none",
    visibility: "visibility-hidden",
    opacity: "opacity-near-zero",
    fontSize: "font-size-zero",
    clip: "clip-hidden",
    box: "zero-box",
    position: "offscreen-position",
    contrast: "low-contrast",
    ariaHidden: "aria-hidden-instruction"
  };
  return map[property];
}

function chooseCategory(signals: RuleSignal[], element: HTMLElement): Finding["category"] {
  if (signals.includes("base64-instruction")) return "encoded-content";
  if (signals.includes("zero-width-unicode") || signals.includes("bidi-control")) return "unicode-security";
  if (element.getAttribute("aria-hidden") === "true") return "accessibility";
  if (signals.includes("data-exfiltration") || signals.includes("tool-use")) return "exfiltration";
  if (signals.some((signal) => signal.includes("instruction") || signal === "role-manipulation" || signal === "reveal-system-prompt")) {
    return "instruction-pattern";
  }
  if (signals.includes("delimiter-block")) return "delimiter";
  return "hidden-css";
}

function buildExplanation(signals: RuleSignal[], visible: boolean): string {
  const visibility = visible ? "visible to the user" : "not readily visible to the user";
  return `Detected ${signals.join(", ")} in content that is ${visibility}. Hidden or instruction-like text can influence AI extraction and browser-agent workflows.`;
}

function recommendedAction(category: Finding["category"]): string {
  if (category === "hidden-css" || category === "accessibility") return "Review the element and remove hidden text from sanitized exports unless it is clearly legitimate.";
  if (category === "unicode-security") return "Remove or normalize suspicious Unicode before copying content into an AI system.";
  if (category === "encoded-content") return "Decode and inspect the content, then exclude it from AI-facing exports unless trusted.";
  return "Treat as advisory, verify intent in context, and avoid copying the suspicious instruction into an AI agent.";
}

function scanComments(document: Document, settings: ScannerSettings): Finding[] {
  if (!settings.enabledCategories.includes("html-comment")) return [];
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  const findings: Finding[] = [];
  let node: Comment | null;
  while ((node = walker.nextNode() as Comment | null)) {
    const text = node.data.trim();
    if (!text || !suspiciousCommentOrMeta.test(text)) continue;
    const rules = containsInstruction(text);
    const scored = scoreFinding({
      hiddenSignals: 1,
      instructionSignals: rules.length,
      unicodeSignals: 0,
      encodedSignals: 0,
      metadataSignals: 1,
      exfiltrationSignals: rules.filter((rule) => rule.category === "exfiltration").length,
      visibleToUser: false,
      likelyInExtractedText: false,
      sensitivity: settings.sensitivity
    });
    findings.push({
      id: stableId("comment()", "comment", text),
      ruleId: "suspicious-comment",
      category: "html-comment",
      severity: scored.severity,
      confidence: scored.confidence,
      selector: "comment()",
      evidence: excerpt(text),
      explanation: "Suspicious instruction-like text was found in an HTML comment.",
      recommendedAction: "Exclude comments from AI-facing exports and review source content.",
      visibleToUser: false,
      likelyInExtractedText: false,
      signals: ["suspicious-comment", ...rules.map((rule) => rule.id)]
    });
  }
  return findings;
}

function scanMeta(document: Document, settings: ScannerSettings): Finding[] {
  if (!settings.enabledCategories.includes("metadata")) return [];
  return Array.from(document.querySelectorAll<HTMLMetaElement>("meta[content]"))
    .filter((meta) => suspiciousCommentOrMeta.test(meta.content))
    .map((meta) => {
      const rules = containsInstruction(meta.content);
      const scored = scoreFinding({
        hiddenSignals: 1,
        instructionSignals: rules.length,
        unicodeSignals: 0,
        encodedSignals: 0,
        metadataSignals: 1,
        exfiltrationSignals: rules.filter((rule) => rule.category === "exfiltration").length,
        visibleToUser: false,
        likelyInExtractedText: true,
        sensitivity: settings.sensitivity
      });
      return {
        id: stableId(getSelector(meta), "meta", meta.content),
        ruleId: "suspicious-meta",
        category: "metadata",
        severity: scored.severity,
        confidence: scored.confidence,
        selector: getSelector(meta),
        evidence: excerpt(meta.content),
        explanation: "Suspicious instruction-like text was found in metadata that page extraction tools may include.",
        recommendedAction: "Remove suspicious metadata from sanitized exports.",
        visibleToUser: false,
        likelyInExtractedText: true,
        signals: ["suspicious-meta", ...rules.map((rule) => rule.id)]
      } satisfies Finding;
    });
}

function findDecodedInstruction(text: string): string | undefined {
  for (const match of text.matchAll(BASE64ISH_RE)) {
    try {
      const decoded = typeof atob === "function" ? atob(match[0]) : Buffer.from(match[0], "base64").toString("utf8");
      if (/^[\x09\x0A\x0D\x20-\x7E]+$/.test(decoded) && containsInstruction(decoded).length > 0) return decoded;
    } catch {
      continue;
    }
  }
  return undefined;
}

function contrastRatio(color: string, background: string): number | null {
  const fg = parseRgb(color);
  const bg = parseRgb(background);
  if (!fg || !bg || background === "rgba(0, 0, 0, 0)" || background === "transparent") return null;
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const channels = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getSelector(element: Element): string {
  const cssEscape = globalThis.CSS?.escape ?? ((value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"));
  if (element.id) return `#${cssEscape(element.id)}`;
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTag = current.tagName;
    const siblings = Array.from(parent.children).filter((child): child is Element => child.tagName === currentTag);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(`${tag}:nth-of-type(${index})`);
    current = parent;
  }
  return parts.join(" > ");
}

function excerpt(text: string): string {
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function stableId(selector: string, rule: string, text: string): string {
  let hash = 0;
  for (const char of `${selector}:${rule}:${text}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `finding-${Math.abs(hash).toString(36)}`;
}

function isDomainAllowed(url: string, allowlist: string[]): boolean {
  if (!url || allowlist.length === 0) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowlist.some((entry) => {
      const normalized = entry.trim().toLowerCase();
      return normalized && (host === normalized || host.endsWith(`.${normalized}`));
    });
  } catch {
    return false;
  }
}
