import type { Finding, FindingCategory, RuleSignal, Severity } from "@agentsafe/shared-types";

export interface FindingExplanationInput {
  ruleId: string;
  category: FindingCategory;
  severity: Severity;
  confidence: number;
  visibility: string;
  visibleToUser: boolean;
  likelyInExtractedText: boolean;
  signals: RuleSignal[];
  hiddenReasons: Record<string, string>;
}

type Enrichment = Pick<
  Finding,
  "title" | "verdict" | "concern" | "possibleImpact" | "whyItMatters" | "confidenceReason" | "falsePositiveGuidance" | "explanation" | "recommendedAction"
>;

export function explainFinding(input: FindingExplanationInput): Enrichment {
  const hiddenContext = input.visibleToUser
    ? "The text appears visible to a user."
    : "The text is not readily visible in the rendered page.";
  const extractionContext = input.likelyInExtractedText
    ? "It is likely to be included when an AI tool extracts page text."
    : "Some extraction tools may skip it, but it is still present in the page source.";
  const visibilityReason = `${hiddenContext} ${extractionContext}`;
  const hiddenReasons = Object.keys(input.hiddenReasons);
  const hasInstruction = input.signals.some((signal) => ["instruction-override", "role-manipulation", "reveal-system-prompt", "tool-use", "data-exfiltration", "delimiter-block"].includes(signal));
  const hasObfuscation = input.signals.some((signal) => ["zero-width-unicode", "bidi-control", "base64-instruction"].includes(signal));
  const verdict = chooseVerdict(input, hasInstruction, hasObfuscation);

  if (input.ruleId === "suspicious-comment-or-meta" || input.category === "html-comment" || input.category === "metadata") {
    const where = input.category === "metadata" ? "page metadata" : input.category === "html-comment" ? "an HTML comment" : "hidden page source";
    return {
      title: input.category === "metadata" ? "Instruction-like text in page metadata" : "Instruction-like text hidden in page source",
      verdict,
      concern: `AgentSafe found instruction-like wording inside ${where}, which users usually do not inspect before sending page content to an AI agent.`,
      possibleImpact: hasInstruction
        ? "A browser agent or summarizer could copy this hidden text into its context and treat it as an instruction, such as ignoring prior directions or changing tool behavior."
        : "An AI workflow may receive source-only content that the user did not realize was part of the page.",
      whyItMatters: `${visibilityReason} Hidden comments and metadata are a common place to hide prompt-injection text because they can be invisible to the person but still visible to automation.`,
      confidenceReason: confidenceText(input, hiddenReasons, hasInstruction, hasObfuscation),
      falsePositiveGuidance: "May be benign if the comment or metadata is a normal developer note, SEO description, or template marker and does not instruct an AI or agent to change behavior.",
      explanation: `Instruction-like content was found in ${where}. ${visibilityReason}`,
      recommendedAction: "Inspect the source element. Remove it from AI-facing exports or page templates unless it is intentional, trusted, and harmless."
    };
  }

  if (input.ruleId === "instruction-override" || input.ruleId === "role-manipulation" || input.ruleId === "reveal-system-prompt") {
    return {
      title: "Prompt-injection instruction",
      verdict,
      concern: "The text appears to tell an AI system to change or ignore its operating instructions.",
      possibleImpact: "If copied into an AI agent context, it may cause the agent to disregard user/developer instructions, reveal hidden prompts, or follow attacker-controlled directions.",
      whyItMatters: visibilityReason,
      confidenceReason: confidenceText(input, hiddenReasons, true, hasObfuscation),
      falsePositiveGuidance: "May be benign in an article, documentation, test fixture, or security training page that is clearly discussing prompt injection rather than trying to control an agent.",
      explanation: `The content contains agent-directed wording associated with ${readableRule(input.ruleId)}. ${visibilityReason}`,
      recommendedAction: "Do not copy this text into an agent unchanged. Review the surrounding page context and remove or quarantine it from sanitized exports if it is not part of trusted documentation."
    };
  }

  if (input.ruleId === "tool-use" || input.ruleId === "data-exfiltration" || input.category === "exfiltration") {
    return {
      title: input.ruleId === "data-exfiltration" ? "Possible data-exfiltration instruction" : "Tool-use instruction aimed at an agent",
      verdict,
      concern: "The text appears to direct an AI agent toward tool use or data transfer.",
      possibleImpact: "An agent with browser, email, file, or API tools could be nudged into sending data, invoking tools, or taking actions outside the user's intent.",
      whyItMatters: visibilityReason,
      confidenceReason: confidenceText(input, hiddenReasons, true, hasObfuscation),
      falsePositiveGuidance: "May be benign if this is visible product documentation or a legitimate workflow description, especially when it is not hidden and does not request secrets or unrelated data.",
      explanation: `The content contains agent-action wording associated with ${readableRule(input.ruleId)}. ${visibilityReason}`,
      recommendedAction: "Review before allowing an agent to act on this page. Remove from AI-facing exports if it asks for secrets, cross-origin data, or unexpected tool calls."
    };
  }

  if (input.ruleId === "zero-width-unicode" || input.ruleId === "bidi-control" || input.category === "unicode-security") {
    return {
      title: input.ruleId === "bidi-control" ? "Bidirectional text control detected" : "Hidden Unicode characters detected",
      verdict,
      concern: "The text contains Unicode controls that can hide, reorder, or visually disguise content.",
      possibleImpact: "A user may read one thing while an AI parser or downstream tool receives different text, which can mask prompt-injection instructions or misleading commands.",
      whyItMatters: visibilityReason,
      confidenceReason: confidenceText(input, hiddenReasons, hasInstruction, true),
      falsePositiveGuidance: "May be benign in multilingual text, accessibility examples, or copied content from rich editors. It is higher risk when combined with agent instructions.",
      explanation: `The content includes ${readableRule(input.ruleId)} characters. ${visibilityReason}`,
      recommendedAction: "Normalize or remove hidden Unicode before copying this content into an AI workflow. Review the normalized text for hidden instructions."
    };
  }

  if (input.ruleId === "base64-instruction" || input.category === "encoded-content") {
    return {
      title: "Encoded instruction-like content",
      verdict,
      concern: "The page contains encoded text that decodes to instruction-like content.",
      possibleImpact: "Encoded instructions can bypass casual review and later be decoded by tools, scripts, or an AI workflow that processes page content.",
      whyItMatters: visibilityReason,
      confidenceReason: confidenceText(input, hiddenReasons, hasInstruction, true),
      falsePositiveGuidance: "May be benign if the encoded value is a normal token, asset hash, or test data and does not decode to agent instructions.",
      explanation: `Encoded content appears to contain AI-directed instructions. ${visibilityReason}`,
      recommendedAction: "Decode and inspect the value. Exclude it from AI-facing exports unless it is expected and trusted."
    };
  }

  return {
    title: "Suspicious AI-facing page content",
    verdict,
    concern: "AgentSafe found content that resembles instructions or hidden text an AI workflow may process differently than a user.",
    possibleImpact: "An AI agent may incorporate this content into its context and produce actions or summaries the user did not intend.",
    whyItMatters: visibilityReason,
    confidenceReason: confidenceText(input, hiddenReasons, hasInstruction, hasObfuscation),
    falsePositiveGuidance: "May be benign when the text is visible, expected, and part of documentation or a security test page.",
    explanation: `The content matched ${readableRule(input.ruleId)}. ${visibilityReason}`,
    recommendedAction: "Review the evidence and surrounding page context before using this page as AI input."
  };
}

