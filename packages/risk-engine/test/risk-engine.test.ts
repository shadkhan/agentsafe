import { describe, expect, it } from "vitest";
import { scoreFinding, summarizeFindings } from "../src";
import type { Finding } from "@agentsafe/shared-types";

describe("risk scoring", () => {
  it("keeps isolated phrase matches below high severity", () => {
    const result = scoreFinding({
      hiddenSignals: 0,
      instructionSignals: 1,
      unicodeSignals: 0,
      encodedSignals: 0,
      metadataSignals: 0,
      exfiltrationSignals: 0,
      visibleToUser: true,
      likelyInExtractedText: true
    });
    expect(["informational", "low", "medium"]).toContain(result.severity);
  });

  it("raises hidden instruction content to high or critical", () => {
    const result = scoreFinding({
      hiddenSignals: 2,
      instructionSignals: 2,
      unicodeSignals: 0,
      encodedSignals: 0,
      metadataSignals: 0,
      exfiltrationSignals: 1,
      visibleToUser: false,
      likelyInExtractedText: true
    });
    expect(["high", "critical"]).toContain(result.severity);
  });

  it("honors sensitivity", () => {
    const low = scoreFinding({
      hiddenSignals: 1,
      instructionSignals: 1,
      unicodeSignals: 0,
      encodedSignals: 0,
      metadataSignals: 0,
      exfiltrationSignals: 0,
      visibleToUser: false,
      likelyInExtractedText: true,
      sensitivity: "low"
    });
    const high = scoreFinding({ ...lowInput, sensitivity: "high" });
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("summarizes findings by severity and category", () => {
    const finding = (severity: Finding["severity"], category: Finding["category"]): Finding => ({
      id: `${severity}-${category}`,
      ruleId: "test",
      category,
      severity,
      confidence: 0.8,
      selector: "body",
      evidence: "test",
      explanation: "test",
      recommendedAction: "test",
      visibleToUser: true,
      likelyInExtractedText: true,
      signals: []
    });
    const summary = summarizeFindings([
      finding("medium", "hidden-css"),
      finding("high", "unicode-security"),
      finding("low", "instruction-pattern")
    ]);
    expect(summary.severityCounts.high).toBe(1);
    expect(summary.hiddenTextCount).toBe(1);
    expect(summary.suspiciousUnicodeCount).toBe(1);
    expect(summary.instructionPatternCount).toBe(1);
  });
});

const lowInput = {
  hiddenSignals: 1,
  instructionSignals: 1,
  unicodeSignals: 0,
  encodedSignals: 0,
  metadataSignals: 0,
  exfiltrationSignals: 0,
  visibleToUser: false,
  likelyInExtractedText: true
} as const;
