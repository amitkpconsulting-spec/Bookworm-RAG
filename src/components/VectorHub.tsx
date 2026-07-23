import React, { useState, useEffect } from "react";
import { 
  Database, 
  Sliders, 
  Check, 
  BookOpen, 
  Sparkles, 
  RefreshCw, 
  Trash2, 
  Settings2, 
  Layers, 
  ShieldAlert,
  HardDrive
} from "lucide-react";
import { RAGSettings, SourceDocument } from "../types";

interface VectorHubProps {
  settings: RAGSettings;
  onUpdateSettings: (updated: Partial<RAGSettings>) => Promise<void>;
  onShowSuccess: (msg: string) => void;
  documents: SourceDocument[];
  totalChunks: number;
  isGenerating?: boolean;
}

export default function VectorHub({ 
  settings, 
  onUpdateSettings, 
  onShowSuccess,
  documents,
  totalChunks,
  isGenerating = false
}: VectorHubProps) {
  // Local temporary settings to support save button at bottom
  const [localSettings, setLocalSettings] = useState<RAGSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if backend settings change
  useEffect(() => {
    setLocalSettings({ ...settings });
  }, [settings]);

  // Calculations for Sandbox
  const totalCapacityGb = localSettings.sandboxCapacity || 64;
  const totalChars = documents.reduce((acc, curr) => acc + curr.charCount, 0);
  // Estimate size of index: rough approximation: 1MB per 1M characters
  const estimatedBytes = totalChunks * 1500 + totalChars; // Rough index size
  const currentTotalGb = (estimatedBytes / (1024 * 1024 * 1024)).toFixed(4);
  const storagePct = Math.max(0.01, Math.min(100, parseFloat(((parseFloat(currentTotalGb) / totalCapacityGb) * 100).toFixed(2))));

  const handleFieldChange = (fields: Partial<RAGSettings>) => {
    if (isGenerating) return;
    setLocalSettings(prev => ({ ...prev, ...fields }));
  };

  const handleSave = async () => {
    if (isGenerating) return;
    setIsSaving(true);
    try {
      await onUpdateSettings(localSettings);
      onShowSuccess("Vector Storage & Embeddings configuration saved successfully.");
    } catch (err) {
      console.error("Failed to save vector configuration:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const hasConflict = localSettings.vectorDb === "chroma" && localSettings.embeddingProvider === "local_tfidf";

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Tab Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#2A2D35]/50 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <h3 className="text-base font-extrabold text-white flex items-center">
              <Database className="h-5.5 w-5.5 text-indigo-400 mr-2.5" />
              Vector Index & Storage Hub
            </h3>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Local Vector Sandbox
            </span>
          </div>
          <p className="text-xs text-[#525866] mt-1">
            Configure indexers, select vector databases, choose similarity metrics, and allocate your local sandbox storage limits.
          </p>
        </div>
      </div>

      {/* RAG Query In-Progress Safety Lock Banner */}
      {isGenerating && (
        <div className="bg-amber-950/20 border-2 border-amber-500/30 rounded-2xl p-4 flex items-start space-x-3.5 text-amber-400 shadow-lg shadow-amber-950/10 animate-pulse">
          <ShieldAlert className="h-5.5 w-5.5 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-amber-300">Active Chat Query In Progress • Vector Hub Locked</h4>
            <p className="text-3xs text-amber-400/80 mt-1 leading-relaxed font-medium">
              The AI assistant is currently retrieving documents and generating a local LLM response. All vector database configuration changes, similarity metric updates, chunk sizes, and storage limits are temporarily disabled to ensure stability and prevent any connection/response corruption.
            </p>
          </div>
        </div>
      )}

      {/* Grid: Stats & Limits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Local Storage Card */}
        <div className="bg-[#16181D]/60 border border-[#2A2D35] p-5 rounded-2xl flex flex-col justify-between shadow-md">
          <div>
            <p className="text-[11px] text-[#525866] font-bold uppercase tracking-widest mb-1 flex items-center">
              <HardDrive className="h-3 w-3 mr-1 text-indigo-400" />
              Local Storage Sandbox
            </p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-lg font-mono font-extrabold text-white">{currentTotalGb} GB</span>
              <span className="text-3xs text-[#525866] font-semibold">of {totalCapacityGb} GB limit</span>
            </div>

            {/* Capacity Selection Buttons */}
            <div className="mt-3 pt-3 border-t border-[#2A2D35]/30">
              <label className="text-[9px] text-[#525866] font-extrabold uppercase tracking-widest block mb-1.5">
                Adjust Capacity Limit
              </label>
              <div className="grid grid-cols-5 gap-1 bg-[#0B0C0E]/50 p-0.5 rounded-lg border border-[#2A2D35]/50">
                {[64, 128, 256, 384, 512].map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => {
                      if (isGenerating) return;
                      handleFieldChange({ sandboxCapacity: cap });
                    }}
                    disabled={isGenerating}
                    title={`${cap} GB Storage Sandbox`}
                    className={`py-1 text-[10px] font-mono font-bold rounded transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                      totalCapacityGb === cap
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                        : "text-[#525866] hover:text-[#E0E0E0] hover:bg-[#16181D]/40"
                    }`}
                  >
                    {cap}G
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-2 w-full bg-[#0B0C0E] rounded-full">
              <div 
                className="h-full bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-500"
                style={{ width: `${storagePct}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-3xs text-[#525866] font-mono">
              <span>{storagePct}% capacity used</span>
              <span className="text-emerald-500 font-bold uppercase">Active sandbox</span>
            </div>
          </div>
        </div>

        {/* Passages Card */}
        <div className="bg-[#16181D]/60 border border-[#2A2D35] p-5 rounded-2xl flex flex-col justify-between shadow-md">
          <div>
            <p className="text-[11px] text-[#525866] font-bold uppercase tracking-widest mb-1 flex items-center">
              <Layers className="h-3 w-3 mr-1 text-indigo-400" />
              Indexed Passages
            </p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-mono font-extrabold text-white">{totalChunks}</span>
              <span className="text-3xs text-indigo-400 font-bold uppercase">Ready for RAG</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#2A2D35]/30 flex justify-between text-3xs text-[#525866]">
            <span>Indexed chunks of raw text</span>
            <span className="font-semibold text-indigo-400 font-mono">TF-IDF & Semantic</span>
          </div>
        </div>

        {/* Words Card */}
        <div className="bg-[#16181D]/60 border border-[#2A2D35] p-5 rounded-2xl flex flex-col justify-between shadow-md">
          <div>
            <p className="text-[11px] text-[#525866] font-bold uppercase tracking-widest mb-1 flex items-center">
              <BookOpen className="h-3 w-3 mr-1 text-indigo-400" />
              Total Words Indexed
            </p>
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-2xl font-mono font-extrabold text-white">
                {documents.reduce((acc, curr) => acc + Math.round(curr.charCount / 5), 0).toLocaleString()}
              </span>
              <span className="text-3xs text-emerald-400 font-bold uppercase">Calculated</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-[#2A2D35]/30 flex justify-between text-3xs text-[#525866]">
            <span>Average 5 chars per word</span>
            <span className="font-semibold text-emerald-400 font-mono">{(totalChars / 1024).toFixed(1)} KB Total</span>
          </div>
        </div>
      </div>

      {/* Vector Storage & Alignments Configuration Panel */}
      <div className="bg-[#16181D]/50 border border-[#2A2D35] rounded-2xl p-6 space-y-6 shadow-lg">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center border-b border-[#2A2D35]/50 pb-3">
          <Sliders className="h-4.5 w-4.5 text-indigo-400 mr-2" />
          Vector Storage & Semantic Embedding Alignments
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Vector DB Engine Selector */}
          <div className="space-y-2">
            <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">Vector Database Engine</label>
            <select
              value={localSettings.vectorDb || "in_memory"}
              onChange={(e) => {
                const val = e.target.value as "in_memory" | "chroma";
                handleFieldChange({ vectorDb: val });
              }}
              disabled={isGenerating}
              className="w-full bg-[#0B0C0E] border border-[#2A2D35] text-[#E0E0E0] focus:outline-none focus:border-indigo-500 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="in_memory">In-Memory Local JSON Store</option>
              <option value="chroma">Chroma DB (Local Docker / Plugin)</option>
            </select>
            <p className="text-3xs text-[#525866] leading-relaxed">
              Choose whether to search using a lightweight in-memory storage engine or stream chunks to a dedicated Chroma database instance.
            </p>
          </div>

          {/* Embeddings / Indexing Provider */}
          <div className="space-y-2">
            <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">Embedding / Indexing Provider</label>
            <select
              value={localSettings.embeddingProvider}
              onChange={(e) => {
                let nextModel = localSettings.embeddingModel;
                if (e.target.value === "local_tfidf") {
                  nextModel = "N/A";
                } else if (e.target.value === "gemini") {
                  nextModel = "gemini-embedding-2-preview";
                } else if (e.target.value === "lm_studio") {
                  nextModel = "text-embedding-nomic";
                } else if (e.target.value === "ollama") {
                  nextModel = "nomic-embed-text";
                }
                handleFieldChange({ 
                  embeddingProvider: e.target.value as any,
                  embeddingModel: nextModel 
                });
              }}
              disabled={isGenerating}
              className="w-full bg-[#0B0C0E] border border-[#2A2D35] text-[#E0E0E0] focus:outline-none focus:border-indigo-500 rounded-xl px-4 py-3 text-xs font-mono disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="local_tfidf">Sparse TF-IDF (100% Offline, Zero-Setup)</option>
              <option value="lm_studio">LM Studio Local Vector Embeddings</option>
              <option value="ollama">Ollama Local Vector Embeddings</option>
              <option value="gemini">Gemini Cloud Embeddings</option>
            </select>
            <p className="text-3xs text-[#525866] leading-relaxed">
              Sparse TF-IDF runs immediately without downloading or loading any embedding models locally.
            </p>
          </div>
        </div>

        {/* Embedding Model & Chroma properties */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#2A2D35]/30">
          {/* Embedding Model Name */}
          <div className="space-y-2">
            <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">Embedding Model Name</label>
            <input
              type="text"
              value={localSettings.embeddingModel}
              onChange={(e) => handleFieldChange({ embeddingModel: e.target.value })}
              placeholder="N/A for local TF-IDF"
              className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-4 py-3 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono placeholder-[#525866] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={localSettings.embeddingProvider === "local_tfidf" || isGenerating}
            />
            <p className="text-3xs text-[#525866]">
              Specify the model loaded in your embedding server (e.g., `text-embedding-nomic` or `nomic-embed-text`).
            </p>
          </div>

          {/* Conflict Warning or Status */}
          <div className="space-y-2 flex flex-col justify-center">
            {hasConflict ? (
              <div className="bg-amber-950/20 border border-amber-900/30 p-3.5 rounded-xl flex items-start space-x-2.5">
                <ShieldAlert className="h-4.5 w-4.5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">Configuration Alert</div>
                  <p className="text-[10px] text-slate-300 leading-snug mt-0.5">
                    Chroma DB is a vector database and requires an active vector embedding model. Please switch Embedding Provider to LM Studio, Ollama, or Gemini to populate document vectors correctly.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/10 border border-emerald-900/20 p-3.5 rounded-xl flex items-start space-x-2.5">
                <Check className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">Status: Active Alignment</div>
                  <p className="text-[10px] text-slate-300 leading-snug mt-0.5">
                    The chosen Vector DB matches the active embedding indexing configurations cleanly. Vectors will align on next ingestion loop.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chroma DB Server Specifics (Only when Chroma selected) */}
        {localSettings.vectorDb === "chroma" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#2A2D35]/30 bg-[#0B0C0E]/20 p-4 rounded-xl">
            <div className="space-y-2">
              <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">Chroma Server URL</label>
              <input
                type="text"
                value={localSettings.chromaUrl || "http://localhost:8000"}
                onChange={(e) => handleFieldChange({ chromaUrl: e.target.value })}
                placeholder="http://localhost:8000"
                className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-4 py-3 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono placeholder-[#525866] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isGenerating}
              />
              <p className="text-3xs text-[#525866]">
                Provide your active Chroma server endpoint. Default is `http://localhost:8000`.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">Chroma Collection</label>
              <input
                type="text"
                value={localSettings.chromaCollection || "technoscope"}
                onChange={(e) => handleFieldChange({ chromaCollection: e.target.value })}
                placeholder="technoscope"
                className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-4 py-3 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono placeholder-[#525866] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isGenerating}
              />
              <p className="text-3xs text-[#525866]">
                Isolated space for book chapters, media transcription files, and manuals.
              </p>
            </div>
          </div>
        )}

        {/* Text Chunking & Overlap parameters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#2A2D35]/30">
          <div className="space-y-2">
            <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">Passage Chunk Size (Words)</label>
            <input
              type="number"
              value={localSettings.chunkSize}
              onChange={(e) => handleFieldChange({ chunkSize: parseInt(e.target.value) || 300 })}
              className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-4 py-3 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isGenerating}
            />
            <p className="text-3xs text-[#525866]">
              Defines the window length when splitting raw document pages into manageable parts.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">Chunk Overlap Window (Words)</label>
            <input
              type="number"
              value={localSettings.chunkOverlap}
              onChange={(e) => handleFieldChange({ chunkOverlap: parseInt(e.target.value) || 50 })}
              className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-4 py-3 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isGenerating}
            />
            <p className="text-3xs text-[#525866]">
              Word count overlap between sequential sections to retain context boundaries.
            </p>
          </div>
        </div>

        {/* Save Vector Settings Action block at the bottom */}
        <div className="pt-6 border-t border-[#2A2D35]/50 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isGenerating}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-lg hover:shadow-indigo-500/20 active:scale-98 transition flex items-center space-x-2 cursor-pointer"
          >
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Saving Changes...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                <span>Save Vector Configuration</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
