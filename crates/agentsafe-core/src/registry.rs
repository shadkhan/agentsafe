use crate::{
    PatternEngine, RuleCategory, RuleDefinition, RuleRegistry, ScanError, TextScanRequest,
};
use regex::{Regex, RegexSet};

#[derive(Debug, Clone)]
pub struct CompiledRule {
    pub definition: RuleDefinition,
    pub regex: Option<Regex>,
    pub literal: Option<String>,
}

#[derive(Debug, Clone)]
pub struct Scanner {
    registry: RuleRegistry,
    regex_set: RegexSet,
    rules: Vec<CompiledRule>,
}

impl Scanner {
    pub fn new(registry: RuleRegistry) -> Result<Self, ScanError> {
        let mut regex_patterns = Vec::new();
        let mut rules = Vec::new();
        for rule in &registry.rules {
            reject_unsupported_regex(rule)?;
            match rule.engine {
                PatternEngine::Regex => {
                    regex_patterns.push(format!("(?i){}", rule.pattern));
                    let regex = Regex::new(&format!("(?i){}", rule.pattern)).map_err(|err| {
                        ScanError::RuleCompilationFailed {
                            rule_id: rule.id.clone(),
                            message: err.to_string(),
                        }
                    })?;
                    rules.push(CompiledRule {
                        definition: rule.clone(),
                        regex: Some(regex),
                        literal: None,
                    });
                }
                PatternEngine::Literal => {
                    rules.push(CompiledRule {
                        definition: rule.clone(),
                        regex: None,
                        literal: Some(rule.pattern.to_lowercase()),
                    });
                }
                PatternEngine::Unicode | PatternEngine::Encoded => {
                    rules.push(CompiledRule {
                        definition: rule.clone(),
                        regex: None,
                        literal: None,
                    });
                }
            }
        }
        let regex_set = if regex_patterns.is_empty() {
            RegexSet::new(["$^"]).expect("internal empty regex set pattern is valid")
        } else {
            RegexSet::new(regex_patterns).map_err(|err| ScanError::RuleCompilationFailed {
                rule_id: "<registry>".to_string(),
                message: err.to_string(),
            })?
        };
        Ok(Self {
            registry,
            regex_set,
            rules,
        })
    }

    pub fn try_default() -> Result<Self, ScanError> {
        Self::new(default_registry())
    }

    pub fn registry_version(&self) -> &str {
        &self.registry.version
    }

    pub fn rules(&self) -> &[CompiledRule] {
        &self.rules
    }

    pub fn regex_set_matches(&self, text: &str) -> Vec<usize> {
        self.regex_set.matches(text).into_iter().collect()
    }

    pub fn scan_text(&self, request: TextScanRequest) -> Result<crate::ScanResult, ScanError> {
        crate::scan_text_with_registry(self, request)
    }
}

