# AgentSafe User Personas and Use Cases

**Document:** `docs/USER_PERSONAS_AND_USE_CASES.md`
**Product:** AgentSafe — Prompt Injection and WebMCP Security
**Status:** MVP product specification
**Primary positioning:** Local-first security inspection for the agent-facing web

---

# 1. Product purpose

AgentSafe helps developers, security professionals and technical AI users inspect the content an AI agent may receive from a webpage.

The extension focuses on two agent-facing attack surfaces:

1. Ordinary webpage content, including hidden or visually obscured instructions.
2. WebMCP tool definitions, schemas and annotations exposed by a webpage.

AgentSafe should answer:

- What suspicious content was detected?
- Where was it found?
- Was the content visible to a human?
- Why could it influence an AI agent?
- Which WebMCP tools are exposed?
- Are those tools likely read-only or state-changing?
- Do the tool definitions request sensitive or unrelated information?
- What should the user review before allowing an agent to use the page?

AgentSafe does not claim that a webpage or tool is completely safe. It provides deterministic findings, evidence and risk-based recommendations.

---

# 2. MVP product boundaries

The first public release should support:

- Current-page prompt-injection scanning
- Hidden-content detection
- Suspicious Unicode detection
- Findings with evidence and explanations
- Visual highlighting and reveal
- Domain, development URL and rule allowlists
- Passive WebMCP tool discovery
- WebMCP tool-definition and schema scanning
- Read-only versus state-changing classification
- Local Rust/WASM scanning inside a Web Worker
- Bounded text processing
- Scan progress and cancellation
- Partial-scan reporting
- Security report export

The first public release does not need to support:

- Automatic WebMCP tool execution
- Transparent interception of all browser agents
- Automatic blocking of third-party agent actions
- Tool-output interception
- Enterprise policy management
- Cloud dashboards
- User accounts
- LLM-based security classification
- RAG ingestion
- A local MCP server
- Remote rule execution

---

# Current Release Accuracy Note

AgentSafe scans locally with packaged browser assets, including a Rust/WASM scanner and a scan Worker for page text. Large-page scans are bounded by mode and can return partial status metadata. Experimental WebMCP inspection is passive and does not execute tools.

# 3. User Persona 1 — Browser-Agent Developer

## 3.1 Persona summary

**Persona name:** Arjun, Browser-Agent Engineer
**Role:** AI engineer, browser automation developer or agentic application developer
**Technical level:** Advanced
**Primary environment:** Chrome, TypeScript, Playwright, browser extensions, AI-agent frameworks
**Primary objective:** Prevent untrusted webpage content from manipulating an AI agent

## 3.2 Background

Arjun develops browser agents that:

- Research information across websites
- Compare products
- Complete forms
- Search internal applications
- Read authenticated dashboards
- Interact with websites using DOM automation
- Discover and use WebMCP tools
- Combine page content with an LLM planning loop

His agent may consume information that is not visible to a human, including:

- Hidden DOM text
- Off-screen elements
- Metadata
- HTML comments
- Zero-width characters
- Bidirectional Unicode controls
- WebMCP tool descriptions
- Parameter descriptions
- User-generated content returned by tools

## 3.3 Main problems

Arjun cannot easily determine:

- Whether a webpage contains indirect prompt injection
- Whether hidden text reaches his agent
- Whether a WebMCP tool description contains manipulative instructions
- Whether a tool is actually read-only
- Whether a tool requests unnecessary credentials or personal data
- Whether a page changed since the last security review
- Whether a detection rule is creating a false positive

Generic browser security extensions usually focus on malicious downloads, phishing or data leakage from the user to an AI platform. They do not clearly inspect the content flowing from a webpage into an AI agent.

## 3.4 Jobs to be done

### Primary job

> Before my browser agent consumes or acts on webpage content, help me identify instructions that may manipulate the agent.

### Supporting jobs

- Reveal text that is invisible to a human but extractable by an agent
- Inspect WebMCP tools before integrating them
- Identify sensitive or state-changing tools
- Export evidence for a bug report
- Test adversarial pages during development
- Create regression fixtures for known prompt-injection patterns
- Verify that a website is still safe after frontend changes

