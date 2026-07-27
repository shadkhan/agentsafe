import { describe, expect, test } from "vitest";
import {
  createChunks,
  dedupeFindings,
  isScopedExceptionMatch,
  makeMessage,
  progressPercentage,
  SCAN_LIMITS,
  SCAN_PROTOCOL_VERSION,
  validateImportedExceptions,
  type ExtractedTextSegment
} from "../src";
import type { Finding, ScopedException } from "@agentsafe/shared-types";

const segment = (id: string, text: string, selector = `#${id}`): ExtractedTextSegment => ({
  sourceId: id,
  nodeId: id,
  selector,
  frameUrl: "https://example.com/page",
  visibility: "visible",
  tagName: "p",
  text,
  textOffset: 0,
  sourceCharCount: text.length,
  hiddenReasons: {},
  visibleToUser: true,
  likelyInExtractedText: true
});

test("creates bounded overlapping chunks", () => {
  const limits = { ...SCAN_LIMITS.quick, chunkSize: 10, chunkOverlap: 3, maxChunkCount: 10 };
  const chunks = createChunks({
    scanId: "scan-1",
    pageUrl: "https://example.com",
    mode: "quick",
    segments: [segment("a", "abcdefghijklmnopqrstuvwxyz")],
    limits
  });
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks[1].text.startsWith(chunks[0].text.slice(-3))).toBe(true);
  expect(chunks.at(-1)?.finalChunk).toBe(true);
});

test("deduplicates overlap findings without merging separate selectors", () => {
  const finding = (selector: string): Finding => ({
    id: crypto.randomUUID(),
    ruleId: "instruction-override",
    category: "instruction-pattern",
    severity: "medium",
    confidence: 0.7,
    selector,
    evidence: "ignore previous instructions",
    explanation: "x",
    recommendedAction: "y",
    visibleToUser: true,
    likelyInExtractedText: true,
    signals: ["instruction-override"]
  });
  expect(dedupeFindings([finding("#a"), finding("#a")])).toHaveLength(1);
  expect(dedupeFindings([finding("#a"), finding("#b")])).toHaveLength(2);
});

describe("scoped exceptions", () => {
  const exception = (partial: Partial<ScopedException>): ScopedException => ({
    id: "ex-1",
    scopeType: "exact-hostname",
    scopeValue: "example.com",
    ruleIds: ["instruction-override"],
    enabled: true,
    createdAt: "2026-07-27T00:00:00.000Z",
    source: "user",
    ...partial
  });

  test("matches exact host but not attacker suffixes", () => {
    const exceptions = [exception({})];
    expect(isScopedExceptionMatch({ url: "https://example.com/page", ruleId: "instruction-override", exceptions })).toBe(true);
    expect(isScopedExceptionMatch({ url: "https://example.com.attacker.test", ruleId: "instruction-override", exceptions })).toBe(false);
    expect(isScopedExceptionMatch({ url: "https://attackerexample.com", ruleId: "instruction-override", exceptions })).toBe(false);
  });

  test("supports subdomain and development hosts", () => {
    expect(isScopedExceptionMatch({ url: "https://sub.example.com", ruleId: "instruction-override", exceptions: [exception({ scopeType: "subdomain" })] })).toBe(true);
    expect(isScopedExceptionMatch({ url: "http://localhost:3000", ruleId: "instruction-override", exceptions: [exception({ scopeType: "development-host", scopeValue: "*" })] })).toBe(true);
    expect(isScopedExceptionMatch({ url: "http://127.0.0.1:5173", ruleId: "instruction-override", exceptions: [exception({ scopeType: "development-host", scopeValue: "*" })] })).toBe(true);
  });

  test("ignores disabled and expired exceptions", () => {
    const now = new Date("2026-07-27T10:00:00.000Z");
    expect(isScopedExceptionMatch({ url: "https://example.com", ruleId: "instruction-override", now, exceptions: [exception({ enabled: false })] })).toBe(false);
    expect(isScopedExceptionMatch({ url: "https://example.com", ruleId: "instruction-override", now, exceptions: [exception({ expiresAt: "2026-07-27T09:00:00.000Z" })] })).toBe(false);
  });
});

test("validates imported exception arrays", () => {
  expect(validateImportedExceptions([{ id: "x" }])).toHaveLength(0);
  expect(validateImportedExceptions([{
    id: "x",
    scopeType: "global-rule",
    scopeValue: "*",
    ruleIds: ["instruction-override"],
    enabled: true,
    createdAt: "2026-07-27T00:00:00.000Z",
    source: "imported"
  }])).toHaveLength(1);
});

test("message protocol includes version and scan id", () => {
  const message = makeMessage("scan-1", "WORKER_HEALTH", {});
  expect(message.protocolVersion).toBe(SCAN_PROTOCOL_VERSION);
  expect(message.scanId).toBe("scan-1");
});

test("progress percentage uses actual work units", () => {
  expect(progressPercentage({
    scanId: "scan-1",
    phase: "scanning_visible_content",
    status: "running",
    nodesVisited: 0,
    charactersExtracted: 0,
    charactersScanned: 0,
    chunksQueued: 10,
    chunksCompleted: 5,
    totalEstimatedChunks: 10,
    findingsCount: 0,
    elapsedMs: 10,
    workerRestartCount: 0,
    currentScanMode: "standard"
  })).toBe(50);
});