pub fn default_registry() -> RuleRegistry {
    RuleRegistry {
        version: "agentsafe-rules-2026-07-29".to_string(),
        rules: vec![
            regex_rule(
                "instruction-override",
                RuleCategory::InstructionPattern,
                r"\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)\b",
                "explanation.instruction_override",
                "action.review_before_copying",
            ),
            regex_rule(
                "role-manipulation",
                RuleCategory::InstructionPattern,
                r"\b(you are now|act as|switch role|developer mode|jailbreak)\b",
                "explanation.role_manipulation",
                "action.review_before_copying",
            ),
            regex_rule(
                "reveal-system-prompt",
                RuleCategory::InstructionPattern,
                r"\b(reveal|print|show|dump|leak)\s+(the\s+)?(system prompt|hidden prompt|developer message|instructions)\b",
                "explanation.reveal_system_prompt",
                "action.review_before_copying",
            ),
            regex_rule(
                "tool-use",
                RuleCategory::Exfiltration,
                r"\b(use|call|invoke)\s+(browser|tool|api|fetch|curl|http|clipboard|email|slack|drive)\b",
                "explanation.tool_use",
                "action.verify_tool_instruction",
            ),
            regex_rule(
                "data-exfiltration",
                RuleCategory::Exfiltration,
                r"\b(send|post|upload|exfiltrate|forward)\s+.{0,40}\b(secrets?|tokens?|cookies?|api keys?|passwords?|private data)\b",
                "explanation.data_exfiltration",
                "action.do_not_copy_sensitive_instruction",
            ),
            // Markdown images load without a click, which makes them the usual
            // way page text talks an agent into leaking data: the instruction
            // tells the model to append what it knows to the image URL.
            regex_rule(
                "markdown-image-exfiltration",
                RuleCategory::Exfiltration,
                r"!\[[^\]]{0,80}\]\(\s*https?://[^)\s]{0,200}[?&](d|q|data|text|prompt|content|payload|secret|token|key|info|msg|message|note|summary)=",
                "explanation.markdown_image_exfiltration",
                "action.do_not_copy_sensitive_instruction",
            ),
            // Lower specificity: API documentation legitimately shows URLs with
            // these parameters, so this rule is corroboration-gated on the
            // TypeScript side and only stands alone when the text is hidden.
            regex_rule(
                "url-parameter-exfiltration",
                RuleCategory::Exfiltration,
                r"https?://[^\s)]{0,200}[?&](data|payload|secret|token|api[_-]?key|password|passwd|cookie|session|prompt|clipboard)=",
                "explanation.url_parameter_exfiltration",
                "action.do_not_copy_sensitive_instruction",
            ),
            regex_rule(
                "delimiter-block",
                RuleCategory::Delimiter,
                r"(```|<\|system\|>|<\|assistant\|>|###\s*(system|developer|instruction)|\[system\])",
                "explanation.delimiter_block",
                "action.review_before_copying",
            ),
            regex_rule(
                "suspicious-comment-or-meta",
                RuleCategory::Metadata,
                r"\b(ai|agent|assistant|llm|system prompt|ignore previous|hidden instruction|tool|exfiltrate)\b",
                "explanation.suspicious_metadata",
                "action.exclude_metadata",
            ),
            unicode_rule(
                "zero-width-unicode",
                RuleCategory::UnicodeSecurity,
                "explanation.zero_width_unicode",
                "action.normalize_unicode",
            ),
            unicode_rule(
                "bidi-control",
                RuleCategory::UnicodeSecurity,
                "explanation.bidi_control",
                "action.normalize_unicode",
            ),
            unicode_rule(
                "tag-block-unicode",
                RuleCategory::UnicodeSecurity,
                "explanation.tag_block_unicode",
                "action.normalize_unicode",
            ),
            encoded_rule(
                "base64-instruction",
                RuleCategory::EncodedContent,
                "explanation.base64_instruction",
                "action.decode_and_review",
            ),
        ],
    }
}

fn regex_rule(
    id: &str,
    category: RuleCategory,
    pattern: &str,
    explanation_key: &str,
    recommended_action_key: &str,
) -> RuleDefinition {
    RuleDefinition {
        id: id.to_string(),
        category,
        engine: PatternEngine::Regex,
        pattern: pattern.to_string(),
        explanation_key: explanation_key.to_string(),
        recommended_action_key: recommended_action_key.to_string(),
    }
}

fn unicode_rule(
    id: &str,
    category: RuleCategory,
    explanation_key: &str,
    recommended_action_key: &str,
) -> RuleDefinition {
    RuleDefinition {
        id: id.to_string(),
        category,
        engine: PatternEngine::Unicode,
        pattern: id.to_string(),
        explanation_key: explanation_key.to_string(),
        recommended_action_key: recommended_action_key.to_string(),
    }
}

fn encoded_rule(
    id: &str,
    category: RuleCategory,
    explanation_key: &str,
    recommended_action_key: &str,
) -> RuleDefinition {
    RuleDefinition {
        id: id.to_string(),
        category,
        engine: PatternEngine::Encoded,
        pattern: id.to_string(),
        explanation_key: explanation_key.to_string(),
        recommended_action_key: recommended_action_key.to_string(),
    }
}

fn reject_unsupported_regex(rule: &RuleDefinition) -> Result<(), ScanError> {
    if rule.engine != PatternEngine::Regex {
        return Ok(());
    }
    let unsupported = ["(?=", "(?!", "(?<=", "(?<!", "\\1", "\\2", "\\k<"];
    if let Some(feature) = unsupported
        .iter()
        .find(|feature| rule.pattern.contains(*feature))
    {
        return Err(ScanError::UnsupportedRegexFeature {
            rule_id: rule.id.clone(),
            message: format!("unsupported construct `{feature}`; Rust regex is non-backtracking and does not support look-around or backreferences"),
        });
    }
    Ok(())
}
