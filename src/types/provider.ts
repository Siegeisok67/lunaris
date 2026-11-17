import type { ReferenceImage } from "./architect";

export type ProviderId = "ollama" | "llamacpp" | "openrouter" | "openai" | "anthropic" | "custom";
export type ProviderRole = "architect" | "executor";
export type ExecutorMode = "handoff" | "stream";
export type AppTheme = "lunar" | "aurora" | "violet" | "ember" | "rose" | "glacier" | "cosmos";
export type ContextMode = "auto" | "manual";

export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  visionEnabled: boolean;
  temperature: number;
  contextLength: number;
  contextMode: ContextMode;
  llamaServerPath: string;
  llamaModelPath: string;
  llamaPort: number;
  cacheTypeK: string;
  cacheTypeV: string;
}

export interface ResourceProcess {
  pid: number;
  name: string;
  ramBytes: number | null;
  vramBytes: number | null;
}

export interface ResourceSnapshot {
  sampledAt: string;
  ramTotalBytes: number | null;
  ramUsedBytes: number | null;
  gpuName: string | null;
  vramTotalBytes: number | null;
  vramUsedBytes: number | null;
  processes: ResourceProcess[];
  availability: { ram: string | null; gpu: string | null; processGpu: string | null };
}

export interface ProviderSettings {
  architect: ProviderConfig;
  executor: ProviderConfig;
  executorMode: ExecutorMode;
  globalShortcut: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
  images?: string[];
}

export interface ProviderRequestOptions {
  role: ProviderRole;
  config: ProviderConfig;
  messages: ChatMessage[];
  images?: ReferenceImage[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderStreamEvent {
  requestId: string;
  kind: "chunk" | "done" | "error" | "cancelled";
  chunk?: string;
  message?: string;
}

export interface OllamaModel {
  name: string;
  size?: number;
  modifiedAt?: string;
  details?: {
    family?: string;
    parameterSize?: string;
    quantizationLevel?: string;
  };
}

export interface ProviderModel {
  id: string;
  name?: string | null;
  description?: string | null;
  contextLength?: number | null;
  architecture?: {
    inputModalities?: string[];
    outputModalities?: string[];
  } | null;
  supportedParameters?: string[];
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  architect: {
    provider: "ollama",
    model: "qwen2.5:1.5b",
    baseUrl: "http://localhost:11434",
    visionEnabled: false,
    temperature: 0.25,
    contextLength: 8192,
    contextMode: "auto",
    llamaServerPath: "",
    llamaModelPath: "",
    llamaPort: 8081,
    cacheTypeK: "f16",
    cacheTypeV: "f16",
  },
  executor: {
    provider: "openrouter",
    model: "",
    baseUrl: "https://openrouter.ai/api/v1",
    visionEnabled: false,
    temperature: 0.35,
    contextLength: 8192,
    contextMode: "auto",
    llamaServerPath: "",
    llamaModelPath: "",
    llamaPort: 8082,
    cacheTypeK: "f16",
    cacheTypeV: "f16",
  },
  executorMode: "handoff",
  globalShortcut: "Alt+Space",
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  ollama: "Ollama",
  llamacpp: "llama.cpp (direct)",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  custom: "OpenAI Compatible",
};

export const DEFAULT_PROVIDER_URLS: Record<ProviderId, string> = {
  ollama: "http://localhost:11434",
  llamacpp: "http://127.0.0.1:8081/v1",
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  custom: "",
};
