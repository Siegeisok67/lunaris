import { motion } from "framer-motion";
import { Blocks, BrainCircuit, CircleHelp, Clock3, Command, Cpu, Settings2, Sparkles, WandSparkles } from "lucide-react";
import type { PromptSession } from "../../types/architect";
import type { ProviderSettings } from "../../types/provider";
import { ResourceWidget } from "./ResourceWidget";

export type NavigationPage = "forge" | "history" | "skills" | "tools" | "models" | "memory";

interface SidebarProps {
  page: NavigationPage;
  history: PromptSession[];
  settings: ProviderSettings;
  onNavigate: (page: NavigationPage | "settings") => void;
  onOpenSession: (session: PromptSession) => void;
  resources: import("../../types/provider").ResourceSnapshot | null;
  resourceError: string | null;
  monitorResources: boolean;
  onRefreshResources: () => void;
}

const navigation = [
  { id: "forge" as const, label: "Prompt Forge", icon: WandSparkles },
  { id: "history" as const, label: "History", icon: Clock3 },
  { id: "skills" as const, label: "Skill Library", icon: Sparkles },
  { id: "tools" as const, label: "Tools & MCP", icon: Blocks },
  { id: "models" as const, label: "Models & Hardware", icon: Cpu },
  { id: "memory" as const, label: "Permanent Memory", icon: BrainCircuit },
];

export function Sidebar({ page, history, settings, onNavigate, onOpenSession, resources, resourceError, monitorResources, onRefreshResources }: SidebarProps) {
  const recent = [...history].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5);
  const provider = settings.architect.provider === "ollama" ? "Ollama local" : settings.architect.provider;
  return (
    <aside className="sidebar">
      <div className="sidebar-main-nav">
        <p className="sidebar-label">WORKSPACE</p>
        {navigation.map(({ id, label, icon: Icon }) => (
          <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => onNavigate(id)}>
            {page === id && <motion.span className="nav-active-rail" layoutId="nav-active-rail" />}
            <Icon size={16} strokeWidth={1.8} /><span>{label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-history">
        <div className="sidebar-label-row"><p className="sidebar-label">RECENT PROMPTS</p><span>{history.length}</span></div>
        {recent.length ? recent.map((session) => (
          <button className="history-link" key={session.id} onClick={() => onOpenSession(session)} title={session.title}>
            <span className="history-dot" /><span>{session.pinned ? "★ " : ""}{session.title}</span>
          </button>
        )) : <p className="sidebar-empty">Your compiled prompts will appear here.</p>}
        {history.length > 5 && <button className="history-more" onClick={() => onNavigate("history")}>View all prompts</button>}
      </div>

      <div className="sidebar-spacer" />
      <ResourceWidget snapshot={resources} error={resourceError} enabled={monitorResources} onRefresh={onRefreshResources} />
      <div className="provider-status">
        <div className="status-indicator" />
        <div><span className="provider-status-label">ARCHITECT</span><strong>{provider} <span>·</span> {settings.architect.model || "Choose a model"}</strong></div>
      </div>
      <button className="nav-item sidebar-settings" onClick={() => onNavigate("settings")}><Settings2 size={16} /><span>Settings</span></button>
      <div className="sidebar-footer"><span><Command size={13} /> {settings.globalShortcut}</span><span><CircleHelp size={13} /> Lunaris 0.1</span></div>
    </aside>
  );
}
