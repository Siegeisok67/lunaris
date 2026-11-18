export type PromptTemplateCategory = "Development" | "Creative" | "Workflow";

export interface PromptTemplate {
  id: string;
  title: string;
  category: PromptTemplateCategory;
  description: string;
  prompt: string;
  skillIds?: string[];
  toolIds?: string[];
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  { id: "app-build", title: "Build an application", category: "Development", description: "Turn a rough product idea into a scoped implementation plan.", prompt: "Help me plan and build an application from this idea. Clarify its users, primary workflow, platform, visual direction, integrations, accessibility needs, and how I will know the first version is successful. Then produce an ordered implementation plan with relevant skills and tools." },
  { id: "debug", title: "Investigate a bug", category: "Development", description: "Find a repeatable cause before proposing a fix.", prompt: "Help me investigate and fix this bug. First clarify the expected behavior, actual behavior, reproduction steps, relevant environment, and recent changes. Ask for missing logs or files only when they affect the diagnosis. Then provide a focused root-cause plan and verification steps." },
  { id: "api", title: "Design an API", category: "Development", description: "Clarify contracts, data, auth, and failure behavior.", prompt: "Help me design and implement this API. Clarify clients, resource shapes, authentication and authorization, validation, error responses, pagination, rate limits, persistence, and deployment constraints. Produce a versioned contract and an implementation sequence." },
  { id: "blender", title: "Create in Blender", category: "Creative", description: "Plan a scene, model, or animation with review checkpoints.", prompt: "Help me create this in Blender. Clarify subject and references, style, scale, scene contents, target render or export, and review criteria. Check relevant objects and tools before editing where available. Include the Blender skills and MCP calls needed, then verify the result with an appropriate viewport or render screenshot." },
  { id: "visual-refresh", title: "Refresh a user interface", category: "Creative", description: "Improve hierarchy, accessibility, and visual consistency.", prompt: "Help me improve this interface. Review the current screen and reference images, then clarify the audience, primary task, visual tone, platform constraints, accessibility requirements, and what should stay familiar. Produce a concrete design and implementation plan with responsive states." },
  { id: "game-prototype", title: "Prototype a game", category: "Creative", description: "Scope a small playable loop and production-ready first slice.", prompt: "Help me prototype this game idea. Clarify the player fantasy, core loop, controls, camera, target platform, art direction, multiplayer expectations, and success criteria. Keep the first slice small and playable, identify technical risks, and lay out implementation and playtest steps." },
  { id: "automation", title: "Automate a workflow", category: "Workflow", description: "Map trigger, tools, data, and safe failure recovery.", prompt: "Help me automate this workflow. Clarify the trigger, inputs, apps and tools involved, expected output, permissions, sensitive data, failure cases, and whether a human should approve actions. Produce a safe, observable implementation plan with recovery steps." },
  { id: "research", title: "Compare options", category: "Workflow", description: "Make a decision brief with criteria and evidence needs.", prompt: "Help me research and compare options for this decision. Clarify the decision, must-have criteria, constraints, budget or time horizon, and what evidence would change my mind. Separate verified facts from assumptions and return a concise recommendation with trade-offs." },
];
