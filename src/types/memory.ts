export type MemoryScope = "profile" | "project";
export type MemorySource = "manual" | "approved-answer";

export interface MemoryProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  scope: MemoryScope;
  projectId: string | null;
  enabled: boolean;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryCollection {
  enabledByDefault: boolean;
  projects: MemoryProject[];
  entries: MemoryEntry[];
}

export const EMPTY_MEMORY: MemoryCollection = {
  enabledByDefault: true,
  projects: [],
  entries: [],
};

export const MEMORY_LIMITS = {
  entries: 80,
  projects: 20,
  contextCharacters: 12_000,
  titleCharacters: 120,
  entryCharacters: 2_000,
} as const;
