import { useState } from "react";
import { Activity, ChevronDown, ChevronUp, Cpu, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import type { ResourceSnapshot } from "../../types/provider";

interface ResourceWidgetProps {
  snapshot: ResourceSnapshot | null;
  error: string | null;
  enabled: boolean;
  onRefresh: () => void;
}

function gib(value: number | null): string {
  return value === null ? "—" : `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function ResourceWidget({ snapshot, error, enabled, onRefresh }: ResourceWidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const ramPercent = snapshot?.ramTotalBytes && snapshot.ramUsedBytes ? Math.min(100, snapshot.ramUsedBytes / snapshot.ramTotalBytes * 100) : 0;
  const vramPercent = snapshot?.vramTotalBytes && snapshot.vramUsedBytes ? Math.min(100, snapshot.vramUsedBytes / snapshot.vramTotalBytes * 100) : 0;
  return (
    <section className="resource-widget" aria-label="System resources">
      <button className="resource-widget-toggle" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className="resource-widget-icon"><Activity size={14} /></span>
        <span className="resource-widget-title"><strong>Live resources</strong><small>{enabled ? snapshot?.gpuName ?? (error ? "Monitor unavailable" : "Sampling…") : "Monitoring paused"}</small></span>
        {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {enabled && snapshot && (
        <div className="resource-widget-bars">
          <div><span>VRAM</span><i><b style={{ width: `${vramPercent}%` }} /></i><strong>{gib(snapshot.vramUsedBytes)}</strong></div>
          <div><span>RAM</span><i><b style={{ width: `${ramPercent}%` }} /></i><strong>{gib(snapshot.ramUsedBytes)}</strong></div>
        </div>
      )}
      {expanded && <div className="resource-widget-details">
        {snapshot ? <>
          <div className="resource-total"><Cpu size={13} /><span>{snapshot.gpuName ?? snapshot.availability.gpu ?? "GPU counters unavailable"}</span><strong>{gib(snapshot.vramUsedBytes)} / {gib(snapshot.vramTotalBytes)}</strong></div>
          <div className="resource-total"><MemoryStick size={13} /><span>System memory</span><strong>{gib(snapshot.ramUsedBytes)} / {gib(snapshot.ramTotalBytes)}</strong></div>
          <p className="resource-process-heading"><HardDrive size={12} /> Largest processes</p>
          {snapshot.processes.slice(0, 5).map((process) => <div className="resource-process" key={process.pid}><span>{process.name}</span><small>{gib(process.ramBytes)} RAM · {gib(process.vramBytes)} VRAM</small></div>)}
          {snapshot.availability.processGpu && <small className="resource-unavailable">{snapshot.availability.processGpu}</small>}
        </> : <p>{error || (enabled ? "Waiting for the first sample…" : "Enable resource monitoring in Settings.")}</p>}
        <button type="button" className="resource-refresh" onClick={onRefresh} disabled={!enabled}><RefreshCw size={12} /> Refresh now</button>
      </div>}
    </section>
  );
}
