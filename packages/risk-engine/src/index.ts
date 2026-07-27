import type { Finding, ScanSummary, Severity } from "@agentsafe/shared-types";

const severityBase: Record<Severity, number> = {
  informational: 4,
  low: 10,
  medium: 24,
  high: 48,
  critical: 72
};

export const severityOrder: Severity[] = ["informational", "low", "medium", "high", "critical"];

export function severityForScore(score: number): Severity {
  if (score >= 85) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  if (score >= 15) return "low";
  return "informational";
}

export function scoreFinding(input: {
  hiddenSignals: number;
  instructionSignals: number;
  unicodeSignals: number;
  encodedSignals: number;
  metadataSignals: number;
  exfiltrationSignals: number;
  visibleToUser: boolean;
  likelyInExtractedText: boolean;
  sensitivity?: "low" | "medium" | "high";
}): { score: number; severity: Severity; confidence: number } {
  let score = 0;
  score += input.hiddenSignals * 18;
  score += input.instructionSignals * 20;
  score += input.unicodeSignals * 16;
  score += input.encodedSignals * 28;
  score += input.metadataSignals * 12;
  score += input.exfiltrationSignals * 26;
  if (!input.visibleToUser && input.likelyInExtractedText) score += 18;
  if (!input.visibleToUser && input.instructionSignals > 0) score += 12;

  const sensitivity = input.sensitivity ?? "medium";
  if (sensitivity === "low") score *= 0.82;
  if (sensitivity === "high") score *= 1.16;
  score = Math.max(1, Math.min(100, Math.round(score)));

  const totalSignals =
    input.hiddenSignals +
    input.instructionSignals +
    input.unicodeSignals +
    input.encodedSignals +
    input.metadataSignals +
    input.exfiltrationSignals;
  const confidence = Math.min(0.98, Math.max(0.2, 0.28 + totalSignals * 0.14 + score / 260));
  return { score, severity: severityForScore(score), confidence: Number(confidence.toFixed(2)) };
}

export function summarizeFindings(findings: Finding[]): ScanSummary {
  const severityCounts = severityOrder.reduce(
    (acc, severity) => ({ ...acc, [severity]: 0 }),
    {} as Record<Severity, number>
  );

  let weightedScore = 0;
  for (const finding of findings) {
    severityCounts[finding.severity] += 1;
    weightedScore += severityBase[finding.severity] * finding.confidence;
  }

  return {
    overallRiskScore: Math.min(100, Math.round(weightedScore)),
    severityCounts,
    hiddenTextCount: findings.filter((f) => f.category === "hidden-css" || f.category === "accessibility").length,
    suspiciousUnicodeCount: findings.filter((f) => f.category === "unicode-security").length,
    instructionPatternCount: findings.filter((f) => f.category === "instruction-pattern" || f.category === "exfiltration").length
  };
}
