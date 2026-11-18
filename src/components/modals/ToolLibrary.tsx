import { useMemo, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, Blocks, LoaderCircle, Plus, Radar, Save, Server, Trash2, X } from "lucide-react";
import type { LocalApplication, McpServer, McpTool, ToolCatalog, ToolHealthResult } from "../../types/tools";
import { choiceMotion, motionTransitions } from "../../lib/motion";
import { mcpServerContainsCredential } from "../../lib/toolCatalog";

type LibraryTab = "applications" | "mcp";
type Draft =
  | { kind: "application"; value: LocalApplication; isNew: boolean }
  | { kind: "mcp"; value: McpServer; isNew: boolean };

interface ToolLibraryProps {
  catalog: ToolCatalog;
  onSave: (catalog: ToolCatalog) => Promise<void>;
  onClose: () => void;
}

function tokens(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function emptyApplication(): LocalApplication {
  return { id: crypto.randomUUID(), name: "", executablePath: "", description: "", triggers: [], usageNotes: "", enabled: true };
}

function emptyServer(): McpServer {
  return { id: crypto.randomUUID(), name: "", connectionKind: "stdio", commandOrUrl: "", args: [], description: "", triggers: [], usageNotes: "", tools: [], enabled: true };
}

function emptyMcpTool(): McpTool {
  return { id: crypto.randomUUID(), name: "", description: "", usageNotes: "", triggers: [] };
}

export function ToolLibrary({ catalog, onSave, onClose }: ToolLibraryProps) {
  const [tab, setTab] = useState<LibraryTab>("applications");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthById, setHealthById] = useState<Record<string, ToolHealthResult>>({});
  const entries = tab === "applications" ? catalog.applications : catalog.mcpServers;
  const visibleName = draft?.value.name || (draft?.kind === "application" ? "New application" : "New MCP server");

  const usageCount = useMemo(() => catalog.mcpServers.reduce((count, server) => count + server.tools.length, 0), [catalog.mcpServers]);

  const openApplication = (application: LocalApplication, isNew = false) => {
    setTab("applications");
    setDraft({ kind: "application", value: { ...application }, isNew });
    setError(null);
    setMessage(null);
  };

  const openServer = (server: McpServer, isNew = false) => {
    setTab("mcp");
    setDraft({ kind: "mcp", value: { ...server, tools: server.tools.map((tool) => ({ ...tool })) }, isNew });
    setError(null);
    setMessage(null);
  };

  const addEntry = () => {
    if (tab === "applications") openApplication(emptyApplication(), true);
    else openServer(emptyServer(), true);
  };

  const validateDraft = (): string | null => {
    if (!draft?.value.name.trim()) return "Enter a name for this entry.";
    if (draft.kind === "application") {
      if (!draft.value.executablePath.trim()) return "Enter the application's executable path.";
      const duplicate = catalog.applications.some((item) => item.id !== draft.value.id && item.name.trim().toLowerCase() === draft.value.name.trim().toLowerCase());
      return duplicate ? "An application with this name already exists." : null;
    }
    if (!draft.value.commandOrUrl.trim()) return "Enter the MCP server command or URL.";
    if (mcpServerContainsCredential(draft.value)) return "Remove credentials from MCP fields. Use an environment placeholder such as ${API_KEY}; the Executor should read the secret from its own configuration.";
    const duplicateServer = catalog.mcpServers.some((item) => item.id !== draft.value.id && item.name.trim().toLowerCase() === draft.value.name.trim().toLowerCase());
    if (duplicateServer) return "An MCP server with this name already exists.";
    const toolNames = draft.value.tools.map((tool) => tool.name.trim().toLowerCase()).filter(Boolean);
    if (toolNames.length !== draft.value.tools.length) return "Give every MCP tool an exact name.";
    if (new Set(toolNames).size !== toolNames.length) return "MCP tool names must be unique within a server.";
    if (draft.value.tools.some((tool) => !tool.description.trim())) return "Add a description for every MCP tool.";
    return null;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    const validationError = validateDraft();
    if (validationError) {
      setError(validationError);
      return;
    }
    const next: ToolCatalog = draft.kind === "application"
      ? {
        ...catalog,
        applications: draft.isNew
          ? [...catalog.applications, draft.value]
          : catalog.applications.map((item) => item.id === draft.value.id ? draft.value : item),
      }
      : {
        ...catalog,
        mcpServers: draft.isNew
          ? [...catalog.mcpServers, draft.value]
          : catalog.mcpServers.map((item) => item.id === draft.value.id ? draft.value : item),
      };
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setDraft({ ...draft, isNew: false });
      setMessage("Saved to your local tool catalog.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const removeEntry = async () => {
    if (!draft || draft.isNew) {
      setDraft(null);
      return;
    }
    const next: ToolCatalog = draft.kind === "application"
      ? { ...catalog, applications: catalog.applications.filter((item) => item.id !== draft.value.id) }
      : { ...catalog, mcpServers: catalog.mcpServers.filter((item) => item.id !== draft.value.id) };
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setDraft(null);
      setMessage("Removed from your local tool catalog.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const updateApplication = (key: keyof LocalApplication, value: string | string[] | boolean) => {
    setDraft((current) => current?.kind === "application" ? { ...current, value: { ...current.value, [key]: value } } : current);
  };

  const updateServer = (key: keyof McpServer, value: string | string[] | boolean | McpTool[]) => {
    setDraft((current) => current?.kind === "mcp" ? { ...current, value: { ...current.value, [key]: value } } : current);
  };

  const updateTool = (id: string, key: keyof McpTool, value: string | string[]) => {
    if (draft?.kind !== "mcp") return;
    updateServer("tools", draft.value.tools.map((tool) => tool.id === id ? { ...tool, [key]: value } : tool));
  };

  const checkCurrentEntry = async () => {
    if (!draft) return;
    setHealthBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await invoke<ToolHealthResult>("check_tool_health", {
        kind: draft.kind,
        connectionKind: draft.kind === "mcp" ? draft.value.connectionKind : null,
        location: draft.kind === "application" ? draft.value.executablePath : draft.value.commandOrUrl,
      });
      setHealthById((current) => ({ ...current, [draft.value.id]: result }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setHealthBusy(false);
    }
  };

  const toolEntryCount = (server: McpServer) => `${server.tools.length} ${server.tools.length === 1 ? "call" : "calls"}`;

  return (
    <motion.div className="tools-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={motionTransitions.page}>
      <div className="tools-page-heading">
        <div><span className="tools-eyebrow">PROMPT CONTEXT</span><h2>Tools &amp; MCP</h2><p>Register the applications and exact MCP calls your Executor can use.</p></div>
        <button type="button" className="skills-icon-button" aria-label="Close tool library" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="tools-workspace">
        <aside className="tools-list-panel" aria-label="Tool catalog">
          <div className="tools-tabs" role="tablist" aria-label="Tool types">
            <motion.button type="button" role="tab" aria-selected={tab === "applications"} className={tab === "applications" ? "active" : ""} onClick={() => { setTab("applications"); setDraft(null); setError(null); }} {...choiceMotion}><AppWindow size={14} /> Apps <span>{catalog.applications.length}</span></motion.button>
            <motion.button type="button" role="tab" aria-selected={tab === "mcp"} className={tab === "mcp" ? "active" : ""} onClick={() => { setTab("mcp"); setDraft(null); setError(null); }} {...choiceMotion}><Blocks size={14} /> MCPs <span>{catalog.mcpServers.length}</span></motion.button>
          </div>
          <button type="button" className="tools-new-button" onClick={addEntry}><Plus size={15} /> Add {tab === "applications" ? "application" : "MCP server"}</button>
          <p className="tools-list-count">{tab === "applications" ? `${catalog.applications.filter((item) => item.enabled).length} enabled applications` : `${usageCount} registered MCP calls`}</p>
          <div className="tools-list-items">
            {entries.map((entry) => {
              const selected = draft?.value.id === entry.id && draft.kind === (tab === "applications" ? "application" : "mcp");
              const name = entry.name || (tab === "applications" ? "Unnamed application" : "Unnamed MCP server");
              const detail = tab === "applications"
                ? (entry as LocalApplication).executablePath
                : `${toolEntryCount(entry as McpServer)} · ${(entry as McpServer).commandOrUrl}`;
              return (
                <button key={entry.id} type="button" className={`tools-list-item ${selected ? "active" : ""}`} onClick={() => tab === "applications" ? openApplication(entry as LocalApplication) : openServer(entry as McpServer)}>
                  <span className="tools-list-icon">{tab === "applications" ? <AppWindow size={15} /> : <Server size={15} />}</span>
                  <span className="tools-list-copy"><strong>{name}</strong><small>{detail}</small><em>{entry.enabled ? "Enabled for prompts" : "Disabled"}{healthById[entry.id] ? ` · ${healthById[entry.id].status} · checked ${new Date(Number(healthById[entry.id].checkedAt) * 1000).toLocaleTimeString()}` : ""}</em></span>
                </button>
              );
            })}
            {!entries.length && <div className="tools-empty-list">{tab === "applications" ? "Add Blender, Krita, GIMP, or another local application." : "Add an MCP server and register its exact callable tool names."}</div>}
          </div>
        </aside>

        <main className="tools-editor-panel">
          <AnimatePresence mode="wait">
            {!draft ? (
              <motion.div key="empty" className="tools-editor-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {tab === "applications" ? <AppWindow size={30} /> : <Blocks size={30} />}
                <h3>{tab === "applications" ? "Local applications" : "MCP server catalog"}</h3>
                <p>{tab === "applications" ? "Save app names, executable locations, and when the Executor should use them." : "Save MCP connection context and exact callable names. The Executor supplies the actual MCP connection."}</p>
                <button type="button" className="secondary-button" onClick={addEntry}><Plus size={14} /> Add {tab === "applications" ? "application" : "MCP server"}</button>
              </motion.div>
            ) : (
              <motion.form key={`${draft.kind}-${draft.value.id}`} onSubmit={(event) => void submit(event)} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.22 }}>
                <div className="tools-editor-heading">
                  <div><span className="tools-eyebrow">{draft.isNew ? "NEW ENTRY" : draft.kind === "application" ? "LOCAL APPLICATION" : "MCP SERVER"}</span><h3>{visibleName}</h3></div>
                  <label className="tools-enabled"><input type="checkbox" checked={draft.value.enabled} onChange={(event) => draft.kind === "application" ? updateApplication("enabled", event.target.checked) : updateServer("enabled", event.target.checked)} /><span>Use in prompts</span></label>
                </div>

                {draft.kind === "application" ? (
                  <div className="tools-form-scroll">
                    <label className="tools-field"><span>Application name</span><input value={draft.value.name} onChange={(event) => updateApplication("name", event.target.value)} placeholder="Blender" maxLength={100} /></label>
                    <label className="tools-field"><span>Executable location</span><input value={draft.value.executablePath} onChange={(event) => updateApplication("executablePath", event.target.value)} placeholder={'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe'} spellCheck={false} /><small>Stored for the Executor prompt. Lunaris will not launch this path.</small></label>
                    <label className="tools-field"><span>What is it used for?</span><textarea value={draft.value.description} onChange={(event) => updateApplication("description", event.target.value)} placeholder="3D modeling, scene inspection, scripting, and rendering" rows={3} maxLength={1200} /></label>
                    <label className="tools-field"><span>Use when these terms appear</span><input value={draft.value.triggers.join(", ")} onChange={(event) => updateApplication("triggers", tokens(event.target.value))} placeholder="blender, 3D scene, bpy, mesh" /></label>
                    <label className="tools-field"><span>Executor usage notes</span><textarea value={draft.value.usageNotes} onChange={(event) => updateApplication("usageNotes", event.target.value)} placeholder="Use the Blender MCP for scene access; run Python through execute_blender_code." rows={4} maxLength={3000} /></label>
                  </div>
                ) : (
                  <div className="tools-form-scroll">
                    <label className="tools-field"><span>Server name</span><input value={draft.value.name} onChange={(event) => updateServer("name", event.target.value)} placeholder="Blender MCP" maxLength={100} /></label>
                    <div className="tools-field-row">
                      <label className="tools-field"><span>Connection kind</span><select value={draft.value.connectionKind} onChange={(event) => updateServer("connectionKind", event.target.value as McpServer["connectionKind"])}><option value="stdio">Local command</option><option value="url">URL endpoint</option></select></label>
                      <label className="tools-field"><span>{draft.value.connectionKind === "stdio" ? "Command or executable path" : "Server URL"}</span><input value={draft.value.commandOrUrl} onChange={(event) => updateServer("commandOrUrl", event.target.value)} placeholder={draft.value.connectionKind === "stdio" ? "uvx blender-mcp" : "http://localhost:3000/mcp"} spellCheck={false} /></label>
                    </div>
                    {draft.value.connectionKind === "stdio" && <label className="tools-field"><span>Arguments (one per line)</span><textarea value={draft.value.args.join("\n")} onChange={(event) => updateServer("args", event.target.value.split(/\r?\n/).filter((line) => line.trim()))} placeholder="--some-option" rows={2} /></label>}
                    <label className="tools-field"><span>What does this server provide?</span><textarea value={draft.value.description} onChange={(event) => updateServer("description", event.target.value)} placeholder="Tools for inspecting and editing the active Blender scene." rows={2} maxLength={1200} /></label>
                    <label className="tools-field"><span>Use when these terms appear</span><input value={draft.value.triggers.join(", ")} onChange={(event) => updateServer("triggers", tokens(event.target.value))} placeholder="blender, bpy, scene" /></label>
                    <label className="tools-field"><span>Server usage notes</span><textarea value={draft.value.usageNotes} onChange={(event) => updateServer("usageNotes", event.target.value)} placeholder="Use only with the connected Blender session. Inspect the scene before editing." rows={2} maxLength={2000} /></label>
                    <div className="mcp-tools-heading"><div><strong>Callable tools</strong><small>Enter exact names as exposed by the MCP server.</small></div><button type="button" className="quiet-action" onClick={() => updateServer("tools", [...draft.value.tools, emptyMcpTool()])}><Plus size={14} /> Add call</button></div>
                    {draft.value.tools.length ? draft.value.tools.map((tool, index) => (
                      <section className="mcp-tool-editor" key={tool.id}>
                        <div className="mcp-tool-title"><strong>Call {String(index + 1).padStart(2, "0")}</strong><button type="button" className="tools-remove-call" aria-label={`Remove ${tool.name || "MCP call"}`} onClick={() => updateServer("tools", draft.value.tools.filter((item) => item.id !== tool.id))}><Trash2 size={14} /></button></div>
                        <label className="tools-field"><span>Exact callable name</span><input value={tool.name} onChange={(event) => updateTool(tool.id, "name", event.target.value)} placeholder="get_objects_summary" /></label>
                        <label className="tools-field"><span>What does it do?</span><textarea value={tool.description} onChange={(event) => updateTool(tool.id, "description", event.target.value)} placeholder="Returns the names, types, and transforms of objects in the active scene." rows={2} maxLength={1200} /></label>
                        <label className="tools-field"><span>When and how to use it</span><textarea value={tool.usageNotes} onChange={(event) => updateTool(tool.id, "usageNotes", event.target.value)} placeholder="Call before creating geometry to inspect existing objects." rows={2} maxLength={1600} /></label>
                        <label className="tools-field"><span>Trigger terms</span><input value={tool.triggers.join(", ")} onChange={(event) => updateTool(tool.id, "triggers", tokens(event.target.value))} placeholder="inspect scene, existing objects" /></label>
                      </section>
                    )) : <p className="mcp-no-tools">No calls registered yet. Add the exact tools your Executor can access.</p>}
                    <p className="tools-secret-note">Do not put API keys, passwords, or secret values in these fields. Use placeholders such as ${"${API_KEY}"}; Lunaris checks for common credential patterns and excludes matching MCP entries from prompts.</p>
                  </div>
                )}

                <div className="tools-editor-footer">
                  <div className="tools-editor-feedback">
                    {error && <p className="inline-error" role="alert">{error}</p>}
                    {message && <p className="tools-success" role="status">{message}</p>}
                    {draft && healthById[draft.value.id] && <p className={`tool-health-result ${healthById[draft.value.id].status}`} role="status">{healthById[draft.value.id].detail}</p>}
                  </div>
                  <div className="tools-editor-actions">
                    <button type="button" className="secondary-button tool-check-button" onClick={() => void checkCurrentEntry()} disabled={healthBusy}><Radar size={13} />{healthBusy ? <LoaderCircle className="spin" size={13} /> : "Check"}</button>
                    <button type="button" className="tools-delete-button" onClick={() => void removeEntry()} disabled={busy}><Trash2 size={14} /> {draft.isNew ? "Discard" : "Remove"}</button>
                    <button type="submit" className="primary-button" disabled={busy}><Save size={14} /> Save entry</button>
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </main>
      </div>
    </motion.div>
  );
}
