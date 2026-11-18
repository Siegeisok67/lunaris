import { Check, CircleAlert, ClipboardCheck, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import type { CompiledPrompt } from "../../lib/promptCompiler";
import { makeBlueprintReviewPrompt, reviewBlueprint } from "../../lib/blueprintReview";

interface BlueprintPreflightProps {
  compiled: CompiledPrompt;
  onCopyReview: (text: string) => void;
}

export function BlueprintPreflight({ compiled, onCopyReview }: BlueprintPreflightProps) {
  const checks = reviewBlueprint(compiled);
  const readyCount = checks.filter((check) => check.ready).length;
  const isReady = readyCount === checks.length;

  return (
    <motion.section className="blueprint-preflight" aria-labelledby="blueprint-preflight-title" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: 0.12 }}>
      <header className="blueprint-preflight-heading">
        <span className="blueprint-preflight-icon"><ShieldCheck size={16} aria-hidden="true" /></span>
        <div>
          <span className="blueprint-preflight-eyebrow">LOCAL QUALITY CHECK</span>
          <h2 id="blueprint-preflight-title">Blueprint preflight</h2>
          <p>{isReady ? "Core handoff details are present." : `${checks.length - readyCount} item${checks.length - readyCount === 1 ? " could use" : "s could use"} more detail before execution.`} This review runs on your device and does not call a model.</p>
        </div>
        <span className={`blueprint-preflight-count ${isReady ? "ready" : "needs-review"}`}>{readyCount}/{checks.length}</span>
      </header>
      <ul className="blueprint-preflight-list">
        {checks.map((check) => (
          <li key={check.id} className={check.ready ? "ready" : "needs-review"}>
            <span className="blueprint-preflight-check-icon">{check.ready ? <Check size={13} aria-hidden="true" /> : <CircleAlert size={13} aria-hidden="true" />}</span>
            <span><strong>{check.label}</strong><small>{check.detail}</small></span>
          </li>
        ))}
      </ul>
      <footer className="blueprint-preflight-footer">
        <p>These are wording checks, not a guarantee. Review the plan yourself before letting an agent make changes.</p>
        <button className="secondary-button" type="button" onClick={() => onCopyReview(makeBlueprintReviewPrompt(compiled, checks))}>
          <ClipboardCheck size={14} aria-hidden="true" /> Copy review prompt
        </button>
      </footer>
    </motion.section>
  );
}
