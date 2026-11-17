import type { McpServer, ToolCatalog } from "../types/tools";

const SECRET_KEY_PATTERN = /(?:--(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|authorization|auth[_-]?token)(?:\s+|\s*=\s*)|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|authorization|auth[_-]?token)\b\s*[:=]\s*)([^\s,;&]+)/gi;

function isEnvironmentPlaceholder(value: string): boolean {
  return /^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|%[A-Za-z_][A-Za-z0-9_]*%|\{\{[A-Za-z_][A-Za-z0-9_]*\}\})$/.test(value);
}

function textContainsCredential(value: string): boolean {
  if (/\bhttps?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(value)
    || /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)
    || /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/.test(value)) return true;
  for (const match of value.matchAll(SECRET_KEY_PATTERN)) {
    const captured = match[1].replace(/^['"]|['"]$/g, "");
    if (captured && !isEnvironmentPlaceholder(captured)) return true;
  }
  return false;
}

export function mcpServerContainsCredential(server: McpServer): boolean {
  const values = [server.name, server.commandOrUrl, ...server.args, server.description, ...server.triggers, server.usageNotes,
    ...server.tools.flatMap((tool) => [tool.name, tool.description, tool.usageNotes, ...tool.triggers])];
  return values.some(textContainsCredential);
}

export interface ArchitectToolReference {
  id: string;
  kind: "application" | "mcp";
  name: string;
  location: string;
  description: string;
  triggers: string[];
  usageNotes: string;
  serverName?: string;
  exactToolName?: string;
  serverTriggers?: string[];
}

export function architectToolReferences(catalog: ToolCatalog): ArchitectToolReference[] {
  const applications: ArchitectToolReference[] = catalog.applications
    .filter((application) => application.enabled)
    .map((application) => ({
      id: `app:${application.id}`,
      kind: "application",
      name: application.name,
      location: application.executablePath,
      description: application.description,
      triggers: application.triggers,
      usageNotes: application.usageNotes,
    }));
  const mcpTools: ArchitectToolReference[] = catalog.mcpServers
    .filter((server) => server.enabled && !mcpServerContainsCredential(server))
    .flatMap((server) => server.tools.map((tool) => ({
      id: `mcp:${server.id}:${tool.id}`,
      kind: "mcp" as const,
      name: `${server.name} / ${tool.name}`,
      location: server.connectionKind === "stdio"
        ? [JSON.stringify(server.commandOrUrl), ...server.args.map((argument) => JSON.stringify(argument))].join(" ")
        : server.commandOrUrl,
      description: [server.description, tool.description].filter(Boolean).join(" "),
      triggers: tool.triggers,
      usageNotes: [server.usageNotes, tool.usageNotes].filter(Boolean).join(" "),
      serverName: server.name,
      exactToolName: tool.name,
      serverTriggers: server.triggers,
    })));
  return [...applications, ...mcpTools];
}

function phraseMatches(text: string, phrase: string): boolean {
  const normalized = phrase.trim().toLocaleLowerCase();
  return normalized.length > 1 && text.includes(normalized);
}

export function selectToolReferences(
  catalog: ToolCatalog,
  detectedIds: string[] | undefined,
  context: string,
): ArchitectToolReference[] {
  const candidates = architectToolReferences(catalog);
  const validIds = new Set(candidates.map((candidate) => candidate.id));
  const selectedIds = new Set((detectedIds ?? []).filter((id) => validIds.has(id)));
  const normalizedContext = context.toLocaleLowerCase();
  return candidates.filter((candidate) => selectedIds.has(candidate.id)
    || candidate.triggers.some((trigger) => phraseMatches(normalizedContext, trigger))
    || phraseMatches(normalizedContext, candidate.exactToolName ?? candidate.name));
}

export function serverForTool(catalog: ToolCatalog, toolId: string): McpServer | undefined {
  const parts = toolId.split(":");
  if (parts.length !== 3 || parts[0] !== "mcp") return undefined;
  return catalog.mcpServers.find((server) => server.id === parts[1] && server.enabled && server.tools.some((tool) => tool.id === parts[2]));
}
