import initWasm, {
  getEngineVersion,
  initializeScanner,
  type InitInput,
  type Scanner
} from "../pkg/agentsafe_wasm.js";
import wasmUrl from "../pkg/agentsafe_wasm_bg.wasm?url";

export type RustSensitivity = "low" | "medium" | "high";

export interface RustTextScanRequest {
  source_id: string;
  text: string;
  sensitivity?: RustSensitivity;
  context?: {
    visible_to_user: boolean;
    likely_in_extracted_text: boolean;
    hidden_signal_count: number;
    metadata_signal_count: number;
  };
  limits?: Partial<RustScanLimits>;
}

export interface RustStructuredScanRequest {
  source_id: string;
  value: unknown;
  sensitivity?: RustSensitivity;
  limits?: Partial<RustScanLimits>;
}

export interface RustScanLimits {
  max_input_bytes: number;
  max_matches: number;
  max_matches_per_rule: number;
  max_structured_depth: number;
  max_array_length: number;
  max_object_field_count: number;
  max_string_length: number;
}

export interface RustScanResult {
  engine_version: string;
  rule_registry_version: string;
  findings: Array<{
    rule_id: string;
    category: string;
    severity: string;
    confidence: number;
    source_id: string;
    evidence: {
      redacted_text: string;
      byte_start?: number;
      byte_end?: number;
      char_start?: number;
      char_end?: number;
    };
    explanation_key: string;
    recommended_action_key: string;
    signals: string[];
  }>;
  risk: {
    overall_risk_score: number;
    severity_counts: Record<string, number>;
  };
  completeness: {
    complete: boolean;
    input_truncated: boolean;
    match_limit_reached: boolean;
    structured_depth_limit_reached: boolean;
    notes: string[];
  };
}

let scannerPromise: Promise<Scanner> | undefined;

export async function initializeRustScanner(wasmInput?: InitInput): Promise<Scanner> {
  if (!scannerPromise) {
    const module_or_path = wasmInput ?? wasmUrl;
    scannerPromise = initWasm({ module_or_path }).then(() => initializeScanner());
  }
  return scannerPromise;
}

export async function scanTextWithRust(request: RustTextScanRequest, wasmInput?: InitInput): Promise<RustScanResult> {
  const scanner = await initializeRustScanner(wasmInput);
  return scanner.scanText(request) as RustScanResult;
}

export async function scanStructuredWithRust(
  request: RustStructuredScanRequest,
  wasmInput?: InitInput
): Promise<RustScanResult> {
  const scanner = await initializeRustScanner(wasmInput);
  return scanner.scanStructured(request) as RustScanResult;
}

export { getEngineVersion };
