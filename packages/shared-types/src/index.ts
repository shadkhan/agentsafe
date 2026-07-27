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
  scopedExceptions: ScopedException[];
  includeAriaHidden: boolean;
  autoScanEnabled: boolean;
  badgeEnabled: boolean;
  autoScanDelayMs: number;
  experimentalWebMcpSecurity: boolean;
  scanMode: ScanMode;
}

export type ScanMode = "quick" | "standard" | "deep";

export type ScanStatus =
  | "idle"
  | "preparing"
  | "running"
  | "complete"
  | "complete_within_configured_limits"
  | "partial_size_limit"
  | "partial_node_limit"
  | "partial_chunk_limit"
  | "partial_finding_limit"
  | "partial_rule_timeout"
  | "partial_worker_failure"
  | "cancelled"
  | "failed";

export interface ScanPartialReason {
  code: ScanStatus;
  explanation: string;
  phase: string;
  source?: string;
  workCompleted?: number;
  workSkipped?: number;
  existingFindingsRemainValid: boolean;
  recommendedAction: string;
}

export interface ScanMetrics {
  scanId: string;
  mode: ScanMode;
  status: ScanStatus;
  startedAt: string;
  completedAt?: string;
  elapsedMs: number;
  nodesVisited: number;
  textNodesVisited: number;
  candidateHiddenElements: number;
  computedStyleInspections: number;
  charactersExtracted: number;
  charactersScanned: number;
  chunksQueued: number;
  chunksCompleted: number;
  chunksSkipped: number;
  workerRestartCount: number;
  timedOutUnits: string[];
  partialReasons: ScanPartialReason[];
  engineVersion?: string;
  ruleRegistryVersion?: string;
  appliedExceptionIds: string[];
}

export interface ScanProgress {
  scanId: string;
  phase: string;
  status: ScanStatus;
  percentage?: number;
  nodesVisited: number;
  estimatedNodes?: number;
  charactersExtracted: number;
  charactersScanned: number;
  chunksQueued: number;
  chunksCompleted: number;
  totalEstimatedChunks: number;
  findingsCount: number;
  elapsedMs: number;
  workerRestartCount: number;
  currentSourceType?: string;
  currentScanMode: ScanMode;
}

export type ScopedExceptionScope =
  | "exact-url"
  | "url-prefix"
  | "exact-hostname"
  | "subdomain"
  | "development-host"
  | "global-rule";

export interface ScopedException {
  id: string;
  scopeType: ScopedExceptionScope;
  scopeValue: string;
  ruleIds: string[];
  enabled: boolean;
  createdAt: string;
  expiresAt?: string;
  note?: string;
  source: "user" | "default" | "imported";
}

export interface ScanContext {
  url: string;
  title: string;
  scannedAt: string;
  settings: ScannerSettings;
}

export interface Finding {
  id: string;
  title?: string;
  ruleId: string;
  category: FindingCategory;
  severity: Severity;
  confidence: number;
  verdict?: "confirmed-risk" | "likely-risk" | "needs-review" | "low-confidence-signal";
  selector: string;
  evidence: string;
  concern?: string;
  possibleImpact?: string;
  whyItMatters?: string;
  confidenceReason?: string;
  falsePositiveGuidance?: string;
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
  metadata?: ScanMetrics;
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
  scopedExceptions: [],
  includeAriaHidden: true,
  autoScanEnabled: false,
  badgeEnabled: true,
  autoScanDelayMs: 1200,
  experimentalWebMcpSecurity: typeof navigator !== "undefined" && "modelContext" in navigator,
  scanMode: "standard"
};
