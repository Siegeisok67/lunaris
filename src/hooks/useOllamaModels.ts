import { useCallback, useEffect, useState } from "react";
import { discoverOllamaModels } from "../lib/llmRouter";
import type { OllamaModel, ProviderConfig } from "../types/provider";

export function useOllamaModels(config: ProviderConfig) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await discoverOllamaModels(config.baseUrl));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [config.baseUrl]);

  useEffect(() => {
    if (config.provider === "ollama") void refresh();
  }, [config.provider, refresh]);

  return { models, loading, error, refresh };
}
