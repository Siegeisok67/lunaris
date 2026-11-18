import { useMemo, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, BrainCircuit, Check, FolderPlus, Pencil, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { MEMORY_LIMITS, type MemoryCollection, type MemoryEntry, type MemoryProject, type MemoryScope } from "../../types/memory";
import { motionTransitions } from "../../lib/motion";

interface MemoryManagerProps {
  memory: MemoryCollection;
  onChange: (memory: MemoryCollection) => void;
  onDefaultChange: (enabled: boolean) => void;
  onClose: () => void;
}

const stamp = () => new Date().toISOString();

export function MemoryManager({ memory, onChange, onDefaultChange, onClose }: MemoryManagerProps) {
  const [scope, setScope] = useState<MemoryScope>("profile");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editScope, setEditScope] = useState<MemoryScope>("profile");
  const [editProjectId, setEditProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [editingProject, setEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");

  const activeProject = memory.projects.find((project) => project.id === projectId) ?? null;
  const scopedEntries = useMemo(() => memory.entries
    .filter((entry) => scope === "profile" ? entry.scope === "profile" : entry.scope === "project" && entry.projectId === projectId)
    .filter((entry) => `${entry.title} ${entry.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [memory.entries, scope, projectId, query]);

  const addProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = projectName.trim();
    if (!name || memory.projects.length >= MEMORY_LIMITS.projects) return;
    const now = stamp();
    const project: MemoryProject = { id: crypto.randomUUID(), name, description: projectDescription.trim(), createdAt: now, updatedAt: now };
    onChange({ ...memory, projects: [...memory.projects, project] });
    setProjectId(project.id);
    setScope("project");
    setProjectName("");
    setProjectDescription("");
  };

  const updateProject = (patch: Partial<Pick<MemoryProject, "name" | "description">>) => {
    if (!activeProject) return;
    onChange({ ...memory, projects: memory.projects.map((project) => project.id === activeProject.id ? { ...project, ...patch, updatedAt: stamp() } : project) });
  };

  const saveProjectEdit = () => {
    const name = editProjectName.trim();
    if (!activeProject || !name) return;
    updateProject({ name: name.slice(0, 100), description: editProjectDescription.trim().slice(0, 400) });
    setEditingProject(false);
  };

  const removeProject = (project: MemoryProject) => {
    if (!window.confirm(`Delete “${project.name}” and its project memories?`)) return;
    onChange({ ...memory, projects: memory.projects.filter((item) => item.id !== project.id), entries: memory.entries.filter((entry) => entry.projectId !== project.id) });
    if (projectId === project.id) setProjectId(null);
    setEditingProject(false);
  };

  const addEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent || memory.entries.length >= MEMORY_LIMITS.entries || (scope === "project" && !projectId)) return;
    const now = stamp();
    const entry: MemoryEntry = { id: crypto.randomUUID(), title: cleanTitle.slice(0, MEMORY_LIMITS.titleCharacters), content: cleanContent.slice(0, MEMORY_LIMITS.entryCharacters), scope, projectId: scope === "project" ? projectId : null, enabled: true, source: "manual", createdAt: now, updatedAt: now };
    onChange({ ...memory, entries: [entry, ...memory.entries] });
    setTitle("");
    setContent("");
  };

  const toggleEntry = (entry: MemoryEntry) => onChange({ ...memory, entries: memory.entries.map((item) => item.id === entry.id ? { ...item, enabled: !item.enabled, updatedAt: stamp() } : item) });
  const removeEntry = (entry: MemoryEntry) => {
    if (!window.confirm(`Delete the saved memory “${entry.title}”?`)) return;
    onChange({ ...memory, entries: memory.entries.filter((item) => item.id !== entry.id) });
  };
  const startEditing = (entry: MemoryEntry) => { setEditingId(entry.id); setEditTitle(entry.title); setEditContent(entry.content); setEditScope(entry.scope); setEditProjectId(entry.projectId ?? ""); };
  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId || !editTitle.trim() || !editContent.trim() || (editScope === "project" && !memory.projects.some((project) => project.id === editProjectId))) return;
    onChange({ ...memory, entries: memory.entries.map((entry) => entry.id === editingId ? { ...entry, title: editTitle.trim().slice(0, MEMORY_LIMITS.titleCharacters), content: editContent.trim().slice(0, MEMORY_LIMITS.entryCharacters), scope: editScope, projectId: editScope === "project" ? editProjectId : null, updatedAt: stamp() } : entry) });
    setEditingId(null);
  };

  return (
    <motion.section className="memory-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={motionTransitions.page}>
      <header className="memory-page-heading"><div><span className="settings-eyebrow">LOCAL CONTEXT</span><h2>Permanent memory</h2><p>Keep stable preferences and project facts close. You decide what Lunaris remembers and shares.</p></div><div className="memory-heading-actions"><span className="memory-local-badge"><ShieldCheck size={13} /> STORED ON THIS DEVICE</span><button className="settings-icon-button" onClick={onClose} aria-label="Close memory"><X size={17} /></button></div></header>

      <section className="memory-default-card glass-card"><div className="memory-default-icon"><BrainCircuit size={18} /></div><div><strong>Include saved memory by default</strong><p>You can turn it off for any individual prompt before sending.</p></div><label className="settings-switch-field"><input type="checkbox" checked={memory.enabledByDefault} onChange={(event) => onDefaultChange(event.target.checked)} /><span className="settings-switch" aria-hidden="true" /><span>{memory.enabledByDefault ? "On" : "Off"}</span></label></section>

      <div className="memory-workspace">
        <aside className="memory-project-panel glass-card"><div className="memory-panel-heading"><div><span className="memory-section-kicker">WORKSPACES</span><strong>Projects</strong></div><span>{memory.projects.length}/{MEMORY_LIMITS.projects}</span></div>
          <button className={`memory-project-choice ${scope === "profile" ? "active" : ""}`} onClick={() => setScope("profile")}><BrainCircuit size={15} /><span><strong>Profile</strong><small>Preferences for any prompt</small></span></button>
          <div className="memory-project-list">{memory.projects.map((project) => <button key={project.id} className={`memory-project-choice ${scope === "project" && projectId === project.id ? "active" : ""}`} onClick={() => { setProjectId(project.id); setScope("project"); setEditingProject(false); }}><Archive size={14} /><span><strong>{project.name}</strong><small>{memory.entries.filter((entry) => entry.projectId === project.id).length} saved facts</small></span></button>)}</div>
          <form className="memory-add-project" onSubmit={addProject}><label className="memory-field"><span>New project</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Lunaris desktop app" maxLength={100} /></label><label className="memory-field"><span>Short description (optional)</span><input value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} placeholder="Stack, goal, or conventions" maxLength={400} /></label><button className="secondary-button" type="submit" disabled={!projectName.trim() || memory.projects.length >= MEMORY_LIMITS.projects}><FolderPlus size={14} /> Add project</button></form>
        </aside>

        <main className="memory-content-panel glass-card">
          <div className="memory-panel-heading"><div><span className="memory-section-kicker">{scope === "profile" ? "APPLIES TO ALL PROMPTS" : activeProject?.name ?? "SELECT A PROJECT"}</span><strong>{scope === "profile" ? "Profile memories" : "Project memories"}</strong></div><span>{scopedEntries.length} shown · {memory.entries.length}/{MEMORY_LIMITS.entries} total</span></div>
          {scope === "project" && activeProject && <div className="memory-project-meta">{editingProject ? <div className="memory-project-edit"><input aria-label="Project name" value={editProjectName} onChange={(event) => setEditProjectName(event.target.value)} maxLength={100} /><input aria-label="Project description" value={editProjectDescription} onChange={(event) => setEditProjectDescription(event.target.value)} maxLength={400} /><button type="button" className="quiet-action" disabled={!editProjectName.trim()} onClick={saveProjectEdit}><Check size={14} /> Done</button><button type="button" className="quiet-action" onClick={() => setEditingProject(false)}>Cancel</button></div> : <><p>{activeProject.description || "No project description yet."}</p><div><button className="quiet-action" onClick={() => { setEditProjectName(activeProject.name); setEditProjectDescription(activeProject.description); setEditingProject(true); }}><Pencil size={13} /> Edit project</button><button className="quiet-action memory-remove-project" onClick={() => removeProject(activeProject)}><Trash2 size={13} /> Delete project</button></div></>}</div>}
          {scope === "project" && !activeProject && <div className="memory-empty"><Archive size={21} /><strong>Choose or create a project</strong><p>Project memories stay separate and are only used when that project is selected.</p></div>}
          {(scope === "profile" || activeProject) && <>
            <form className="memory-entry-form" onSubmit={addEntry}><label className="memory-field"><span>Memory title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Preferred UI framework" maxLength={MEMORY_LIMITS.titleCharacters} /></label><label className="memory-field"><span>What should Lunaris remember?</span><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write a stable preference, convention, or project fact…" maxLength={MEMORY_LIMITS.entryCharacters} rows={3} /></label><div className="memory-entry-form-footer"><small>Avoid passwords, API keys, or other secrets. {content.length}/{MEMORY_LIMITS.entryCharacters}</small><button className="primary-button" type="submit" disabled={!title.trim() || !content.trim() || memory.entries.length >= MEMORY_LIMITS.entries || (scope === "project" && !projectId)}><Plus size={14} /> Save memory</button></div></form>
            <label className="memory-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved memories…" aria-label="Search saved memories" /></label>
            <div className="memory-entry-list"><AnimatePresence initial={false}>{scopedEntries.map((entry) => <motion.article key={entry.id} className={`memory-entry ${entry.enabled ? "" : "disabled"}`} layout initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
              {editingId === entry.id ? <form onSubmit={saveEdit} className="memory-edit-form"><label className="memory-field"><span>Title</span><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={MEMORY_LIMITS.titleCharacters} /></label><label className="memory-field"><span>Memory</span><textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} maxLength={MEMORY_LIMITS.entryCharacters} rows={3} /></label><label className="memory-field"><span>Save to</span><select value={editScope === "profile" ? "profile" : `project:${editProjectId}`} onChange={(event) => { const value = event.target.value; if (value === "profile") setEditScope("profile"); else { setEditScope("project"); setEditProjectId(value.slice("project:".length)); } }}><option value="profile">Profile</option>{memory.projects.map((project) => <option key={project.id} value={`project:${project.id}`}>{project.name}</option>)}</select></label><div className="memory-entry-actions"><button className="primary-button" type="submit" disabled={!editTitle.trim() || !editContent.trim() || (editScope === "project" && !editProjectId)}><Check size={13} /> Save edits</button><button className="quiet-action" type="button" onClick={() => setEditingId(null)}>Cancel</button></div></form> : <><div className="memory-entry-main"><label className="memory-enabled-toggle"><input type="checkbox" checked={entry.enabled} onChange={() => toggleEntry(entry)} /><span className="settings-switch" aria-hidden="true" /></label><div><div className="memory-entry-title"><strong>{entry.title}</strong><span>{entry.source === "approved-answer" ? "APPROVED ANSWER" : "MANUAL"}</span></div><p>{entry.content}</p><small>Updated {new Date(entry.updatedAt).toLocaleDateString()}</small></div></div><div className="memory-entry-actions"><button className="quiet-action" onClick={() => startEditing(entry)}><Pencil size={13} /> Edit</button><button className="quiet-action memory-remove-project" onClick={() => removeEntry(entry)}><Trash2 size={13} /> Delete</button></div></>}
            </motion.article>)}</AnimatePresence>{!scopedEntries.length && <div className="memory-empty"><BrainCircuit size={21} /><strong>{query ? "No matching memories" : "Nothing saved here yet"}</strong><p>{query ? "Try another search." : "Add a stable fact here, or approve a clarification suggestion from a blueprint."}</p></div>}</div>
          </>}
        </main>
      </div>
    </motion.section>
  );
}
