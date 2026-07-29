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

  it("ranks a few real findings above a pile of informational noise", () => {
    const noise = Array.from({ length: 40 }, (_, index) =>
      finding("informational", "instruction-pattern", 0.28, `noise-${index}`)
    );
    const real = Array.from({ length: 3 }, (_, index) => finding("high", "hidden-css", 0.7, `real-${index}`));
    expect(summarizeFindings(noise).overallRiskScore).toBeLessThan(summarizeFindings(real).overallRiskScore);
  });

  it("keeps informational noise out of the medium risk band", () => {
    const noise = Array.from({ length: 60 }, (_, index) =>
      finding("informational", "instruction-pattern", 0.28, `noise-${index}`)
    );
    expect(summarizeFindings(noise).overallRiskScore).toBeLessThan(35);
  });

  it("scores a single critical finding as high risk on its own", () => {
    expect(summarizeFindings([finding("critical", "hidden-css", 0.9)]).overallRiskScore).toBeGreaterThanOrEqual(60);
  });

  it("summarizes findings by severity and category", () => {
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

const finding = (
  severity: Finding["severity"],
  category: Finding["category"],
  confidence = 0.8,
  id = `${severity}-${category}`
): Finding => ({
  id,
  ruleId: "test",
  category,
  severity,
  confidence,
  selector: "body",
  evidence: "test",
  explanation: "test",
  recommendedAction: "test",
  visibleToUser: true,
  likelyInExtractedText: true,
  signals: []
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
