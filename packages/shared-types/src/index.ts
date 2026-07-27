export type Severity = "informational" | "low" | "medium" | "high" | "critical";

export type FindingCategory =
  | "hidden-css"
  | "unicode-security"
  | "instruction-pattern"
  | "encoded-content"
  | "metadata"
  | "html-comment"
  | "accessibility"
  | "exfiltration"
  | "delimiter";

export type RuleSignal =
  | "display-none"
  | "visibility-hidden"
  | "opacity-near-zero"
  | "zero-box"
  | "font-size-zero"
  | "offscreen-position"
  | "clip-hidden"
  | "low-contrast"
  | "zero-width-unicode"
  | "bidi-control"
  | "suspicious-comment"
  | "suspicious-meta"
  | "aria-hidden-instruction"
  | "base64-instruction"
  | "instruction-override"
  | "role-manipulation"
  | "reveal-system-prompt"
  | "delimiter-block"
  | "tool-use"
  | "data-exfiltration";

export interface ScannerSettings {
  enabledCategories: FindingCategory[];
  sensitivity: "low" | "medium" | "high";
  domainAllowlist: string[];
  phraseAllowlist: string[];
  includeAriaHidden: boolean;
  autoScanEnabled: boolean;
  badgeEnabled: boolean;
  autoScanDelayMs: number;
  experimentalWebMcpSecurity: boolean;
}

export interface ScanContext {
  url: string;
  title: string;
  scannedAt: string;
  settings: ScannerSettings;
}

export interface Finding {
  id: string;
  ruleId: string;
  category: FindingCategory;
  severity: Severity;
  confidence: number;
  selector: string;
  evidence: string;
  explanation: string;
  recommendedAction: string;
  visibleToUser: boolean;
  likelyInExtractedText: boolean;
  signals: RuleSignal[];
  cssProperties?: Record<string, string>;
  decodedEvidence?: string;
}

export interface ScanSummary {
  overallRiskScore: number;
  severityCounts: Record<Severity, number>;
  hiddenTextCount: number;
  suspiciousUnicodeCount: number;
  instructionPatternCount: number;
}

export interface ScanResult {
  context: ScanContext;
  findings: Finding[];
  summary: ScanSummary;
}

export interface SanitizedExport {
  sourceUrl: string;
  pageTitle: string;
  extractedAt: string;
  contentHash: string;
  extractedMainContent: string;
  sanitizedHtml: string;
  sanitizedMarkdown: string;
  diff: string;
  removedOrTransformedFindings: Finding[];
  findings: Finding[];
}

export const defaultSettings: ScannerSettings = {
  enabledCategories: [
    "hidden-css",
    "unicode-security",
    "instruction-pattern",
    "encoded-content",
    "metadata",
    "html-comment",
    "accessibility",
    "exfiltration",
    "delimiter"
  ],
  sensitivity: "medium",
  domainAllowlist: [],
  phraseAllowlist: [],
  includeAriaHidden: true,
  autoScanEnabled: false,
  badgeEnabled: true,
  autoScanDelayMs: 1200,
  experimentalWebMcpSecurity: typeof navigator !== "undefined" && "modelContext" in navigator
};
