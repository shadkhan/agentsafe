$ErrorActionPreference = "Stop"

function Run-Step($Name, $Command) {
  Write-Host "==> $Name"
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

if (!(Test-Path "pnpm-lock.yaml")) {
  throw "pnpm-lock.yaml is required for reproducible installs."
}

Run-Step "Frozen pnpm install" "pnpm install --frozen-lockfile"
Run-Step "Rust format check" "cargo fmt --all -- --check"
Run-Step "Rust clippy" "cargo clippy --workspace --all-targets -- -D warnings"
Run-Step "Rust tests" "cargo test --workspace"
Run-Step "TypeScript typecheck" "pnpm typecheck"
Run-Step "JavaScript tests" "pnpm test"
Run-Step "Extension production build" "pnpm --filter @agentsafe/extension build"

$wasm = Get-ChildItem "apps/extension/.output/chrome-mv3" -Recurse -Filter "*.wasm" | Select-Object -First 1
if (!$wasm) {
  throw "Built extension is missing the local WASM binary."
}

$localPathLeak = Select-String -Path "apps/extension/.output/chrome-mv3/**/*.js" -Pattern "D:\\AI_Projects" -ErrorAction SilentlyContinue
if ($localPathLeak) {
  throw "Built extension contains local machine path references."
}

Write-Host "Clean build verification passed. WASM: $($wasm.FullName)"
