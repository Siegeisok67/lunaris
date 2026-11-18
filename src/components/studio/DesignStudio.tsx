import { useEffect, useState } from "react";
import { Check, Clipboard, Code2, FlaskConical, Layers3, Play, RefreshCw, Sparkles } from "lucide-react";
import type { ExecutorTurn, PromptSession, WorkflowStage, WorkflowStageProgress, WorkflowStageStatus } from "../../types/architect";
import type { ExecutorMode } from "../../types/provider";
import { ExecutorConversation } from "./ExecutorConversation";
import { RevisionHistory } from "./RevisionHistory";

interface DesignStudioProps {
  session: PromptSession | null;
  stages: WorkflowStage[];
  progress: WorkflowStageProgress[];
  activeStageId: string | null;
  compiledPrompt: string;
  mode: ExecutorMode;
  model: string;
  turns: ExecutorTurn[];
  streamingText: string;
  streaming: boolean;
  error: string | null;
  onSelectStage: (id: string) => void;
  onRunStage: (stage: WorkflowStage) => void;
  onCopyStage: (stage: WorkflowStage) => void;
  onSetStageStatus: (stageId: string, status: WorkflowStageStatus, evidence: string) => void;
  onFollowUp: (message: string) => void;
  onCopyFollowUp: (message: string) => void;
  onRecordReply: (message: string) => void;
  onSaveRevision: (text: string, reason: string) => void;
  onRestoreRevision: (revision: import("../../types/architect").BlueprintRevision) => void;
  onOpenBlueprint: () => void;
}

const statusLabel: Record<WorkflowStageStatus, string> = { pending: "UP NEXT", in_progress: "IN PROGRESS", needs_changes: "NEEDS CHANGES", verified: "VERIFIED BY YOU" };

export function DesignStudio({ session, stages, progress, activeStageId, compiledPrompt, mode, model, turns, streamingText, streaming, error, onSelectStage, onRunStage, onCopyStage, onSetStageStatus, onFollowUp, onCopyFollowUp, onRecordReply, onSaveRevision, onRestoreRevision, onOpenBlueprint }: DesignStudioProps) {
  const activeStage = stages.find((stage) => stage.id === activeStageId) ?? stages[0];
  const stageProgress = (id: string) => progress.find((item) => item.stageId === id) ?? { stageId: id, status: "pending" as const, evidence: "", updatedAt: "" };
  const verifiedCount = progress.filter((item) => item.status === "verified" && stages.some((stage) => stage.id === item.stageId)).length;
  const [evidence, setEvidence] = useState("");
  useEffect(() => { setEvidence(activeStage ? stageProgress(activeStage.id).evidence : ""); }, [activeStage?.id, progress]);

  if (!session || !stages.length) return <main className="design-studio-page"><div className="studio-empty glass-card"><div className="studio-hero-mark"><Layers3 size={24} /></div><span className="settings-eyebrow">BUILD IN REVIEWABLE STEPS</span><h1>Design Studio</h1><p>Start an app or software request in Prompt Forge. Lunaris will shape it into a first draft, verification, feature expansion, and polish stages.</p><button className="primary-button" onClick={onOpenBlueprint}><Code2 size={14} /> Open current blueprint</button></div></main>;

  return (
    <main className="design-studio-page">
      <header className="studio-page-heading"><div><span className="settings-eyebrow">DESIGN · BUILD · VERIFY</span><h1>Design Studio</h1><p>{session.title} <span>·</span> {model || "Choose an Executor"}</p></div><button className="secondary-button" onClick={onOpenBlueprint}>View full blueprint</button></header>
      <section className="studio-progress glass-card"><div><span className="studio-panel-icon"><Sparkles size={16} /></span><div><span>PROJECT PATH</span><strong>{verifiedCount} of {stages.length} stages verified</strong></div><span className="studio-progress-percent">{Math.round(verifiedCount / stages.length * 100)}%</span></div><div className="studio-progress-track"><span style={{ width: `${verifiedCount / stages.length * 100}%` }} /></div><small>Each stage stays paused until you choose the next one. The Executor can report checks; you confirm when a result is verified.</small></section>
      <div className="studio-workspace">
        <aside className="studio-stage-list" aria-label="Build stages">
          <div className="studio-stage-list-heading"><span>STAGES</span><span>{stages.length}</span></div>
          {stages.map((stage, index) => {
            const status = stageProgress(stage.id).status;
            return <button key={stage.id} className={`studio-stage-select ${activeStage?.id === stage.id ? "active" : ""} ${status}`} aria-current={activeStage?.id === stage.id ? "step" : undefined} onClick={() => onSelectStage(stage.id)}><span className="studio-stage-index">{status === "verified" ? <Check size={13} /> : String(index + 1).padStart(2, "0")}</span><span><strong>{stage.title}</strong><small>{statusLabel[status]}</small></span></button>;
          })}
        </aside>
        {activeStage && <section className="studio-stage-detail glass-card">
          <div className="studio-stage-detail-top"><div><span className="settings-eyebrow">STAGE {String(stages.findIndex((stage) => stage.id === activeStage.id) + 1).padStart(2, "0")}</span><h2>{activeStage.title}</h2></div><span className={`studio-status-pill ${stageProgress(activeStage.id).status}`}>{statusLabel[stageProgress(activeStage.id).status]}</span></div>
          <div className="studio-stage-info-grid"><article><span><Code2 size={13} /> GOAL</span><p>{activeStage.goal}</p></article><article><span><Layers3 size={13} /> DELIVERABLE</span><p>{activeStage.deliverable}</p></article><article><span><FlaskConical size={13} /> TEST / VERIFY</span><p>{activeStage.verification}</p></article></div>
          <div className="studio-stage-actions"><button className="primary-button" disabled={!model || streaming} onClick={() => onRunStage(activeStage)}><Play size={14} fill="currentColor" /> Run this stage</button><button className="secondary-button" onClick={() => onCopyStage(activeStage)}><Clipboard size={14} /> Copy stage prompt</button></div>
          <div className="studio-evidence"><label><span>What did you test or observe?</span><textarea value={evidence} onChange={(event) => setEvidence(event.target.value.slice(0, 4000))} rows={3} placeholder="Add your test result, screenshot notes, or reason this stage needs changes…" /><small>Executor claims are recorded as notes. Marking a stage verified is your confirmation.</small></label><div><button className="secondary-button" onClick={() => onSetStageStatus(activeStage.id, "needs_changes", evidence)}><RefreshCw size={13} /> Needs changes</button><button className="primary-button" onClick={() => onSetStageStatus(activeStage.id, "verified", evidence)}><Check size={14} /> Mark verified</button></div></div>
        </section>}
      </div>
      <ExecutorConversation mode={mode} turns={turns} streamingText={streamingText} streaming={streaming} error={error} activeStageTitle={activeStage?.title ?? ""} onSend={onFollowUp} onCopy={onCopyFollowUp} onRecordReply={onRecordReply} />
      <RevisionHistory key={session.id} currentText={compiledPrompt} revisions={session.blueprintRevisions ?? []} onSave={onSaveRevision} onRestore={onRestoreRevision} />
      {compiledPrompt && <details className="studio-blueprint-source"><summary>View full master blueprint</summary><pre>{compiledPrompt}</pre></details>}
    </main>
  );
}
