export type SkillCategory = "frontend" | "backend" | "creative" | "workflow";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  triggers: string[];
  content: string;
  builtIn: boolean;
  updatedAt?: string;
}

export interface SkillMatch {
  skill: SkillDefinition;
  confidence: number;
  reason: string;
}

export interface SkillFile {
  id: string;
  content: string;
}
