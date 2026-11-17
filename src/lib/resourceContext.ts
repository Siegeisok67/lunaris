import type { ResourceSnapshot } from "../types/provider";

function formatGiB(value: number | null): string {
  return value === null ? "unavailable" : `${(value / 1024 ** 3).toFixed(1)} GB`;
}

export function resourceContext(snapshot: ResourceSnapshot | null): string {
  if (!snapshot) return "Live system resource telemetry is currently unavailable.";
  const sampledAt = Number(snapshot.sampledAt);
  const lines = [
    `Sampled at: ${Number.isFinite(sampledAt) ? new Date(sampledAt).toISOString() : "time unavailable"}`,
    `System RAM: ${formatGiB(snapshot.ramUsedBytes)} used / ${formatGiB(snapshot.ramTotalBytes)} total`,
    `GPU: ${snapshot.gpuName ?? snapshot.availability.gpu ?? "unavailable"}`,
    `GPU memory: ${formatGiB(snapshot.vramUsedBytes)} used / ${formatGiB(snapshot.vramTotalBytes)} total`,
  ];
  const processes = snapshot.processes.slice(0, 8).map((process) =>
    `- ${process.name} (PID ${process.pid}): RAM ${formatGiB(process.ramBytes)}, VRAM ${formatGiB(process.vramBytes)}`,
  );
  if (processes.length) lines.push("Largest reported processes:", ...processes);
  if (snapshot.availability.processGpu) lines.push(`GPU process detail: ${snapshot.availability.processGpu}`);
  return lines.join("\n");
}