## 3.5 Main use cases

### Use case 1.1 — Preflight webpage scan

**Trigger:** Arjun is testing his agent against an unfamiliar webpage.

**Flow:**

1. Arjun opens the target page.
2. He starts an AgentSafe scan.
3. AgentSafe traverses the page in bounded batches.
4. Text-pattern scanning runs inside the Rust/WASM Web Worker.
5. AgentSafe detects hidden or suspicious instructions.
6. Findings show evidence, severity, confidence and DOM location.
7. Arjun reveals or highlights the related page elements.
8. He decides whether the agent should consume the page.

**Expected outcome:** Arjun knows which portions of the page should be treated as untrusted.

### Use case 1.2 — Browser-agent attack testing

**Trigger:** Arjun creates an adversarial test page containing indirect prompt injections.

**Flow:**

1. The page includes visible and hidden injection patterns.
2. Arjun runs Quick, Standard and Deep scans.
3. AgentSafe identifies which rules trigger.
4. Arjun checks for missed detections and false positives.
5. He exports the report and adds it to his test documentation.

**Expected outcome:** AgentSafe becomes a manual security-testing companion for the browser agent.

### Use case 1.3 — WebMCP tool preflight inspection

**Trigger:** A page exposes one or more WebMCP tools.

**Flow:**

1. AgentSafe discovers the exposed tools.
2. It lists tool names, descriptions, origins and schemas.
3. The WebMCP adapter converts the tool metadata into a generic structured scan request.
4. The Rust/WASM scanner checks human-readable strings.
5. AgentSafe classifies each tool as:
   - Declared read-only
   - Likely read-only
   - State-changing
   - Sensitive state-changing
   - Unknown

6. AgentSafe returns:
   - Allow
   - Allow with untrusted-content warning
   - Review
   - Require confirmation
   - Block

7. Arjun reviews the evidence before integrating the tool into his agent.

**Expected outcome:** Arjun can evaluate agent-facing tools before trusting them.

### Use case 1.4 — Regression review after a website update

**Trigger:** A website changes its layout, text or WebMCP definitions.

**Flow:**

1. Arjun runs AgentSafe against the updated page.
2. He exports a new report.
3. He compares findings with the previous report.
4. New or changed findings are added to the release review.

**Expected outcome:** AgentSafe helps detect security regressions caused by content or tool-definition changes.

## 3.6 How an AI agent can use AgentSafe

### Current MVP support

The MVP does not transparently intercept every browser agent.

The supported workflow is human-controlled:

```text
Browser agent developer
        ↓
Opens target page
        ↓
Runs AgentSafe manually
        ↓
Reviews webpage and WebMCP findings
        ↓
Decides whether the agent may proceed
```

### Future explicit integration

A future agent SDK may support:

```text
Agent discovers page or WebMCP tools
        ↓
AgentSafe guard scans definitions
        ↓
Policy decision returned
        ↓
Agent requests confirmation if required
        ↓
Tool is allowed, reviewed or blocked
```

This future integration should be explicit. AgentSafe must not claim universal interception unless the agent has integrated the AgentSafe SDK or protocol.

## 3.7 Success criteria

Persona 1 succeeds when:

- A scan does not freeze the browser
- Findings include exact evidence
- Hidden findings can be revealed
- WebMCP tools can be inspected without execution
- The user can distinguish declared versus inferred behavior
- Reports are useful in development issues and pull requests
- The extension does not upload page content externally

## 3.8 Why this persona recommends AgentSafe

Arjun recommends AgentSafe when he can say:

> AgentSafe shows what untrusted instructions my browser agent may receive and gives me evidence before the agent acts.

Key recommendation reasons:

- Local-first processing
- Open-source implementation
- Webpage and WebMCP coverage
- Visual evidence
- Reusable Rust/WASM engine
- No paid backend
- No account requirement
- Deterministic findings
- Useful developer reports

