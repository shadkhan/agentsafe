import type { Severity } from "@agentsafe/shared-types";
import { scanStructuredWithRust, type RustScanResult } from "@agentsafe/scanner-wasm";

export type WebMcpToolType = "declarative" | "imperative" | "unknown";
export type WebMcpSupportStatus = "supported" | "unsupported" | "partial";
export type WebMcpActionClassification =
  | "Declared read-only"
  | "Likely read-only"
  | "State-changing"
  | "Sensitive state-changing"
  | "Unknown";
export type WebMcpDecision = "Allow" | "Allow with untrusted-content warning" | "Review" | "Require confirmation" | "Block";

export interface WebMcpSupportInfo {
  status: WebMcpSupportStatus;
  hasNavigatorModelContext: boolean;
  hasDeclarativeCandidates: boolean;
  message: string;
}

export interface WebMcpToolDefinition {
  name?: string;
  title?: string;
  description?: string;
  origin?: string;
  frameOrigin?: string;
  type: WebMcpToolType;
  inputSchema?: unknown;
  outputSchema?: unknown;
  parameterNames: string[];
  parameterDescriptions: string[];
  enumValues: string[];
  examples: string[];
  annotations?: Record<string, unknown>;
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface WebMcpToolClassification {
  classification: WebMcpActionClassification;
  inferred: boolean;
  reasons: string[];
}

export interface WebMcpSecurityFinding {
  ruleId: string;
  severity: Severity;
  confidence: number;
  evidence: string;
  explanation: string;
  recommendedAction: string;
}

export interface WebMcpToolSecurityResult {
  tool: WebMcpToolDefinition;
  classification: WebMcpToolClassification;
  decision: WebMcpDecision;
  riskScore: number;
  confidence: number;
  reasons: string[];
  findings: WebMcpSecurityFinding[];
  origin?: string;
  scanCompleteness: RustScanResult["completeness"];
}

export interface WebMcpSecurityReport {
  pageUrl: string;
  pageOrigin: string;
  scanTimestamp: string;
  browserSupport: WebMcpSupportInfo;
  agentSafeVersion: string;
  scannerEngineVersion: string;
  tools: WebMcpToolSecurityResult[];
  scanCompleteness: RustScanResult["completeness"];
}

export type RustStructuredScanner = (request: {
  source_id: string;
  value: unknown;
  sensitivity?: "low" | "medium" | "high";
}) => Promise<RustScanResult>;

const DEFAULT_COMPLETENESS: RustScanResult["completeness"] = {
  complete: true,
  input_truncated: false,
  match_limit_reached: false,
  structured_depth_limit_reached: false,
  notes: []
};

const CREDENTIAL_RE = /\b(password|passcode|credential|api[_ -]?key|secret|token|session|cookie|oauth|jwt)\b/i;
const PERSONAL_DATA_RE = /\b(ssn|social security|passport|driver'?s license|bank account|credit card|date of birth|home address)\b/i;
const STATE_CHANGE_RE = /\b(create|update|delete|remove|submit|send|post|upload|purchase|checkout|book|cancel|transfer|invite|email|message|write|save|run|execute)\b/i;
const READ_ONLY_RE = /\b(get|list|read|search|find|fetch|view|lookup|retrieve|summarize|calculate|preview)\b/i;
const CROSS_ORIGIN_RE = /\b(cross-origin|third-party|external origin|another domain|different origin)\b/i;
const HIDDEN_UNICODE_RE = /[\u200B-\u200D\uFEFF]/;
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/;

export async function analyzeWebMcpTools(input: {
  pageUrl: string;
  browserSupport: WebMcpSupportInfo;
  tools: WebMcpToolDefinition[];
  agentSafeVersion?: string;
  scanner?: RustStructuredScanner;
}): Promise<WebMcpSecurityReport> {
  const scanner = input.scanner ?? ((request) => scanStructuredWithRust(request));
  const scanTimestamp = new Date().toISOString();
  const results: WebMcpToolSecurityResult[] = [];
  let scannerEngineVersion = "unknown";

  for (const [index, tool] of input.tools.entries()) {
    const sourceId = `webmcp:${tool.name ?? `tool-${index}`}`;
    const rust = await scanner({
      source_id: sourceId,
      value: toStructuredScanValue(tool),
      sensitivity: "medium"
    });
    scannerEngineVersion = rust.engine_version || scannerEngineVersion;
    results.push(evaluateTool(tool, rust));
  }

  return {
    pageUrl: input.pageUrl,
    pageOrigin: safeOrigin(input.pageUrl),
    scanTimestamp,
    browserSupport: input.browserSupport,
    agentSafeVersion: input.agentSafeVersion ?? "0.1.0",
    scannerEngineVersion,
    tools: results,
    scanCompleteness: mergeCompleteness(results.map((result) => result.scanCompleteness))
  };
}

export function evaluateTool(tool: WebMcpToolDefinition, rust: RustScanResult): WebMcpToolSecurityResult {
  const classification = classifyWebMcpTool(tool);
  const findings = [...mapRustFindings(rust), ...heuristicFindings(tool, classification)];
  const maxSeverity = Math.max(0, ...findings.map((finding) => severityWeight(finding.severity)));
  const reasons = [...classification.reasons, ...findings.map((finding) => finding.explanation)];
  const riskScore = Math.min(100, Math.max(rust.risk.overall_risk_score, findings.reduce((score, finding) => score + severityScore(finding.severity) * finding.confidence, 0)));
  const decision = decideTool(tool, classification, findings, Math.round(riskScore));
  const confidence = Number(Math.min(0.98, Math.max(0.35, findings.length ? average(findings.map((finding) => finding.confidence)) : classification.inferred ? 0.58 : 0.9)).toFixed(2));

  return {
    tool,
    classification,
    decision,
    riskScore: Math.round(riskScore),
    confidence: maxSeverity === 0 && classification.classification === "Declared read-only" ? 0.9 : confidence,
    reasons,
    findings,
    origin: tool.origin,
    scanCompleteness: rust.completeness ?? DEFAULT_COMPLETENESS
  };
}

export function classifyWebMcpTool(tool: WebMcpToolDefinition): WebMcpToolClassification {
  const searchable = searchableText(tool);
  const schemaText = safeStringify(tool.inputSchema ?? {});
  const sensitive = CREDENTIAL_RE.test(searchable) || PERSONAL_DATA_RE.test(searchable) || CREDENTIAL_RE.test(schemaText) || PERSONAL_DATA_RE.test(schemaText);
  const stateChanging = STATE_CHANGE_RE.test(`${tool.name ?? ""} ${tool.description ?? ""} ${schemaText}`);
  const readOnly = READ_ONLY_RE.test(`${tool.name ?? ""} ${tool.description ?? ""}`);

  if (tool.readOnlyHint === true) {
    return {
      classification: "Declared read-only",
      inferred: false,
      reasons: ["Tool declares readOnlyHint=true."]
    };
  }
  if (sensitive && stateChanging) {
    return {
      classification: "Sensitive state-changing",
      inferred: true,
      reasons: ["Tool appears state-changing and references sensitive fields."]
    };
  }
  if (stateChanging) {
    return {
      classification: "State-changing",
      inferred: true,
      reasons: ["Tool name, description, or schema uses action verbs associated with state changes."]
    };
  }
  if (readOnly) {
    return {
      classification: "Likely read-only",
      inferred: true,
      reasons: ["Tool appears read-only based on its name or description."]
    };
  }
  return {
    classification: "Unknown",
    inferred: true,
    reasons: ["Tool does not declare readOnlyHint and action semantics are ambiguous."]
  };
}

export function exportWebMcpReportJson(report: WebMcpSecurityReport): string {
  return JSON.stringify(redactReport(report), null, 2);
}

export function exportWebMcpReportMarkdown(report: WebMcpSecurityReport): string {
  const redacted = redactReport(report);
  const lines = [
    "# AgentSafe WebMCP Security Report",
    "",
    `- Page URL: ${redacted.pageUrl}`,
    `- Page origin: ${redacted.pageOrigin}`,
    `- Scan timestamp: ${redacted.scanTimestamp}`,
    `- Browser support: ${redacted.browserSupport.status}`,
    `- AgentSafe version: ${redacted.agentSafeVersion}`,
    `- Scanner engine version: ${redacted.scannerEngineVersion}`,
    `- Tools discovered: ${redacted.tools.length}`,
    ""
  ];
  for (const result of redacted.tools) {
    lines.push(`## ${result.tool.name ?? "Unnamed tool"}`, "");
    lines.push(`- Type: ${result.tool.type}`);
    lines.push(`- Classification: ${result.classification.classification}${result.classification.inferred ? " (inferred)" : ""}`);
    lines.push(`- Decision: ${result.decision}`);
    lines.push(`- Risk score: ${result.riskScore}`);
    lines.push(`- Confidence: ${result.confidence}`);
    lines.push(`- Findings: ${result.findings.length}`, "");
    if (result.tool.description) lines.push(result.tool.description, "");
    for (const finding of result.findings) {
      lines.push(`- ${finding.ruleId}: ${finding.evidence}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function detectWebMcpSupport(documentLike: Document = document): WebMcpSupportInfo {
  const hasNavigatorModelContext = typeof navigator !== "undefined" && "modelContext" in navigator;
  const hasDeclarativeCandidates = documentLike.querySelectorAll("form[toolname][tooldescription]").length > 0;
  return {
    status: hasNavigatorModelContext ? "supported" : hasDeclarativeCandidates ? "partial" : "unsupported",
    hasNavigatorModelContext,
    hasDeclarativeCandidates,
    message: hasNavigatorModelContext
      ? "WebMCP browser API detected. AgentSafe scans registered metadata passively."
      : "WebMCP API was not detected. For local Chrome testing, enable chrome://flags/#enable-webmcp-testing and relaunch Chrome."
  };
}

export function discoverDeclarativeWebMcpTools(documentLike: Document = document): WebMcpToolDefinition[] {
  return Array.from(documentLike.querySelectorAll<HTMLFormElement>("form[toolname][tooldescription]")).map((form) => {
    const inputSchema = formToSchema(form);
    return normalizeToolDefinition({
      name: form.getAttribute("toolname") ?? undefined,
      title: form.getAttribute("tooltitle") ?? undefined,
      description: form.getAttribute("tooldescription") ?? undefined,
      origin: location.origin,
      frameOrigin: location.origin,
      type: "declarative",
      inputSchema,
      outputSchema: undefined,
      annotations: readAnnotations(form),
      readOnlyHint: parseBooleanHint(form.getAttribute("readonlyhint")),
      untrustedContentHint: parseBooleanHint(form.getAttribute("untrustedcontenthint"))
    });
  });
}

export function normalizeToolDefinition(raw: Partial<WebMcpToolDefinition>): WebMcpToolDefinition {
  const schemaText = JSON.stringify(raw.inputSchema ?? {});
  return {
    type: raw.type ?? "unknown",
    name: raw.name,
    title: raw.title,
    description: raw.description,
    origin: raw.origin,
    frameOrigin: raw.frameOrigin,
    inputSchema: raw.inputSchema,
    outputSchema: raw.outputSchema,
    parameterNames: raw.parameterNames ?? schemaParameterNames(raw.inputSchema),
    parameterDescriptions: raw.parameterDescriptions ?? schemaStringsByKey(raw.inputSchema, "description"),
    enumValues: raw.enumValues ?? enumValues(raw.inputSchema),
    examples: raw.examples ?? [...schemaStringsByKey(raw.inputSchema, "example"), ...schemaStringsByKey(raw.inputSchema, "examples")],
    annotations: raw.annotations,
    readOnlyHint: raw.readOnlyHint ?? booleanFromPath(raw.annotations, "readOnlyHint"),
    untrustedContentHint: raw.untrustedContentHint ?? booleanFromPath(raw.annotations, "untrustedContentHint") ?? /untrustedContentHint["']?\s*:\s*true/i.test(schemaText)
  };
}

export function passiveWebMcpPageCollector() {
  const support = detectWebMcpSupport(document);
  const declarativeTools = discoverDeclarativeWebMcpTools(document);
  const imperativeTools = Array.isArray((globalThis as { __agentsafeWebMcpTools?: unknown[] }).__agentsafeWebMcpTools)
    ? ((globalThis as { __agentsafeWebMcpTools?: Partial<WebMcpToolDefinition>[] }).__agentsafeWebMcpTools ?? []).map((tool) =>
        normalizeToolDefinition({ ...tool, type: tool.type ?? "imperative", origin: location.origin, frameOrigin: location.origin })
      )
    : [];
  const byKey = new Map<string, WebMcpToolDefinition>();
  for (const tool of [...declarativeTools, ...imperativeTools]) byKey.set(`${tool.type}:${tool.name ?? tool.description ?? byKey.size}`, tool);
  return {
    support,
    pageUrl: location.href,
    pageOrigin: location.origin,
    tools: Array.from(byKey.values())
  };
}

function toStructuredScanValue(tool: WebMcpToolDefinition) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    parameterDescriptions: tool.parameterDescriptions,
    enumValues: tool.enumValues,
    examples: tool.examples,
    inputSchemaDescriptions: schemaStringsByKey(tool.inputSchema, "description"),
    outputSchemaDescriptions: schemaStringsByKey(tool.outputSchema, "description"),
    annotations: tool.annotations
  };
}

function heuristicFindings(tool: WebMcpToolDefinition, classification: WebMcpToolClassification): WebMcpSecurityFinding[] {
  const text = searchableText(tool);
  const findings: WebMcpSecurityFinding[] = [];
  if (CREDENTIAL_RE.test(text)) findings.push(makeFinding("webmcp-credential-request", "critical", text, "Tool metadata requests credentials, cookies, secrets, or session tokens.", "Do not expose unrelated credentials to this tool."));
  if (PERSONAL_DATA_RE.test(text)) findings.push(makeFinding("webmcp-unrelated-personal-data", "high", text, "Tool metadata asks for sensitive personal data that may be unrelated to the stated action.", "Review whether the requested data is necessary."));
  if (CROSS_ORIGIN_RE.test(text)) findings.push(makeFinding("webmcp-cross-origin-instruction", "medium", text, "Tool metadata references cross-origin or third-party instructions.", "Confirm that the destination origin is expected."));
  if (HIDDEN_UNICODE_RE.test(text)) findings.push(makeFinding("webmcp-hidden-unicode", "medium", text, "Tool metadata contains hidden Unicode characters.", "Normalize or remove hidden Unicode before trusting the tool."));
  if (BIDI_RE.test(text)) findings.push(makeFinding("webmcp-bidi-control", "high", text, "Tool metadata contains bidirectional Unicode controls.", "Treat reordered text as suspicious and inspect the source."));
  if (toolSchemaMismatch(tool)) findings.push(makeFinding("webmcp-description-schema-mismatch", "medium", text, "Tool name/description and schema appear to describe different actions.", "Review the tool before allowing an agent to use it."));
  if (classification.classification === "Unknown") findings.push(makeFinding("webmcp-unknown-action", "low", text, "Tool action semantics are unknown.", "Require confirmation before use."));
  return findings;
}

function mapRustFindings(rust: RustScanResult): WebMcpSecurityFinding[] {
  return rust.findings.map((finding) => ({
    ruleId: finding.rule_id,
    severity: finding.severity as Severity,
    confidence: finding.confidence,
    evidence: redactSensitive(finding.evidence.redacted_text),
    explanation: `Rust scanner matched ${finding.rule_id}.`,
    recommendedAction: "Review WebMCP metadata before allowing an agent to use this tool."
  }));
}

function decideTool(tool: WebMcpToolDefinition, classification: WebMcpToolClassification, findings: WebMcpSecurityFinding[], riskScore: number): WebMcpDecision {
  if (findings.some((finding) => finding.ruleId === "webmcp-credential-request" || finding.ruleId === "instruction-override" || finding.ruleId === "reveal-system-prompt")) return "Block";
  if (tool.untrustedContentHint) return "Allow with untrusted-content warning";
  if (findings.some((finding) => finding.ruleId === "webmcp-description-schema-mismatch")) return "Review";
  if (classification.classification === "Unknown" || classification.classification === "State-changing" || classification.classification === "Sensitive state-changing") return "Require confirmation";
  if (riskScore >= 35) return "Review";
  return "Allow";
}

function formToSchema(form: HTMLFormElement) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const field of Array.from(form.elements)) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
    const name = field.name || field.id;
    if (!name) continue;
    const description = field.getAttribute("toolparamdescription") ?? labelFor(field) ?? field.getAttribute("aria-description") ?? undefined;
    const schema: Record<string, unknown> = { type: field instanceof HTMLInputElement && field.type === "number" ? "number" : "string" };
    if (description) schema.description = description;
    if (field instanceof HTMLSelectElement) schema.enum = Array.from(field.options).map((option) => option.value || option.textContent || "").filter(Boolean);
    properties[name] = schema;
    if (field.required) required.push(name);
  }
  return { type: "object", properties, required };
}

function readAnnotations(element: Element): Record<string, unknown> | undefined {
  const annotations: Record<string, unknown> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith("toolannotation-")) annotations[attribute.name.slice("toolannotation-".length)] = attribute.value;
  }
  return Object.keys(annotations).length ? annotations : undefined;
}

function labelFor(field: Element): string | undefined {
  const id = field.getAttribute("id");
  if (!id) return undefined;
  return document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() || undefined;
}

function schemaParameterNames(schema: unknown): string[] {
  if (!isRecord(schema) || !isRecord(schema.properties)) return [];
  return Object.keys(schema.properties);
}

function schemaStringsByKey(value: unknown, key: string): string[] {
  const out: string[] = [];
  visit(value, (node) => {
    if (!isRecord(node)) return;
    const found = node[key];
    if (typeof found === "string") out.push(found);
    if (Array.isArray(found)) out.push(...found.filter((item): item is string => typeof item === "string"));
  });
  return out;
}

function enumValues(schema: unknown): string[] {
  const out: string[] = [];
  visit(schema, (node) => {
    if (isRecord(node) && Array.isArray(node.enum)) out.push(...node.enum.filter((item): item is string => typeof item === "string"));
    if (isRecord(node) && typeof node.const === "string") out.push(node.const);
  });
  return out;
}

function visit(value: unknown, fn: (value: unknown) => void, seen = new Set<unknown>()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  fn(value);
  if (Array.isArray(value)) value.forEach((item) => visit(item, fn, seen));
  else Object.values(value as Record<string, unknown>).forEach((item) => visit(item, fn, seen));
}

function searchableText(tool: WebMcpToolDefinition): string {
  return [
    tool.name,
    tool.title,
    tool.description,
    ...tool.parameterDescriptions,
    ...tool.enumValues,
    ...tool.examples,
    ...schemaStringsByKey(tool.inputSchema, "description"),
    ...schemaStringsByKey(tool.outputSchema, "description"),
    safeStringify(tool.annotations ?? {})
  ]
    .filter(Boolean)
    .join(" ");
}

function toolSchemaMismatch(tool: WebMcpToolDefinition): boolean {
  const nameDescription = `${tool.name ?? ""} ${tool.description ?? ""}`.toLowerCase();
  const schema = `${tool.parameterNames.join(" ")} ${tool.parameterDescriptions.join(" ")}`.toLowerCase();
  if (!nameDescription || !schema) return false;
  return READ_ONLY_RE.test(nameDescription) && STATE_CHANGE_RE.test(schema);
}

function makeFinding(ruleId: string, severity: Severity, evidence: string, explanation: string, recommendedAction: string): WebMcpSecurityFinding {
  return {
    ruleId,
    severity,
    confidence: severity === "critical" ? 0.94 : severity === "high" ? 0.86 : severity === "medium" ? 0.72 : 0.58,
    evidence: redactSensitive(excerpt(evidence)),
    explanation,
    recommendedAction
  };
}

function redactReport<T>(report: T): T {
  return JSON.parse(redactSensitive(safeStringify(report))) as T;
}

function redactSensitive(value: string): string {
  return value
    .replace(/\b(api[_ -]?key|token|secret|password|cookie|session)\b\s*[:=]\s*["']?[^"',\s}]+/gi, "$1=[redacted]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]");
}

function mergeCompleteness(items: RustScanResult["completeness"][]): RustScanResult["completeness"] {
  return {
    complete: items.every((item) => item.complete),
    input_truncated: items.some((item) => item.input_truncated),
    match_limit_reached: items.some((item) => item.match_limit_reached),
    structured_depth_limit_reached: items.some((item) => item.structured_depth_limit_reached),
    notes: Array.from(new Set(items.flatMap((item) => item.notes)))
  };
}

function safeOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function severityScore(severity: Severity): number {
  return { informational: 4, low: 10, medium: 24, high: 48, critical: 72 }[severity];
}

function severityWeight(severity: Severity): number {
  return { informational: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity];
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function excerpt(value: string) {
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanFromPath(value: unknown, key: string): boolean | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value[key] === "boolean" ? value[key] : undefined;
}

function parseBooleanHint(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  if (value === "" || value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return undefined;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item !== "object" || item === null) return item;
    if (seen.has(item)) return "[circular]";
    seen.add(item);
    return item;
  });
}
