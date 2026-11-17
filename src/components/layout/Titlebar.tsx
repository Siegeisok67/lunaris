import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, Moon, X } from "lucide-react";

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void invoke<boolean>("window_is_maximized").then(setMaximized).catch(() => undefined);
  }, []);

  const toggleMaximize = async () => {
    try {
      setMaximized(await invoke<boolean>("window_toggle_maximize"));
    } catch {
      setMaximized(false);
    }
  };

  const beginWindowDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const handleTitlebarDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    void toggleMaximize();
  };

  return (
    <header className="titlebar" data-tauri-drag-region onPointerDown={beginWindowDrag} onDoubleClick={handleTitlebarDoubleClick}>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-mark"><Moon size={15} strokeWidth={1.8} /></span>
        <span>LUNARIS</span>
        <span className="titlebar-divider" />
        <span className="titlebar-caption">Prompt studio</span>
      </div>
      <div className="window-controls" aria-label="Window controls">
        <button aria-label="Minimize" title="Minimize" onClick={() => void invoke("window_minimize")}><Minus size={15} /></button>
        <button aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} onClick={() => void toggleMaximize()}>
          {maximized ? <span className="restore-icon">▢</span> : <Maximize2 size={13} />}
        </button>
        <button className="close-window" aria-label="Close" title="Close" onClick={() => void invoke("window_close")}><X size={15} /></button>
      </div>
    </header>
  );
}
