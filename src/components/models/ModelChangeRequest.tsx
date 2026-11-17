import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, LoaderCircle, Moon, X } from "lucide-react";
import type { ProviderSettings } from "../../types/provider";

export interface ExecutorRecommendation {
  model: string;
  rationale: string;
  capabilities: string[];
}

interface ModelChangeRequestProps {
  recommendation: ExecutorRecommendation;
  currentModel: string;
  baseUrl: string;
  runtime: "ollama" | "custom";
  onAccept: (model: string, runtime: "ollama" | "custom", baseUrl: string) => void;
  onDismiss: () => void;
}

interface PullNotice { requestId: string; status: string; completed: number | null; total: number | null; message: string | null }

function bulbGraphic() {
  return <svg viewBox="0 0 48 56" role="img" aria-label="Glowing light bulb"><defs><linearGradient id="request-bulb" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f2ffff" stopOpacity=".92" /><stop offset=".5" stopColor="#9be7f5" stopOpacity=".42" /><stop offset="1" stopColor="#b6a0ff" stopOpacity=".6" /></linearGradient></defs><path d="M18 34c-.7-1.8-1.8-3.2-3-5a11.2 11.2 0 1 1 18-.4c-1.3 2-2.5 3.5-3.1 5.4H18Z" fill="url(#request-bulb)" stroke="#e0fdff" strokeWidth="1.5" /><path d="M19 37h10m-9 3.5h8m-6.5 3.3h5m-4.2 3h3.4M24 5V2M9.5 12 7 9.5M38.5 12 41 9.5M7 23H4m40 0h-3" fill="none" stroke="#c4c7ff" strokeWidth="1.4" strokeLinecap="round" /><path d="M21.5 25c1.3-2 2.3-3.7 2.5-6 .3 2.3 1.3 4 2.5 6-1.4-.5-3.6-.5-5 0Z" fill="#f2ffff" opacity=".82" /></svg>;
}

export function ModelChangeRequest({ recommendation, currentModel, baseUrl, runtime, onAccept, onDismiss }: ModelChangeRequestProps) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<PullNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declineStage, setDeclineStage] = useState<"flicker" | "moon" | null>(null);

  useEffect(() => {
    let active = true;
    const discover = runtime === "custom"
      ? invoke<Array<{ id: string }>>("custom_list_models", { role: "executor", baseUrl }).then((models) => models.map((model) => model.id))
      : invoke<Array<{ name: string }>>("ollama_list_models", { baseUrl }).then((models) => models.map((model) => model.name));
    void discover
      .then((models) => { if (active) setInstalled(models.includes(recommendation.model)); })
      .catch(() => { if (active) setInstalled(false); });
    return () => { active = false; };
  }, [baseUrl, recommendation.model, runtime]);

  const accept = async () => {
    setError(null);
    if (installed) { onAccept(recommendation.model, runtime, baseUrl); return; }
    if (runtime === "custom") { setError("This model is not listed by your custom endpoint. Load it on that server, then refresh its model list."); return; }
    setLoading(true);
    const requestId = crypto.randomUUID();
    try {
      const unlisten = await listen<PullNotice>("lunaris://ollama-pull", (event) => {
        if (event.payload.requestId !== requestId) return;
        setProgress(event.payload);
        if (event.payload.status === "error") setError(event.payload.message || "Model download failed.");
      });
      try {
        await invoke("ollama_pull_model", { baseUrl, model: recommendation.model, requestId });
        const models = await invoke<Array<{ name: string }>>("ollama_list_models", { baseUrl });
        if (!models.some((model) => model.name === recommendation.model)) throw new Error("The download finished, but Ollama did not list the model as installed.");
        onAccept(recommendation.model, runtime, baseUrl);
      } finally { unlisten(); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setLoading(false);
    }
  };

  const decline = () => {
    setDeclineStage("flicker");
    window.setTimeout(() => setDeclineStage("moon"), 330);
    window.setTimeout(onDismiss, 820);
  };

  const percent = progress?.total ? Math.min(100, ((progress.completed ?? 0) / progress.total) * 100) : 0;
  return <motion.div className="model-request-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .25 }}>
    <motion.section className="model-request-dialog" initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 7, scale: .98 }} transition={{ type: "spring", stiffness: 270, damping: 25 }} role="dialog" aria-modal="true" aria-labelledby="model-request-title">
      <div className="model-request-light"><div className="model-request-halo" />
        <AnimatePresence mode="wait">
          {declineStage === "moon" ? <motion.div key="moon" className="model-request-moon" initial={{ opacity: 0, scale: .5, rotate: -30 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}><Moon size={43} /></motion.div>
            : <motion.div key="bulb" className={`model-request-bulb ${loading ? "loading" : ""} ${declineStage === "flicker" ? "flickering" : ""}`} initial={{ opacity: 0, scale: .65, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .8 }}>{bulbGraphic()}<b>!</b></motion.div>}
        </AnimatePresence>
      </div>
      <span className="settings-eyebrow">ARCHITECT SUGGESTION</span>
      <h2 id="model-request-title">The Architect has a request</h2>
      <p>{recommendation.rationale}</p>
      <div className="model-request-swap"><div><small>CURRENT EXECUTOR</small><strong>{currentModel || "Not selected"}</strong></div><span>→</span><div><small>RECOMMENDED</small><strong>{recommendation.model}</strong></div></div>
      <div className="model-capabilities">{recommendation.capabilities.map((item) => <span className="model-capability" key={item}>{item}</span>)}</div>
      {loading && <div className="model-request-progress"><div><span>{progress?.status ?? "Starting download…"}</span><small>{progress?.total ? `${Math.round(percent)}%` : "Preparing"}</small></div><i><b style={{ width: `${percent}%` }} /></i></div>}
      {error && <p className="model-inline-error" role="alert">{error}</p>}
      <div className="model-request-actions"><button type="button" className="primary-button" onClick={() => void accept()} disabled={loading || installed === null || (runtime === "custom" && !installed)}>{loading ? <LoaderCircle className="spin" size={15} /> : installed ? <Check size={15} /> : <Download size={15} />}{loading ? "Installing model…" : installed ? "Switch Executor" : runtime === "custom" ? "Model not on server" : "Download & switch"}</button><button type="button" className="secondary-button" onClick={decline} disabled={loading}><X size={14} /> Keep current model</button></div>
      <small className="model-request-note">{runtime === "custom" ? "Custom server model availability and downloads are managed by your endpoint." : "Lunaris will only install or switch models after you approve."}</small>
    </motion.section>
  </motion.div>;
}
