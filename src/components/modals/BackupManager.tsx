import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArchiveRestore, Download, FileUp, LoaderCircle, ShieldCheck } from "lucide-react";
import type { BackupBundle } from "../../types/backup";
import type { HistoryCollection, LunarisSettings } from "../../lib/storage";
import type { MemoryCollection } from "../../types/memory";
import type { SkillDefinition } from "../../types/skills";
import { createBackup, parseBackup } from "../../lib/backup";
import { listSkillFiles } from "../../lib/storage";
import { motionTransitions } from "../../lib/motion";

interface BackupManagerProps {
  settings: LunarisSettings;
  history: HistoryCollection;
  memory: MemoryCollection;
  skills: SkillDefinition[];
  onImport: (backup: BackupBundle) => Promise<void>;
  onClose: () => void;
}

export function BackupManager({ settings, history, memory, skills, onImport, onClose }: BackupManagerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BackupBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const exportBackup = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const skillFiles = await listSkillFiles();
      const backup = createBackup(settings, history, memory, skillFiles);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Lunaris-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Backup created. Keep it somewhere safe before changing devices.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const readBackup = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    try {
      setPreview(parseBackup(await file.text()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await onImport(preview);
      setPreview(null);
      setNotice("Backup merged into Lunaris. Existing credential-store entries were left in place.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.main className="backup-page" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.page}>
      <header className="backup-page-heading"><div><span className="settings-eyebrow">LOCAL DATA</span><h1>Backup &amp; Restore</h1><p>Move your Lunaris setup between devices or keep a safety copy.</p></div><button className="skills-icon-button" onClick={onClose} aria-label="Close backup manager">×</button></header>
      <section className="backup-security-note"><ShieldCheck size={16} /><p><strong>Credentials stay private.</strong> Backups include settings, prompt history, memory, workflows, and installed skills. Provider keys remain in the operating system credential store and are never exported.</p></section>
      <div className="backup-action-grid">
        <article className="backup-action-card glass-card"><span className="backup-card-icon"><Download size={17} /></span><h2>Create local backup</h2><p>Export a versioned JSON file with your current tools, workflows, saved memory, and prompt sessions.</p><button className="primary-button" onClick={() => void exportBackup()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Download size={14} />} Export backup</button></article>
        <article className="backup-action-card glass-card"><span className="backup-card-icon"><ArchiveRestore size={17} /></span><h2>Restore or merge</h2><p>Choose a Lunaris backup to preview its contents. Import merges matching records by ID and keeps your credentials untouched.</p><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readBackup(file); }} /><button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <FileUp size={14} />} Choose backup file</button></article>
      </div>
      <AnimatePresence>{preview && <motion.section className="backup-preview glass-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}><div><span className="settings-eyebrow">IMPORT PREVIEW</span><h2>Ready to merge this backup?</h2><p>Exported {preview.exportedAt ? new Date(preview.exportedAt).toLocaleString() : "date unavailable"}</p></div><ul><li>{preview.history.sessions.length} prompt sessions</li><li>{preview.memory.entries.length} saved memories across {preview.memory.projects.length} projects</li><li>{preview.skills.length} skill files</li><li>{preview.settings.toolCatalog.applications.length} applications and {preview.settings.toolCatalog.mcpServers.length} MCP servers</li><li>{preview.settings.customPromptTemplates.length} workflow presets</li></ul><div className="backup-preview-actions"><button className="secondary-button" onClick={() => setPreview(null)} disabled={busy}>Cancel</button><button className="primary-button" onClick={() => void importBackup()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <ArchiveRestore size={14} />} Import and merge</button></div></motion.section>}</AnimatePresence>
      {error && <p className="inline-error backup-feedback" role="alert">{error}</p>}{notice && <p className="backup-success" role="status">{notice}</p>}
      <div className="backup-local-summary"><strong>THIS DEVICE</strong><span>{history.sessions.length} prompts</span><span>{memory.entries.length} memories</span><span>{skills.length} skills</span><span>{settings.customPromptTemplates.length} workflows</span></div>
    </motion.main>
  );
}
