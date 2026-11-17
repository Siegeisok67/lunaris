import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  FileText,
  LoaderCircle,
  Play,
  Sparkles,
  Square,
} from "lucide-react";
import type { CompiledPrompt } from "../../lib/promptCompiler";
import type { ExecutorMode } from "../../types/provider";
import { GlassCard } from "../ui/GlassCard";

interface BlueprintViewerProps {
  compiled: CompiledPrompt;
  executorMode: ExecutorMode;
  executorModel: string;
  onCopy: () => void;
  onStream: () => void;
  onStop: () => void;
  streaming: boolean;
  executorText: string;
  streamError: string | null;
  onNewPrompt: () => void;
}

export function BlueprintViewer({
  compiled,
  executorMode,
  executorModel,
  onCopy,
  onStream,
  onStop,
  streaming,
  executorText,
  streamError,
  onNewPrompt,
}: BlueprintViewerProps) {
  const canStream = executorModel.trim().length > 0;
  const hasResponse = executorText.length > 0;

  return (
    <div className="blueprint-view">
      <header className="blueprint-heading">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="eyebrow"><span className="eyebrow-line" /> READY FOR WHAT'S NEXT <span className="eyebrow-line" /></div>
          <h1>Your execution <span>blueprint.</span></h1>
          <p>A focused plan with your decisions, assumptions, and the skill rules that apply.</p>
        </motion.div>
        <div className="blueprint-status"><Check size={14} aria-hidden="true" /> READY TO USE</div>
      </header>

      <div className="blueprint-metrics" aria-label="Blueprint summary">
        <GlassCard className="blueprint-metric" delay={0.04}>
          <span>PLAN LENGTH</span>
          <strong>{compiled.estimatedTokensAfter.toLocaleString()}</strong>
          <small>estimated tokens</small>
        </GlassCard>
        <GlassCard className="blueprint-metric" delay={0.09}>
          <span>MATCHED SKILLS</span>
          <strong>{compiled.activeSkills.length}</strong>
          <small>local rule {compiled.activeSkills.length === 1 ? "set" : "sets"} included</small>
        </GlassCard>
        <GlassCard className="blueprint-metric" delay={0.14}>
          <span>ASSUMPTIONS</span>
          <strong>{compiled.assumptions.length}</strong>
          <small>for your review</small>
        </GlassCard>
        <GlassCard className="blueprint-metric blueprint-savings-metric" delay={0.19}>
          <span>MODELED TOKEN SAVINGS</span>
          <strong>{compiled.estimatedTokensSaved.toLocaleString()}</strong>
          <small>Potential executor tokens avoided if two revision passes are prevented.</small>
        </GlassCard>
      </div>

      <div className="blueprint-layout">
        <main className="blueprint-main">
          <GlassCard className="blueprint-prompt-card" delay={0.18}>
            <div className="blueprint-card-heading">
              <div className="blueprint-card-title"><FileText size={17} aria-hidden="true" /><div><span>MASTER PROMPT</span><h2>Ready for your execution agent</h2></div></div>
              <button className="primary-button blueprint-copy-button" type="button" onClick={onCopy}>
                <Copy size={15} aria-hidden="true" /> Copy blueprint
              </button>
            </div>
            <div className="blueprint-prompt-preview">
              <pre>{compiled.text}</pre>
            </div>
            <div className="blueprint-prompt-footer">
              <span>Copy and paste this prompt into your IDE agent or another tool.</span>
              <span>{compiled.text.length.toLocaleString()} characters</span>
            </div>
          </GlassCard>

          {executorMode === "stream" && (
            <GlassCard className="blueprint-executor-card" delay={0.24}>
              <div className="blueprint-card-heading">
                <div className="blueprint-card-title"><Sparkles size={17} aria-hidden="true" /><div><span>EXECUTOR</span><h2>Run the blueprint here</h2></div></div>
                {streaming ? (
                  <button className="blueprint-stop-button" type="button" onClick={onStop}>
                    <Square size={13} fill="currentColor" aria-hidden="true" /> Stop
                  </button>
                ) : (
                  <button className="primary-button blueprint-run-button" type="button" disabled={!canStream} onClick={onStream}>
                    <Play size={14} fill="currentColor" aria-hidden="true" /> {hasResponse ? "Run again" : "Run executor"}
                  </button>
                )}
              </div>
              <div className="blueprint-executor-meta">
                <span className="blueprint-model-dot" />
                <span>{canStream ? executorModel : "No Executor model selected"}</span>
                <span className="blueprint-executor-status" role="status" aria-live="polite">
                  {streaming ? <><LoaderCircle className="spin" size={13} aria-hidden="true" /> Streaming response</> : hasResponse ? "Response received" : "Waiting to run"}
                </span>
              </div>
              {!canStream && <p className="inline-error blueprint-model-error">Choose an Executor model in Provider Settings to run this blueprint here.</p>}
              <AnimatePresence>
                {streamError && (
                  <motion.p className="inline-error blueprint-stream-error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <CircleAlert size={15} aria-hidden="true" /> {streamError}
                  </motion.p>
                )}
              </AnimatePresence>
              <div className="blueprint-executor-output" role="log" aria-label="Executor response" aria-live="off">
                {hasResponse ? <pre>{executorText}</pre> : (
                  <div className="blueprint-executor-empty">
                    {streaming ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                    <p>{streaming ? "Waiting for the first response…" : "The Executor's response will appear here."}</p>
                  </div>
                )}
              </div>
            </GlassCard>
          )}
        </main>

        <aside className="blueprint-aside" aria-label="Blueprint details">
          <GlassCard className="blueprint-detail-card" delay={0.2}>
            <div className="blueprint-aside-title"><Sparkles size={15} aria-hidden="true" /> INCLUDED SKILLS</div>
            {compiled.activeSkills.length ? (
              <ul className="blueprint-skill-list">
                {compiled.activeSkills.map((skill) => (
                  <li className="blueprint-skill-item" key={skill.id}>
                    <span className="blueprint-skill-icon"><Check size={13} aria-hidden="true" /></span>
                    <div><strong>{skill.name}</strong><span>{skill.description}</span></div>
                  </li>
                ))}
              </ul>
            ) : <p className="blueprint-aside-empty">No specialized skill rules were needed.</p>}
          </GlassCard>

          <GlassCard className="blueprint-detail-card" delay={0.25}>
            <div className="blueprint-aside-title"><CircleAlert size={15} aria-hidden="true" /> ASSUMPTIONS TO REVIEW</div>
            {compiled.assumptions.length ? (
              <ul className="blueprint-assumption-list">
                {compiled.assumptions.map((assumption, index) => <li key={`${index}-${assumption}`}>{assumption}</li>)}
              </ul>
            ) : <p className="blueprint-aside-empty">No unanswered clarification questions.</p>}
          </GlassCard>

          <GlassCard className="blueprint-handoff-card" delay={0.3}>
            <div className="blueprint-aside-title"><Copy size={15} aria-hidden="true" /> HANDOFF</div>
            <p>The copied prompt includes the goal, known specs, answers, assumptions, and skill rules. When references are present, Lunaris stages temporary image files and includes their paths.</p>
            <button className="blueprint-handoff-action" type="button" onClick={onCopy}>
              Copy for IDE agent <ArrowRight size={14} aria-hidden="true" />
            </button>
          </GlassCard>
        </aside>
      </div>

      <div className="blueprint-footer">
        <button className="quiet-action" type="button" onClick={onNewPrompt}>
          <ArrowRight size={15} aria-hidden="true" /> Start a new request
        </button>
      </div>
    </div>
  );
}
