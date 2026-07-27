use agentsafe_core::{
    default_registry, scan_structured_value, ScanError, Scanner as CoreScanner, StructuredScanRequest,
    TextScanRequest, ENGINE_VERSION,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Scanner {
    inner: CoreScanner,
}

#[wasm_bindgen(js_name = initializeScanner)]
pub fn initialize_scanner() -> Result<Scanner, JsValue> {
    console_error_panic_hook::set_once();
    Ok(Scanner {
        inner: CoreScanner::new(default_registry()).map_err(to_js_error)?,
    })
}

#[wasm_bindgen]
impl Scanner {
    #[wasm_bindgen(js_name = scanText)]
    pub fn scan_text(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: TextScanRequest = serde_wasm_bindgen::from_value(request)
            .map_err(|err| to_js_error(ScanError::InvalidSerializedInput(err.to_string())))?;
        let result = self.inner.scan_text(request).map_err(to_js_error)?;
        serde_wasm_bindgen::to_value(&result).map_err(|err| JsValue::from_str(&err.to_string()))
    }

    #[wasm_bindgen(js_name = scanStructured)]
    pub fn scan_structured(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: StructuredScanRequest = serde_wasm_bindgen::from_value(request)
            .map_err(|err| to_js_error(ScanError::InvalidSerializedInput(err.to_string())))?;
        let result = scan_structured_value(&self.inner, request).map_err(to_js_error)?;
        serde_wasm_bindgen::to_value(&result).map_err(|err| JsValue::from_str(&err.to_string()))
    }

    #[wasm_bindgen(js_name = getRuleRegistryVersion)]
    pub fn get_rule_registry_version(&self) -> String {
        self.inner.registry_version().to_string()
    }
}

#[wasm_bindgen(js_name = getEngineVersion)]
pub fn get_engine_version() -> String {
    ENGINE_VERSION.to_string()
}

fn to_js_error(error: ScanError) -> JsValue {
    JsValue::from_str(&error.to_string())
}
