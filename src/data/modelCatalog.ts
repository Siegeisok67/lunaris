export interface ModelRecommendation {
  model: string;
  role: "Architect" | "Executor";
  description: string;
  capabilities: string[];
  estimatedVramGb: number;
  storageGb?: number;
  downloadable?: boolean;
}

export const MODEL_CATALOG: ModelRecommendation[] = [
  { model: "qwen2.5:1.5b", role: "Architect", description: "Lightweight request analysis and clarification.", capabilities: ["reasoning", "tool context"], estimatedVramGb: 2 },
  { model: "qwen2.5-coder:7b", role: "Executor", description: "Code-focused planning and implementation.", capabilities: ["coding", "reasoning"], estimatedVramGb: 7 },
  { model: "qwen3-vl:8b", role: "Executor", description: "Image understanding alongside code and tool instructions.", capabilities: ["vision", "coding", "tool context"], estimatedVramGb: 9 },
];

// Approximate Q4 downloads from the Ollama library. Actual tag sizes and
// runtime VRAM vary with quantization, context, and backend settings.
export const OLLAMA_INSTALL_CATALOG: ModelRecommendation[] = [
  { model: "qwen2.5:1.5b", role: "Architect", description: "Small, quick model for clarification and prompt planning.", capabilities: ["reasoning", "tool use"], estimatedVramGb: 2, storageGb: 1.1, downloadable: true },
  { model: "llama3.2:3b", role: "Architect", description: "Compact general assistant for fast local analysis.", capabilities: ["reasoning", "tool use"], estimatedVramGb: 3, storageGb: 2, downloadable: true },
  { model: "qwen3:4b", role: "Architect", description: "Balanced small model for reasoning and tool instructions.", capabilities: ["reasoning", "tool use"], estimatedVramGb: 4, storageGb: 2.6, downloadable: true },
  { model: "gemma3:4b", role: "Architect", description: "Compact multimodal model for text and reference images.", capabilities: ["vision", "reasoning"], estimatedVramGb: 5, storageGb: 3.3, downloadable: true },
  { model: "qwen3:8b", role: "Architect", description: "Stronger reasoning for detailed plans and structured work.", capabilities: ["reasoning", "coding", "tool use"], estimatedVramGb: 7, storageGb: 5.2, downloadable: true },
  { model: "qwen2.5-coder:7b", role: "Executor", description: "Code-focused implementation model for local execution.", capabilities: ["coding", "reasoning", "tool use"], estimatedVramGb: 7, storageGb: 4.7, downloadable: true },
  { model: "qwen3-vl:8b", role: "Executor", description: "Vision-capable model for reference images, coding, and tool steps.", capabilities: ["vision", "coding", "reasoning", "tool use"], estimatedVramGb: 10, storageGb: 6.1, downloadable: true },
  { model: "llava:7b", role: "Executor", description: "Image and screenshot understanding with general chat.", capabilities: ["vision", "reasoning"], estimatedVramGb: 7, storageGb: 4.7, downloadable: true },
  { model: "deepseek-r1:8b", role: "Executor", description: "Reasoning-focused model for multi-step work.", capabilities: ["reasoning", "coding"], estimatedVramGb: 7, storageGb: 5.2, downloadable: true },
  { model: "gemma3:12b", role: "Executor", description: "Multimodal assistant with image input and stronger general reasoning.", capabilities: ["vision", "reasoning", "coding"], estimatedVramGb: 11, storageGb: 8.1, downloadable: true },
  { model: "qwen2.5-coder:14b", role: "Executor", description: "Larger coding model for complex implementation tasks.", capabilities: ["coding", "reasoning", "tool use"], estimatedVramGb: 12, storageGb: 9, downloadable: true },
  { model: "deepseek-r1:14b", role: "Executor", description: "Larger reasoning model for complex planning and code review.", capabilities: ["reasoning", "coding"], estimatedVramGb: 12, storageGb: 9, downloadable: true },
];

export function modelCapabilities(model: string): string[] {
  const value = model.toLowerCase();
  return [
    ...(value.includes("vl") || value.includes("vision") || value.includes("llava") ? ["vision"] : []),
    ...(value.includes("coder") || value.includes("code") || value.includes("starcoder") ? ["coding"] : []),
    ...(value.includes("r1") || value.includes("reason") || value.includes("qwen") ? ["reasoning"] : []),
    ...(value.includes("tools") || value.includes("qwen") || value.includes("gpt") || value.includes("claude") ? ["tool use"] : []),
  ];
}
