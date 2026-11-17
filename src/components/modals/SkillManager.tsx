import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Check,
  FileDown,
  FilePlus2,
  LoaderCircle,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { deleteSkillFile, loadSkills, saveSkillFile, toSkillFile } from "../../lib/storage";
import { motionTransitions } from "../../lib/motion";
import type { SkillCategory, SkillDefinition } from "../../types/skills";

interface SkillManagerProps {
  onChanged: (skills: SkillDefinition[]) => void;
  onClose: () => void;
}

const CATEGORIES: SkillCategory[] = ["frontend", "backend", "creative", "workflow"];
const MAX_SKILL_BYTES = 512 * 1024;

interface ImportedSkill { skill: SkillDefinition; choice: "import" | "replace" | "skip" }

function newSkill(): SkillDefinition {
  return {
    id: "",
    name: "",
    description: "",
    category: "workflow",
    triggers: [],
    content: "# New skill\n\n",
    builtIn: false,
  };
}

function slugify(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/g, "");
}

function parseTriggers(value: string): string[] {
  const seen = new Set<string>();
  return value.split(/[,\n]/).map((item) => item.trim()).filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SkillManager({ onChanged, onClose }: SkillManagerProps) {
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillDefinition | null>(null);
  const [triggersInput, setTriggersInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [idTouched, setIdTouched] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SkillCategory | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedSkill[]>([]);
  const [importing, setImporting] = useState(false);

  const chooseImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])].filter((file) => file.name.toLowerCase().endsWith(".md")).slice(0, 100);
    event.target.value = "";
    if (!files.length) { setError("Choose Markdown skill files or a folder containing them."); return; }
    const seen = new Set<string>();
    const items: ImportedSkill[] = [];
    for (const file of files) {
      if (file.size > MAX_SKILL_BYTES) continue;
      const content = await file.text();
      const header = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(content)?.[1] ?? "";
      const field = (name: string) => new RegExp(`^\\s*${name}:\\s*["']?(.+?)["']?\\s*$`, "im").exec(header)?.[1]?.trim() ?? "";
      const name = field("name") || file.name.replace(/\.md$/i, "").replace(/[-_]/g, " ");
      const description = field("description") || "Imported Markdown skill.";
      const rawTriggers = field("triggers").replace(/^\[|\]$/g, "");
      const triggers = rawTriggers.split(",").map((value) => value.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
      let id = slugify(name) || slugify(file.name.replace(/\.md$/i, "")) || "imported-skill";
      if (seen.has(id)) id = `${id}-${items.length + 1}`;
      seen.add(id);
      const conflict = skills.some((skill) => skill.id === id);
      items.push({ skill: { id, name, description, category: "workflow", triggers, content: content.trim(), builtIn: false }, choice: conflict ? "skip" : "import" });
    }
    setImported(items);
    setError(files.length !== items.length ? "Some files were skipped because they were empty, too large, or unreadable." : null);
    setMessage(null);
  };

  const commitImports = async () => {
    if (busy || importing) return;
    setImporting(true);
    setError(null);
    try {
      const current = await loadSkills();
      const files = new Map(current.map((skill) => [skill.id, skill]));
      for (const item of imported) {
        if (item.choice === "skip") continue;
        let skill = item.skill;
        if (item.choice === "replace") {
          const original = current.find((candidate) => candidate.id === skill.id);
          if (original?.builtIn) throw new Error(`“${skill.name}” matches a starter skill; choose Skip or import under a new name.`);
        } else if (files.has(skill.id)) {
          let suffix = 2;
          while (files.has(`${skill.id}-${suffix}`)) suffix += 1;
          skill = { ...skill, id: `${skill.id}-${suffix}` };
        }
        if (new TextEncoder().encode(skill.content).length > MAX_SKILL_BYTES) continue;
        await saveSkillFile(toSkillFile(skill));
        files.set(skill.id, skill);
      }
      const loaded = await loadSkills();
      setSkills(loaded);
      onChanged(loaded);
      setImported([]);
      setMessage("Selected skills were imported into the local library.");
    } catch (caught) {
      setError(`Could not import skills: ${errorMessage(caught)}`);
    } finally {
      setImporting(false);
    }
  };

  const baseline = selectedId ? skills.find((skill) => skill.id === selectedId) : undefined;
  const dirty = draft !== null && (creating
    ? Boolean(draft.id || draft.name || draft.description || triggersInput || draft.content.trim() !== "# New skill")
    : Boolean(baseline && (
      draft.name !== baseline.name ||
      draft.description !== baseline.description ||
      draft.category !== baseline.category ||
      triggersInput !== baseline.triggers.join(", ") ||
      draft.content !== baseline.content
    )));

  const choose = (skill: SkillDefinition) => {
    if (busy || selectedId === skill.id && !creating) return;
    if (dirty && !window.confirm("Discard unsaved changes to this skill?")) return;
    setSelectedId(skill.id);
    setDraft({ ...skill, triggers: [...skill.triggers] });
    setTriggersInput(skill.triggers.join(", "));
    setCreating(false);
    setIdTouched(false);
    setError(null);
    setMessage(null);
  };

  const startNew = () => {
    if (busy) return;
    if (dirty && !window.confirm("Discard unsaved changes to this skill?")) return;
    setSelectedId(null);
    setDraft(newSkill());
    setTriggersInput("");
    setCreating(true);
    setIdTouched(false);
    setError(null);
    setMessage(null);
  };

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadSkills();
      setSkills(loaded);
      const selected = loaded.find((skill) => skill.id === selectedId) ?? loaded[0];
      if (selected) {
        setSelectedId(selected.id);
        setDraft({ ...selected, triggers: [...selected.triggers] });
        setTriggersInput(selected.triggers.join(", "));
        setCreating(false);
      } else {
        setSelectedId(null);
        setDraft(null);
      }
    } catch (caught) {
      setError(`Could not load the skill library: ${errorMessage(caught)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void loadSkills()
      .then((loaded) => {
        if (!active) return;
        setSkills(loaded);
        if (loaded[0]) {
          setSelectedId(loaded[0].id);
          setDraft({ ...loaded[0], triggers: [...loaded[0].triggers] });
          setTriggersInput(loaded[0].triggers.join(", "));
        }
      })
      .catch((caught: unknown) => { if (active) setError(`Could not load the skill library: ${errorMessage(caught)}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const updateDraft = <K extends keyof SkillDefinition>(key: K, value: SkillDefinition[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setError(null);
    setMessage(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || busy) return;
    const skill: SkillDefinition = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      triggers: parseTriggers(triggersInput),
      content: draft.content.trim(),
    };
    if (!/^[a-z0-9-]{1,64}$/.test(skill.id)) {
      setError("Skill ID must be 1–64 lowercase letters, numbers, or hyphens.");
      return;
    }
    if (!skill.name) {
      setError("Give this skill a name.");
      return;
    }
    if (!skill.description) {
      setError("Add a short description so the Architect can identify this skill.");
      return;
    }
    if (!skill.content) {
      setError("Add Markdown instructions before saving.");
      return;
    }
    if (creating && skills.some((existing) => existing.id === skill.id)) {
      setError("A skill with this ID already exists. Choose another ID.");
      return;
    }
    const file = toSkillFile(skill);
    if (new TextEncoder().encode(file.content).length > MAX_SKILL_BYTES) {
      setError("This skill exceeds the 512 KB file limit.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveSkillFile(file);
      const loaded = await loadSkills();
      setSkills(loaded);
      const saved = loaded.find((item) => item.id === skill.id) ?? skill;
      setSelectedId(saved.id);
      setDraft({ ...saved, triggers: [...saved.triggers] });
      setTriggersInput(saved.triggers.join(", "));
      setCreating(false);
      setIdTouched(false);
      setMessage("Skill saved to your local library.");
      onChanged(loaded);
    } catch (caught) {
      setError(`Could not save this skill: ${errorMessage(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft || creating || busy) return;
    if (!window.confirm(`Delete “${draft.name}” from the skill library?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deleteSkillFile(draft.id);
      const remaining = skills.filter((skill) => skill.id !== draft.id);
      setSkills(remaining);
      onChanged(remaining);
      const next = remaining[0];
      setSelectedId(next?.id ?? null);
      setDraft(next ? { ...next, triggers: [...next.triggers] } : null);
      setTriggersInput(next?.triggers.join(", ") ?? "");
      setMessage(`Deleted “${draft.name}”.`);
    } catch (caught) {
      setError(`Could not delete this skill: ${errorMessage(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  const discard = () => {
    if (!baseline) return;
    setDraft({ ...baseline, triggers: [...baseline.triggers] });
    setTriggersInput(baseline.triggers.join(", "));
    setError(null);
    setMessage(null);
  };

  const query = search.trim().toLowerCase();
  const visibleSkills = skills.filter((skill) =>
    (categoryFilter === "all" || skill.category === categoryFilter) &&
    (!query || `${skill.name} ${skill.description} ${skill.id} ${skill.triggers.join(" ")}`.toLowerCase().includes(query))
  );

  return (
    <motion.div className="skills-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={motionTransitions.page}>
      <div className="skills-page-heading">
        <div>
          <span className="skills-eyebrow">LOCAL LIBRARY</span>
          <h2>Skill Library</h2>
          <p>Reusable Markdown rules the Architect can attach to a compiled prompt.</p>
        </div>
        <button type="button" className="skills-icon-button" aria-label="Close skill library" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="skills-workspace">
        <aside className="skills-list-panel" aria-label="Installed skills">
          <div className="skills-list-toolbar">
            <div className="skills-search-wrap"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search skills" aria-label="Search skills" /></div>
            <button type="button" className="skills-new-button" onClick={startNew} disabled={loading || busy}><FilePlus2 size={16} /> New skill</button>
            <label className="skills-import-button"><FileDown size={15} /> Import skills<input type="file" accept=".md,text/markdown,text/plain" multiple onChange={(event) => void chooseImportFiles(event)} /></label>
            <label className="skills-import-button secondary"><FileDown size={15} /> Import skill folder<input ref={(input) => input?.setAttribute("webkitdirectory", "")} type="file" accept=".md,text/markdown,text/plain" multiple onChange={(event) => void chooseImportFiles(event)} /></label>
            {imported.length > 0 && <div className="skills-import-preview"><strong>{imported.length} Markdown file{imported.length === 1 ? "" : "s"} found</strong>{imported.map((item, index) => {
              const conflict = skills.some((skill) => skill.id === item.skill.id);
              const builtin = skills.some((skill) => skill.id === item.skill.id && skill.builtIn);
              return <div className="skills-import-row" key={`${item.skill.id}-${index}`}><span><b>{item.skill.name}</b><small>{item.skill.description}</small></span>{conflict ? <select value={builtin && item.choice === "replace" ? "skip" : item.choice} onChange={(event) => setImported((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, choice: event.target.value as ImportedSkill["choice"] } : row))}><option value="skip">Skip duplicate</option><option value="rename">Import as new</option>{!builtin && <option value="replace">Replace existing</option>}</select> : <small>Ready to import</small>}</div>;
            })}<button type="button" className="primary-button" disabled={importing || !imported.some((item) => item.choice !== "skip")} onClick={() => void commitImports()}>{importing ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Import selected</button></div>}
          </div>
          <label className="skills-filter-field">
            <span>Category</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as SkillCategory | "all")}>
              <option value="all">All categories</option>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
            </select>
          </label>
          <div className="skills-list-count">{visibleSkills.length} of {skills.length} skills</div>
          <div className="skills-list-items">
            {loading && <div className="skills-list-empty"><LoaderCircle className="spin" size={18} /> Loading skills…</div>}
            {!loading && visibleSkills.map((skill) => (
              <button
                type="button"
                key={skill.id}
                className={`skills-list-item ${selectedId === skill.id && !creating ? "active" : ""}`}
                onClick={() => choose(skill)}
                aria-current={selectedId === skill.id && !creating ? "true" : undefined}
              >
                <span className="skills-list-icon"><BookOpen size={16} /></span>
                <span className="skills-list-copy"><strong>{skill.name}</strong><small>{skill.description}</small><em>{skill.category}{skill.builtIn ? " · Starter" : " · Custom"}</em></span>
              </button>
            ))}
            {!loading && visibleSkills.length === 0 && <div className="skills-list-empty">{skills.length ? "No skills match your search." : "Your library is empty. Create a skill to get started."}</div>}
          </div>
        </aside>

        <main className="skills-editor-panel">
          {draft ? (
            <form onSubmit={(event) => void save(event)}>
              <div className="skills-editor-heading">
                <div><span className="skills-eyebrow">{creating ? "NEW SKILL" : draft.builtIn ? "STARTER SKILL" : "CUSTOM SKILL"}</span><h3>{creating ? "Create a skill" : draft.name}</h3></div>
                {!creating && <span className="skills-editor-id">{draft.id}.md</span>}
              </div>
              <div className="skills-metadata-grid">
                <label className="skills-field">
                  <span>Name</span>
                  <input value={draft.name} onChange={(event) => {
                    const name = event.target.value;
                    setDraft((current) => current ? { ...current, name, id: creating && !idTouched ? slugify(name) : current.id } : current);
                    setError(null);
                    setMessage(null);
                  }} placeholder="e.g. Python Data Analysis" />
                </label>
                <label className="skills-field">
                  <span>Skill ID</span>
                  <input value={draft.id} onChange={(event) => { setIdTouched(true); updateDraft("id", event.target.value); }} disabled={!creating} placeholder="python-data-analysis" spellCheck={false} />
                </label>
                <label className="skills-field skills-description-field">
                  <span>Description</span>
                  <input value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="When should the Architect use this skill?" />
                </label>
                <label className="skills-field">
                  <span>Category</span>
                  <select value={draft.category} onChange={(event) => updateDraft("category", event.target.value as SkillCategory)}>
                    {CATEGORIES.map((category) => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}
                  </select>
                </label>
                <label className="skills-field skills-triggers-field">
                  <span>Triggers <small>Separate with commas</small></span>
                  <input value={triggersInput} onChange={(event) => { setTriggersInput(event.target.value); setError(null); setMessage(null); }} placeholder="python, pandas, data analysis" />
                </label>
              </div>
              <label className="skills-markdown-field">
                <span><strong>Markdown instructions</strong><small>{draft.content.split(/\r?\n/).length} lines · {draft.content.length.toLocaleString()} characters</small></span>
                <textarea value={draft.content} onChange={(event) => updateDraft("content", event.target.value)} placeholder={"# Skill name\n\nWrite the rules the executor should follow…"} spellCheck={false} />
              </label>
              <div className="skills-editor-footer">
                <div className="skills-editor-feedback">
                  {error && <p className="inline-error" role="alert">{error}</p>}
                  {message && <p className="skills-success" role="status"><Check size={14} /> {message}</p>}
                  {!error && !message && dirty && <span>Unsaved changes</span>}
                </div>
                <div className="skills-editor-actions">
                  {!creating && <button type="button" className="skills-delete-button" onClick={() => void remove()} disabled={busy}><Trash2 size={15} /> Delete</button>}
                  {!creating && dirty && <button type="button" className="quiet-action" onClick={discard} disabled={busy}><RotateCcw size={14} /> Discard</button>}
                  <button type="submit" className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Save skill</button>
                </div>
              </div>
            </form>
          ) : (
            <div className="skills-editor-empty"><BookOpen size={30} /><h3>{loading ? "Opening library…" : "No skill selected"}</h3><p>{loading ? "Loading your local Markdown skills." : "Select a skill or create a new one to start editing."}</p>{error && <><p className="inline-error" role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => void reload()}>Retry loading</button></>}</div>
          )}
        </main>
      </div>
    </motion.div>
  );
}
