import { scanTextWithRust } from "@agentsafe/scanner-wasm";
import {
  SCAN_PROTOCOL_VERSION,
  type ChunkResultPayload,
  type ScanChunkPayload,
  type ScanWorkerMessage,
  type TextChunk
} from "./protocol";
import { mapChunkFindings } from "./finding-mapping";

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
      // Deliberately neutral: a chunk spans many page elements with different
      // visibility, so engine-side context would score every match in the chunk
      // as if it shared the visibility of whichever segment happened to set the
      // chunk label. Severity is assigned per segment in mapChunkFindings.
      context: {
        visible_to_user: true,
        likely_in_extracted_text: true,
        hidden_signal_count: 0,
        metadata_signal_count: 0
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
      findings: mapChunkFindings({
        chunk: payload.chunk,
        findings: result.findings,
        sensitivity: payload.settings.sensitivity
      }),
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

function post<T extends ScanWorkerMessage["messageType"], P>(scanId: string, messageType: T, payload: P) {
  self.postMessage({ protocolVersion: SCAN_PROTOCOL_VERSION, scanId, messageType, timestamp: new Date().toISOString(), payload } satisfies ScanWorkerMessage<T, P>);
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
