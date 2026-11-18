import type { HistoryCollection, LunarisSettings } from "../lib/storage";
import type { MemoryCollection } from "./memory";
import type { SkillFile } from "./skills";

export interface BackupBundle {
  format: "lunaris-backup";
  schemaVersion: 1;
  exportedAt: string;
  settings: LunarisSettings;
  history: HistoryCollection;
  memory: MemoryCollection;
  skills: SkillFile[];
}
