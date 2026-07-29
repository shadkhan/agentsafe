import { scoreFinding } from "@agentsafe/risk-engine";
import type { Finding, FindingCategory, RuleSignal, ScannerSettings } from "@agentsafe/shared-types";
import { isRuleSignal, type TextChunk } from "./protocol";
import { explainFinding } from "./finding-explanations";

export interface RustChunkFinding {
  rule_id: string;
  category: string;
  severity: string;
  confidence: number;
  evidence: { redacted_text: string; char_start?: number };
  signals: string[];
}

type ChunkSegment = TextChunk["segments"][number];
type SegmentVisibility = ChunkSegment["visibility"];

interface MappedFinding {
  finding: Finding;
  sourceId: string;
  visibility: SegmentVisibility;
}

/**
 * Rules whose patterns match ordinary prose often enough that a match on its own
 * is not evidence of risk. They are kept only when the text is not user-visible,
 * or when a higher-specificity rule matched the same source element.
 */
const LOW_SPECIFICITY_RULES = new Set([
  "tool-use",
  "delimiter-block",
  "suspicious-comment-or-meta",
  "url-parameter-exfiltration"
]);

/**
 * Rules that exist to inspect page source. `suspicious-comment-or-meta` matches a
 * bare keyword list ("ai", "agent", "tool", "llm"), so on visible body text it
 * flags almost every page that discusses AI. It is only meaningful in metadata
 * and comments, which is what it was written for.
 */
const SOURCE_ONLY_RULES = new Set(["suspicious-comment-or-meta"]);

/**
 * Maps raw scanner-engine findings for one chunk onto page segments, scores each
 * finding from the visibility of the segment it actually landed in, and drops
 * low-specificity matches that nothing corroborates.
 *
 * Scoring must happen here rather than in the engine: a chunk can hold thousands
 * of segments, so chunk-level visibility says nothing about any individual match.
 */
export function mapChunkFindings(input: {
  chunk: TextChunk;
  findings: RustChunkFinding[];
  sensitivity: ScannerSettings["sensitivity"];
}): Finding[] {
  const mapped = input.findings.map((finding) => mapFinding(input.chunk, finding, input.sensitivity));
  return filterUncorroboratedFindings(mapped);
}

export function mapFinding(
  chunk: TextChunk,
  rustFinding: RustChunkFinding,
  sensitivity: ScannerSettings["sensitivity"]
): MappedFinding {
  const charStart = rustFinding.evidence.char_start ?? 0;
  const segment = segmentForOffset(chunk, charStart);
  const visibility = segment?.visibility ?? chunk.visibilityCategory;
  const visibleToUser = segment?.visibleToUser ?? chunk.visibilityCategory === "visible";
  const likelyInExtractedText = segment?.likelyInExtractedText ?? true;
  const hiddenReasons = segment?.hiddenReasons ?? {};
  const hiddenSignals = Object.keys(hiddenReasons).map(cssSignal).filter(Boolean) as RuleSignal[];
  const signals = [...hiddenSignals, ...signalsForRule(rustFinding.rule_id, visibility)];
  const category = chooseCategory(rustFinding.category, visibility, signals);

  const scored = scoreFinding({
    hiddenSignals: independentHiddenSignalCount(hiddenSignals),
    instructionSignals: countSignals(signals, isInstructionSignal),
    unicodeSignals: countSignals(signals, isUnicodeSignal),
    encodedSignals: countSignals(signals, isEncodedSignal),
    metadataSignals: visibility === "metadata" || visibility === "comment" ? 1 : 0,
    exfiltrationSignals: countSignals(signals, isExfiltrationSignal),
    visibleToUser,
    likelyInExtractedText,
    sensitivity
  });

  const enrichment = explainFinding({
    ruleId: rustFinding.rule_id,
    category,
    severity: scored.severity,
    confidence: scored.confidence,
    visibility,
    visibleToUser,
    likelyInExtractedText,
    signals,
    hiddenReasons
  });

  return {
    sourceId: segment?.sourceId ?? chunk.chunkId,
    visibility,
    finding: {
      id: stableId(segment?.selector ?? chunk.chunkId, rustFinding.rule_id, rustFinding.evidence.redacted_text, charStart),
      title: enrichment.title,
      ruleId: rustFinding.rule_id,
      category,
      severity: scored.severity,
      confidence: scored.confidence,
      verdict: enrichment.verdict,
      selector: segment?.selector ?? chunk.chunkId,
      frameUrl: segment?.frameUrl ?? chunk.frameUrl,
      evidence: excerpt(rustFinding.evidence.redacted_text),
      concern: enrichment.concern,
      possibleImpact: enrichment.possibleImpact,
      whyItMatters: enrichment.whyItMatters,
      confidenceReason: enrichment.confidenceReason,
      falsePositiveGuidance: enrichment.falsePositiveGuidance,
      explanation: enrichment.explanation,
      recommendedAction: enrichment.recommendedAction,
      visibleToUser,
      likelyInExtractedText,
      signals,
      cssProperties: Object.keys(hiddenReasons).length ? hiddenReasons : undefined
    }
  };
}