---

# 4. User Persona 2 — WebMCP Website Developer

## 4.1 Persona summary

**Persona name:** Maya, WebMCP Product Developer
**Role:** Frontend developer, platform engineer or website developer adding agent-facing tools
**Technical level:** Intermediate to advanced
**Primary environment:** Chrome, JavaScript/TypeScript, website frontend and WebMCP tooling
**Primary objective:** Ensure that her website exposes understandable and appropriately scoped tools to AI agents

## 4.2 Background

Maya develops a website that exposes actions such as:

- Search products
- Retrieve account information
- Submit a support ticket
- Add an item to a cart
- Book an appointment
- Update a profile
- Run diagnostics
- Send a message
- Retrieve user-generated content

She needs to ensure that tool definitions are:

- Accurate
- Limited in scope
- Properly annotated
- Free from suspicious instructions
- Clear about state changes
- Careful with sensitive fields
- Safe for agents to interpret

## 4.3 Main problems

Chrome DevTools can help Maya inspect WebMCP tools, but she still needs security-focused analysis.

She may accidentally publish:

- A state-changing tool labeled as read-only
- A description containing confusing agent instructions
- A tool requesting unnecessary credentials
- A schema inconsistent with the tool description
- A tool returning untrusted content without an appropriate hint
- A tool with overly broad free-text fields
- A tool exposing sensitive data unnecessarily
- A description containing hidden Unicode or copied malicious text

## 4.4 Jobs to be done

### Primary job

> Before releasing WebMCP tools, help me detect security, trust and clarity problems in their definitions.

### Supporting jobs

- Verify `readOnlyHint`
- Verify `untrustedContentHint`
- Detect description-schema mismatch
- Identify sensitive input fields
- Identify state-changing actions
- Test tools on localhost and staging
- Export a report for code review
- Explain how an AI agent may interpret the tool

## 4.5 Main use cases

### Use case 2.1 — Local WebMCP development review

**Trigger:** Maya registers a new tool on localhost.

**Flow:**

1. Maya opens the local development page.
2. AgentSafe detects WebMCP support.
3. It lists the registered tool.
4. AgentSafe scans the name, description, parameters, schemas, examples and annotations.
5. It flags missing or conflicting metadata.
6. Maya updates the tool definition.
7. She runs the scan again.

**Expected outcome:** WebMCP security checks become part of the local development loop.

### Use case 2.2 — State-changing classification

**Trigger:** Maya adds a `submit_support_ticket` tool.

**Flow:**

1. AgentSafe inspects the name and description.
2. It checks `readOnlyHint`.
3. It identifies that the tool causes an external state change.
4. If the tool is incorrectly marked read-only, AgentSafe raises a finding.
5. It recommends requiring user confirmation.

**Expected outcome:** The tool does not appear safer than it really is.

### Use case 2.3 — Sensitive-field review

**Trigger:** A search tool asks for a password, token or session identifier.

**Flow:**

1. AgentSafe scans the input schema.
2. It detects a credential-like field.
3. It compares the field with the stated purpose of the tool.
4. It assigns a high-risk finding when the sensitive field appears unrelated.
5. It recommends removal or additional review.

**Expected outcome:** Unnecessary collection of sensitive data is caught before release.

### Use case 2.4 — Untrusted output declaration

**Trigger:** A tool returns customer comments or third-party text.

**Flow:**

1. AgentSafe inspects the output schema and annotations.
2. It identifies that the output may contain user-generated content.
3. It checks whether `untrustedContentHint` is present.
4. If absent, it recommends marking the output as untrusted.

**Expected outcome:** Downstream agents are encouraged to treat the returned text as data rather than instructions.

### Use case 2.5 — Pre-release security report

**Trigger:** Maya prepares a pull request for WebMCP support.

**Flow:**

1. She runs AgentSafe against staging.
2. AgentSafe analyzes all available tools.
3. Maya exports a Markdown or JSON report.
4. The report is attached to the pull request.
5. Reviewers see classifications, annotations and findings.