function chooseVerdict(input: FindingExplanationInput, hasInstruction: boolean, hasObfuscation: boolean): Finding["verdict"] {
  if ((hasInstruction || input.ruleId === "data-exfiltration") && (!input.visibleToUser || hasObfuscation)) return "likely-risk";
  if (input.severity === "critical" || input.severity === "high") return "likely-risk";
  if (input.confidence < 0.55) return "low-confidence-signal";
  return "needs-review";
}

function confidenceText(input: FindingExplanationInput, hiddenReasons: string[], hasInstruction: boolean, hasObfuscation: boolean) {
  const reasons = [];
  if (!input.visibleToUser) reasons.push("not visible to the user");
  if (input.likelyInExtractedText) reasons.push("likely included in extracted text");
  if (hasInstruction) reasons.push("contains AI/agent-directed wording");
  if (hasObfuscation) reasons.push("contains obfuscation or encoded content");
  if (hiddenReasons.length) reasons.push(`hidden by ${hiddenReasons.join(", ")}`);
  if (!reasons.length) reasons.push("matched a known risky pattern");
  return `Confidence is ${Math.round(input.confidence * 100)}% because the content is ${reasons.join("; ")}.`;
}

function readableRule(ruleId: string) {
  return ruleId.replace(/-/g, " ");
}
