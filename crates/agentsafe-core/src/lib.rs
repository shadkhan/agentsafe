mod registry;
mod scan;
mod scoring;
mod types;

pub use registry::{default_registry, Scanner};
pub use scan::{scan_structured_value, scan_text_with_registry};
pub use scoring::{score_signals, severity_for_score, summarize_risk, SignalCounts};
pub use types::*;

pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