**Expected outcome:** The security review becomes reproducible and shareable.

## 4.6 How an AI agent uses the developer’s WebMCP tools

AgentSafe’s MVP does not execute WebMCP tools.

It validates the surface that a future agent may consume:

```text
Website registers WebMCP tool
        ↓
AgentSafe inspects definition
        ↓
Developer corrects risks
        ↓
AI agent later discovers the improved tool
```

Future explicit AgentSafe integration may add:

- Invocation authorization
- User-intent alignment
- Argument minimization
- Confirmation workflows
- Tool-output scanning
- Structured security envelopes

These are future capabilities and must not be represented as implemented in the MVP unless repository evidence confirms them.

## 4.7 Success criteria

Persona 2 succeeds when:

- WebMCP tools are discoverable on supported pages
- Unsupported Chrome versions fail gracefully
- Tools are not executed during inspection
- Schema and annotation findings are understandable
- State-changing classifications explain their reasoning
- Sensitive evidence is redacted in reports
- Localhost and staging allowlists work
- The extension clearly labels WebMCP functionality as experimental

## 4.8 Why this persona recommends AgentSafe

Maya recommends AgentSafe when she can say:

> Chrome DevTools shows me my WebMCP tools. AgentSafe tells me which definitions may be risky or misleading to an AI agent.

Key recommendation reasons:

- Security-specific WebMCP analysis
- Clear remediation
- Works during local development
- No cloud service
- Evidence suitable for pull requests
- Detects annotation and schema problems
- Uses the same scanner as the public Rust/WASM package

---

# 5. User Persona 3 — AI Security and AppSec Engineer

## 5.1 Persona summary

**Persona name:** Elena, AI Application Security Engineer
**Role:** AppSec engineer, product-security engineer, AI red-teamer or security consultant
**Technical level:** Advanced
**Primary environment:** Browser security reviews, security reports, red-team testing, GitHub issues and internal ticketing
**Primary objective:** Produce reproducible evidence of agent-facing security risks

## 5.2 Background

Elena reviews applications that include:

- AI assistants
- Browser agents
- WebMCP tools
- User-generated content
- Third-party widgets
- AI summarization
- Automated research
- Agentic form completion
- Internal knowledge systems

She needs evidence that developers can reproduce and fix.

A vague warning is not enough. She needs:

- Rule ID
- Exact evidence
- DOM location
- Visibility state
- Origin
- Confidence
- Severity
- Scan limits
- Scan completeness
- Remediation guidance

## 5.3 Main problems

Elena often encounters:

- Prompt-injection reports without reproduction steps
- Hidden text that is difficult to demonstrate
- Tools that claim to be read-only but change state
- Sensitive schema fields hidden inside large definitions
- False positives with no explanation
- Security scanners that upload confidential page content
- Results that cannot be attached to a ticket
- Tools that claim a page is safe without sufficient evidence

## 5.4 Jobs to be done

### Primary job

> Help me identify, reproduce and document agent-facing prompt-injection and WebMCP security findings.

### Supporting jobs

- Reveal hidden text
- Inspect suspicious CSS
- Locate findings in the DOM
- Review tool definitions
- Export redacted security reports
- Test known attack fixtures
- Validate scanner behavior on large adversarial inputs
- Distinguish complete and partial scans
- Add domain and rule exceptions without hiding unrelated findings

## 5.5 Main use cases

### Use case 3.1 — Hidden prompt-injection investigation

**Trigger:** Elena suspects a webpage contains hidden instructions.

**Flow:**

1. She runs AgentSafe.
2. AgentSafe reports a hidden instruction-like finding.
3. Elena opens the finding detail.
4. AgentSafe shows:
   - Evidence
   - Rule ID
   - DOM selector
   - Hiding mechanism
   - Severity
   - Confidence

5. Elena clicks Reveal.
6. The extension temporarily exposes the hidden content.
7. She exports the report.

**Expected outcome:** The security issue can be reproduced by developers.

### Use case 3.2 — WebMCP security assessment

