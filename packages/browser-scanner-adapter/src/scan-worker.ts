import { scanTextWithRust } from "@agentsafe/scanner-wasm";
import type { Finding, FindingCategory, RuleSignal, Severity } from "@agentsafe/shared-types";
import {
  isRuleSignal,
  SCAN_PROTOCOL_VERSION,
  type ChunkResultPayload,
  type ScanChunkPayload,
  type ScanWorkerMessage,
  type TextChunk
} from "./protocol";

let initialized = false;
let abortedScanId: string | undefined;

self.addEventListener("message", (event: MessageEvent<ScanWorkerMessage>) => {
  void handleMessage(event.data);
});

async function handleMessage(message: ScanWorkerMessage) {
  if (!message || message.protocolVersion !== SCAN_PROTOCOL_VERSION) return;
  if (message.messageType === "WORKER_INITIALIZE") {
    try {
      await scanTextWithRust({ source_id: "agentsafe-worker-health", text: "health", sensitivity: "low" });
      initialized = true;
      post(message.scanId, "WORKER_READY", { ok: true });
    } catch (error) {
      post(message.scanId, "WORKER_FATAL_ERROR", { message: formatError(error) });
    }
    return;
  }
  if (message.messageType === "SCAN_ABORT") {
    abortedScanId = message.scanId;
    return;
  }
  if (message.messageType !== "SCAN_CHUNK") return;
  if (!initialized) {
    post(message.scanId, "CHUNK_ERROR", { message: "Worker is not initialized." });
    return;
  }
  if (abortedScanId === message.scanId) return;
  const payload = message.payload as ScanChunkPayload;
  try {
    validateChunk(payload.chunk);
    const result = await scanTextWithRust({
      source_id: payload.chunk.chunkId,
      text: payload.chunk.text,
      sensitivity: payload.settings.sensitivity,
      context: {
        visible_to_user: payload.chunk.visibilityCategory === "visible",
        likely_in_extracted_text: true,
        hidden_signal_count: payload.chunk.visibilityCategory === "hidden" ? 1 : 0,
        metadata_signal_count: payload.chunk.visibilityCategory === "metadata" || payload.chunk.visibilityCategory === "comment" ? 1 : 0
      },
      limits: {
        max_input_bytes: payload.limits.chunkSize + payload.limits.chunkOverlap,
        max_matches: payload.limits.maxFindings,
        max_matches_per_rule: payload.limits.maxFindingsPerRule,
        max_structured_depth: payload.limits.maxStructuredDepth,
        max_array_length: payload.limits.maxStructuredFields,
        max_object_field_count: payload.limits.maxStructuredFields,
        max_string_length: payload.limits.maxTextNodeCharacters
      }
    });
    const out: ChunkResultPayload = {
      chunkId: payload.chunk.chunkId,
      findings: result.findings.map((finding) => mapFinding(payload.chunk, finding)),
      engineVersion: result.engine_version,
      ruleRegistryVersion: result.rule_registry_version,
      charactersScanned: payload.chunk.text.length,
      completeness: result.completeness
    };
    post(message.scanId, "CHUNK_RESULT", out);
  } catch (error) {
    post(message.scanId, "CHUNK_ERROR", { chunkId: payload.chunk?.chunkId, message: formatError(error) });
  }
}

function validateChunk(chunk: TextChunk) {
  if (!chunk || typeof chunk.text !== "string" || !chunk.chunkId || !Array.isArray(chunk.segments)) throw new Error("Malformed chunk.");
  if (chunk.text.length > 512 * 1024) throw new Error("Chunk exceeds worker hard limit.");
}

function mapFinding(chunk: TextChunk, rustFinding: {
  rule_id: string;
  category: string;
  severity: string;
  confidence: number;
  evidence: { redacted_text: string; char_start?: number };
  signals: string[];
}): Finding {
  const charStart = rustFinding.evidence.char_start ?? 0;
  const segment = chunk.segments.find((candidate) => charStart >= candidate.start && charStart <= candidate.end) ?? chunk.segments[0];
  const hiddenSignals = Object.keys(segment?.hiddenReasons ?? {}).map(cssSignal).filter(Boolean) as RuleSignal[];
  const signals = [...hiddenSignals, ...rustFinding.signals.filter(isRuleSignal)];
  const category = chooseCategory(rustFinding.category, segment?.visibility ?? chunk.visibilityCategory, signals);
  return {
    id: stableId(segment?.selector ?? chunk.chunkId, rustFinding.rule_id, rustFinding.evidence.redacted_text, charStart),
    ruleId: rustFinding.rule_id,
    category,
    severity: rustFinding.severity as Severity,
    confidence: rustFinding.confidence,
    selector: segment?.selector ?? chunk.chunkId,
    evidence: excerpt(rustFinding.evidence.redacted_text),
    explanation: `Rust/WASM scanner matched ${rustFinding.rule_id} in ${segment?.visibility ?? chunk.visibilityCategory} page content.`,
    recommendedAction: recommendedAction(category),
    visibleToUser: segment?.visibleToUser ?? chunk.visibilityCategory === "visible",
    likelyInExtractedText: segment?.likelyInExtractedText ?? true,
    signals: signals.length ? signals : [fallbackSignal(rustFinding.rule_id)],
    cssProperties: Object.keys(segment?.hiddenReasons ?? {}).length ? segment?.hiddenReasons : undefined
  };
}

function chooseCategory(rustCategory: string, visibility: string, signals: RuleSignal[]): FindingCategory {
  if (signals.includes("base64-instruction") || rustCategory === "encoded-content") return "encoded-content";
  if (signals.includes("zero-width-unicode") || signals.includes("bidi-control") || rustCategory === "unicode-security") return "unicode-security";
  if (rustCategory === "exfiltration") return "exfiltration";
  if (rustCategory === "delimiter") return "delimiter";
  if (visibility === "metadata") return "metadata";
  if (visibility === "comment") return "html-comment";
  if (visibility === "hidden") return "hidden-css";
  return "instruction-pattern";
}

function recommendedAction(category: FindingCategory) {
  if (category === "hidden-css" || category === "accessibility") return "Review the element and remove hidden text from sanitized exports unless it is clearly legitimate.";
  if (category === "unicode-security") return "Remove or normalize suspicious Unicode before copying content into an AI system.";
  if (category === "encoded-content") return "Decode and inspect the content, then exclude it from AI-facing exports unless trusted.";
  return "Treat as advisory, verify intent in context, and avoid copying the suspicious instruction into an AI agent.";
}

function cssSignal(property: string): RuleSignal | undefined {
  return {
    display: "display-none",
    visibility: "visibility-hidden",
    opacity: "opacity-near-zero",
    fontSize: "font-size-zero",
    clip: "clip-hidden",
    box: "zero-box",
    position: "offscreen-position",
    contrast: "low-contrast",
    ariaHidden: "aria-hidden-instruction"
  }[property] as RuleSignal | undefined;
}

function fallbackSignal(ruleId: string): RuleSignal {
  return isRuleSignal(ruleId) ? ruleId : "instruction-override";
}

function stableId(selector: string, rule: string, text: string, offset: number) {
  let hash = 0;
  for (const char of `${selector}:${rule}:${text}:${offset}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `finding-${Math.abs(hash).toString(36)}`;
}

function excerpt(text: string) {
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function post<T extends ScanWorkerMessage["messageType"], P>(scanId: string, messageType: T, payload: P) {
  self.postMessage({ protocolVersion: SCAN_PROTOCOL_VERSION, scanId, messageType, timestamp: new Date().toISOString(), payload } satisfies ScanWorkerMessage<T, P>);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
