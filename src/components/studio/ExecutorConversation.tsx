import { useState } from "react";
import { ArrowUpRight, Clipboard, LoaderCircle, MessageCircle, Send } from "lucide-react";
import type { ExecutorTurn } from "../../types/architect";
import type { ExecutorMode } from "../../types/provider";

interface ExecutorConversationProps {
  mode: ExecutorMode;
  turns: ExecutorTurn[];
  streamingText: string;
  streaming: boolean;
  error: string | null;
  activeStageTitle: string;
  onSend: (message: string) => void;
  onCopy: (message: string) => void;
  onRecordReply: (message: string) => void;
}

export function ExecutorConversation({ mode, turns, streamingText, streaming, error, activeStageTitle, onSend, onCopy, onRecordReply }: ExecutorConversationProps) {
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const submit = () => {
    if (!draft.trim() || streaming) return;
    if (mode === "stream") onSend(draft.trim());
    else onCopy(draft.trim());
    setDraft("");
  };

  return (
    <section className="studio-conversation glass-card" aria-labelledby="studio-conversation-title">
      <header className="studio-panel-heading"><div className="studio-panel-icon"><MessageCircle size={16} /></div><div><span>SESSION DISCUSSION</span><h2 id="studio-conversation-title">Executor follow-up</h2><p>Keep questions and decisions attached to this blueprint.</p></div></header>
      <div className="studio-chat-log" role="log" aria-label="Executor conversation" aria-live="polite">
        {!turns.length && <div className="studio-chat-empty">Ask the Executor about the current plan or a completed stage.</div>}
        {turns.map((turn) => <article className={`studio-chat-turn ${turn.role}`} key={turn.id}><span>{turn.role === "user" ? "YOU" : "EXECUTOR"}{turn.stageId ? ` · ${turn.stageId}` : ""}</span><p>{turn.content}</p></article>)}
        {streaming && <article className="studio-chat-turn assistant streaming"><span><LoaderCircle className="spin" size={12} /> EXECUTOR · {activeStageTitle || "FOLLOW-UP"}</span><p>{streamingText || "Thinking…"}</p></article>}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <label className="studio-chat-input"><span className="sr-only">Follow-up message</span><textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 6000))} onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); } }} placeholder={mode === "stream" ? "Ask a follow-up about this blueprint…" : "Write a follow-up for your IDE agent…"} rows={3} /><small>Ctrl+Enter to {mode === "stream" ? "send" : "copy"} · {draft.length.toLocaleString()}/6,000</small></label>
      <div className="studio-chat-actions"><span>{mode === "stream" ? "Streamed replies are saved in this session." : "Copy the handoff, then paste the Executor reply below to keep a record."}</span><button className="primary-button" disabled={!draft.trim() || streaming} onClick={submit}>{mode === "stream" ? <><Send size={13} /> Send follow-up</> : <><Clipboard size={13} /> Copy follow-up</>}</button></div>
      {mode === "handoff" && <div className="studio-handoff-reply"><label><span>Paste the Executor's reply</span><textarea value={reply} onChange={(event) => setReply(event.target.value.slice(0, 12000))} rows={3} placeholder="The Executor's response…" /></label><button className="secondary-button" disabled={!reply.trim()} onClick={() => { onRecordReply(reply.trim()); setReply(""); }}>Save reply <ArrowUpRight size={13} /></button></div>}
    </section>
  );
}
