import type { FindingCategory, RuleSignal } from "@agentsafe/shared-types";

export interface PatternRule {
  id: RuleSignal;
  category: FindingCategory;
  pattern: RegExp;
  explanation: string;
}

export const instructionPatterns: PatternRule[] = [
  {
    id: "instruction-override",
    category: "instruction-pattern",
    pattern: /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)\b/i,
    explanation: "The text asks an AI or assistant to ignore earlier instructions."
  },
  {
    id: "role-manipulation",
    category: "instruction-pattern",
    pattern: /\b(you are now|act as|switch role|developer mode|jailbreak)\b/i,
    explanation: "The text attempts to manipulate the role or operating mode of an AI assistant."
  },
  {
    id: "reveal-system-prompt",
    category: "instruction-pattern",
    pattern: /\b(reveal|print|show|dump|leak)\s+(the\s+)?(system prompt|hidden prompt|developer message|instructions)\b/i,
    explanation: "The text requests disclosure of hidden or system-level instructions."
  },
  {
    id: "tool-use",
    category: "exfiltration",
    pattern: /\b(use|call|invoke)\s+(browser|tool|api|fetch|curl|http|clipboard|email|slack|drive)\b/i,
    explanation: "The text includes tool-use instructions that may affect agent behavior."
  },
  {
    id: "data-exfiltration",
    category: "exfiltration",
    pattern: /\b(send|post|upload|exfiltrate|forward)\s+.{0,40}\b(secrets?|tokens?|cookies?|api keys?|passwords?|private data)\b/i,
    explanation: "The text appears to request disclosure or transfer of sensitive data."
  },
  {
    id: "delimiter-block",
    category: "delimiter",
    pattern: /(```|<\|system\|>|<\|assistant\|>|###\s*(system|developer|instruction)|\[system\])/i,
    explanation: "The text uses prompt-like delimiters often seen in hidden instruction blocks."
  }
];

export const suspiciousCommentOrMeta = /\b(ai|agent|assistant|llm|system prompt|ignore previous|hidden instruction|tool|exfiltrate)\b/i;

export function containsInstruction(text: string): PatternRule[] {
  return instructionPatterns.filter((rule) => rule.pattern.test(text));
}
