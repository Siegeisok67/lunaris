import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ArchitectResult, ReferenceImage } from "../types/architect";
import type {
  ChatMessage,
  OllamaModel,
  ProviderConfig,
  ProviderId,
  ProviderRequestOptions,
  ProviderRole,
  ProviderStreamEvent,
} from "../types/provider";
import { parseArchitectResult } from "./jsonRepair";

interface RustProviderRequest {
  requestId?: string;
  role: ProviderRole;
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  payload: Record<string, unknown>;
}

const STREAM_EVENT = "lunaris://provider-stream";
const visionCapabilityCache = new Map<string, boolean>();

const ARCHITECT_JSON_SCHEMA = {
  type: "object",
  properties: {
    known_specs: {
      type: "object",
      additionalProperties: {
        anyOf: [
          { type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" },
          { type: "array", items: { type: "string" } },
        ],
      },
    },
    assumptions: { type: "array", items: { type: "string" }, maxItems: 10 },
    detected_skills: { type: "array", items: { type: "string" }, maxItems: 40 },
    detected_tools: { type: "array", items: { type: "string" }, maxItems: 80 },
    executor_recommendation: {
      anyOf: [
        { type: "null" },
        { type: "object", properties: { model: { type: "string" }, rationale: { type: "string" }, capabilities: { type: "array", items: { type: "string" }, maxItems: 6 } }, required: ["model", "rationale", "capabilities"], additionalProperties: false },
      ],
    },
    context_recommendation: {
      anyOf: [
        { type: "null" },
        { type: "object", properties: { architect_tokens: { type: "integer", minimum: 4096, maximum: 131072 }, executor_tokens: { type: "integer", minimum: 4096, maximum: 131072 }, rationale: { type: "string" } }, required: ["architect_tokens", "executor_tokens", "rationale"], additionalProperties: false },
      ],
    },
    is_ready_to_execute: { type: "boolean" },
    next_questions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          options: { type: "array", items: { type: "string" }, maxItems: 8 },
        },
        required: ["id", "question"],
        additionalProperties: false,
      },
    },
    final_execution_prompt: { type: "string" },
    workflow_stages: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          goal: { type: "string" },
          deliverable: { type: "string" },
          verification: { type: "string" },
        },
        required: ["id", "title", "goal", "deliverable", "verification"],
        additionalProperties: false,
      },
    },
  },
  required: ["known_specs", "assumptions", "detected_skills", "detected_tools", "executor_recommendation", "context_recommendation", "is_ready_to_execute", "next_questions", "final_execution_prompt"],
  additionalProperties: false,
};

function knownVisionModelName(model: string): boolean {
  return /(?:qwen[0-9.]*-?vl|llava|vision|moondream|minicpm-v|gemma3)/i.test(model);
}

async function ollamaSupportsImages(config: ProviderConfig): Promise<boolean | null> {
  const model = config.model.trim();
  const cacheKey = `${config.baseUrl.trim()}|${model}`.toLowerCase();
  const cached = visionCapabilityCache.get(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const capabilities = await invoke<string[]>("ollama_model_capabilities", {
      baseUrl: config.baseUrl,
      model,
    });
    const supportsImages = capabilities.some((capability) => capability.toLowerCase() === "vision")
      || (capabilities.length === 0 && knownVisionModelName(model));
    visionCapabilityCache.set(cacheKey, supportsImages);
    return supportsImages;
  } catch {
    return null;
  }
}

export async function architectCanSeeImages(config: ProviderConfig, images: ReferenceImage[]): Promise<boolean> {
  if (!images.length || !config.visionEnabled) return false;
  if (config.provider !== "ollama") return true;
  return (await ollamaSupportsImages(config)) === true;
}

async function assertImageCapability(options: ProviderRequestOptions): Promise<void> {
  if (!options.config.visionEnabled || !options.images?.length || options.config.provider !== "ollama") return;
  const supportsImages = await ollamaSupportsImages(options.config);
  if (supportsImages === true) return;
  const model = options.config.model.trim();
  const roleName = options.role === "architect" ? "Architect" : "Executor";
  if (supportsImages === false) {
    throw new Error(`Ollama ${roleName} model “${model}” does not support images. Choose a vision-capable model such as qwen3-vl, or disable image input for this request.`);
  }
  throw new Error(`Lunaris couldn't verify image support for Ollama ${roleName} model “${model}”. Check that Ollama is running and the model is installed, then retry.`);
}

function dataUrl(image: ReferenceImage): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}

function adaptMessages(provider: ProviderId, messages: ChatMessage[], images: ReferenceImage[] = []): ChatMessage[] {
  const copied = messages.map((message) => ({ ...message }));
  if (images.length === 0) return copied;
  const lastUser = copied.map((message) => message.role).lastIndexOf("user");
  if (lastUser < 0) return copied;
  const message = copied[lastUser];
  if (provider === "ollama") {
    const content = typeof message.content === "string" ? message.content : "";
    copied[lastUser] = { ...message, content, images: images.map((image) => image.base64) };
  } else if (provider === "anthropic") {
    const prior = Array.isArray(message.content) ? message.content : [{ type: "text", text: String(message.content) }];
    copied[lastUser] = {
      ...message,
      content: [
        ...prior,
        ...images.map((image) => ({
          type: "image",
          source: { type: "base64", media_type: image.mimeType, data: image.base64 },
        })),
      ],
    };
  } else {
    const prior = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
    copied[lastUser] = {
      ...message,
      content: [
        ...prior,
        ...images.map((image) => ({ type: "image_url", image_url: { url: dataUrl(image) } })),
      ],
    };
  }
  return copied;
}

