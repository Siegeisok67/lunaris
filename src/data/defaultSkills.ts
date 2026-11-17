import type { SkillDefinition } from "../types/skills";

export const DEFAULT_SKILLS: SkillDefinition[] = [
  {
    id: "blender-mcp",
    name: "Blender MCP Workflow",
    description: "Build and verify Blender scenes through an available Blender MCP connection.",
    category: "creative",
    triggers: ["blender", "bpy", "3d scene", "mesh", "render", "material", "animation"],
    builtIn: true,
    content: `# Blender MCP Workflow\n\nWhen Blender or a Blender MCP connection is available:\n\n- Inspect the open scene and its object names before changing it. Preserve unrelated scene content.\n- Use the available Blender MCP tools for scene inspection, object edits, materials, cameras, lighting, rendering, and export. Do not invent tool names; inspect the available tools first.\n- Break the work into reversible stages: inspect, block out, refine, light, render, then export.\n- Match supplied references by measuring silhouettes, proportions, colors, and camera framing. Ask for missing source views only when they prevent a reasonable result.\n- Keep object names descriptive and organize related objects into collections. Prefer modifiers and parameterized changes when they make later edits easier.\n- Render a preview and inspect the result before calling visual work complete. Fix obvious clipping, missing materials, framing errors, or unintended objects.\n- Report which scene and output files were actually changed. Do not claim an export or render exists unless it was produced.\n`,
  },
  {
    id: "react-ui",
    name: "React Interface Implementation",
    description: "Design accessible, responsive React interfaces with clear component boundaries.",
    category: "frontend",
    triggers: ["react", "tsx", "frontend", "dashboard", "component", "web app", "user interface", "ui"],
    builtIn: true,
    content: `# React Interface Implementation\n\nFor React interface work:\n\n- Inspect the existing project structure, package scripts, design tokens, and component conventions before editing. Keep the framework and build setup already in use.\n- Build the requested user flow first. Keep components focused, use typed props, and place reusable stateful behavior in hooks when that reduces duplication.\n- Preserve keyboard access, visible focus, semantic HTML, readable contrast, and useful labels for controls. Do not rely on color alone to communicate state.\n- Handle loading, empty, error, and success states as part of the feature. Disable actions while their operation is in flight and show recoverable errors near the affected control.\n- Match the supplied visual references at the intended viewport. Use responsive layout constraints, consistent spacing, and existing tokens before adding new colors or typography.\n- Avoid placeholder data and decorative controls that do not work. Verify the production build and report any behavior that remains blocked by unavailable services.\n`,
  },
  {
    id: "backend-api",
    name: "Backend API Design",
    description: "Implement reliable APIs with validation, authorization, and predictable error handling.",
    category: "backend",
    triggers: ["api", "backend", "endpoint", "server", "database", "authentication", "service"],
    builtIn: true,
    content: `# Backend API Design\n\nFor backend or API work:\n\n- Inspect the existing routes, data model, authentication middleware, and error conventions before adding endpoints. Reuse established patterns.\n- Validate all input at the boundary, authorize access before returning or changing protected data, and keep secrets out of logs and error payloads.\n- Define request and response shapes explicitly. Use stable status codes and structured errors that tell the caller what can be corrected.\n- Make writes atomic where partial state would be harmful. Use transactions or idempotency controls when retries could duplicate work.\n- Apply limits to uploaded files, request bodies, pagination, and expensive operations. Treat user-supplied paths and URLs as untrusted input.\n- Keep migrations reversible where possible. Verify the relevant checks and describe any compatibility or data migration requirements.\n`,
  },
];

export function defaultSkillFiles() {
  return DEFAULT_SKILLS.map(({ id, content }) => ({ id, content }));
}
