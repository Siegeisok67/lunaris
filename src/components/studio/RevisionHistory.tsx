import { useEffect, useMemo, useState } from "react";
import { Clock3, GitCompareArrows, RotateCcw, Save } from "lucide-react";
import type { BlueprintRevision } from "../../types/architect";

interface RevisionHistoryProps {
  currentText: string;
  revisions: BlueprintRevision[];
  onSave: (text: string, reason: string) => void;
  onRestore: (revision: BlueprintRevision) => void;
}

function changedLines(before: string, after: string): { removed: string[]; added: string[] } {
  const left = before.split(/\r?\n/);
  const right = after.split(/\r?\n/);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  return {
    removed: left.slice(prefix, left.length - suffix).slice(0, 200),
    added: right.slice(prefix, right.length - suffix).slice(0, 200),
  };
}

export function RevisionHistory({ currentText, revisions, onSave, onRestore }: RevisionHistoryProps) {
  const [draft, setDraft] = useState(currentText);
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState(revisions[0]?.id ?? null);
  useEffect(() => { setDraft(currentText); }, [currentText]);
  const selected = revisions.find((revision) => revision.id === selectedId) ?? null;
  const diff = useMemo(() => selected ? changedLines(selected.text, draft) : null, [selected, draft]);

  return (
    <section className="studio-revisions glass-card" aria-labelledby="studio-revisions-title">
      <header className="studio-panel-heading"><div className="studio-panel-icon"><GitCompareArrows size={16} /></div><div><span>EDITABLE PLAN HISTORY</span><h2 id="studio-revisions-title">Blueprint revisions</h2><p>Save a new version before replacing the current blueprint.</p></div></header>
      <div className="studio-revision-editor"><label><span>Current blueprint</span><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 100_000))} rows={10} spellCheck={false} /></label><div className="studio-revision-editor-footer"><input value={reason} onChange={(event) => setReason(event.target.value.slice(0, 200))} placeholder="What changed?" aria-label="Revision note" /><button className="primary-button" disabled={!draft.trim() || draft === currentText || revisions.length >= 20} onClick={() => { onSave(draft, reason.trim() || "Updated execution blueprint"); setReason(""); }}><Save size={13} /> Save revision</button></div><small>{revisions.length}/20 snapshots · Changes are applied only when you save.</small></div>
      <div className="studio-revision-layout">
        <div className="studio-revision-list"><strong>PREVIOUS VERSIONS</strong>{revisions.length ? revisions.slice().reverse().map((revision) => <button key={revision.id} className={selected?.id === revision.id ? "active" : ""} onClick={() => setSelectedId(revision.id)}><Clock3 size={12} /><span><b>{revision.reason}</b><small>{new Date(revision.createdAt).toLocaleString()}</small></span></button>) : <p>No revisions saved yet.</p>}</div>
        {selected && diff && <div className="studio-revision-diff"><div className="studio-diff-columns"><article><span>PREVIOUS</span><pre>{diff.removed.join("\n") || "No removed lines"}</pre></article><article><span>CURRENT DRAFT</span><pre>{diff.added.join("\n") || "No added lines"}</pre></article></div><p>Showing the changed block; unchanged text is omitted.</p><button className="secondary-button" onClick={() => onRestore(selected)}><RotateCcw size={13} /> Restore this version</button></div>}
      </div>
    </section>
  );
}
