import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ImagePlus, LibraryBig, LoaderCircle, Paperclip, Pencil, Plus, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import type { ReferenceImage } from "../../types/architect";
import type { ProviderConfig } from "../../types/provider";
import { GlassCard } from "../ui/GlassCard";
import { PROMPT_TEMPLATES, type PromptTemplate, type PromptTemplateCategory } from "../../data/promptTemplates";
import type { MemoryCollection, MemoryProject } from "../../types/memory";
import { memoryPayload } from "../../lib/memory";

interface PromptInputProps {
  config: ProviderConfig;
  memory: MemoryCollection;
  selectedProjectId: string | null;
  memoryEnabled: boolean;
  customTemplates: PromptTemplate[];
  onSaveCustomTemplates: (templates: PromptTemplate[]) => void;
  onProjectChange: (projectId: string | null) => void;
  onMemoryEnabledChange: (enabled: boolean) => void;
  onStart: (prompt: string, images: ReferenceImage[], projectId: string | null, includeMemory: boolean) => void;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_000_000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The selected file is not a readable image."));
    image.src = dataUrl;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the image file."));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

async function fromFile(file: File): Promise<ReferenceImage> {
  if (!IMAGE_TYPES.has(file.type)) throw new Error("Use a PNG, JPEG, or WebP screenshot.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Each screenshot must be smaller than 8 MB.");
  const previewUrl = await fileToDataUrl(file);
  const image = await loadImage(previewUrl);
  if (image.width * image.height > MAX_IMAGE_PIXELS) throw new Error("This screenshot is too large to process safely.");
  return {
    id: crypto.randomUUID(),
    name: file.name || `Reference ${new Date().toLocaleTimeString()}`,
    mimeType: file.type as ReferenceImage["mimeType"],
    base64: previewUrl.slice(previewUrl.indexOf(",") + 1),
    previewUrl,
    width: image.width,
    height: image.height,
    sizeBytes: file.size,
  };
}

async function fromClipboard(): Promise<ReferenceImage> {
  const image = await readImage();
  const { width, height } = await image.size();
  if (width * height > MAX_IMAGE_PIXELS) throw new Error("The clipboard screenshot is too large to process safely.");
  const rgba = await image.rgba();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the clipboard screenshot.");
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const previewUrl = canvas.toDataURL("image/png");
  const base64 = previewUrl.slice(previewUrl.indexOf(",") + 1);
  if (base64.length > Math.ceil(MAX_FILE_BYTES * 4 / 3)) throw new Error("The clipboard screenshot must encode to less than 8 MB.");
  return {
    id: crypto.randomUUID(),
    name: `Clipboard screenshot ${new Date().toLocaleTimeString()}`,
    mimeType: "image/png",
    base64,
    previewUrl,
    width,
    height,
    sizeBytes: Math.floor(base64.length * 3 / 4),
  };
}

export function PromptInput({ config, memory, selectedProjectId, memoryEnabled, customTemplates, onSaveCustomTemplates, onProjectChange, onMemoryEnabledChange, onStart }: PromptInputProps) {
  const [prompt, setPrompt] = useState(() => { try { return localStorage.getItem("lunaris.promptDraft") ?? ""; } catch { return ""; } });
  const [draftRecovered] = useState(() => { try { return Boolean(localStorage.getItem("lunaris.promptDraft")); } catch { return false; } });
  useEffect(() => { try { if (prompt.trim()) localStorage.setItem("lunaris.promptDraft", prompt); else localStorage.removeItem("lunaris.promptDraft"); } catch { /* Draft recovery is best effort when storage is unavailable. */ } }, [prompt]);
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [readingImage, setReadingImage] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateCategory, setTemplateCategory] = useState("All");
  const [templateDraft, setTemplateDraft] = useState<PromptTemplate | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const starters = [
    { label: "Build an app", text: "Help me plan and build an app. Clarify the users, core workflow, visual direction, platform, and integrations before writing the implementation plan." },
    { label: "Create in Blender", text: "Help me create this in Blender. Clarify the subject, style, scale, scene contents, and how I want to review the result. Include relevant Blender tools and skills in the final plan." },
    { label: "Improve a design", text: "Help me improve this design. Review my reference images, identify the intended audience and mood, then clarify the most important changes and how I will judge the result." },
  ];
  const visibleTemplates = [...PROMPT_TEMPLATES, ...customTemplates].filter((template) => (templateCategory === "All" || template.category === templateCategory) && `${template.title} ${template.description} ${template.prompt}`.toLowerCase().includes(templateQuery.trim().toLowerCase()));
  const includedMemory = memoryPayload(memory, selectedProjectId, memoryEnabled);

  const beginTemplate = (template?: PromptTemplate) => setTemplateDraft(template ?? {
    id: `custom-${crypto.randomUUID()}`,
    title: "",
    category: "Workflow",
    description: "",
    prompt: "",
  });

