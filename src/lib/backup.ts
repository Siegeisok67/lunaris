import type { BackupBundle } from "../types/backup";
import type { HistoryCollection, LunarisSettings } from "./storage";
import { normalizeHistoryCollection, normalizeSettings } from "./storage";
import type { MemoryCollection } from "../types/memory";
import { normalizeMemory } from "./memory";
import type { SkillFile } from "../types/skills";

const MAX_BACKUP_CHARS = 64 * 1024 * 1024;
const SECRET_FIELD = /(?:api[_-]?key|password|passwd|secret|access[_-]?token|refresh[_-]?token|authorization)/i;

function scrubText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}=?/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g, "[REDACTED]")
    .replace(/(https?:\/\/[^\s/:@]+):[^\s/@]+@/gi, "$1:[REDACTED]@")
    .replace(/((?:api[_-]?key|password|passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]\s*)(["']?)[^\s,;&"']+/gi, "$1$2[REDACTED]");
}

function scrubSecrets(value: unknown): unknown {
  if (typeof value === "string") return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !SECRET_FIELD.test(key))
    .map(([key, item]) => [key, scrubSecrets(item)]));
}

export function createBackup(settings: LunarisSettings, history: HistoryCollection, memory: MemoryCollection, skills: SkillFile[]): BackupBundle {
  return scrubSecrets({
    format: "lunaris-backup",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    settings,
    history,
    memory,
    skills,
  }) as BackupBundle;
}

export function parseBackup(text: string): BackupBundle {
  if (text.length > MAX_BACKUP_CHARS) throw new Error("Backup files must be smaller than 64 MB.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This file is not valid JSON."); }
  if (!raw || typeof raw !== "object") throw new Error("This file is not a Lunaris backup.");
  const value = raw as Record<string, unknown>;
  if (value.format !== "lunaris-backup" || value.schemaVersion !== 1) throw new Error("This Lunaris backup version is not supported.");
  if (!value.settings || typeof value.settings !== "object" || !value.history || typeof value.history !== "object" || !value.memory || typeof value.memory !== "object" || !Array.isArray(value.skills)) throw new Error("The backup is missing one or more required collections.");
  const history = value.history as { sessions?: unknown };
  if (!Array.isArray(history.sessions) || history.sessions.length > 250 || value.skills.length > 500) throw new Error("The backup exceeds the session or skill limits.");
  const sanitized = scrubSecrets(value) as Record<string, unknown>;
  const skills = (sanitized.skills as unknown[]).flatMap((item): SkillFile[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(candidate.id) || typeof candidate.content !== "string" || candidate.content.length > 512 * 1024) return [];
    return [{ id: candidate.id, content: candidate.content }];
  });
  const ids = new Set<string>();
  for (const skill of skills) {
    if (ids.has(skill.id)) throw new Error("The backup contains duplicate skill IDs.");
    ids.add(skill.id);
  }
  return {
    format: "lunaris-backup",
    schemaVersion: 1,
    exportedAt: typeof sanitized.exportedAt === "string" ? sanitized.exportedAt : "",
    settings: normalizeSettings(sanitized.settings) as LunarisSettings,
    history: normalizeHistoryCollection(sanitized.history),
    memory: normalizeMemory(sanitized.memory),
    skills,
  };
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[], limit: number): T[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()].slice(-limit);
}

export interface RestoredBackup {
  settings: LunarisSettings;
  history: HistoryCollection;
  memory: MemoryCollection;
  skills: SkillFile[];
}

export function mergeBackup(current: RestoredBackup, imported: BackupBundle): RestoredBackup {
  const applications = mergeById(current.settings.toolCatalog.applications, imported.settings.toolCatalog.applications, 500);
  const mcpServers = mergeById(current.settings.toolCatalog.mcpServers, imported.settings.toolCatalog.mcpServers, 300);
  const customPromptTemplates = mergeById(current.settings.customPromptTemplates, imported.settings.customPromptTemplates, 100);
  const settings: LunarisSettings = {
    ...current.settings,
    ...imported.settings,
    toolCatalog: { applications, mcpServers },
    customPromptTemplates,
  };
  const sessions = mergeById(current.history.sessions, imported.history.sessions, 250)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const projects = mergeById(current.memory.projects, imported.memory.projects, 20);
  const entries = mergeById(current.memory.entries, imported.memory.entries, 80);
  const memory: MemoryCollection = { enabledByDefault: imported.memory.enabledByDefault, projects, entries };
  const skills = mergeById(current.skills, imported.skills, 500);
  return { settings, history: { sessions }, memory, skills };
}
