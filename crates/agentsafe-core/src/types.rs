use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RuleCategory {
    HiddenCss,
    UnicodeSecurity,
    InstructionPattern,
    EncodedContent,
    Metadata,
    HtmlComment,
    Accessibility,
    Exfiltration,
    Delimiter,
    Structured,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PatternEngine {
    Literal,
    Regex,
    Unicode,
    Encoded,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "kebab-case")]
pub enum Severity {
    Informational,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Sensitivity {
    Low,
    Medium,
    High,
}

impl Default for Sensitivity {
    fn default() -> Self {
        Self::Medium
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleDefinition {
    pub id: String,
    pub category: RuleCategory,
    pub engine: PatternEngine,
    pub pattern: String,
    pub explanation_key: String,
    pub recommended_action_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleRegistry {
    pub version: String,
    pub rules: Vec<RuleDefinition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextScanRequest {
    pub source_id: String,
    pub text: String,
    #[serde(default)]
    pub sensitivity: Sensitivity,
    #[serde(default)]
    pub context: SourceContext,
    #[serde(default)]
    pub limits: ScanLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredScanRequest {
    pub source_id: String,
    pub value: serde_json::Value,
    #[serde(default)]
    pub sensitivity: Sensitivity,
    #[serde(default)]
    pub limits: ScanLimits,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceContext {
    pub visible_to_user: bool,
    pub likely_in_extracted_text: bool,
    pub hidden_signal_count: u32,
    pub metadata_signal_count: u32,
}

impl Default for SourceContext {
    fn default() -> Self {
        Self {
            visible_to_user: true,
            likely_in_extracted_text: true,
            hidden_signal_count: 0,
            metadata_signal_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanLimits {
    pub max_input_bytes: usize,
    pub max_matches: usize,
    pub max_matches_per_rule: usize,
    pub max_structured_depth: usize,
    pub max_array_length: usize,
    pub max_object_field_count: usize,
    pub max_string_length: usize,
}

impl Default for ScanLimits {
    fn default() -> Self {
        Self {
            max_input_bytes: 262_144,
            max_matches: 256,
            max_matches_per_rule: 32,
            max_structured_depth: 16,
            max_array_length: 256,
            max_object_field_count: 256,
            max_string_length: 16_384,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Evidence {
    pub redacted_text: String,
    pub byte_start: Option<usize>,
    pub byte_end: Option<usize>,
    pub char_start: Option<usize>,
    pub char_end: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Finding {
    pub rule_id: String,
    pub category: RuleCategory,
    pub severity: Severity,
    pub confidence: f64,
    pub source_id: String,
    pub evidence: Evidence,
    pub explanation_key: String,
    pub recommended_action_key: String,
    pub signals: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAssessment {
    pub overall_risk_score: u32,
    pub severity_counts: BTreeMap<String, u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanCompleteness {
    pub complete: bool,
    pub input_truncated: bool,
    pub match_limit_reached: bool,
    pub structured_depth_limit_reached: bool,
    pub notes: Vec<String>,
}

impl Default for ScanCompleteness {
    fn default() -> Self {
        Self {
            complete: true,
            input_truncated: false,
            match_limit_reached: false,
            structured_depth_limit_reached: false,
            notes: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub engine_version: String,
    pub rule_registry_version: String,
    pub findings: Vec<Finding>,
    pub risk: RiskAssessment,
    pub completeness: ScanCompleteness,
}

#[derive(Debug, Error, Serialize, Deserialize, PartialEq, Eq)]
pub enum ScanError {
    #[error("input exceeds maximum size")]
    InputTooLarge,
    #[error("rule compilation failed for {rule_id}: {message}")]
    RuleCompilationFailed { rule_id: String, message: String },
    #[error("unsupported regex feature in {rule_id}: {message}")]
    UnsupportedRegexFeature { rule_id: String, message: String },
    #[error("structured input exceeded configured limits")]
    StructuredLimitExceeded,
    #[error("invalid serialized input: {0}")]
    InvalidSerializedInput(String),
}
