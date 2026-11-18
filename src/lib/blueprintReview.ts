import type { CompiledPrompt } from "./promptCompiler";

export interface BlueprintCheck {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
  suggestion: string;
}

function section(text: string, heading: string): string {
  const headingText = `## ${heading}`;
  const headingIndex = text.indexOf(headingText);
  if (headingIndex < 0) return "";
  const contentStart = text.indexOf("\n", headingIndex + headingText.length);
  if (contentStart < 0) return "";
  const nextHeading = text.indexOf("\n## ", contentStart + 1);
  return text.slice(contentStart + 1, nextHeading < 0 ? undefined : nextHeading).trim();
}

export function reviewBlueprint(compiled: CompiledPrompt): BlueprintCheck[] {
  const goal = section(compiled.text, "Goal");
  const specs = section(compiled.text, "Known specifications");
  const answers = section(compiled.text, "Clarification answers");
  const plan = section(compiled.text, "Master execution plan");
  const requirements = `${goal}\n${specs}\n${answers}\n${plan}`;
  const planSteps = plan.match(/^\s*(?:\d{1,2}[.)]|[-*])\s+\S/gm) ?? [];
  const hasAcceptanceCriteria = /acceptance criteria|success criteria|definition of done|done when|complete when|expected (?:result|behavior)|must pass/i.test(requirements);
  const hasVerification = /\b(?:test(?:s|ing)?|verify|verification|validate|validation|screenshot|render|inspect|review)\b/i.test(plan);
  const hasConstraints = Boolean(specs) && !/no explicit constraints were extracted/i.test(specs);

  return [
    {
      id: "acceptance",
      label: "Success criteria",
      ready: hasAcceptanceCriteria,
      detail: hasAcceptanceCriteria ? "The blueprint names a way to judge the result." : "No explicit success criteria were found.",
      suggestion: "Add observable acceptance criteria or describe what a finished result should look like.",
    },
    {
      id: "steps",
      label: "Actionable steps",
      ready: planSteps.length >= 2,
      detail: planSteps.length >= 2 ? `${planSteps.length} ordered or bulleted actions detected.` : "The execution plan has few distinct actions.",
      suggestion: "Break the work into a few ordered steps with clear deliverables.",
    },
    {
      id: "verification",
      label: "Verification",
      ready: hasVerification,
      detail: hasVerification ? "The execution plan includes a verification activity." : "No verification activity was found in the execution plan.",
      suggestion: "Specify how the Executor should check its work, such as a build, test, screenshot, render, or review.",
    },
    {
      id: "constraints",
      label: "Known constraints",
      ready: hasConstraints,
      detail: hasConstraints ? "The Architect captured concrete specifications or constraints." : "No concrete constraints were captured; the Executor may need to infer them.",
      suggestion: "Add important platform, scope, compatibility, or preservation constraints before handing off.",
    },
  ];
}

export function makeBlueprintReviewPrompt(compiled: CompiledPrompt, checks: BlueprintCheck[]): string {
  const gaps = checks.filter((check) => !check.ready).map((check) => `- ${check.label}: ${check.suggestion}`);
  return `Review this Lunaris execution blueprint before any work begins. Do not execute it, edit files, or invent requirements.\n\nReturn a concise review with: (1) ambiguous or conflicting requirements, (2) assumptions that need the user's decision, (3) a minimal acceptance checklist, and (4) any serious risk the plan missed. If a concern cannot be established from the blueprint, label it as a question rather than a fact.\n\n${gaps.length ? `Local preflight suggestions:\n${gaps.join("\n")}\n\n` : "The local preflight found no basic completeness gaps. Still check for contradictions and unsafe assumptions.\n\n"}--- BLUEPRINT ---\n${compiled.text}`;
}
