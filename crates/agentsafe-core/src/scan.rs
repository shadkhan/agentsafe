use crate::registry::Scanner;
use crate::scoring::{score_signals, summarize_risk, SignalCounts};
use crate::{
    Evidence, Finding, PatternEngine, RuleCategory, ScanCompleteness, ScanError, ScanLimits,
    ScanResult, SourceContext, StructuredScanRequest, TextScanRequest, ENGINE_VERSION,
};
use base64::Engine;
use serde_json::Value;

const ZERO_WIDTH: [char; 4] = ['\u{200B}', '\u{200C}', '\u{200D}', '\u{FEFF}'];

pub fn scan_text_with_registry(
    scanner: &Scanner,
    request: TextScanRequest,
) -> Result<ScanResult, ScanError> {
    let limits = request.limits.clone();
    if request.text.len() > limits.max_input_bytes {
        return Err(ScanError::InputTooLarge);
    }
    let mut completeness = ScanCompleteness::default();
    let normalized = normalize_text(&request.text);
    let mut findings = Vec::new();

    scan_regex_and_literals(
        scanner,
        &request,
        &normalized,
        &mut findings,
        &mut completeness,
    );
    scan_unicode(scanner, &request, &mut findings, &mut completeness);
    scan_encoded(
        scanner,
        &request,
        &normalized,
        &mut findings,
        &mut completeness,
    );

    if findings.len() >= limits.max_matches {
        completeness.complete = false;
        completeness.match_limit_reached = true;
        findings.truncate(limits.max_matches);
    }

    Ok(ScanResult {
        engine_version: ENGINE_VERSION.to_string(),
        rule_registry_version: scanner.registry_version().to_string(),
        risk: summarize_risk(&findings),
        findings,
        completeness,
    })
}

pub fn scan_structured_value(
    scanner: &Scanner,
    request: StructuredScanRequest,
) -> Result<ScanResult, ScanError> {
    let mut strings = Vec::new();
    let mut completeness = ScanCompleteness::default();
    collect_strings(
        &request.value,
        "$",
        0,
        &request.limits,
        &mut strings,
        &mut completeness,
    )?;
    let mut all_findings = Vec::new();
    for (source_id, text) in strings {
        let result = scan_text_with_registry(
            scanner,
            TextScanRequest {
                source_id: format!("{}:{source_id}", request.source_id),
                text,
                sensitivity: request.sensitivity,
                context: SourceContext::default(),
                limits: request.limits.clone(),
            },
        )?;
        all_findings.extend(result.findings);
        if all_findings.len() >= request.limits.max_matches {
            completeness.complete = false;
            completeness.match_limit_reached = true;
            all_findings.truncate(request.limits.max_matches);
            break;
        }
    }
    Ok(ScanResult {
        engine_version: ENGINE_VERSION.to_string(),
        rule_registry_version: scanner.registry_version().to_string(),
        risk: summarize_risk(&all_findings),
        findings: all_findings,
        completeness,
    })
}

fn scan_regex_and_literals(
    scanner: &Scanner,
    request: &TextScanRequest,
    text: &str,
    findings: &mut Vec<Finding>,
    completeness: &mut ScanCompleteness,
) {
    let lower = text.to_lowercase();
    let regex_candidates = scanner.regex_set_matches(text);
    let mut regex_index = 0usize;
    for rule in scanner.rules() {
        if findings.len() >= request.limits.max_matches {
            completeness.complete = false;
            completeness.match_limit_reached = true;
            return;
        }
        match rule.definition.engine {
            PatternEngine::Regex => {
                let should_scan = regex_candidates.contains(&regex_index);
                regex_index += 1;
                if !should_scan {
                    continue;
                }
                if let Some(regex) = &rule.regex {
                    for matched in regex
                        .find_iter(text)
                        .take(request.limits.max_matches_per_rule)
                    {
                        findings.push(make_finding(
                            &rule.definition,
                            request,
                            text,
                            matched.start(),
                            matched.end(),
                            signals_for_category(&rule.definition.category),
                        ));
                    }
                }
            }
            PatternEngine::Literal => {
                if let Some(literal) = &rule.literal {
                    for (count, (start, _)) in lower.match_indices(literal).enumerate() {
                        if count >= request.limits.max_matches_per_rule {
                            break;
                        }
                        findings.push(make_finding(
                            &rule.definition,
                            request,
                            text,
                            start,
                            start + literal.len(),
                            signals_for_category(&rule.definition.category),
                        ));
                    }
                }
            }
            PatternEngine::Unicode | PatternEngine::Encoded => {}
        }
    }
}

