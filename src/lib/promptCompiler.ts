import type { ArchitectResult, AnswerRecord } from "../types/architect";
import type { SkillDefinition } from "../types/skills";
import type { ToolCatalog } from "../types/tools";
import { selectToolReferences } from "./toolCatalog";

export interface CompiledPrompt {
  text: string;
  activeSkills: SkillDefinition[];
  activeTools: ReturnType<typeof selectToolReferences>;
  assumptions: string[];
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  estimatedTokensSaved: number;
}

function tokenEstimate(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatSpecs(specs: ArchitectResult["known_specs"]): string {
  const entries = Object.entries(specs);
  if (entries.length === 0) return "- No explicit constraints were extracted; use the request and listed assumptions.";
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `- **${key}:** ${Array.isArray(value) ? value.join(", ") : value === null ? "Not specified" : String(value)}`)
    .join("\n");
}

function answerMap(answers: AnswerRecord[]): Map<string, string> {
  return new Map(answers.map(({ questionId, answer }) => [questionId, answer]));
}

export function compileExecutionPrompt(args: {
  originalPrompt: string;
  result: ArchitectResult;
  answers: AnswerRecord[];
  skills: SkillDefinition[];
  skippedQuestions?: boolean;
  attachments?: string[];
  toolCatalog?: ToolCatalog;
}): CompiledPrompt {
  const selected = new Set(args.result.detected_skills);
  const skillContext = `${args.originalPrompt} ${args.answers.map(({ questionText, answer }) => `${questionText ?? ""} ${answer}`).join(" ")}`.toLocaleLowerCase();
  const activeSkills = args.skills.filter((skill) => selected.has(skill.id)
    || skill.triggers.some((trigger) => trigger.trim().length > 1 && skillContext.includes(trigger.toLocaleLowerCase())));
  const toolCatalog = args.toolCatalog ?? { applications: [], mcpServers: [] };
  const toolContext = `${args.originalPrompt} ${args.answers.map(({ questionText, answer }) => `${questionText ?? ""} ${answer}`).join(" ")}`;
  const activeTools = selectToolReferences(toolCatalog, args.result.detected_tools, toolContext);
  const recordedAnswers = answerMap(args.answers);
  const unanswered = args.result.next_questions.filter((question) => !recordedAnswers.has(question.id));
  const assumptions = unanswered.map((question) => {
    const options = question.options?.length ? ` Choose the most suitable of ${question.options.join(", ")}.` : " Choose a conservative, reversible default.";
    return `${question.question}${options}`;
  });

  const answerSection = args.answers.length
    ? args.answers.map(({ questionId, questionText, answer }) => `- ${questionText || questionId}: ${answer}`).join("\n")
    : "- No follow-up answers were needed.";
  const skillCalls = activeSkills.length
    ? activeSkills.map((skill) => `- Invoke skill \`${skill.id}\` before its relevant work. If the Executor supports native skill activation, activate this ID; otherwise follow the complete embedded rules below.`).join("\n")
    : "- No specialized skill calls were selected.";
  const skillSection = activeSkills.length
    ? activeSkills.map((skill) => `### ${skill.name} (${skill.id})\n${skill.content.trim()}`).join("\n\n")
    : "No specialized skill rules were detected.";
  const applicationRefs = activeTools.filter((tool) => tool.kind === "application");
  const mcpRefs = activeTools.filter((tool) => tool.kind === "mcp");
  const applicationSection = applicationRefs.length
    ? applicationRefs.map((tool) => `- **${tool.name}:** executable \`${tool.location}\`\n  Purpose: ${tool.description || "Not specified."}${tool.usageNotes ? `\n  Usage: ${tool.usageNotes}` : ""}`).join("\n")
    : "No registered local applications were matched.";
  const mcpSection = mcpRefs.length
    ? mcpRefs.map((tool) => `- **${tool.serverName || "MCP server"} — call \`${tool.exactToolName || tool.name}\`:** ${tool.description || "No description supplied."}\n  Server location: \`${tool.location}\`${tool.usageNotes ? `\n  Usage: ${tool.usageNotes}` : ""}`).join("\n")
    : "No registered MCP calls were matched.";
  const attachmentSection = args.attachments?.length
    ? args.attachments.map((name) => `- ${name}`).join("\n")
    : "No reference images are attached to this copied prompt. Include them in the target agent if visual details matter.";
  const plan = args.result.final_execution_prompt.trim() || "Create a clear implementation plan, inspect the existing project before editing, and complete the work in small verifiable steps.";
  const assumptionSection = assumptions.length
    ? assumptions.map((assumption) => `- ${assumption}`).join("\n")
    : "- No unresolved clarification questions.";
  const compileNote = args.skippedQuestions
    ? "The user chose to compile now. Treat unresolved details as assumptions, make safe reversible choices, and call those assumptions out in the result."
    : ""

  const text = `# Lunaris Execution Blueprint

## Goal
${args.originalPrompt.trim()}

## Known specifications
${formatSpecs(args.result.known_specs)}

## Clarification answers
${answerSection}

## Reference material
${attachmentSection}

## Assumptions to resolve while implementing
${assumptionSection}

## Matched technical skills
${skillCalls}

## Skill instructions
${skillSection}

## Relevant local applications
${applicationSection}

## Available MCP calls
${mcpSection}

## Master execution plan
${plan}

## Execution expectations
- Inspect the current project and relevant files before making changes.
- Inspect every numbered reference image before acting. In a streamed request, image attachments follow the same order as the REF labels; in an IDE handoff, open each exact local file path listed above. Do not claim visual verification until you have inspected the references.
- Follow the existing conventions and preserve unrelated work.
- Implement the plan, handle errors and edge cases, and keep the user informed about material decisions.
- Run the relevant build or validation commands when available; report the commands and their actual results.
- Summarize changed files and any remaining limitations without claiming work that was not performed.
${compileNote ? `\n## Compile note\n${compileNote}` : ""}`;

  const estimatedTokensAfter = tokenEstimate(text);
  const estimatedTokensBefore = estimatedTokensAfter * 3;
  return {
    text,
    activeSkills,
    activeTools,
    assumptions,
    estimatedTokensBefore,
    estimatedTokensAfter,
    estimatedTokensSaved: estimatedTokensBefore - estimatedTokensAfter,
  };
}
