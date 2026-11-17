export type McpConnectionKind = "stdio" | "url";

export interface LocalApplication {
  id: string;
  name: string;
  executablePath: string;
  description: string;
  triggers: string[];
  usageNotes: string;
  enabled: boolean;
}

export interface McpTool {
  id: string;
  name: string;
  description: string;
  usageNotes: string;
  triggers: string[];
}

export interface McpServer {
  id: string;
  name: string;
  connectionKind: McpConnectionKind;
  commandOrUrl: string;
  args: string[];
  description: string;
  triggers: string[];
  usageNotes: string;
  tools: McpTool[];
  enabled: boolean;
}

export interface ToolCatalog {
  applications: LocalApplication[];
  mcpServers: McpServer[];
}

export const EMPTY_TOOL_CATALOG: ToolCatalog = {
  applications: [],
  mcpServers: [],
};