fn scan_unicode(
    scanner: &Scanner,
    request: &TextScanRequest,
    findings: &mut Vec<Finding>,
    completeness: &mut ScanCompleteness,
) {
    for rule in scanner.rules() {
        if !matches!(rule.definition.engine, PatternEngine::Unicode) {
            continue;
        }
        let mut count = 0usize;
        for (idx, ch) in request.text.char_indices() {
            let matched = if rule.definition.id == "zero-width-unicode" {
                ZERO_WIDTH.contains(&ch)
            } else if rule.definition.id == "bidi-control" {
                ('\u{202A}'..='\u{202E}').contains(&ch) || ('\u{2066}'..='\u{2069}').contains(&ch)
            } else {
                false
            };
            if !matched {
                continue;
            }
            findings.push(make_finding(
                &rule.definition,
                request,
                &request.text,
                idx,
                idx + ch.len_utf8(),
                vec![rule.definition.id.clone()],
            ));
            count += 1;
            if count >= request.limits.max_matches_per_rule
                || findings.len() >= request.limits.max_matches
            {
                completeness.complete = false;
                completeness.match_limit_reached = true;
                return;
            }
        }
    }
}

fn scan_encoded(
    scanner: &Scanner,
    request: &TextScanRequest,
    text: &str,
    findings: &mut Vec<Finding>,
    completeness: &mut ScanCompleteness,
) {
    let Some(rule) = scanner
        .rules()
        .iter()
        .find(|rule| rule.definition.id == "base64-instruction")
    else {
        return;
    };
    let Ok(base64ish) = regex::Regex::new(r"\b(?:[A-Za-z0-9+/]{24,}={0,2})\b") else {
        return;
    };
    let mut count = 0usize;
    for matched in base64ish.find_iter(text) {
        if count >= request.limits.max_matches_per_rule
            || findings.len() >= request.limits.max_matches
        {
            completeness.complete = false;
            completeness.match_limit_reached = true;
            return;
        }
        let candidate = matched.as_str();
        let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(candidate) else {
            continue;
        };
        let Ok(decoded_text) = String::from_utf8(decoded) else {
            continue;
        };
        if !decoded_text
            .chars()
            .all(|ch| ch == '\t' || ch == '\n' || ch == '\r' || (' '..='~').contains(&ch))
        {
            continue;
        }
        let nested_request = TextScanRequest {
            source_id: request.source_id.clone(),
            text: decoded_text,
            sensitivity: request.sensitivity,
            context: request.context.clone(),
            limits: request.limits.clone(),
        };
        let nested = scan_text_with_registry(scanner, nested_request);
        if nested
            .map(|result| !result.findings.is_empty())
            .unwrap_or(false)
        {
            findings.push(make_finding(
                &rule.definition,
                request,
                text,
                matched.start(),
                matched.end(),
                vec!["base64-instruction".to_string()],
            ));
            count += 1;
        }
    }
}

fn collect_strings(
    value: &Value,
    path: &str,
    depth: usize,
    limits: &ScanLimits,
    strings: &mut Vec<(String, String)>,
    completeness: &mut ScanCompleteness,
) -> Result<(), ScanError> {
    if depth > limits.max_structured_depth {
        completeness.complete = false;
        completeness.structured_depth_limit_reached = true;
        return Err(ScanError::StructuredLimitExceeded);
    }
    match value {
        Value::String(text) => {
            if text.len() > limits.max_string_length {
                completeness.complete = false;
                completeness.input_truncated = true;
                strings.push((
                    path.to_string(),
                    text.chars().take(limits.max_string_length).collect(),
                ));
            } else {
                strings.push((path.to_string(), text.clone()));
            }
        }
        Value::Array(items) => {
            for (idx, item) in items.iter().take(limits.max_array_length).enumerate() {
                collect_strings(
                    item,
                    &format!("{path}[{idx}]"),
                    depth + 1,
                    limits,
                    strings,
                    completeness,
                )?;
            }
            if items.len() > limits.max_array_length {
                completeness.complete = false;
                completeness
                    .notes
                    .push("array length limit reached".to_string());
            }
        }
        Value::Object(map) => {
            for (key, item) in map.iter().take(limits.max_object_field_count) {
                collect_strings(
                    item,
                    &format!("{path}.{key}"),
                    depth + 1,
                    limits,
                    strings,
                    completeness,
                )?;
            }
            if map.len() > limits.max_object_field_count {
                completeness.complete = false;
                completeness
                    .notes
                    .push("object field limit reached".to_string());
            }
        }
        _ => {}
    }
    Ok(())
}