**Trigger:** Elena audits a website exposing agent-facing tools.

**Flow:**

1. AgentSafe discovers all available WebMCP tools.
2. It scans descriptions and schemas.
3. It identifies:
   - Strong prompt-injection language
   - Sensitive fields
   - State-changing actions
   - Missing trust annotations
   - Description-schema inconsistencies

4. Elena reviews inferred versus declared behavior.
5. She exports a report for the product team.

**Expected outcome:** The agent-facing interface is reviewed like any other security-sensitive API surface.

### Use case 3.3 — Large adversarial page test

**Trigger:** Elena opens a large log or intentionally adversarial page.

**Flow:**

1. AgentSafe estimates the page size.
2. It processes bounded chunks in a Web Worker.
3. The UI remains responsive.
4. Elena can cancel the scan.
5. If a size limit or timeout is reached, the result is marked partial.
6. AgentSafe reports which rules or content were not fully processed.

**Expected outcome:** The scanner itself does not become an easy browser denial-of-service vector.

### Use case 3.4 — False-positive exception

**Trigger:** A legitimate security-training page intentionally contains injection phrases.

**Flow:**

1. AgentSafe reports the findings.
2. Elena verifies that they are expected.
3. She adds:
   - A domain exception
   - A rule-specific exception
   - A development URL exception

4. Other unrelated rules continue to run.

**Expected outcome:** Exceptions reduce noise without disabling the entire scanner.

### Use case 3.5 — Report attached to a security ticket

**Trigger:** Elena needs to communicate findings to a development team.

**Flow:**

1. She exports a Markdown or JSON report.
2. Sensitive values are redacted.
3. The report includes scan completeness and engine version.
4. It is attached to a ticket or GitHub issue.

**Expected outcome:** Findings are actionable and auditable.

## 5.6 How an AI agent may use AgentSafe in the future

The MVP supports security professionals through manual inspection.

A future explicit agent integration could use AgentSafe as a policy checkpoint:

```text
Agent receives webpage or tool definition
        ↓
AgentSafe scans untrusted content
        ↓
AgentSafe returns findings and decision
        ↓
Agent:
- proceeds
- treats content as untrusted
- asks for confirmation
- blocks the operation
```

A future tool-output guard could scan nested structured output and identify findings at paths such as:

```text
$.orders[2].customerComment
```

This future behavior must remain separate from the MVP unless it has been implemented and tested.

## 5.7 Success criteria

Persona 3 succeeds when:

- Findings are reproducible
- Evidence is not vague
- Scan completeness is always disclosed
- Reports redact sensitive values
- Rules have stable identifiers
- The extension does not claim certainty without evidence
- Large content does not freeze the browser
- Allowlist decisions are scoped and reversible
- The scanner engine version is included in reports

## 5.8 Why this persona recommends AgentSafe

Elena recommends AgentSafe when she can say:

> It gives me reproducible, local and evidence-based findings for both webpage prompt injection and WebMCP exposure.

Key recommendation reasons:

- Evidence-first findings
- Local processing
- No page-content upload
- Stable rule IDs
- Rust/WASM scanner
- Partial-scan honesty
- Security report export
- WebMCP-specific checks
- Open-source rules and fixtures

---

# 6. Cross-persona use-case matrix

| Capability                     | Browser-Agent Developer |    WebMCP Developer |    AI Security/AppSec |
| ------------------------------ | ----------------------: | ------------------: | --------------------: |
| Scan current page              |                 Primary |          Supporting |               Primary |
| Detect hidden text             |                 Primary |          Supporting |               Primary |
| Reveal and highlight findings  |                 Primary |          Supporting |               Primary |
| Detect suspicious Unicode      |                 Primary |             Primary |               Primary |
| Inspect WebMCP tools           |                 Primary |             Primary |               Primary |
| Analyze schemas                |                 Primary |             Primary |               Primary |
| Classify state changes         |                 Primary |             Primary |               Primary |
| Validate annotations           |              Supporting |             Primary |               Primary |
| Development URL allowlist      |                 Primary |             Primary |            Supporting |
| Rule-level exceptions          |              Supporting |          Supporting |               Primary |
| Export security report         |              Supporting |             Primary |               Primary |
| Scan progress and cancellation |              Supporting |          Supporting |               Primary |
| Rust/WASM local scanning       |     Architectural value | Architectural value | Trust and performance |
| Execute WebMCP tools           |                  Future |              Future |                Future |
| Scan tool output               |                  Future |              Future |                Future |
| Automatic agent enforcement    |                  Future |              Future |                Future |

