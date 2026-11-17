import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ResourceSnapshot } from "../types/provider";

export function useSystemResources(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timeout = 0;
    const sample = async () => {
      if (document.visibilityState === "visible") {
        try {
          const next = await invoke<ResourceSnapshot>("system_resource_snapshot");
          if (active) { setSnapshot(next); setError(null); }
        } catch (caught) {
          if (active) setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
      if (active) timeout = window.setTimeout(() => void sample(), 5000);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timeout);
        void sample();
      }
    };
    void sample();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearTimeout(timeout); document.removeEventListener("visibilitychange", onVisibility); };
  }, [enabled, refreshKey]);

  return { snapshot, error, refresh: () => setRefreshKey((key) => key + 1) };
}
