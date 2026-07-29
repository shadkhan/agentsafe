import type {
  Finding,
  ScanMetrics,
  ScanMode,
  ScanPartialReason,
  ScanProgress,
  ScanStatus,
  ScannerSettings,
  ScopedException
} from "@agentsafe/shared-types";
import {
  SCAN_PROTOCOL_VERSION,
  type ChunkResultPayload,
  type ExceptionMatchContext,
  type ExtractedTextSegment,
  type PageExtractionResult,
  type ScanCoordinatorOptions,
  type ScanCoordinatorResult,
  type ScanLimitsConfig,
  type ScanWorkerMessage,
  type TextChunk
} from "./protocol";
import scanWorkerUrl from "./scan-worker.ts?worker&url";

export * from "./protocol";
export { explainFinding } from "./finding-explanations";
export { filterUncorroboratedFindings, mapChunkFindings, mapFinding, type RustChunkFinding } from "./finding-mapping";

export const SCAN_LIMITS: Record<ScanMode, ScanLimitsConfig> = {
  quick: limits(2, 64, 512, 1_500, 1, 250, 12_000, 4_000, 64, 20_000),
  standard: limits(5, 128, 1_024, 5_000, 2, 1_000, 35_000, 12_000, 128, 45_000),
  deep: limits(20, 256, 2_048, 12_000, 2, 5_000, 100_000, 50_000, 256, 120_000)
};

export function createScanWorker(): Worker {
  return new Worker(scanWorkerUrl, { type: "module" });
}

export function createChunks(input: {
  scanId: string;
  pageUrl: string;
  mode: ScanMode;
  segments: ExtractedTextSegment[];
  limits?: ScanLimitsConfig;
}): TextChunk[] {
  const limits = input.limits ?? SCAN_LIMITS[input.mode];
  const chunks: TextChunk[] = [];
  let currentText = "";
  let currentSegments: TextChunk["segments"] = [];
  let absoluteOffset = 0;
  let chunkStart = 0;

  const flush = (finalChunk: boolean) => {
    if (!currentText || chunks.length >= limits.maxChunkCount) return;
    const previousEnd = chunkStart + currentText.length;
    const visibilityCategory = currentSegments.some((segment) => segment.visibility === "hidden")
      ? "hidden"
      : currentSegments.some((segment) => segment.visibility === "metadata")
        ? "metadata"
        : currentSegments.some((segment) => segment.visibility === "comment")
          ? "comment"
          : "visible";
    chunks.push({
      scanId: input.scanId,
      chunkId: `${input.scanId}:chunk:${chunks.length}`,
      sourceIds: Array.from(new Set(currentSegments.map((segment) => segment.sourceId))),
      text: currentText,
      sourceStartOffset: chunkStart,
      sourceEndOffset: previousEnd,
      overlapStart: chunks.length === 0 ? 0 : Math.min(limits.chunkOverlap, currentText.length),
      overlapEnd: finalChunk ? 0 : Math.min(limits.chunkOverlap, currentText.length),
      visibilityCategory,
      scanMode: input.mode,
      pageUrl: input.pageUrl,
      frameUrl: input.pageUrl,
      finalChunk,
      segments: currentSegments
    });
    if (finalChunk) {
      currentText = "";
      currentSegments = [];
      return;
    }
    const overlap = currentText.slice(-limits.chunkOverlap);
    const overlapStart = Math.max(0, currentText.length - overlap.length);
    currentSegments = currentSegments
      .filter((segment) => segment.end > overlapStart)
      .map((segment) => ({
        ...segment,
        start: Math.max(0, segment.start - overlapStart),
        end: Math.max(0, segment.end - overlapStart)
      }));
    currentText = overlap;
    chunkStart = previousEnd - overlap.length;
  };

  for (const segment of input.segments) {
    if (chunks.length >= limits.maxChunkCount) break;
    const text = segment.text.slice(0, limits.maxTextNodeCharacters);
    let offset = 0;
    while (offset < text.length && chunks.length < limits.maxChunkCount) {
      const available = limits.chunkSize - currentText.length;
      const piece = text.slice(offset, offset + available);
      const start = currentText.length;
      currentText += piece;
      currentSegments.push({
        sourceId: segment.sourceId,
        selector: segment.selector,
        frameUrl: segment.frameUrl,
        start,
        end: start + piece.length,
        visibleToUser: segment.visibleToUser,
        likelyInExtractedText: segment.likelyInExtractedText,
        hiddenReasons: segment.hiddenReasons,
        visibility: segment.visibility
      });
      offset += piece.length;
      absoluteOffset += piece.length;
      if (currentText.length >= limits.chunkSize) flush(false);
    }
    if (currentText.length + 1 < limits.chunkSize) {
      currentText += "\n";
      absoluteOffset += 1;
    }
  }
  flush(true);
  return chunks.map((chunk, index) => ({ ...chunk, finalChunk: index === chunks.length - 1 }));
}

