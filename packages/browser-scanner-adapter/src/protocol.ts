import type {
  Finding,
  RuleSignal,
  ScanMode,
  ScanProgress,
  ScanStatus,
  ScannerSettings,
  ScopedException
} from "@agentsafe/shared-types";

export const SCAN_PROTOCOL_VERSION = 1;

export interface ExtractedTextSegment {
  sourceId: string;
  nodeId: string;
  selector: string;
  frameUrl: string;
  visibility: "visible" | "hidden" | "metadata" | "comment";
  tagName: string;
  text: string;
  textOffset: number;
  sourceCharCount: number;
  hiddenReasons: Record<string, string>;
  visibleToUser: boolean;
  likelyInExtractedText: boolean;
}

export interface ExtractionMetrics {
  nodesVisited: number;
  textNodesVisited: number;
  candidateHiddenElements: number;
  computedStyleInspections: number;
  charactersExtracted: number;
  traversalDurationMs: number;
  /** Embedded frames the extracting document contains, used to report coverage. */
  iframeCount?: number;
  shadowRootsVisited?: number;
  /** Set when merging per-frame extractions in the side panel. */
  framesScanned?: number;
  framesDetected?: number;
  partialReasons: Array<{
    code: ScanStatus;
    explanation: string;
    phase: string;
    source?: string;
    workCompleted?: number;
    workSkipped?: number;
  }>;
}

export interface PageExtractionResult {
  scanId: string;
  pageUrl: string;
  pageTitle: string;
  segments: ExtractedTextSegment[];
  metrics: ExtractionMetrics;
}

export interface TextChunk {
  scanId: string;
  chunkId: string;
  sourceIds: string[];
  text: string;
  sourceStartOffset: number;
  sourceEndOffset: number;
  overlapStart: number;
  overlapEnd: number;
  visibilityCategory: ExtractedTextSegment["visibility"];
  scanMode: ScanMode;
  pageUrl: string;
  frameUrl: string;
  finalChunk: boolean;
  segments: Array<{
    sourceId: string;
    selector: string;
    frameUrl: string;
    start: number;
    end: number;
    visibleToUser: boolean;
    likelyInExtractedText: boolean;
    hiddenReasons: Record<string, string>;
    visibility: ExtractedTextSegment["visibility"];
  }>;
}

export interface ScanLimitsConfig {
  maxDomNodes: number;
  maxTextNodes: number;
  maxTotalCharacters: number;
  maxTextNodeCharacters: number;
  maxChunkCount: number;
  maxQueuedChunks: number;
  maxFindings: number;
  maxFindingsPerRule: number;
  maxEvidenceLength: number;
  maxEncodedContentDecodeBytes: number;
  maxStructuredDepth: number;
  maxStructuredFields: number;
  maxWorkerRestarts: number;
  maxScanDurationMs: number;
  chunkSize: number;
  chunkOverlap: number;
  chunkTimeoutMs: number;
  workerInitTimeoutMs: number;
}

export type WorkerMessageType =
  | "WORKER_INITIALIZE"
  | "WORKER_READY"
  | "SCAN_CHUNK"
  | "CHUNK_PROGRESS"
  | "CHUNK_RESULT"
  | "CHUNK_ERROR"
  | "SCAN_ABORT"
  | "WORKER_HEALTH"
  | "WORKER_FATAL_ERROR";

export interface ScanWorkerMessage<TType extends WorkerMessageType = WorkerMessageType, TPayload = unknown> {
  protocolVersion: typeof SCAN_PROTOCOL_VERSION;
  scanId: string;
  messageType: TType;
  timestamp: string;
  payload: TPayload;
}

export interface ScanChunkPayload {
  chunk: TextChunk;
  settings: ScannerSettings;
  limits: ScanLimitsConfig;
}

export interface ChunkResultPayload {
  chunkId: string;
  findings: Finding[];
  engineVersion: string;
  ruleRegistryVersion: string;
  charactersScanned: number;
  completeness: {
    complete: boolean;
    input_truncated: boolean;
    match_limit_reached: boolean;
    structured_depth_limit_reached: boolean;
    notes: string[];
  };
}

export interface ScanCoordinatorOptions {
  scanId?: string;
  pageUrl: string;
  pageTitle: string;
  settings: ScannerSettings;
  segments: ExtractedTextSegment[];
  extractionMetrics: ExtractionMetrics;
  workerFactory?: () => Worker;
  now?: () => number;
  onProgress?: (progress: ScanProgress) => void;
  signal?: AbortSignal;
}

export interface ScanCoordinatorResult {
  findings: Finding[];
  status: ScanStatus;
  metrics: import("@agentsafe/shared-types").ScanMetrics;
}

export interface ExceptionMatchContext {
  url: string;
  ruleId: string;
  now?: Date;
  exceptions: ScopedException[];
}

export function isRuleSignal(value: string): value is RuleSignal {
  return [
    "display-none",
    "visibility-hidden",
    "opacity-near-zero",
    "zero-box",
    "font-size-zero",
    "offscreen-position",
    "clip-hidden",
    "low-contrast",
    "zero-width-unicode",
    "bidi-control",
    "tag-block-unicode",
    "suspicious-comment",
    "suspicious-meta",
    "aria-hidden-instruction",
    "base64-instruction",
    "instruction-override",
    "role-manipulation",
    "reveal-system-prompt",
    "delimiter-block",
    "tool-use",
    "data-exfiltration",
    "markdown-image-exfiltration",
    "url-parameter-exfiltration"
  ].includes(value);
}