fn normalize_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn make_finding(
    rule: &crate::RuleDefinition,
    request: &TextScanRequest,
    text: &str,
    byte_start: usize,
    byte_end: usize,
    signals: Vec<String>,
) -> Finding {
    let signal_counts = SignalCounts {
        hidden: request.context.hidden_signal_count,
        instruction: signals
            .iter()
            .filter(|signal| {
                signal.contains("instruction")
                    || *signal == "role-manipulation"
                    || *signal == "reveal-system-prompt"
            })
            .count() as u32,
        unicode: signals
            .iter()
            .filter(|signal| signal.contains("unicode") || *signal == "bidi-control")
            .count() as u32,
        encoded: signals
            .iter()
            .filter(|signal| signal.contains("base64"))
            .count() as u32,
        metadata: request.context.metadata_signal_count,
        exfiltration: signals
            .iter()
            .filter(|signal| *signal == "tool-use" || *signal == "data-exfiltration")
            .count() as u32,
    };
    let (_, severity, confidence) = score_signals(
        signal_counts,
        request.context.visible_to_user,
        request.context.likely_in_extracted_text,
        request.sensitivity,
    );
    Finding {
        rule_id: rule.id.clone(),
        category: rule.category.clone(),
        severity,
        confidence,
        source_id: request.source_id.clone(),
        evidence: evidence(text, byte_start, byte_end),
        explanation_key: rule.explanation_key.clone(),
        recommended_action_key: rule.recommended_action_key.clone(),
        signals,
    }
}

fn evidence(text: &str, byte_start: usize, byte_end: usize) -> Evidence {
    let start = nearest_char_boundary_at_or_before(text, byte_start.saturating_sub(80));
    let end = nearest_char_boundary_at_or_after(text, (byte_end + 80).min(text.len()));
    Evidence {
        redacted_text: redact(&text[start..end]),
        byte_start: Some(byte_start),
        byte_end: Some(byte_end),
        char_start: Some(text[..byte_start].chars().count()),
        char_end: Some(text[..byte_end].chars().count()),
    }
}

fn nearest_char_boundary_at_or_before(text: &str, mut idx: usize) -> usize {
    idx = idx.min(text.len());
    while idx > 0 && !text.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

fn nearest_char_boundary_at_or_after(text: &str, mut idx: usize) -> usize {
    idx = idx.min(text.len());
    while idx < text.len() && !text.is_char_boundary(idx) {
        idx += 1;
    }
    idx
}

fn redact(text: &str) -> String {
    let mut out = text.to_string();
    for marker in ["api key", "password", "token", "secret"] {
        out = out.replace(marker, "[redacted-sensitive-keyword]");
        out = out.replace(&marker.to_uppercase(), "[redacted-sensitive-keyword]");
    }
    if out.len() > 240 {
        out.truncate(237);
        out.push_str("...");
    }
    out
}

fn signals_for_category(category: &RuleCategory) -> Vec<String> {
    match category {
        RuleCategory::InstructionPattern => vec!["instruction-pattern".to_string()],
        RuleCategory::Exfiltration => vec!["data-exfiltration".to_string()],
        RuleCategory::Delimiter => vec!["delimiter-block".to_string()],
        RuleCategory::Metadata => vec!["suspicious-meta".to_string()],
        RuleCategory::EncodedContent => vec!["base64-instruction".to_string()],
        RuleCategory::UnicodeSecurity => vec!["unicode-security".to_string()],
        _ => vec!["text-match".to_string()],
    }
}