  const saveTemplate = () => {
    if (!templateDraft?.title.trim() || !templateDraft.prompt.trim()) return;
    const existing = customTemplates.some((template) => template.id === templateDraft.id);
    if (!existing && customTemplates.length >= 100) return;
    const updated = existing
      ? customTemplates.map((template) => template.id === templateDraft.id ? { ...templateDraft, title: templateDraft.title.trim(), description: templateDraft.description.trim(), prompt: templateDraft.prompt.trim() } : template)
      : [...customTemplates, { ...templateDraft, title: templateDraft.title.trim(), description: templateDraft.description.trim(), prompt: templateDraft.prompt.trim() }];
    onSaveCustomTemplates(updated);
    setTemplateDraft(null);
  };

  const deleteTemplate = (template: PromptTemplate) => {
    if (!window.confirm(`Delete the custom template “${template.title}”?`)) return;
    onSaveCustomTemplates(customTemplates.filter((item) => item.id !== template.id));
  };

  const addFiles = async (files: FileList | File[]) => {
    setImageError(null);
    for (const file of Array.from(files)) {
      try {
        const image = await fromFile(file);
        setImages((current) => current.length >= 5 ? current : [...current, image]);
      } catch (caught) {
        setImageError(caught instanceof Error ? caught.message : String(caught));
      }
    }
  };

  const pasteImage = async () => {
    setReadingImage(true);
    setImageError(null);
    try {
      const image = await fromClipboard();
      setImages((current) => current.length >= 5 ? current : [...current, image]);
    } catch {
      setImageError("No screenshot was found on the clipboard.");
    } finally {
      setReadingImage(false);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);
    if (imageFiles.length) {
      event.preventDefault();
      void addFiles(imageFiles);
    }
  };

  const start = () => {
    if (!prompt.trim() || !config.model.trim()) return;
    try { localStorage.removeItem("lunaris.promptDraft"); } catch { /* Ignore unavailable storage. */ }
    onStart(prompt.trim(), images, selectedProjectId, memoryEnabled);
  };

