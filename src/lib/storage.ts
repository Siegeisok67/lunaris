import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_SKILLS, defaultSkillFiles } from "../data/defaultSkills";
import { DEFAULT_PROVIDER_SETTINGS, type AppTheme, type BackgroundMotion, type BackgroundScene, type ProviderSettings } from "../types/provider";
import type { PromptSession } from "../types/architect";
import type { SkillDefinition, SkillFile } from "../types/skills";
import { EMPTY_TOOL_CATALOG, type ToolCatalog } from "../types/tools";
import { EMPTY_MEMORY, type MemoryCollection } from "../types/memory";
import { normalizeMemory } from "./memory";

export interface LunarisSettings {
  providers: ProviderSettings;
  selectedNavigation: "forge" | "skills" | "settings" | "models" | "tools" | "history";
  toolCatalog: ToolCatalog;
  theme: AppTheme;
  monitorResources: boolean;
  modelPreference: "balanced" | "specialists";
  backgroundScene: BackgroundScene;
  backgroundIntensity: number;
  backgroundMotion: BackgroundMotion;
}

export interface HistoryCollection {
  sessions: PromptSession[];
}

const DEFAULT_SETTINGS: LunarisSettings = {
  providers: DEFAULT_PROVIDER_SETTINGS,
  selectedNavigation: "forge",
  toolCatalog: EMPTY_TOOL_CATALOG,
  theme: "lunar",
  monitorResources: true,
  modelPreference: "balanced",
  backgroundScene: "moonlit",
  backgroundIntensity: 70,
  backgroundMotion: "system",
};

const DEFAULT_HISTORY: HistoryCollection = { sessions: [] };

export async function loadSettings(): Promise<LunarisSettings> {
  const stored = await invoke<LunarisSettings | null>("storage_read", { key: "settings" });
  if (!stored || typeof stored !== "object") return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    providers: {
      ...DEFAULT_PROVIDER_SETTINGS,
      ...stored.providers,
      architect: { ...DEFAULT_PROVIDER_SETTINGS.architect, ...stored.providers?.architect },
      executor: { ...DEFAULT_PROVIDER_SETTINGS.executor, ...stored.providers?.executor },
    },
    toolCatalog: {
      applications: Array.isArray(stored.toolCatalog?.applications) ? stored.toolCatalog.applications : [],
      mcpServers: Array.isArray(stored.toolCatalog?.mcpServers) ? stored.toolCatalog.mcpServers : [],
    },
    theme: (["lunar", "aurora", "violet", "ember", "rose", "glacier", "cosmos"].includes(stored.theme) ? stored.theme : "lunar") as AppTheme,
    monitorResources: typeof stored.monitorResources === "boolean" ? stored.monitorResources : true,
    modelPreference: stored.modelPreference === "specialists" ? "specialists" : "balanced",
    backgroundScene: (["moonlit", "aurora", "nebula", "meteor", "eclipse", "quiet"].includes(stored.backgroundScene) ? stored.backgroundScene : "moonlit") as BackgroundScene,
    backgroundIntensity: typeof stored.backgroundIntensity === "number" ? Math.max(0, Math.min(100, stored.backgroundIntensity)) : 70,
    backgroundMotion: (["system", "reduced", "still"].includes(stored.backgroundMotion) ? stored.backgroundMotion : "system") as BackgroundMotion,
  };
}

export async function saveSettings(settings: LunarisSettings): Promise<void> {
  await invoke("storage_write", { key: "settings", value: settings });
}

export async function loadHistory(): Promise<HistoryCollection> {
  const stored = await invoke<HistoryCollection | null>("storage_read", { key: "history" });
  if (!stored || !Array.isArray(stored.sessions)) return DEFAULT_HISTORY;
  return { sessions: stored.sessions.slice(0, 250) };
}

export async function saveHistory(history: HistoryCollection): Promise<void> {
  await invoke("storage_write", { key: "history", value: { sessions: history.sessions.slice(0, 250) } });
}