export async function runWorkerScan(options: ScanCoordinatorOptions): Promise<ScanCoordinatorResult> {
  const scanId = options.scanId ?? crypto.randomUUID();
  const mode = options.settings.scanMode ?? "standard";
  const limits = SCAN_LIMITS[mode];
  const started = options.now?.() ?? Date.now();
  const startedAt = new Date(started).toISOString();
  let worker = (options.workerFactory ?? createScanWorker)();
  let status: ScanStatus = "running";
  let workerRestartCount = 0;
  let chunksSkipped = 0;
  let charactersScanned = 0;
  let engineVersion: string | undefined;
  let ruleRegistryVersion: string | undefined;
  const timedOutUnits: string[] = [];
  const findings: Finding[] = [];
  const partialReasons: ScanPartialReason[] = options.extractionMetrics.partialReasons.map((reason) => makePartial(reason.code, reason.explanation, reason.phase, reason.source));
  let chunks: TextChunk[] = [];
  let aborted = false;
  const abort = () => {
    aborted = true;
    worker.postMessage(makeMessage(scanId, "SCAN_ABORT", {}));
    worker.terminate();
  };
  options.signal?.addEventListener("abort", abort, { once: true });

  try {
    chunks = createChunks({ scanId, pageUrl: options.pageUrl, mode, segments: options.segments, limits });
    if (chunks.length >= limits.maxChunkCount) {
      status = "partial_chunk_limit";
      partialReasons.push(makePartial("partial_chunk_limit", "Chunk limit reached; some extracted content was not scanned.", "scanning_visible_content"));
    }

    await initializeWorker(worker, scanId, mode, limits.workerInitTimeoutMs);
    if (aborted) throw new Error("Scan cancelled");
    publishProgress("scanning_visible_content", 0);

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (aborted || options.signal?.aborted) {
        status = "cancelled";
        partialReasons.push(makePartial("cancelled", "The scan was cancelled. Findings shown were detected before cancellation.", "scanning_visible_content"));
        break;
      }
      if ((options.now?.() ?? Date.now()) - started > limits.maxScanDurationMs) {
        status = "partial_worker_failure";
        chunksSkipped += chunks.length - index;
        partialReasons.push(makePartial("partial_worker_failure", "Maximum scan duration reached; remaining chunks were skipped.", "scanning_visible_content", chunk.chunkId));
        break;
      }
      try {
        const result = await scanChunk(worker, scanId, chunk, options.settings, limits, options.signal);
        engineVersion = result.engineVersion;
        ruleRegistryVersion = result.ruleRegistryVersion;
        charactersScanned += result.charactersScanned;
        findings.push(...result.findings.filter((finding) => shouldKeepFinding(options.pageUrl, finding, options.settings)));
        publishProgress("scanning_visible_content", index + 1);
        if (findings.length >= limits.maxFindings) {
          status = "partial_finding_limit";
          partialReasons.push(makePartial("partial_finding_limit", "Finding limit reached; remaining findings may be omitted.", "aggregating_findings"));
          break;
        }
      } catch (error) {
        if (aborted || options.signal?.aborted) {
          status = "cancelled";
          partialReasons.push(makePartial("cancelled", "The scan was cancelled. Findings shown were detected before cancellation.", "scanning_visible_content", chunk.chunkId));
          break;
        }
        timedOutUnits.push(chunk.chunkId);
        chunksSkipped += 1;
        worker.terminate();
        if (workerRestartCount >= limits.maxWorkerRestarts) {
          status = "partial_worker_failure";
          partialReasons.push(makePartial("partial_worker_failure", "Scanner Worker failed after the restart limit.", "scanning_visible_content", chunk.chunkId));
          break;
        }
        workerRestartCount += 1;
        status = "partial_rule_timeout";
        partialReasons.push(makePartial("partial_rule_timeout", `Chunk ${chunk.chunkId} timed out or failed and was skipped. ${formatError(error)}`, "scanning_visible_content", chunk.chunkId));
        worker = (options.workerFactory ?? createScanWorker)();
        await initializeWorker(worker, scanId, mode, limits.workerInitTimeoutMs);
      }
    }
  } finally {
    options.signal?.removeEventListener("abort", abort);
    worker.terminate();
  }

  const completedAt = new Date(options.now?.() ?? Date.now()).toISOString();
  const finalStatus: ScanStatus = aborted || options.signal?.aborted ? "cancelled" : status === "running" ? (partialReasons.length ? partialReasons[0].code : "complete_within_configured_limits") : status;
  const metrics: ScanMetrics = {
    scanId,
    mode,
    status: finalStatus,
    startedAt,
    completedAt,
    elapsedMs: (options.now?.() ?? Date.now()) - started,
    nodesVisited: options.extractionMetrics.nodesVisited,
    textNodesVisited: options.extractionMetrics.textNodesVisited,
    candidateHiddenElements: options.extractionMetrics.candidateHiddenElements,
    computedStyleInspections: options.extractionMetrics.computedStyleInspections,
    charactersExtracted: options.extractionMetrics.charactersExtracted,
    charactersScanned,
    framesScanned: options.extractionMetrics.framesScanned,
    framesDetected: options.extractionMetrics.framesDetected,
    shadowRootsVisited: options.extractionMetrics.shadowRootsVisited,
    chunksQueued: chunks.length,
    chunksCompleted: Math.max(0, chunks.length - chunksSkipped),
    chunksSkipped,
    workerRestartCount,
    timedOutUnits,
    partialReasons,
    engineVersion,
    ruleRegistryVersion,
    appliedExceptionIds: appliedExceptionIds(options.pageUrl, options.settings.scopedExceptions)
  };
  return { findings: dedupeFindings(findings).slice(0, limits.maxFindings), status: finalStatus, metrics };

  function publishProgress(phase: string, chunksCompleted: number) {
    options.onProgress?.({
      scanId,
      phase,
      status: "running",
      percentage: chunks.length ? Math.min(98, Math.round((chunksCompleted / chunks.length) * 90) + 5) : undefined,
      nodesVisited: options.extractionMetrics.nodesVisited,
      charactersExtracted: options.extractionMetrics.charactersExtracted,
      charactersScanned,
      chunksQueued: chunks.length,
      chunksCompleted,
      totalEstimatedChunks: chunks.length,
      findingsCount: findings.length,
      elapsedMs: (options.now?.() ?? Date.now()) - started,
      workerRestartCount,
      currentSourceType: "page-text",
      currentScanMode: mode
    });
  }
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const finding of findings) {
    const key = `${finding.ruleId}:${finding.selector}:${hash(finding.evidence.toLowerCase().replace(/\s+/g, " ").trim())}:${finding.visibleToUser}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}

export function isScopedExceptionMatch(context: ExceptionMatchContext): boolean {
  let parsed: URL;
  try {
    parsed = new URL(context.url);
  } catch {
    return false;
  }
  const host = normalizeHost(parsed.hostname);
  const now = context.now ?? new Date();
  for (const exception of sortedExceptions(context.exceptions)) {
    if (!exception.enabled) continue;
    if (exception.expiresAt && new Date(exception.expiresAt) <= now) continue;
    if (exception.ruleIds.length > 0 && !exception.ruleIds.includes(context.ruleId)) continue;
    const scope = exception.scopeValue.trim();
    if (!scope) continue;
    if (exception.scopeType === "global-rule") return exception.ruleIds.includes(context.ruleId);
    if (exception.scopeType === "exact-url" && stripHash(context.url) === stripHash(scope)) return true;
    if (exception.scopeType === "url-prefix" && context.url.startsWith(scope)) return true;
    if (exception.scopeType === "exact-hostname" && host === normalizeHost(scope)) return true;
    if (exception.scopeType === "subdomain") {
      const normalizedScope = normalizeHost(scope);
      if (host !== normalizedScope && host.endsWith(`.${normalizedScope}`)) return true;
    }
    if (exception.scopeType === "development-host" && isDevelopmentHost(host) && (normalizeHost(scope) === host || scope === "*")) return true;
  }
  return false;
}

export function validateImportedExceptions(value: unknown): ScopedException[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ScopedException => {
    if (typeof item !== "object" || item === null) return false;
    const candidate = item as Partial<ScopedException>;
    return Boolean(candidate.id && candidate.scopeType && candidate.scopeValue && Array.isArray(candidate.ruleIds) && typeof candidate.enabled === "boolean" && candidate.createdAt && candidate.source);
  });
}

export function makeMessage<T extends ScanWorkerMessage["messageType"], P>(scanId: string, messageType: T, payload: P): ScanWorkerMessage<T, P> {
  return { protocolVersion: SCAN_PROTOCOL_VERSION, scanId, messageType, timestamp: new Date().toISOString(), payload };
}

export function progressPercentage(progress: ScanProgress): number | undefined {
  if (!progress.totalEstimatedChunks && !progress.estimatedNodes) return undefined;
  const chunkPart = progress.totalEstimatedChunks ? progress.chunksCompleted / progress.totalEstimatedChunks : 0;
  const nodePart = progress.estimatedNodes ? progress.nodesVisited / progress.estimatedNodes : 0;
  return Math.min(99, Math.round(Math.max(chunkPart, nodePart) * 100));
}

function scanChunk(worker: Worker, scanId: string, chunk: TextChunk, settings: ScannerSettings, limits: ScanLimitsConfig, signal?: AbortSignal): Promise<ChunkResultPayload> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Scan cancelled"));
      return;
    }
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Chunk timeout: ${chunk.chunkId}`));
    }, limits.chunkTimeoutMs);
    const onAbort = () => {
      cleanup();
      reject(new Error("Scan cancelled"));
    };
    const onMessage = (event: MessageEvent<ScanWorkerMessage>) => {
      const message = event.data;
      if (message?.protocolVersion !== SCAN_PROTOCOL_VERSION || message.scanId !== scanId) return;
      if (message.messageType === "CHUNK_RESULT") {
        cleanup();
        resolve(message.payload as ChunkResultPayload);
      }
      if (message.messageType === "CHUNK_ERROR" || message.messageType === "WORKER_FATAL_ERROR") {
        cleanup();
        reject(new Error(JSON.stringify(message.payload)));
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
    };
    worker.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage(makeMessage(scanId, "SCAN_CHUNK", { chunk, settings, limits }));
  });
}

