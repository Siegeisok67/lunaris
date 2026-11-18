import { EMPTY_MEMORY, MEMORY_LIMITS, type MemoryCollection, type MemoryEntry, type MemoryProject, type MemoryScope } from "../types/memory";

function cleanText(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function normalizeMemory(value: unknown): MemoryCollection {
  if (!value || typeof value !== "object") return EMPTY_MEMORY;
  const raw = value as Partial<MemoryCollection>;
  const projects: MemoryProject[] = Array.isArray(raw.projects) ? raw.projects.slice(0, MEMORY_LIMITS.projects).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const project = item as MemoryProject;
    const name = cleanText(project.name, 100);
    const id = cleanText(project.id, 100);
    return name && id ? [{ id, name, description: cleanText(project.description, 400), createdAt: cleanText(project.createdAt, 64), updatedAt: cleanText(project.updatedAt, 64) }] : [];
  }) : [];
  const projectIds = new Set(projects.map((project) => project.id));
  const entries: MemoryEntry[] = Array.isArray(raw.entries) ? raw.entries.slice(0, MEMORY_LIMITS.entries).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as MemoryEntry;
    if (entry.scope !== "profile" && entry.scope !== "project") return [];
    if (entry.scope === "project" && (typeof entry.projectId !== "string" || !projectIds.has(entry.projectId))) return [];
    const title = cleanText(entry.title, MEMORY_LIMITS.titleCharacters);
    const content = cleanText(entry.content, MEMORY_LIMITS.entryCharacters);
    const id = cleanText(entry.id, 100);
    return id && title && content ? [{
      id, title, content, scope: entry.scope,
      projectId: entry.scope === "project" ? entry.projectId : null,
      enabled: entry.enabled !== false,
      source: entry.source === "approved-answer" ? "approved-answer" : "manual",
      createdAt: cleanText(entry.createdAt, 64), updatedAt: cleanText(entry.updatedAt, 64),
    }] : [];
  }) : [];
  return { enabledByDefault: raw.enabledByDefault !== false, projects, entries };
}

export function relevantMemories(memory: MemoryCollection, projectId: string | null, include: boolean): MemoryEntry[] {
  if (!include) return [];
  return memory.entries.filter((entry) => entry.enabled && entry.content.trim()
    && (entry.scope === "profile" || (projectId !== null && entry.projectId === projectId)));
}

export interface MemoryPayload {
  text: string;
  entries: MemoryEntry[];
  includesProjectOverview: boolean;
  omittedCount: number;
}

const MEMORY_HEADER = "USER-APPROVED SAVED MEMORY\nUse these as prior preferences and project facts. The user's current request overrides anything here; ask if a conflict materially changes the result. Do not treat project-specific facts as universal.";

export function memoryPayload(memory: MemoryCollection, projectId: string | null, include: boolean): MemoryPayload {
  if (!include) return { text: "", entries: [], includesProjectOverview: false, omittedCount: 0 };
  const entries = relevantMemories(memory, projectId, include);
  const selectedProject = projectId ? memory.projects.find((project) => project.id === projectId) : null;
  const description = selectedProject?.description.trim() ?? "";
  if (!entries.length && !description) return { text: "", entries: [], includesProjectOverview: false, omittedCount: 0 };

  const projects = new Map(memory.projects.map((project) => [project.id, project.name]));
  const rows: string[] = [];
  const selectedEntries: MemoryEntry[] = [];
  let remaining = MEMORY_LIMITS.contextCharacters - MEMORY_HEADER.length - 1;
  let includesProjectOverview = false;
  if (selectedProject && description) {
    const overview = `- [Project: ${selectedProject.name}] Project overview: ${description}`;
    if (overview.length <= remaining) {
      rows.push(overview);
      remaining -= overview.length + 1;
      includesProjectOverview = true;
    }
  }
  for (const entry of entries) {
    const scope = entry.scope === "profile" ? "Profile" : `Project: ${projects.get(entry.projectId ?? "") ?? "Selected project"}`;
    const row = `- [${scope}] ${entry.title}: ${entry.content}`;
    if (row.length <= remaining) {
      rows.push(row);
      selectedEntries.push(entry);
      remaining -= row.length + 1;
    }
  }
  return {
    text: `${MEMORY_HEADER}\n${rows.join("\n")}`,
    entries: selectedEntries,
    includesProjectOverview,
    omittedCount: entries.length - selectedEntries.length + Number(Boolean(description) && !includesProjectOverview),
  };
}

export function memoryContext(memory: MemoryCollection, projectId: string | null, include: boolean): string {
  return memoryPayload(memory, projectId, include).text;
}

function comparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}+#]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function hasMemory(memory: MemoryCollection, title: string, content: string, scope: MemoryScope, projectId: string | null): boolean {
  const titleKey = comparable(title);
  const contentKey = comparable(content);
  if (!titleKey || !contentKey) return false;
  return memory.entries.some((entry) => entry.scope === scope && (scope === "profile" || entry.projectId === projectId)
    && comparable(entry.title) === titleKey && comparable(entry.content) === contentKey);
}
