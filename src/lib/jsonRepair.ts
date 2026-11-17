import type { ArchitectResult, QuestionCard, SpecSheet, SpecValue } from "../types/architect";

const MAX_RESPONSE_CHARS = 512_000;

export class ArchitectJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchitectJsonError";
  }
}

function removeCodeFence(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/^\s*```(?:json|javascript|js)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function extractBalancedJson(text: string): string | null {
  let start = -1;
  let closings: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      if (start >= 0) inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      if (start < 0) start = index;
      closings.push(char === "{" ? "}" : "]");
      continue;
    }
    if (char === "}" || char === "]") {
      if (start < 0) continue;
      if (closings.pop() !== char) {
        start = -1;
        closings = [];
        continue;
      }
      if (closings.length === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function quoteUnquotedKeys(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === "{" || char === ",") {
      result += char;
      let cursor = index + 1;
      while (/\s/.test(text[cursor] ?? "")) cursor += 1;
      const key = /^[A-Za-z_$][\w$-]*/.exec(text.slice(cursor))?.[0];
      if (key) {
        let colon = cursor + key.length;
        while (/\s/.test(text[colon] ?? "")) colon += 1;
        if (text[colon] === ":") {
          result += text.slice(index + 1, cursor) + JSON.stringify(key);
          index = cursor + key.length - 1;
        }
      }
      continue;
    }
    result += char;
  }
  return result;
}

function normalizeSingleQuotedStrings(text: string): string {
  let output = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const char of text) {
    if (quote === "'") {
      if (escaped) {
        output += char === "'" ? "'" : char === "\\" ? "\\\\" : `\\${char}`;
        escaped = false;
      } else if (char === "\\") escaped = true;
      else if (char === "'") {
        output += '"';
        quote = null;
      } else if (char === '"') output += '\\"';
      else output += char;
    } else if (quote === '"') {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = null;
    } else if (char === "'") {
      output += '"';
      quote = "'";
    } else {
      output += char;
      if (char === '"') quote = '"';
    }
  }
  if (quote === "'" && output.endsWith('"')) output = output.slice(0, -1) + '"';
  return output;
}

function repairCandidate(candidate: string): string[] {
  const noComments = candidate
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\r\n]*/g, "$1");
  const normalized = normalizeSingleQuotedStrings(noComments);
  const keysQuoted = quoteUnquotedKeys(normalized);
  const relaxed = keysQuoted
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null");
  return [candidate, noComments, normalized, keysQuoted, relaxed];
}

export function parseJsonWithRepair<T>(input: string): T {
  if (input.length > MAX_RESPONSE_CHARS) {
    throw new ArchitectJsonError("The Architect response is too large to parse safely.");
  }
  const cleaned = removeCodeFence(input);
  const candidate = extractBalancedJson(cleaned) ?? cleaned;
  let lastError: unknown;
  for (const attempt of repairCandidate(candidate)) {
    try {
      return JSON.parse(attempt) as T;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "invalid syntax";
  throw new ArchitectJsonError(`The model returned invalid JSON (${detail}). Try the request again or use a larger model.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSpecSheet(value: unknown): SpecSheet {
  if (!isRecord(value)) return {};
  const output: SpecSheet = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" || raw === null) {
      output[key.slice(0, 120)] = raw as SpecValue;
    } else if (Array.isArray(raw)) {
      output[key.slice(0, 120)] = raw.filter((entry): entry is string => typeof entry === "string").slice(0, 30);
    }
  }
  return output;
}

function readQuestions(value: unknown): QuestionCard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const questions: QuestionCard[] = [];
  for (const raw of value.slice(0, 12)) {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.question !== "string") continue;
    const id = raw.id.trim().slice(0, 80);
    const question = raw.question.trim().slice(0, 1200);
    if (!id || !question || seen.has(id)) continue;
    seen.add(id);
    const options = Array.isArray(raw.options)
      ? raw.options.filter((option): option is string => typeof option === "string").map((option) => option.slice(0, 240)).slice(0, 8)
      : undefined;
    questions.push({ id, question, ...(options?.length ? { options } : {}) });
  }
  return questions;
}

export function validateArchitectResult(input: unknown): ArchitectResult {
  if (!isRecord(input)) throw new ArchitectJsonError("The Architect response must be a JSON object.");
  const detected = Array.isArray(input.detected_skills)
    ? input.detected_skills.filter((skill): skill is string => typeof skill === "string").map((skill) => skill.trim()).filter(Boolean).slice(0, 40)
    : [];
  const detectedTools = Array.isArray(input.detected_tools)
    ? input.detected_tools.filter((tool): tool is string => typeof tool === "string").map((tool) => tool.trim()).filter(Boolean).slice(0, 80)
    : [];
  const ready = input.is_ready_to_execute === true;
  const questions = readQuestions(input.next_questions);
  const prompt = typeof input.final_execution_prompt === "string" ? input.final_execution_prompt.trim().slice(0, 100_000) : "";
  const rawRecommendation = input.executor_recommendation;
  const recommendation = isRecord(rawRecommendation)
    && typeof rawRecommendation.model === "string"
    && typeof rawRecommendation.rationale === "string"
    && Array.isArray(rawRecommendation.capabilities)
    ? {
      model: rawRecommendation.model.trim().slice(0, 120),
      rationale: rawRecommendation.rationale.trim().slice(0, 800),
      capabilities: rawRecommendation.capabilities.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 6),
    }
    : null;
  const rawContext = input.context_recommendation;
  const contextRecommendation = isRecord(rawContext)
    && typeof rawContext.architect_tokens === "number"
    && Number.isFinite(rawContext.architect_tokens)
    && typeof rawContext.executor_tokens === "number"
    && Number.isFinite(rawContext.executor_tokens)
    && typeof rawContext.rationale === "string"
    ? {
      architect_tokens: Math.max(4096, Math.min(131072, Math.round(rawContext.architect_tokens))),
      executor_tokens: Math.max(4096, Math.min(131072, Math.round(rawContext.executor_tokens))),
      rationale: rawContext.rationale.trim().slice(0, 800),
    }
    : null;
  return {
    known_specs: readSpecSheet(input.known_specs),
    detected_skills: [...new Set(detected)],
    detected_tools: [...new Set(detectedTools)],
    is_ready_to_execute: ready,
    next_questions: ready ? [] : questions,
    final_execution_prompt: prompt,
    executor_recommendation: recommendation?.model ? recommendation : null,
    context_recommendation: contextRecommendation,
  };
}

export function parseArchitectResult(input: string): ArchitectResult {
  return validateArchitectResult(parseJsonWithRepair<unknown>(input));
}