function initializeWorker(worker: Worker, scanId: string, mode: ScanMode, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Worker initialization timed out"));
    }, timeoutMs);
    const onMessage = (event: MessageEvent<ScanWorkerMessage>) => {
      const message = event.data;
      if (message?.protocolVersion !== SCAN_PROTOCOL_VERSION || message.scanId !== scanId) return;
      if (message.messageType === "WORKER_READY") {
        cleanup();
        resolve();
      }
      if (message.messageType === "WORKER_FATAL_ERROR") {
        cleanup();
        reject(new Error(JSON.stringify(message.payload)));
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage(makeMessage(scanId, "WORKER_INITIALIZE", { mode }));
  });
}

function shouldKeepFinding(pageUrl: string, finding: Finding, settings: ScannerSettings) {
  return settings.enabledCategories.includes(finding.category) && !isScopedExceptionMatch({ url: pageUrl, ruleId: finding.ruleId, exceptions: settings.scopedExceptions });
}

function makePartial(code: ScanStatus, explanation: string, phase: string, source?: string): ScanPartialReason {
  return { code, explanation, phase, source, existingFindingsRemainValid: true, recommendedAction: "Review findings as partial and retry with a deeper scan mode if needed." };
}

function appliedExceptionIds(url: string, exceptions: ScopedException[]) {
  return exceptions.filter((exception) => isScopedExceptionMatch({ url, ruleId: exception.ruleIds[0] ?? "", exceptions: [exception] })).map((exception) => exception.id);
}

