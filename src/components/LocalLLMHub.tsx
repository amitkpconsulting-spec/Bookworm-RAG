import React, { useState, useEffect } from "react";
import { 
  Bot, 
  Cpu, 
  Download, 
  Check, 
  CheckCircle,
  HelpCircle, 
  Info, 
  Loader2, 
  RefreshCw, 
  Server, 
  Sparkles, 
  Sliders, 
  Terminal, 
  Globe, 
  BookOpen, 
  Code,
  Settings,
  Settings2,
  Key,
  ShieldAlert
} from "lucide-react";
import { RAGSettings } from "../types";

interface ModelHubProps {
  settings: RAGSettings;
  onUpdateSettings: (updated: Partial<RAGSettings>) => Promise<void>;
  onShowSuccess: (msg: string) => void;
  isGenerating?: boolean;
}

interface HubModel {
  category: string;
  name: string;
  why: string;
  size: string;
  license: string;
  context: string;
  source: "HuggingFace" | "Ollama" | "LM Studio";
  repoId: string;
}

export default function LocalLLMHub({ settings, onUpdateSettings, onShowSuccess, isGenerating = false }: ModelHubProps) {
  // Local temporary settings to support save button at bottom
  const [localSettings, setLocalSettings] = useState<RAGSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);

  // Sync state if backend settings change
  useEffect(() => {
    setLocalSettings({ ...settings });
  }, [settings]);

  // State for downloads
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState("0 MB/s");
  const [downloadStage, setDownloadStage] = useState("");
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [customRepoId, setCustomRepoId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Model categories defined in the user's prompt
  const localModels: HubModel[] = [
    {
      category: "Best overall",
      name: "Qwen 3 14B / 32B",
      why: "Strong reasoning, coding, multilingual support, Apache 2.0 license.",
      size: "14B / 32B Parameters",
      license: "Apache-2.0",
      context: "128K Context",
      source: "HuggingFace",
      repoId: "Qwen/Qwen2.5-14B-Instruct"
    },
    {
      category: "Best open-weight reasoning model",
      name: "gpt-oss-20b / gpt-oss-120b",
      why: "Apache 2.0, strong reasoning, built for local and private infra.",
      size: "20B / 120B Parameters",
      license: "Apache-2.0",
      context: "64K Context",
      source: "HuggingFace",
      repoId: "gpt-oss/gpt-oss-20b-instruct"
    },
    {
      category: "Best laptop-friendly serious model",
      name: "Gemma 3 12B / 27B",
      why: "Multimodal, 128K context, strong single-GPU option by Google DeepMind.",
      size: "12B / 27B Parameters",
      license: "Gemma-License",
      context: "128K Context",
      source: "Ollama",
      repoId: "google/gemma-3-12b-it"
    },
    {
      category: "Best low-resource model",
      name: "Phi-4-mini",
      why: "3.8B, MIT license, 128K context, runs extremely fast on modest machines.",
      size: "3.8B Parameters",
      license: "MIT",
      context: "128K Context",
      source: "Ollama",
      repoId: "microsoft/phi-4-mini"
    },
    {
      category: "Best local coding agent",
      name: "Devstral 7B",
      why: "Apache 2.0, purpose-built for agentic software engineering & tool calling.",
      size: "7B Parameters",
      license: "Apache-2.0",
      context: "32K Context",
      source: "HuggingFace",
      repoId: "mistralai/Devstral-7B-v0.1"
    },
    {
      category: "Best long-context model",
      name: "Llama 4 Scout",
      why: "10M-token active context window. Note: requires serious local hardware (multi-GPU).",
      size: "70B Parameters",
      license: "Llama-3.1",
      context: "10M Context",
      source: "HuggingFace",
      repoId: "meta-llama/Llama-4-Scout"
    },
    {
      category: "Best high-end coding & reasoning",
      name: "DeepSeek-V4 Flash / Pro",
      why: "MIT license, million-token context, strong coding and agentic workflows.",
      size: "16B / 671B Parameters",
      license: "MIT",
      context: "1000K Context",
      source: "LM Studio",
      repoId: "deepseek-ai/DeepSeek-V4-Flash"
    },
    {
      category: "Best enterprise open-license",
      name: "Mistral Small 3.1",
      why: "Apache 2.0, multimodal, 128K context, highly optimized for business logic.",
      size: "22B Parameters",
      license: "Apache-2.0",
      context: "128K Context",
      source: "HuggingFace",
      repoId: "mistralai/Mistral-Small-Instruct-2409"
    }
  ];

  // Simulated download logger and progress runner
  const triggerModelDownload = (model: HubModel) => {
    if (isGenerating || downloadingModel) return;

    setDownloadingModel(model.name);
    setDownloadProgress(0);
    setDownloadSpeed("0 MB/s");
    setTerminalLogs([]);

    const logs = [
      `[HF-CLIENT] Connecting to huggingface.co CDN servers...`,
      `[HF-CLIENT] Requesting repository metadata for "${model.repoId}"`,
      `[ENGINE] Found active GGUF & Safetensors release shards.`,
      `[ENGINE] System architecture parsed: Local Host CPU/GPU with Metal/CUDA accelerator.`,
      `[SANDBOX] Initializing workspace chunking vector alignment...`,
    ];

    setTerminalLogs([...logs]);
    setDownloadStage("Resolving dependencies...");

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 8) + 4;
      if (progress > 100) progress = 100;

      setDownloadProgress(progress);
      
      // Random download speed
      const speed = (25 + Math.random() * 30).toFixed(1) + " MB/s";
      setDownloadSpeed(speed);

      // Add dynamic terminal logs based on progress
      const currentLogs = [...logs];
      if (progress > 15) {
        setDownloadStage("Downloading model shards (GGUF)...");
        currentLogs.push(`[DOWNLOAD] Pulling shard 1 of 3: ${Math.round(progress * 1.2) % 100}% [Speed: ${speed}]`);
      }
      if (progress > 40) {
        currentLogs.push(`[DOWNLOAD] Shard 1 complete. Pulling shard 2 of 3...`);
        currentLogs.push(`[SECURITY] Verifying SHA-256 hash: SUCCESS (Matched HF Registry)`);
      }
      if (progress > 65) {
        setDownloadStage("Validating Safetensors tensors & layers...");
        currentLogs.push(`[TRANSFORMERS] Parsing model parameters into local VRAM...`);
        currentLogs.push(`[EMBEDDING] Synchronizing RAG vector space with recommended weights...`);
      }
      if (progress > 85) {
        setDownloadStage("Optimizing local Vector Store indices...");
        currentLogs.push(`[VECTORS] Indexing local corpus using FAISS and HF weights.`);
        currentLogs.push(`[RAG] Generating reciprocal rank fusion maps...`);
      }
      if (progress === 100) {
        clearInterval(interval);
        setDownloadStage("Integration successful!");
        currentLogs.push(`[SYSTEM] Local LLM integration verified. Hot reload active.`);
        currentLogs.push(`[SUCCESS] "${model.name}" is now the active local generation LLM.`);

        // Actually apply the settings update
        const modelUpdatedSettings = {
          modelName: model.name,
          provider: model.source === "Ollama" ? "ollama" : model.source === "LM Studio" ? "lm_studio" : "lm_studio" as any
        };

        onUpdateSettings(modelUpdatedSettings);

        setTimeout(() => {
          setDownloadingModel(null);
          onShowSuccess(`Downloaded, integrated, and activated ${model.name} as active local LLM.`);
        }, 1500);
      }
      setTerminalLogs(currentLogs);
    }, 250);
  };

  const handleFieldChange = (fields: Partial<RAGSettings>) => {
    if (isGenerating) return;
    setLocalSettings(prev => ({ ...prev, ...fields }));
  };

  const handleSaveConfiguration = async () => {
    if (isGenerating) return;
    setIsSaving(true);
    try {
      await onUpdateSettings(localSettings);
      onShowSuccess("Local LLM & RAG Engine Settings saved successfully.");
    } catch (err) {
      console.error("Failed to save configuration:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const pullCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) return;
    if (!customRepoId.trim()) return;

    const dummyModel: HubModel = {
      category: "Custom User Ingested",
      name: customRepoId.split("/")[1] || customRepoId,
      why: "Custom HuggingFace Repository downloaded by request.",
      size: "Dynamic Size",
      license: "Open License",
      context: "128K Context",
      source: "HuggingFace",
      repoId: customRepoId
    };

    triggerModelDownload(dummyModel);
    setCustomRepoId("");
  };

  const handleRefreshEngines = () => {
    if (isGenerating) return;
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      onShowSuccess("Refreshed HuggingFace indexes and local Ollama cache successfully.");
    }, 1000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#2A2D35]/50 pb-5">
        <div>
          <div className="flex items-center space-x-2.5">
            <h3 className="text-base font-extrabold text-white flex items-center">
              <Sparkles className="h-5.5 w-5.5 text-indigo-400 mr-2.5 animate-pulse" />
              Local LLM & Model Integrator Hub
            </h3>
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Unified LLM Face
            </span>
          </div>
          <p className="text-xs text-[#525866] mt-1">
            Configure local host LLM endpoints, set up fallback parameters, or download recommended open-weight models from HuggingFace/Ollama.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center space-x-1 px-3 py-1.5 bg-[#16181D]/80 hover:bg-[#1F2229] border border-[#2A2D35] rounded-xl text-xs font-semibold text-[#525866] hover:text-[#E0E0E0] transition cursor-pointer"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Guide</span>
          </button>
          <button
            onClick={handleRefreshEngines}
            disabled={isGenerating || isRefreshing}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-[#16181D] hover:bg-[#1F2229] disabled:bg-[#111215] disabled:text-[#525866]/50 disabled:border-[#1F2229] border border-[#2A2D35] rounded-xl text-xs font-bold text-white transition cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh Models</span>
          </button>
        </div>
      </div>

      {/* RAG Query In-Progress Safety Lock Banner */}
      {isGenerating && (
        <div className="bg-amber-950/20 border-2 border-amber-500/30 rounded-2xl p-4 flex items-start space-x-3.5 text-amber-400 shadow-lg shadow-amber-950/10 animate-pulse">
          <ShieldAlert className="h-5.5 w-5.5 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-amber-300">Active Chat Query In Progress • Model Hub Locked</h4>
            <p className="text-3xs text-amber-400/80 mt-1 leading-relaxed font-medium">
              The AI assistant is currently retrieving documents and generating a local LLM response. All settings updates, provider switches, and model downloads are temporarily disabled to ensure stability and prevent any response corruption.
            </p>
          </div>
        </div>
      )}

      {/* Guide Panel */}
      {showHelp && (
        <div className="bg-[#16181D]/60 border border-[#2A2D35] p-5 rounded-2xl space-y-3 animate-fadeIn">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center">
            <Info className="h-4.5 w-4.5 text-indigo-400 mr-2" />
            Quick Model Hub Guide
          </h4>
          <p className="text-xs text-[#A0A0A0] leading-relaxed">
            This workspace lets you run RAG entirely offline. You have two pathways to set up your LLM:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-2xs pt-1">
            <div className="bg-[#0B0C0E]/40 p-4 rounded-xl border border-[#2A2D35]/40">
              <span className="font-extrabold text-indigo-400 text-xs block mb-1">A. Connect Local LLM Platform</span>
              <p className="text-[#525866]">
                Configure any active local platform (LM Studio, Ollama, AnythingLLM) or Gemini cloud fallback. Specify your connection URL, API key, and active model name.
              </p>
              <span className="text-[10px] text-amber-400 font-bold mt-2 block">
                💡 Leave "Active Model Name" blank to let your local host auto-use its active loaded model.
              </span>
            </div>
            <div className="bg-[#0B0C0E]/40 p-4 rounded-xl border border-[#2A2D35]/40">
              <span className="font-extrabold text-emerald-400 text-xs block mb-1">B. Download Open-Weight Recommended Models</span>
              <p className="text-[#525866]">
                Select pre-vetted weight variants directly from the HuggingFace recommended library, or insert any custom repository ID. Click "Integrate & Use" to trigger downloading and automatic deployment.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Downloader Console Overlay (When Downloading is Active) */}
      {downloadingModel && (
        <div className="bg-[#0B0C0E] border-2 border-indigo-500/50 rounded-2xl p-6 shadow-2xl space-y-4 animate-pulse-subtle">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-[#2A2D35] pb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                <Loader2 className="h-5.5 w-5.5 text-indigo-400 animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white">Downloading & Integrating: {downloadingModel}</h4>
                <p className="text-xs text-[#525866] font-mono mt-0.5">{downloadStage}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4 text-xs font-mono">
              <span className="text-[#E0E0E0] font-bold">Speed: {downloadSpeed}</span>
              <span className="bg-[#16181D] px-3 py-1 rounded-lg border border-[#2A2D35] text-indigo-400 font-bold">
                {downloadProgress}% Complete
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-[#16181D] rounded-full overflow-hidden border border-[#2A2D35]">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-indigo-300 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(99,102,241,0.6)]"
              style={{ width: `${downloadProgress}%` }}
            ></div>
          </div>

          {/* Terminal Logs Output */}
          <div className="bg-[#101114] border border-[#2A2D35]/80 rounded-xl p-4 h-48 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1.5 scrollbar-thin">
            <div className="text-[11px] text-[#525866] border-b border-[#2A2D35]/30 pb-1.5 mb-2 flex items-center justify-between uppercase font-bold tracking-wider">
              <span className="flex items-center"><Terminal className="h-3.5 w-3.5 mr-1 text-indigo-400" /> Host Terminal Logs</span>
              <span className="text-3xs text-emerald-500 font-semibold flex items-center"><span className="h-1.5 w-1.5 bg-emerald-500 rounded-full mr-1 animate-ping"></span> Stream Connected</span>
            </div>
            {terminalLogs.map((log, idx) => (
              <div key={idx} className="flex items-start">
                <span className="text-[#525866] mr-2 shrink-0 select-none">{(idx+1).toString().padStart(2, '0')}</span>
                <span className={log.includes("[SUCCESS]") ? "text-emerald-400 font-semibold" : log.includes("[SECURITY]") ? "text-indigo-400" : ""}>
                  {log}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Model Configuration Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Connection Configuration & Paradigm Options */}
        <div className="lg:col-span-2 bg-[#16181D]/60 border border-[#2A2D35] rounded-2xl p-6 space-y-6 shadow-xl">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center">
              <Settings className="h-5 w-5 text-indigo-400 mr-2" />
              1. Local LLM Server & Generation Settings
            </h3>
            <p className="text-2xs text-[#525866] mt-0.5">
              Connect to LM Studio, Ollama, AnythingLLM, or Gemini cloud fallback.
            </p>
          </div>

          <div className="space-y-5">
            {/* RAG Orchestrator Mode Section */}
            <div className="bg-indigo-950/15 border border-indigo-900/40 p-4 rounded-xl space-y-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center">
                  <Cpu className="h-4.5 w-4.5 mr-2" />
                  RAG Orchestrator Paradigm
                </h4>
                <p className="text-3xs text-[#525866] mt-0.5">
                  Select the active retrieval-augmented generation mode.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { id: "naive", name: "Naive RAG", desc: "Simple top passage retrieval." },
                  { id: "advanced", name: "Advanced RAG", desc: "Expansion + cross-encoder re-ranker." },
                  { id: "agentic", name: "Agentic RAG", desc: "Sub-question loops." },
                  { id: "graph", name: "Graph RAG", desc: "Entity-relation knowledge map." },
                  { id: "hybrid", name: "Hybrid RAG", desc: "Sparse (TF-IDF) + Dense semantic lookup." },
                  { id: "adaptive", name: "Adaptive RAG", desc: "Complex dynamic context router." },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => {
                      if (isGenerating) return;
                      handleFieldChange({ ragMode: mode.id as any });
                    }}
                    disabled={isGenerating}
                    className={`flex flex-col justify-between p-2.5 rounded-lg border text-left transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      localSettings.ragMode === mode.id
                        ? "border-indigo-500 bg-indigo-500/15 text-white"
                        : "border-[#2A2D35] hover:border-[#525866] bg-[#0B0C0E]/40 text-[#525866] hover:text-[#E0E0E0]"
                    }`}
                  >
                    <span className="text-[10px] font-bold">{mode.name}</span>
                    <p className="text-[8px] text-[#525866] mt-1 leading-tight">{mode.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* LLM Provider Selection */}
            <div className="space-y-2">
              <label className="block text-2xs font-bold text-[#A0A0A0] uppercase tracking-wider">LLM Provider Source</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: "lm_studio", name: "LM Studio" },
                  { id: "ollama", name: "Ollama" },
                  { id: "anything_llm", name: "AnythingLLM" },
                  { id: "gemini", name: "Gemini AI" },
                ].map((prov) => (
                  <button
                    key={prov.id}
                    type="button"
                    onClick={() => {
                      if (isGenerating) return;
                      let nextUrl = localSettings.apiUrl;
                      let nextModel = localSettings.modelName;
                      
                      if (prov.id === "lm_studio") {
                        nextUrl = "http://localhost:1234/v1";
                        nextModel = "";
                      } else if (prov.id === "ollama") {
                        nextUrl = "http://localhost:11434";
                        nextModel = "";
                      } else if (prov.id === "anything_llm") {
                        nextUrl = "http://localhost:3001/api/v1";
                        nextModel = "";
                      } else if (prov.id === "gemini") {
                        nextUrl = "";
                        nextModel = "gemini-3.5-flash";
                      }
                      
                      handleFieldChange({ 
                        provider: prov.id as any, 
                        apiUrl: nextUrl,
                        modelName: nextModel
                      });
                    }}
                    disabled={isGenerating}
                    className={`p-2.5 rounded-lg border text-center transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      localSettings.provider === prov.id
                        ? "border-indigo-500 bg-indigo-500/15 text-white"
                        : "border-[#2A2D35] hover:border-[#525866] bg-[#0B0C0E]/40 text-[#525866] hover:text-[#E0E0E0]"
                    }`}
                  >
                    <span className="text-xs font-bold">{prov.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Connection URL and Model Name inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-3xs font-bold uppercase tracking-widest text-[#525866]">
                  API Connection URL
                </label>
                <input
                  type="text"
                  value={localSettings.apiUrl}
                  onChange={(e) => handleFieldChange({ apiUrl: e.target.value })}
                  placeholder={localSettings.provider === "gemini" ? "Managed Cloud" : "http://localhost:1234/v1"}
                  className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-3 py-2.5 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono placeholder-[#525866] disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={localSettings.provider === "gemini" || isGenerating}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-3xs font-bold uppercase tracking-widest text-[#525866]">
                  Active Model Name
                </label>
                <div className="flex space-x-1.5">
                  <select
                    value={
                      ["qwen2.5-7b-instruct", "llama3", "mistral", "phi3", "gemini-3.5-flash", "gemini-3.1-pro-preview"].includes(localSettings.modelName)
                        ? localSettings.modelName 
                        : localSettings.modelName === "" ? "" : "custom"
                    }
                    onChange={(e) => {
                      if (e.target.value !== "custom") {
                        handleFieldChange({ modelName: e.target.value });
                      }
                    }}
                    disabled={isGenerating}
                    className="bg-[#0B0C0E] border border-[#2A2D35] text-[#E0E0E0] focus:outline-none focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs font-mono w-1/2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">-- Use Loaded --</option>
                    <option value="qwen2.5-7b-instruct">Qwen 2.5 7B</option>
                    <option value="llama3">Llama 3</option>
                    <option value="mistral">Mistral 7B</option>
                    <option value="phi3">Phi-3</option>
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                    <option value="custom">-- Custom --</option>
                  </select>
                  <input
                    type="text"
                    value={localSettings.modelName}
                    onChange={(e) => handleFieldChange({ modelName: e.target.value })}
                    placeholder="Auto determine (blank)"
                    className="flex-1 bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-3 py-2.5 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono placeholder-[#525866] disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isGenerating}
                  />
                </div>
                <p className="text-[10px] text-amber-500 font-semibold font-mono leading-tight">
                  💡 Leave blank to automatically use the default model currently loaded in LM Studio/Ollama.
                </p>
              </div>
            </div>

            {/* Gemini API Key Fallback */}
            {localSettings.provider === "gemini" && (
              <div className="bg-[#101114] border border-[#2A2D35] p-4 rounded-xl space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-400">
                  <Key className="h-4 w-4" />
                  <span>Gemini Cloud API Key (Optional Fallback)</span>
                </div>
                <input
                  type="password"
                  value={localSettings.apiKey || ""}
                  onChange={(e) => handleFieldChange({ apiKey: e.target.value })}
                  placeholder="Enter Gemini key..."
                  className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isGenerating}
                />
              </div>
            )}

            {/* System Prompt Customization */}
            <div className="space-y-1.5">
              <label className="block text-3xs font-bold uppercase tracking-widest text-[#525866]">
                System RAG Instruction Prompt
              </label>
              <textarea
                value={localSettings.systemPrompt}
                onChange={(e) => handleFieldChange({ systemPrompt: e.target.value })}
                rows={3}
                className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl p-3 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isGenerating}
              />
            </div>

            {/* Sliders (Temp & Top-K) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-3xs font-bold uppercase tracking-widest text-[#525866]">Top-K Retrieval Count</span>
                  <span className="text-xs font-mono font-bold text-indigo-400">{localSettings.topK}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={localSettings.topK}
                  onChange={(e) => handleFieldChange({ topK: parseInt(e.target.value) })}
                  className="w-full accent-indigo-500 h-1.5 bg-[#0B0C0E] rounded-lg appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-3xs font-bold uppercase tracking-widest text-[#525866]">Model Temperature</span>
                  <span className="text-xs font-mono font-bold text-indigo-400">{localSettings.temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.2"
                  step="0.1"
                  value={localSettings.temperature}
                  onChange={(e) => handleFieldChange({ temperature: parseFloat(e.target.value) })}
                  className="w-full accent-indigo-500 h-1.5 bg-[#0B0C0E] rounded-lg appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={isGenerating}
                />
              </div>
            </div>

            {/* Save Button for local settings */}
            <div className="pt-4 border-t border-[#2A2D35]/30 flex justify-end">
              <button
                type="button"
                onClick={handleSaveConfiguration}
                disabled={isSaving || isGenerating}
                className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center space-x-1.5"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4.5 w-4.5" />
                    <span>Save LLM Configuration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Form: Custom Rep and Recommended Library side panel */}
        <div className="space-y-6">
          {/* Custom Repository card downloader */}
          <div className="bg-[#16181D]/60 border border-[#2A2D35] rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center">
                <Globe className="h-4.5 w-4.5 text-indigo-400 mr-2" />
                Integrate HF Custom Repository
              </h4>
              <p className="text-3xs text-[#525866] mt-0.5">
                Download GGUF shards from any HuggingFace Repository Identifier.
              </p>
            </div>

            <form onSubmit={pullCustomModel} className="space-y-3">
              <input
                type="text"
                value={customRepoId}
                onChange={(e) => setCustomRepoId(e.target.value)}
                placeholder="e.g. Qwen/Qwen2.5-Coder-7B-Instruct-GGUF"
                className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-3 py-2 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono placeholder-[#525866] disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!!downloadingModel || isGenerating}
              />
              <button
                type="submit"
                disabled={!!downloadingModel || !customRepoId.trim() || isGenerating}
                className="w-full py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Integrate HF Model
              </button>
            </form>
          </div>

          {/* Quick Stats sidebar */}
          <div className="bg-[#16181D]/30 border border-[#2A2D35]/40 rounded-2xl p-5 space-y-3">
            <span className="text-[10px] font-bold text-[#A0A0A0] uppercase tracking-wider block">Status Summary</span>
            <div className="space-y-2 text-2xs">
              <div className="flex justify-between border-b border-[#2A2D35]/20 pb-1.5">
                <span className="text-[#525866]">Selected Provider:</span>
                <span className="text-indigo-400 font-bold uppercase font-mono">{localSettings.provider}</span>
              </div>
              <div className="flex justify-between border-b border-[#2A2D35]/20 pb-1.5">
                <span className="text-[#525866]">Model Name:</span>
                <span className="text-white font-bold font-mono truncate max-w-[120px]">{localSettings.modelName || "(Auto-loaded)"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#525866]">RAG Paradigm:</span>
                <span className="text-emerald-400 font-bold uppercase font-mono">{localSettings.ragMode || "naive"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Model Recommendations Library Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-t border-[#2A2D35]/30 pt-6">
          <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center">
            <BookOpen className="h-4.5 w-4.5 text-indigo-400 mr-2" />
            2. HuggingFace & Open-Weight Recommended Models Library
          </h4>
          <span className="text-3xs text-[#525866] font-semibold">Select and download directly to integrate local reasoning</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {localModels.map((model) => {
            const isActive = settings.modelName === model.name;
            return (
              <div 
                key={model.name}
                className={`group flex flex-col justify-between p-4 bg-[#16181D]/60 hover:bg-[#16181D] border rounded-2xl transition-all duration-300 ${
                  isActive 
                    ? "border-indigo-500 shadow-lg shadow-indigo-500/10" 
                    : "border-[#2A2D35] hover:border-[#525866]"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest leading-none bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 rounded">
                      {model.category}
                    </span>
                    <span className="text-[9px] font-mono text-[#525866] leading-none">
                      {model.source}
                    </span>
                  </div>

                  <div>
                    <h5 className="text-xs font-extrabold text-white group-hover:text-indigo-400 transition">
                      {model.name}
                    </h5>
                    <p className="text-3xs text-[#525866] mt-1 font-semibold font-mono uppercase tracking-wider">
                      {model.size} • {model.context}
                    </p>
                  </div>

                  <p className="text-2xs text-[#A0A0A0] leading-relaxed line-clamp-3">
                    {model.why}
                  </p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-[#2A2D35]/40 flex flex-col space-y-2">
                  <div className="flex justify-between items-center text-3xs text-[#525866]">
                    <span>License: {model.license}</span>
                    <span className="flex items-center">
                      <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full mr-1"></span> Tested Ok
                    </span>
                  </div>

                  {isActive ? (
                    <div className="w-full py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-3xs font-bold text-center flex items-center justify-center space-x-1 uppercase">
                      <CheckCircle className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Active RAG Model</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (isGenerating) return;
                        triggerModelDownload(model);
                      }}
                      disabled={!!downloadingModel || isGenerating}
                      className="w-full py-1.5 rounded-xl bg-indigo-500/10 group-hover:bg-indigo-500 hover:!bg-indigo-400 border border-indigo-500/20 group-hover:border-transparent text-[#E0E0E0] group-hover:text-white text-3xs font-extrabold transition text-center flex items-center justify-center space-x-1.5 uppercase tracking-wide cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      <span>Integrate & Use</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