function makeRequest(options: ProviderRequestOptions, requestId?: string): RustProviderRequest {
  const provider = options.config.provider;
  const messages = adaptMessages(provider, options.messages, options.config.visionEnabled ? options.images : []);
  const systemMessages = provider === "anthropic" ? messages.filter((message) => message.role === "system") : [];
  const providerMessages = provider === "anthropic" ? messages.filter((message) => message.role !== "system") : messages;
  const payload: Record<string, unknown> = {
    messages: providerMessages,
    temperature: options.temperature ?? options.config.temperature,
  };
  if (provider === "ollama") payload.num_ctx = options.config.contextLength;
  if (systemMessages.length > 0) {
    payload.system = systemMessages
      .map((message) => typeof message.content === "string" ? message.content : JSON.stringify(message.content))
      .join("\n\n");
  }
  if (options.maxTokens) payload.max_tokens = options.maxTokens;
  if (options.jsonMode && provider !== "ollama") payload.response_format = { type: "json_object" };
  if (options.jsonMode && provider === "ollama") payload.format = ARCHITECT_JSON_SCHEMA;
  return {
    ...(requestId ? { requestId } : {}),
    role: options.role,
    provider,
    model: options.config.model,
    baseUrl: options.config.baseUrl,
    payload,
  };
}

function extractContent(provider: ProviderId, response: unknown): string {
  if (typeof response !== "object" || response === null) throw new Error("Provider returned an unexpected response.");
  const value = response as Record<string, unknown>;
  if (provider === "ollama") {
    const message = value.message as Record<string, unknown> | undefined;
    return typeof message?.content === "string" ? message.content : typeof value.response === "string" ? value.response : "";
  }
  if (provider === "anthropic") {
    const content = Array.isArray(value.content) ? value.content : [];
    return content.map((part) => (part as Record<string, unknown>).text).filter((text): text is string => typeof text === "string").join("");
  }
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const choice = choices[0] as Record<string, unknown> | undefined;
  const message = (choice?.message ?? choice?.delta) as Record<string, unknown> | undefined;
  return typeof message?.content === "string" ? message.content : "";
}

export async function completeText(options: ProviderRequestOptions): Promise<string> {
  await assertImageCapability(options);
  const response = await invoke<unknown>("provider_complete", { request: makeRequest(options) });
  return extractContent(options.config.provider, response);
}

export async function evaluateArchitect(options: Omit<ProviderRequestOptions, "jsonMode">): Promise<ArchitectResult> {
  const text = await completeText({ ...options, jsonMode: true, maxTokens: 1800 });
  return parseArchitectResult(text);
}

function extractDeltas(provider: ProviderId, block: string): string[] {
  const output: string[] = [];
  if (provider === "ollama") {
    for (const line of block.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as Record<string, unknown>;
        const message = event.message as Record<string, unknown> | undefined;
        const text = typeof message?.content === "string" ? message.content : event.response;
        if (typeof text === "string" && text) output.push(text);
      } catch {
        continue;
      }
    }
    return output;
  }

  for (const part of block.split(/\r?\n/)) {
    const line = part.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as Record<string, unknown>;
      if (provider === "anthropic") {
        const delta = event.delta as Record<string, unknown> | undefined;
        if (typeof delta?.text === "string") output.push(delta.text);
      } else {
        const choices = Array.isArray(event.choices) ? event.choices : [];
        const choice = choices[0] as Record<string, unknown> | undefined;
        const delta = choice?.delta as Record<string, unknown> | undefined;
        if (typeof delta?.content === "string") output.push(delta.content);
      }
    } catch {
      continue;
    }
  }
  return output;
}

export async function streamText(
  options: ProviderRequestOptions,
  onDelta: (text: string) => void,
  onRequestId?: (requestId: string) => void,
): Promise<{ requestId: string; text: string }> {
  await assertImageCapability(options);
  const requestId = crypto.randomUUID();
  onRequestId?.(requestId);
  let rawBuffer = "";
  let text = "";
  let streamFailure: Error | null = null;
  let cancelled = false;
  const provider = options.config.provider;
  const unlisten = await listen<ProviderStreamEvent>(STREAM_EVENT, (event) => {
    const payload = event.payload;
    if (payload.requestId !== requestId) return;
    if (payload.kind === "chunk" && payload.chunk) {
      rawBuffer += payload.chunk;
      if (provider === "ollama") {
        const lines = rawBuffer.split(/\r?\n/);
        rawBuffer = lines.pop() ?? "";
        for (const delta of extractDeltas(provider, lines.join("\n"))) {
          text += delta;
          onDelta(delta);
        }
      } else {
        const blocks = rawBuffer.split(/\r?\n\r?\n/);
        rawBuffer = blocks.pop() ?? "";
        for (const delta of extractDeltas(provider, blocks.join("\n\n"))) {
          text += delta;
          onDelta(delta);
        }
      }
    } else if (payload.kind === "error") {
      streamFailure = new Error(payload.message || "The provider stream failed.");
    } else if (payload.kind === "cancelled") {
      cancelled = true;
    }
  });

  try {
    await invoke("provider_stream", { request: makeRequest(options, requestId) });
    if (rawBuffer) {
      for (const delta of extractDeltas(provider, rawBuffer)) {
        text += delta;
        onDelta(delta);
      }
    }
    if (streamFailure) throw streamFailure;
    if (cancelled) throw new DOMException("The response was cancelled.", "AbortError");
    return { requestId, text };
  } finally {
    unlisten();
  }
}

export async function cancelStream(requestId: string): Promise<boolean> {
  return invoke<boolean>("cancel_provider_request", { requestId });
}

export async function discoverOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  return invoke<OllamaModel[]>("ollama_list_models", { baseUrl });
}

export function supportsVision(config: ProviderConfig): boolean {
  return config.visionEnabled && config.model.trim().length > 0;
}