  return (
    <div className="prompt-start-page">
      <div className="forge-heading">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="eyebrow"><span className="eyebrow-line" /> THINK IT THROUGH <span className="eyebrow-line" /></div>
          <h1>Big idea, <span>clear plan.</span></h1>
          <p>Give Lunaris the rough version. It will ask what matters, then shape the prompt your execution AI needs.</p>
        </motion.div>
      </div>

      <GlassCard className={`prompt-card ${dragging ? "dragging" : ""}`} delay={0.05}>
        <div className="prompt-card-top">
          <div><Sparkles size={15} /><span>START WITH THE ROUGH VERSION</span></div>
          <span className="prompt-length">{prompt.length.toLocaleString()} / 16,000</span>
        </div>
        {draftRecovered && prompt.trim() && <p className="draft-recovery-note">Draft restored from your last visit. You can edit it before continuing.</p>}
        <div className="prompt-memory-controls">
          <label className="settings-field prompt-project-select"><span>Project context</span><select value={selectedProjectId ?? ""} onChange={(event) => onProjectChange(event.target.value || null)}><option value="">No project selected</option>{memory.projects.map((project: MemoryProject) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className="prompt-memory-toggle"><input type="checkbox" checked={memoryEnabled} onChange={(event) => onMemoryEnabledChange(event.target.checked)} /><span className="settings-switch" aria-hidden="true" /><span><strong>Include saved memory</strong><small>{!memoryEnabled ? "No saved memory will be shared" : includedMemory.entries.length ? `${includedMemory.entries.length} saved fact${includedMemory.entries.length === 1 ? "" : "s"}${includedMemory.includesProjectOverview ? " plus project overview" : ""} will be shared${includedMemory.omittedCount ? ` · ${includedMemory.omittedCount} over the context limit` : ""}` : includedMemory.includesProjectOverview ? "Project overview will be shared" : "No saved facts for this prompt"}</small></span></label>
          {includedMemory.text && <details className="prompt-memory-preview"><summary>Review exact context being shared</summary><pre>{includedMemory.text}</pre></details>}
        </div>
        <div
          className="prompt-dropzone"
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files); }}
        >
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value.slice(0, 16_000))}
            onPaste={handlePaste}
            placeholder="I want to build…"
            aria-label="Describe the project or task"
            maxLength={16_000}
            autoFocus
          />
          {dragging && <div className="drop-overlay"><ImagePlus size={22} /> Drop reference screenshots</div>}
        </div>

        <AnimatePresence>
          {images.length > 0 && (
            <motion.div className="attachment-list" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
              {images.map((image) => (
                <div className="attachment-chip" key={image.id}>
                  <img src={image.previewUrl} alt="" />
                  <span title={image.name}>{image.name}</span>
                  <button aria-label={`Remove ${image.name}`} onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}><X size={13} /></button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="prompt-card-bottom">
          <div className="attachment-actions">
            <button className="quiet-action" onClick={() => fileInput.current?.click()}><Paperclip size={14} /> Add screenshots</button>
            <button className="quiet-action" onClick={() => void pasteImage()} disabled={readingImage}>
              {readingImage ? <LoaderCircle className="spin" size={14} /> : <ImagePlus size={14} />} Paste image
            </button>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ""; }} />
          </div>
          <div className="model-and-submit">
            <div className="active-model-pill"><span className="model-dot" />{config.provider} <i>·</i> {config.model || "No model selected"}</div>
            <button className="primary-button" disabled={!prompt.trim() || !config.model.trim()} onClick={start}><span>Clarify this</span><Send size={14} /></button>
          </div>
        </div>
        {imageError && <p className="inline-error image-error">{imageError}</p>}
        {images.length > 0 && !config.visionEnabled && <p className="inline-hint">The Architect will receive image names only. Lunaris keeps the images for the Executor and includes them with streamed requests or stages files for IDE handoff.</p>}
        {images.length >= 5 && <p className="inline-hint">Maximum of five reference images reached.</p>}
      </GlassCard>

      <div className="prompt-starters" aria-label="Prompt starters"><span>NEED A STARTING POINT?</span>{starters.map((starter) => <button type="button" key={starter.label} onClick={() => setPrompt(starter.text)}>{starter.label}</button>)}<button type="button" className="template-gallery-launch" onClick={() => setTemplatesOpen(true)}><LibraryBig size={13} /> Browse templates</button></div>
      <div className="prompt-footnotes"><span>Works with coding, 3D, design, and research tasks</span><span>Nothing is sent until you start</span></div>
      <AnimatePresence>
        {templatesOpen && <motion.div className="template-gallery-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setTemplatesOpen(false); }}>
          <motion.section className="template-gallery glass-card" role="dialog" aria-modal="true" aria-labelledby="template-gallery-title" initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }}>
            <header className="template-gallery-heading"><div><span className="settings-eyebrow">START WITH STRUCTURE</span><h2 id="template-gallery-title">Prompt templates</h2><p>Choose a starting point or save a reusable workflow for later.</p></div><div className="template-gallery-heading-actions"><button className="secondary-button" onClick={() => beginTemplate()}><Plus size={13} /> New template</button><button className="settings-icon-button" aria-label="Close templates" onClick={() => setTemplatesOpen(false)}><X size={17} /></button></div></header>
            <div className="template-gallery-tools"><label className="template-search"><Search size={15} /><input aria-label="Search prompt templates" value={templateQuery} onChange={(event) => setTemplateQuery(event.target.value)} placeholder="Search templates…" /></label><div className="template-categories">{["All", "Development", "Creative", "Workflow"].map((category) => <button key={category} className={templateCategory === category ? "active" : ""} aria-pressed={templateCategory === category} onClick={() => setTemplateCategory(category)}>{category}</button>)}</div></div>
            {templateDraft && <form className="custom-template-form" onSubmit={(event) => { event.preventDefault(); saveTemplate(); }}><div className="custom-template-form-heading"><strong>{customTemplates.some((template) => template.id === templateDraft.id) ? "Edit custom template" : "Create custom template"}</strong><button type="button" className="settings-icon-button" aria-label="Cancel template edit" onClick={() => setTemplateDraft(null)}><X size={14} /></button></div><div className="custom-template-form-grid"><label><span>Title</span><input required maxLength={80} value={templateDraft.title} onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })} placeholder="e.g. Blender prop blockout" /></label><label><span>Category</span><select value={templateDraft.category} onChange={(event) => setTemplateDraft({ ...templateDraft, category: event.target.value as PromptTemplateCategory })}><option>Development</option><option>Creative</option><option>Workflow</option></select></label><label className="wide"><span>Short description</span><input maxLength={180} value={templateDraft.description} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} placeholder="What this workflow is for" /></label><label className="wide"><span>Prompt</span><textarea required maxLength={16000} rows={5} value={templateDraft.prompt} onChange={(event) => setTemplateDraft({ ...templateDraft, prompt: event.target.value })} placeholder="Write the reusable request and details Lunaris should clarify…" /></label></div><div className="custom-template-form-actions"><small>{customTemplates.length}/100 saved · {templateDraft.prompt.length.toLocaleString()} / 16,000 characters</small><button type="submit" className="primary-button" disabled={!templateDraft.title.trim() || !templateDraft.prompt.trim() || (!customTemplates.some((template) => template.id === templateDraft.id) && customTemplates.length >= 100)}>Save template</button></div></form>}
            <div className="template-gallery-grid">{visibleTemplates.map((template) => {
              const custom = template.id.startsWith("custom-");
              return <article key={template.id} className={`template-choice ${custom ? "custom" : ""}`}><span>{custom ? `CUSTOM · ${template.category}` : template.category}</span><strong>{template.title}</strong><small>{template.description}</small><div className="template-choice-actions"><button type="button" onClick={() => { setPrompt(template.prompt); setTemplatesOpen(false); }}><i>Use template <ArrowUpRight size={13} /></i></button>{custom && <><button type="button" aria-label={`Edit ${template.title}`} onClick={() => beginTemplate(template)}><Pencil size={12} /></button><button type="button" aria-label={`Delete ${template.title}`} onClick={() => deleteTemplate(template)}><Trash2 size={12} /></button></>}</div></article>;
            })}{visibleTemplates.length === 0 && <p className="template-no-results">No templates match that search.</p>}</div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
    </div>
  );
}
