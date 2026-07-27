# Rust/WASM Extraction Gap Analysis

## Current Scanner Architecture

AgentSafe currently scans in TypeScript.

- `packages/scanner/src/index.ts` owns DOM traversal, CSS visibility analysis, text normalization, Unicode checks, base64-like decoding, finding generation, selectors, and comment/meta scanning.
- `packages/scanner/src/rules.ts` owns prompt-injection regex rules and the suspicious comment/meta regex.
- `packages/risk-engine/src/index.ts` owns deterministic scoring, severity thresholds, confidence calculation, and summary aggregation.
- `apps/extension/entrypoints/sidepanel/main.tsx` snapshots the active page through `chrome.scripting.executeScript`, parses the snapshot in the side panel, calls `scanDocument`, then exports sanitized content.
- `packages/dom-sanitizer` and `packages/markdown-exporter` consume the current TypeScript `Finding` schema.

The current implementation has no separate platform-neutral text engine. DOM logic and text rules are intertwined at finding construction time.

## Regular Expressions

Instruction patterns in `packages/scanner/src/rules.ts`:

- `instruction-override`: `\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)\b`
- `role-manipulation`: `\b(you are now|act as|switch role|developer mode|jailbreak)\b`
- `reveal-system-prompt`: `\b(reveal|print|show|dump|leak)\s+(the\s+)?(system prompt|hidden prompt|developer message|instructions)\b`
- `tool-use`: `\b(use|call|invoke)\s+(browser|tool|api|fetch|curl|http|clipboard|email|slack|drive)\b`
- `data-exfiltration`: `\b(send|post|upload|exfiltrate|forward)\s+.{0,40}\b(secrets?|tokens?|cookies?|api keys?|passwords?|private data)\b`
- `delimiter-block`: ``(```|<\|system\|>|<\|assistant\|>|###\s*(system|developer|instruction)|\[system\])``

Other scanner regexes:

- Suspicious comments/meta: `\b(ai|agent|assistant|llm|system prompt|ignore previous|hidden instruction|tool|exfiltrate)\b`
- Zero-width Unicode: `[\u200B-\u200D\uFEFF]`
- Bidirectional Unicode controls: `[\u202A-\u202E\u2066-\u2069]`
- Base64-like candidates: `\b(?:[A-Za-z0-9+/]{24,}={0,2})\b`
- Printable decoded text: `^[\x09\x0A\x0D\x20-\x7E]+$`
- Clipping CSS detector: `rect\(\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*,?\s*0(px)?\s*\)|inset\(50%\)`
- RGB parser: `rgba?\((\d+),\s*(\d+),\s*(\d+)`

All prompt/text regexes can move to Rust `regex`. CSS/RGB regexes should remain TypeScript DOM-adapter logic.

## Literal Phrase Rules

Literal-like phrase families currently embedded in regex alternations:

- Override verbs: `ignore`, `disregard`, `forget`
- Prior-instruction targets: `previous`, `prior`, `above`, `earlier`
- Instruction nouns: `instructions`, `prompts`, `rules`
- Role manipulation phrases: `you are now`, `act as`, `switch role`, `developer mode`, `jailbreak`
- Prompt disclosure verbs: `reveal`, `print`, `show`, `dump`, `leak`
- Prompt disclosure targets: `system prompt`, `hidden prompt`, `developer message`, `instructions`
- Tool verbs: `use`, `call`, `invoke`
- Tool targets: `browser`, `tool`, `api`, `fetch`, `curl`, `http`, `clipboard`, `email`, `slack`, `drive`
- Exfiltration verbs: `send`, `post`, `upload`, `exfiltrate`, `forward`
- Sensitive targets: `secret`, `secrets`, `token`, `tokens`, `cookie`, `cookies`, `api key`, `api keys`, `password`, `passwords`, `private data`
- Delimiters: triple backticks, `<|system|>`, `<|assistant|>`, `### system`, `### developer`, `### instruction`, `[system]`

These should become registry-backed Rust rules. Fixed phrases can use an efficient literal pre-pass before regex evidence extraction.

## Unicode Checks

Current checks:

- Zero-width characters: U+200B, U+200C, U+200D, U+FEFF
- Bidirectional controls: U+202A through U+202E and U+2066 through U+2069

The scanner checks the original text before whitespace normalization so U+FEFF is not lost as whitespace. This behavior must be preserved.

## Normalization Behavior

Current element text flow:

1. `originalText = element.textContent ?? ""`
2. `rawText = originalText.replace(/\s+/g, " ").trim()`
3. Empty normalized text is skipped.
4. Phrase allowlist checks use lowercase substring matching against `rawText`.
5. Unicode checks use `originalText`.
6. Pattern checks and base64 checks use `rawText`.
7. Evidence is truncated to 240 characters.

Rust should expose explicit normalized and original-text handling rather than implicitly hiding this in DOM traversal.

## Findings Schema

Current UI-compatible TypeScript finding fields:

- `id`
- `ruleId`
- `category`
- `severity`
- `confidence`
- `selector`
- `evidence`
- `explanation`
- `recommendedAction`
- `visibleToUser`
- `likelyInExtractedText`
- `signals`
- optional `cssProperties`
- optional `decodedEvidence`

Rust core required stable fields:

- `rule_id`
- `category`
- `severity`
- `confidence`
- `source_id`
- byte/character offsets when available
- redacted evidence
- explanation key
- recommended-action key

The browser adapter must translate Rust findings to the existing UI schema.

## Risk-Scoring Logic

Current `scoreFinding` weights:

- hidden signal: `18`
- instruction signal: `20`
- Unicode signal: `16`
- encoded signal: `28`
- metadata signal: `12`
- exfiltration signal: `26`
- hidden but likely extracted: `+18`
- hidden instruction: `+12`
- sensitivity low multiplier: `0.82`
- sensitivity high multiplier: `1.16`
- clamp score to `1..100`

Severity thresholds:

- `>= 85`: critical
- `>= 60`: high
- `>= 35`: medium
- `>= 15`: low
- otherwise informational

Confidence:

- `0.28 + totalSignals * 0.14 + score / 260`
- clamped to `0.2..0.98`
- rounded to two decimals

Summary severity bases:

- informational `4`
- low `10`
- medium `24`
- high `48`
- critical `72`

Summary overall risk is the clamped weighted sum of `severityBase * confidence`.

## DOM-Dependent Logic

Must remain in TypeScript browser adapter:

- `document.querySelectorAll("body *")`
- `textContent` extraction
- `getComputedStyle`
- `display`, `visibility`, `opacity`, `fontSize`
- computed width/height and offset fallback
- absolute/fixed offscreen positioning
- `clip` and `clipPath`
- foreground/background contrast
- `aria-hidden`
- `closest("script,style,noscript,template")`
- `TreeWalker` comment scanning
- `meta[content]` scanning
- CSS selector generation
- page snapshotting
- highlight/reveal/clear injected functions

## Browser-Dependent Logic

Must remain outside Rust:

- Chrome permissions and optional host access.
- `chrome.scripting.executeScript`.
- `chrome.storage.local` and `chrome.storage.session`.
- badge updates.
- side panel rendering.
- downloads and clipboard.
- DOMPurify and Readability/Turndown export flow.

## Tests and Fixtures

Existing tests:

- `packages/scanner/test/scanner.test.ts`: CSS hiding, instruction patterns, Unicode controls, comments/meta, base64, settings, false-positive regression, finding schema.
- `packages/risk-engine/test/risk-engine.test.ts`: phrase-only severity, hidden instruction severity, sensitivity, summary aggregation.
- `packages/dom-sanitizer/test/dom-sanitizer.test.ts`: hidden content removal, Unicode normalization, script/event stripping.
- `packages/markdown-exporter/test/markdown-exporter.test.ts`: sanitized Markdown/report fields and deterministic hash.
- `e2e/extension-smoke.spec.ts`: fixture and side panel smoke tests.

Fixtures:

- `fixtures/benign/article.html`
- `fixtures/benign/documentation.html`
- `fixtures/malicious/hidden-instruction.html`
- `fixtures/malicious/unicode-and-encoded.html`

## Extraction Gaps

- Existing findings include English explanation/action paragraphs; Rust core must return stable keys only.
- Existing scanner reports one combined finding per element; Rust text scanning should report per rule/source span, then browser adapter can combine or map to UI-compatible findings.
- Existing base64 decoding uses browser `atob` or Node `Buffer`; Rust needs a platform-neutral base64 dependency and limits.
- Existing regex rules are JS `RegExp`; Rust rule compilation must reject unsupported look-around/backreferences in custom rule definitions.
- Existing auto-scan currently runs from the side panel, not a dedicated worker. The WASM integration should move text scanning to a worker while DOM traversal remains TypeScript.
- Existing tests verify DOM scanner behavior, not standalone text scanning. Rust and worker integration tests must be added.