export async function loadMemory(): Promise<MemoryCollection> {
  const stored = await invoke<MemoryCollection | null>("storage_read", { key: "memory" });
  return normalizeMemory(stored ?? EMPTY_MEMORY);
}

export async function saveMemory(memory: MemoryCollection): Promise<void> {
  await invoke("storage_write", { key: "memory", value: normalizeMemory(memory) });
}

export async function listSkillFiles(): Promise<SkillFile[]> {
  const ids = await invoke<string[]>("skills_list");
  const results = await Promise.all(ids.map(async (id) => invoke<SkillFile | null>("skills_read", { id })));
  return results.filter((skill): skill is SkillFile => skill !== null);
}

export async function saveSkillFile(skill: SkillFile): Promise<void> {
  await invoke("skills_write", { id: skill.id, content: skill.content });
}

export async function deleteSkillFile(id: string): Promise<void> {
  await invoke("skills_delete", { id });
}

export async function seedSkillsIfEmpty(): Promise<void> {
  await invoke<boolean>("skills_seed_if_empty", { skills: defaultSkillFiles() });
}

export async function loadSkills(): Promise<SkillDefinition[]> {
  await seedSkillsIfEmpty();
  const files = await listSkillFiles();
  const builtinsById = new Map(DEFAULT_SKILLS.map((skill) => [skill.id, skill]));
  const skills = files.map((file) => {
    const builtin = builtinsById.get(file.id);
    const { metadata, body } = unpackSkill(file.content);
    if (builtin) return { ...builtin, ...metadata, content: body, builtIn: true };
    const title = metadata.name || body.split(/\r?\n/, 1)[0]?.replace(/^#\s*/, "").trim() || file.id;
    return {
      id: file.id,
      name: title,
      description: metadata.description || "Custom skill loaded from your local library.",
      category: metadata.category || "workflow" as const,
      triggers: metadata.triggers || [],
      content: body,
      builtIn: false,
    };
  });
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export function toSkillFile(skill: SkillDefinition): SkillFile {
  const metadata = {
    name: skill.name,
    description: skill.description,
    category: skill.category,
    triggers: skill.triggers,
  };
  return { id: skill.id, content: `---\nlunaris: ${JSON.stringify(metadata)}\n---\n\n${skill.content.trim()}\n` };
}

function unpackSkill(content: string): { metadata: Partial<SkillDefinition>; body: string } {
  const match = /^---\s*\r?\nlunaris:\s*(\{[^\r\n]*\})\s*\r?\n---\s*\r?\n?([\s\S]*)$/m.exec(content);
  if (!match) return { metadata: {}, body: content };
  try {
    const raw = JSON.parse(match[1]) as Partial<SkillDefinition>;
    const categories = ["frontend", "backend", "creative", "workflow"] as const;
    return {
      metadata: {
        ...(typeof raw.name === "string" ? { name: raw.name } : {}),
        ...(typeof raw.description === "string" ? { description: raw.description } : {}),
        ...(categories.includes(raw.category as (typeof categories)[number]) ? { category: raw.category } : {}),
        ...(Array.isArray(raw.triggers) ? { triggers: raw.triggers.filter((value): value is string => typeof value === "string") } : {}),
      },
      body: match[2].trim(),
    };
  } catch {
    return { metadata: {}, body: content };
  }
}

export async function saveProviderSecret(role: "architect" | "executor", provider: string, secret: string): Promise<void> {
  await invoke("provider_set_secret", { role, provider, secret });
}

export async function providerSecretExists(role: "architect" | "executor", provider: string): Promise<boolean> {
  const status = await invoke<{ exists: boolean }>("provider_secret_exists", { role, provider });
  return status.exists;
}

export async function deleteProviderSecret(role: "architect" | "executor", provider: string): Promise<void> {
  await invoke("provider_delete_secret", { role, provider });
}