function sortedExceptions(exceptions: ScopedException[]) {
  const priority: Record<ScopedException["scopeType"], number> = { "exact-url": 1, "url-prefix": 2, "exact-hostname": 3, subdomain: 4, "development-host": 5, "global-rule": 6 };
  return [...exceptions].sort((left, right) => priority[left.scopeType] - priority[right.scopeType]);
}

function stripHash(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("#")[0];
  }
}

function normalizeHost(value: string) {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

function isDevelopmentHost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function hash(value: string) {
  let out = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index);
    out = Math.imul(out, 16777619);
  }
  return (out >>> 0).toString(16);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function limits(totalMb: number, chunkKb: number, overlap: number, timeout: number, restarts: number, findings: number, nodes: number, textNodes: number, chunks: number, durationMs: number): ScanLimitsConfig {
  return {
    maxDomNodes: nodes,
    maxTextNodes: textNodes,
    maxTotalCharacters: totalMb * 1024 * 1024,
    maxTextNodeCharacters: 512 * 1024,
    maxChunkCount: chunks,
    maxQueuedChunks: 32,
    maxFindings: findings,
    maxFindingsPerRule: Math.min(256, findings),
    maxEvidenceLength: 240,
    maxEncodedContentDecodeBytes: 128 * 1024,
    maxStructuredDepth: 16,
    maxStructuredFields: 1_024,
    maxWorkerRestarts: restarts,
    maxScanDurationMs: durationMs,
    chunkSize: chunkKb * 1024,
    chunkOverlap: overlap,
    chunkTimeoutMs: timeout,
    workerInitTimeoutMs: 5_000
  };
}