---

# 7. Agent usage model

## 7.1 Human-controlled MVP model

The first release supports a human-in-the-loop security check:

```text
Page or WebMCP-enabled website
        ↓
AgentSafe scans locally
        ↓
Human reviews evidence
        ↓
Human decides whether an AI agent may use the page
```

## 7.2 Explicit future integration model

A future AgentSafe SDK may support:

```text
Agent discovers tool
        ↓
AgentSafe inspects definition
        ↓
AgentSafe returns deterministic policy decision
        ↓
Agent requests confirmation when necessary
        ↓
Agent invokes approved tool
        ↓
AgentSafe scans returned untrusted content
```

## 7.3 Unsupported claim

AgentSafe must not state:

> AgentSafe automatically protects every AI agent in Chrome.

A more accurate statement is:

> AgentSafe helps users and developers inspect agent-facing webpage content and WebMCP tools. Automatic enforcement requires explicit integration with the agent.

---

# 8. Recommendation triggers

Users are most likely to recommend AgentSafe after one of these moments.

## 8.1 Invisible-content discovery

> AgentSafe found and revealed instructions that I could not see on the page.

## 8.2 WebMCP security correction

> AgentSafe found that my state-changing tool was incorrectly described or requested unnecessary sensitive data.

## 8.3 Reproducible report

> AgentSafe created a report that I could attach directly to a pull request or security ticket.

## 8.4 Local-first trust

> The extension performed the scan locally and did not upload the page.

## 8.5 Performance confidence

> The extension scanned a large page without freezing the browser and clearly reported any limits.

---

# 9. Product differentiation

AgentSafe should differentiate through the combination of:

- Page-level prompt-injection detection
- Visual evidence and element reveal
- WebMCP security analysis
- State-changing tool classification
- Sensitive-schema detection
- Local-first scanning
- Open-source Rust/WASM engine
- Bounded large-content processing
- Shareable reports
- Honest scan-completeness reporting

AgentSafe should not compete primarily as:

- Antivirus software
- Enterprise data-loss prevention
- A general privacy blocker
- A prompt manager
- A generic WebMCP debugger
- An AI-powered content summarizer
- A guarantee that a page is safe

---

# 10. Product statement

> AgentSafe helps developers and AI users see what an AI agent may receive from a webpage. It detects hidden prompt-injection risks, reveals suspicious elements and audits WebMCP tool definitions before an agent trusts or acts on them. All scanning runs locally.

## Tagline

> See what the AI sees—before it acts.

---

# 11. MVP acceptance criteria

The MVP is useful for the three primary personas only when:

1. A user can scan the active page.
2. Findings include rule ID, evidence, severity, confidence and source location.
3. Suspicious page elements can be highlighted or revealed.
4. Hidden Unicode and bidirectional controls are detected.
5. Exact domains and development URLs can be allowlisted.
6. Rule-specific exceptions do not disable unrelated rules.
7. WebMCP tools can be discovered on supported pages.
8. WebMCP definitions are scanned without executing tools.
9. Tools are classified as read-only, state-changing or unknown.
10. Sensitive schema fields are identified.
11. WebMCP recommendations explain their reasoning.
12. Large text scanning runs in a Worker.
13. Input is processed in bounded chunks.
14. The user can cancel a scan.
15. Partial scans are clearly marked.
16. Security reports can be exported.
17. Exported evidence is redacted where necessary.
18. Page content is not sent to a remote service.
19. WebMCP support is labeled experimental.
20. The product does not claim universal agent interception.