/**
 * Corroboration is evaluated per chunk, so a low-specificity match is kept when
 * another rule fired on the same element within the same chunk.
 */
export function filterUncorroboratedFindings(mapped: MappedFinding[]): Finding[] {
  const corroboratedSources = new Set(
    mapped.filter((entry) => !LOW_SPECIFICITY_RULES.has(entry.finding.ruleId)).map((entry) => entry.sourceId)
  );
  return mapped
    .filter((entry) => {
      if (SOURCE_ONLY_RULES.has(entry.finding.ruleId)) {
        return entry.visibility === "metadata" || entry.visibility === "comment";
      }
      if (!LOW_SPECIFICITY_RULES.has(entry.finding.ruleId)) return true;
      return !entry.finding.visibleToUser || corroboratedSources.has(entry.sourceId);
    })
    .map((entry) => entry.finding);
}

function segmentForOffset(chunk: TextChunk, charStart: number): ChunkSegment | undefined {
  return chunk.segments.find((candidate) => charStart >= candidate.start && charStart <= candidate.end) ?? chunk.segments[0];
}

function signalsForRule(ruleId: string, visibility: SegmentVisibility): RuleSignal[] {
  if (ruleId === "suspicious-comment-or-meta") {
    return [visibility === "comment" ? "suspicious-comment" : "suspicious-meta"];
  }
  return isRuleSignal(ruleId) ? [ruleId] : ["instruction-override"];
}

/**
 * `display:none` and `visibility:hidden` mechanically produce a zero-sized box and
 * an empty clip rect, so those co-occurring signals are not independent evidence
 * of intent. Counting them separately inflated severity on ordinary hidden markup.
 */
function independentHiddenSignalCount(hiddenSignals: RuleSignal[]): number {
  const independent = new Set(hiddenSignals);
  if (independent.has("display-none") || independent.has("visibility-hidden")) {
    independent.delete("zero-box");
    independent.delete("clip-hidden");
  }
  return Math.min(independent.size, 2);
}

function countSignals(signals: RuleSignal[], predicate: (signal: RuleSignal) => boolean): number {
  return signals.filter(predicate).length;
}

function isInstructionSignal(signal: RuleSignal): boolean {
  return signal === "instruction-override" || signal === "role-manipulation" || signal === "reveal-system-prompt";
}

function isUnicodeSignal(signal: RuleSignal): boolean {
  return signal === "zero-width-unicode" || signal === "bidi-control" || signal === "tag-block-unicode";
}

function isEncodedSignal(signal: RuleSignal): boolean {
  return signal === "base64-instruction";
}

function isExfiltrationSignal(signal: RuleSignal): boolean {
  return (
    signal === "tool-use" ||
    signal === "data-exfiltration" ||
    signal === "markdown-image-exfiltration" ||
    signal === "url-parameter-exfiltration"
  );
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

function stableId(selector: string, rule: string, text: string, offset: number) {
  let hash = 0;
  for (const char of `${selector}:${rule}:${text}:${offset}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `finding-${Math.abs(hash).toString(36)}`;
}

function excerpt(text: string) {
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}
