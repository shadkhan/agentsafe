use crate::{Finding, RiskAssessment, Sensitivity, Severity};
use std::collections::BTreeMap;

pub fn severity_for_score(score: u32) -> Severity {
    if score >= 85 {
        Severity::Critical
    } else if score >= 60 {
        Severity::High
    } else if score >= 35 {
        Severity::Medium
    } else if score >= 15 {
        Severity::Low
    } else {
        Severity::Informational
    }
}

pub fn score_signals(
    hidden_signals: u32,
    instruction_signals: u32,
    unicode_signals: u32,
    encoded_signals: u32,
    metadata_signals: u32,
    exfiltration_signals: u32,
    visible_to_user: bool,
    likely_in_extracted_text: bool,
    sensitivity: Sensitivity,
) -> (u32, Severity, f64) {
    let mut score = hidden_signals * 18
        + instruction_signals * 20
        + unicode_signals * 16
        + encoded_signals * 28
        + metadata_signals * 12
        + exfiltration_signals * 26;
    if !visible_to_user && likely_in_extracted_text {
        score += 18;
    }
    if !visible_to_user && instruction_signals > 0 {
        score += 12;
    }
    let mut score_f = score as f64;
    match sensitivity {
        Sensitivity::Low => score_f *= 0.82,
        Sensitivity::Medium => {}
        Sensitivity::High => score_f *= 1.16,
    }
    let score = score_f.round().clamp(1.0, 100.0) as u32;
    let total_signals = hidden_signals
        + instruction_signals
        + unicode_signals
        + encoded_signals
        + metadata_signals
        + exfiltration_signals;
    let confidence = (0.28 + total_signals as f64 * 0.14 + score as f64 / 260.0)
        .clamp(0.2, 0.98);
    let confidence = (confidence * 100.0).round() / 100.0;
    (score, severity_for_score(score), confidence)
}

pub fn summarize_risk(findings: &[Finding]) -> RiskAssessment {
    let mut severity_counts = BTreeMap::from([
        ("informational".to_string(), 0),
        ("low".to_string(), 0),
        ("medium".to_string(), 0),
        ("high".to_string(), 0),
        ("critical".to_string(), 0),
    ]);
    let mut weighted = 0.0;
    for finding in findings {
        let key = match finding.severity {
            Severity::Informational => "informational",
            Severity::Low => "low",
            Severity::Medium => "medium",
            Severity::High => "high",
            Severity::Critical => "critical",
        };
        *severity_counts.entry(key.to_string()).or_insert(0) += 1;
        let base = match finding.severity {
            Severity::Informational => 4.0,
            Severity::Low => 10.0,
            Severity::Medium => 24.0,
            Severity::High => 48.0,
            Severity::Critical => 72.0,
        };
        weighted += base * finding.confidence;
    }
    RiskAssessment {
        overall_risk_score: weighted.round().min(100.0) as u32,
        severity_counts,
    }
}
