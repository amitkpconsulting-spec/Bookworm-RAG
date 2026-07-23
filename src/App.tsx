import React, { useState, useEffect, useRef } from "react";
import { 
  BookOpen, 
  Bot, 
  Check, 
  ChevronRight, 
  ChevronDown,
  Cpu, 
  Database, 
  FileText, 
  HelpCircle, 
  Info, 
  Layers, 
  Loader2, 
  Plus, 
  RefreshCw, 
  Send, 
  Settings, 
  Settings2, 
  Sparkles, 
  Terminal,
  Trash2, 
  UploadCloud, 
  Youtube 
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { 
  RAGSettings, 
  SourceDocument, 
  ChatMessage, 
  RetrievedSource 
} from "./types";
import LocalLLMHub from "./components/LocalLLMHub";
import VectorHub from "./components/VectorHub";

export default function App() {
  // State
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [settings, setSettings] = useState<RAGSettings | null>(null);
  
  // Tabs
  const [activeTab, setActiveTab] = useState<"chat" | "add" | "model_hub" | "vector_hub" | "sources">("chat");
  
  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I am Technoscope, your custom intelligence engine. Upload your PDFs, books, or parse YouTube videos and text under 'Import Manager'. I will query your local databases or Gemini securely to find exactly what you need—your data, your chat!",
      timestamp: new Date().toLocaleTimeString(),
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  // Ingestion fields
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [isIngesting, setIsIngesting] = useState<"file" | "youtube" | "text" | false>(false);
  const [ingestStatus, setIngestStatus] = useState<{ success?: string; error?: string } | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
    successCount: number;
    failCount: number;
    errors: string[];
  } | null>(null);
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  
  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load configuration on mount
  useEffect(() => {
    fetchSettings();
    fetchDocuments();
  }, []);

  // Scroll to chat bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isGenerating]);

  // Fetch backend RAG settings
  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  // Fetch ingested documents
  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
        setTotalChunks(data.totalChunks || 0);
      }
    } catch (err) {
      console.error("Error loading documents:", err);
    }
  };

  // Save Settings to Backend
  const handleSaveSettings = async (updated: Partial<RAGSettings>) => {
    if (!settings) return;
    const nextSettings = { ...settings, ...updated };
    setSettings(nextSettings);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings),
      });
      const data = await res.json();
      if (data.success) {
        setIngestStatus({ success: "Configuration updated successfully." });
        setTimeout(() => setIngestStatus(null), 3000);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  // Trigger File Input Click
  const triggerFileInput = () => {
    if (isIngesting) return;
    fileInputRef.current?.click();
  };

  // Handle Drag Events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isIngesting) return;
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (isIngesting) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isIngesting) return;
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(Array.from(e.target.files));
    }
  };

  // Upload multiple files at once via backend (Batch Upload)
  const uploadFiles = async (files: File[]) => {
    setIsIngesting("file");
    setIngestStatus(null);
    setBatchProgress({
      current: 1,
      total: files.length,
      fileName: files.map(f => f.name).join(", "),
      successCount: 0,
      failCount: 0,
      errors: [],
    });

    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    let localSuccessCount = 0;
    let localFailCount = 0;
    const localErrors: string[] = [];

    try {
      const res = await fetch("/api/ingest/files", {
        method: "POST",
        body: formData,
      });

      const responseText = await res.text();

      if (!res.ok) {
        let msg = `Server error (Status ${res.status})`;
        if (res.status === 413) {
          msg += " - File size is too large for the network proxy. Please split files or copy-paste text.";
        } else if (responseText && responseText.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(responseText);
            msg = parsed.error || msg;
          } catch {}
        } else if (responseText && responseText.length < 150) {
          msg += `: ${responseText.trim().replace(/<[^>]*>/g, '')}`;
        }
        throw new Error(msg);
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (jsonErr) {
        const stripped = responseText.trim().substring(0, 100).replace(/<[^>]*>/g, '').trim();
        throw new Error(`Failed to parse server JSON response. Response starts with: "${stripped || 'empty'}"`);
      }

      if (data.results && Array.isArray(data.results)) {
        for (const item of data.results) {
          if (item.success) {
            localSuccessCount++;
          } else {
            localFailCount++;
            localErrors.push(`"${item.name}": ${item.error || "Failed to process document"}`);
          }
        }
      } else {
        if (data.success) {
          localSuccessCount = files.length;
        } else {
          localFailCount = files.length;
          localErrors.push(data.error || "Failed to process documents");
        }
      }
    } catch (err: any) {
      localFailCount = files.length;
      localErrors.push(err.message || "Network error occurred");
    }

    setBatchProgress(null);
    setIsIngesting(false);

    // Set dynamic, rich final alert status
    if (localFailCount === 0) {
      setIngestStatus({
        success: files.length === 1 
          ? `Successfully ingested "${files[0].name}" into the knowledge base!`
          : `Successfully ingested all ${files.length} documents into the knowledge base!`
      });
    } else if (localSuccessCount > 0) {
      setIngestStatus({
        success: `Partially successful: Ingested ${localSuccessCount} of ${files.length} files.`,
        error: `Failed for ${localFailCount} files:\n` + localErrors.join("\n")
      });
    } else {
      setIngestStatus({
        error: `Failed to ingest any files:\n` + localErrors.join("\n")
      });
    }

    fetchDocuments();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Ingest YouTube Video
  const handleYoutubeIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl.trim()) return;

    setIsIngesting("youtube");
    setIngestStatus(null);

    try {
      const res = await fetch("/api/ingest/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl }),
      });
      const data = await res.json();

      if (data.success) {
        setIngestStatus({ 
          success: `Successfully scraped YouTube captions: "${data.document.title}" into ${data.chunksCount} passages!` 
        });
        setYoutubeUrl("");
        fetchDocuments();
      } else {
        setIngestStatus({ error: data.error || "Failed to extract subtitles." });
      }
    } catch (err: any) {
      setIngestStatus({ error: err.message || "Failed to connect to backend transcript scraper." });
    } finally {
      setIsIngesting(false);
    }
  };

  // Ingest Manual Text Paste
  const handlePasteIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteTitle.trim() || !pasteText.trim()) return;

    setIsIngesting("text");
    setIngestStatus(null);

    try {
      const res = await fetch("/api/ingest/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pasteTitle, text: pasteText }),
      });
      const data = await res.json();

      if (data.success) {
        setIngestStatus({ 
          success: `Successfully ingested pasted book section "${data.document.title}" into ${data.chunksCount} passages!` 
        });
        setPasteTitle("");
        setPasteText("");
        fetchDocuments();
      } else {
        setIngestStatus({ error: data.error || "Failed to ingest text." });
      }
    } catch (err: any) {
      setIngestStatus({ error: err.message || "Failed to parse manual input text." });
    } finally {
      setIsIngesting(false);
    }
  };

  // Delete individual book/document
  const deleteDocument = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document and remove its indexed chunks?")) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchDocuments();
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  // Clear all database content
  const clearAllDocuments = async () => {
    // First Confirmation
    if (!confirm("CRITICAL: This will permanently wipe all books, PDFs, YouTube captions, and indexed passages from your local database. Do you want to continue?")) {
      return;
    }
    // Second Confirmation (Guardrail)
    if (!confirm("WARNING: This action is permanent and cannot be undone. All your ingested local knowledge data will be permanently deleted. Are you absolutely certain you want to proceed with wiping the database?")) {
      return;
    }
    
    try {
      const res = await fetch("/api/documents/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setDocuments([]);
        setTotalChunks(0);
        await fetchDocuments();
        setChatHistory([
          {
            id: "system-reset",
            role: "system",
            content: "Knowledge base cleared. All ingested files and chunk databases are wiped.",
            timestamp: new Date().toLocaleTimeString(),
          }
        ]);
      } else {
        alert("Failed to wipe database: Backend returned an unsuccessful response.");
      }
    } catch (err) {
      console.error("Failed to wipe database:", err);
      alert("Error occurred while trying to wipe the database. Please check your connection.");
    }
  };

  // Submit query for RAG search and generation
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isGenerating) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString(),
    };

    setChatHistory(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsGenerating(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          history: chatHistory.filter(h => h.role !== "system").map(h => ({
            role: h.role,
            content: h.content
          })),
          ragMode: settings?.ragMode
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Server failed to process RAG query.");
      }

      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: data.answer,
        timestamp: new Date().toLocaleTimeString(),
        sources: data.sources,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        generationTimeMs: data.generationTimeMs,
        structured: data.structured,
      };

      setChatHistory(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      const isLocal = settings?.provider && settings.provider !== "gemini";
      const hint = isLocal 
        ? "Please ensure your local LLM engine (e.g., LM Studio or Ollama) is actively running on your computer, loaded with a model, and that its API URL is set correctly in the Settings panel."
        : "Please verify that your Gemini API key is configured correctly in the Settings panel.";
        
      const errMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: "system",
        content: `Error generating response: ${err.message || "Endpoint call failed."} ${hint}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setChatHistory(prev => [...prev, errMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Toggle expanded state for specific reference sources
  const toggleSource = (sourceId: string) => {
    setExpandedSources(prev => ({
      ...prev,
      [sourceId]: !prev[sourceId],
    }));
  };

  const totalChars = documents.reduce((acc, curr) => acc + curr.charCount, 0);
  const totalKb = (totalChars / 1024).toFixed(1);
  const totalMbVal = totalChars / (1024 * 1024);
  // Sandbox capacity can be configured to a variety of sizes: 64 GB, 128 GB, 256 GB, 384 GB, 512 GB
  const totalCapacityGb = settings?.sandboxCapacity || 64;
  // Initial storage is 10% of selected capacity (e.g., 10% of 64 GB = 6.4 GB)
  const initialStorageMb = (totalCapacityGb * 0.10) * 1024;
  const currentTotalGb = ((initialStorageMb + totalMbVal) / 1024).toFixed(2);
  const storagePct = Math.min(((initialStorageMb + totalMbVal) / (totalCapacityGb * 1024)) * 100, 100).toFixed(1);

  return (
    <div className="flex h-screen w-full flex-col bg-[#0B0C0E] font-sans text-[#E0E0E0] antialiased overflow-hidden">
      {/* Upper header */}
      <header className="flex items-center justify-between border-b border-[#1F2229] bg-[#0B0C0E]/50 backdrop-blur px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/20">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-wider text-white flex items-center uppercase">
              TECHNOSCOPE
              <span className="ml-2.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-0.5 text-3xs font-bold tracking-widest uppercase">
                Portable Mode
              </span>
            </h1>
            <p className="text-xs text-indigo-400 font-bold tracking-wide uppercase text-[10px]">your data your chat</p>
          </div>
        </div>

        {/* Current Connection badge info */}
        {settings && (
          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-[#16181D] px-3 py-1.5 rounded-lg border border-[#2A2D35] text-xs">
              <Cpu className="h-4 w-4 text-indigo-400" />
              <span className="text-[#A0A0A0] font-semibold">LLM Engine:</span>
              <span className="text-white font-mono bg-[#0B0C0E] px-1.5 py-0.5 rounded text-2xs uppercase">
                {settings.provider}
              </span>
              <span className="text-white truncate max-w-[120px]" title={settings.modelName}>
                {settings.modelName}
              </span>
            </div>

            <div className="flex items-center space-x-2 bg-[#16181D] px-3 py-1.5 rounded-lg border border-[#2A2D35] text-xs">
              <Database className="h-4 w-4 text-green-500" />
              <span className="text-[#A0A0A0] font-semibold">Retrieval:</span>
              <span className="text-white font-mono bg-[#0B0C0E] px-1.5 py-0.5 rounded text-2xs uppercase">
                {settings.embeddingProvider === "local_tfidf" ? "TF-IDF" : "Vector"}
              </span>
              <span className="text-green-500 font-bold">{documents.length} sources</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Panel Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Work Area */}
        <main className="flex-1 flex flex-col bg-[#0F1115] overflow-hidden">
          {/* Navigation Tab Bar */}
          <div className="flex items-center justify-between border-b border-[#1F2229] bg-[#0B0C0E]/30 px-6">
            <div className="flex space-x-1.5 py-2">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "chat"
                    ? "bg-[#1F2229] text-white"
                    : "text-[#525866] hover:bg-[#16181D] hover:text-[#E0E0E0]"
                }`}
              >
                <Bot className="h-4 w-4 text-indigo-400" />
                <span>Active Chat</span>
              </button>

              <button
                onClick={() => setActiveTab("add")}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "add"
                    ? "bg-[#1F2229] text-white"
                    : "text-[#525866] hover:bg-[#16181D] hover:text-[#E0E0E0]"
                }`}
              >
                <Plus className="h-4 w-4 text-indigo-400" />
                <span>Import Manager</span>
              </button>

              <button
                onClick={() => setActiveTab("model_hub")}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "model_hub"
                    ? "bg-[#1F2229] text-white"
                    : "text-[#525866] hover:bg-[#16181D] hover:text-[#E0E0E0]"
                }`}
              >
                <Settings2 className="h-4 w-4 text-indigo-400" />
                <span>Model Hub</span>
              </button>

              <button
                onClick={() => setActiveTab("vector_hub")}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "vector_hub"
                    ? "bg-[#1F2229] text-white"
                    : "text-[#525866] hover:bg-[#16181D] hover:text-[#E0E0E0]"
                }`}
              >
                <Layers className="h-4 w-4 text-indigo-400 animate-pulse" />
                <span>Vector Hub</span>
              </button>

              <button
                onClick={() => setActiveTab("sources")}
                className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === "sources"
                    ? "bg-[#1F2229] text-white"
                    : "text-[#525866] hover:bg-[#16181D] hover:text-[#E0E0E0]"
                }`}
              >
                <Database className="h-4 w-4 text-indigo-400" />
                <span>Source DB</span>
              </button>
            </div>

            <div className="text-3xs text-[#525866] flex items-center font-mono uppercase tracking-wider font-bold">
              <Info className="h-3 w-3 mr-1 text-indigo-400" />
              {activeTab === "chat" && "RAG matches context automatically"}
              {activeTab === "add" && "File is split & embedded instantly"}
              {activeTab === "model_hub" && "Configure LLMs & download weights"}
              {activeTab === "vector_hub" && "Configure vector databases & similarity metrics"}
              {activeTab === "sources" && "Manage ingested knowledge sources"}
            </div>
          </div>

          {/* Action alerts */}
          {ingestStatus && (
            <div className="px-6 py-3 border-b border-[#1F2229] bg-[#0B0C0E]/50">
              {ingestStatus.success && (
                <div className="flex items-center space-x-2.5 text-xs text-emerald-400 font-medium bg-[#16181D]/90 border border-emerald-500/20 p-3 rounded-xl shadow-sm">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{ingestStatus.success}</span>
                </div>
              )}
              {ingestStatus.error && (
                <div className="flex items-center space-x-2.5 text-xs text-rose-400 font-medium bg-[#16181D]/90 border border-rose-500/20 p-3 rounded-xl shadow-sm">
                  <Info className="h-4 w-4 text-rose-400 shrink-0" />
                  <span>{ingestStatus.error}</span>
                </div>
              )}
            </div>
          )}

          {/* Tab Pages */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* TAB 1: RAG CHAT */}
            {activeTab === "chat" && (
              <div className="flex flex-col h-full space-y-4">
                {/* Chat feed */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 select-text">
                  {chatHistory.map((msg) => (
                    <div 
                      key={msg.id}
                      className={`flex flex-col space-y-1.5 ${
                        msg.role === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <div className="flex items-center space-x-2 px-1 text-3xs text-[#525866] font-bold font-mono uppercase tracking-wider">
                        <span>{msg.role === "user" ? "ME" : msg.role === "system" ? "SYSTEM ENGINE" : "AI ASSISTANT"}</span>
                        <span>•</span>
                        <span>{msg.timestamp}</span>
                      </div>

                      {msg.role === "assistant" && msg.structured ? (
                        <div className="flex flex-col space-y-4 w-full max-w-[90%] bg-[#1F2229] border border-[#2C313C]/60 rounded-2xl p-5 shadow-xl select-text text-[#D1D1D1]">
                          
                          {/* 1. EXECUTIVE SUMMARY BLOCK */}
                          {msg.structured.executiveSummary && (
                            <div className="bg-[#16181D] border-l-3 border-indigo-500 rounded-r-xl p-3.5 shadow-sm">
                              <div className="flex items-center space-x-2 mb-1.5 text-xs font-bold text-indigo-400 font-sans tracking-wide uppercase">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-400 animate-pulse" />
                                <span>Executive Synthesis</span>
                              </div>
                              <p className="text-xs text-[#E0E0E0] leading-relaxed italic font-medium">
                                "{msg.structured.executiveSummary}"
                              </p>
                            </div>
                          )}

                          {/* 2. DETAILED ANALYSIS BLOCK */}
                          {msg.structured.detailedAnalysis && (
                            <div className="space-y-2 mt-1">
                              <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 font-sans tracking-wide uppercase border-b border-slate-700/40 pb-1">
                                <FileText className="h-3.5 w-3.5 text-slate-400" />
                                <span>Detailed Analysis</span>
                              </div>
                              <div className="text-sm text-[#D8D8D8] leading-relaxed prose prose-invert prose-xs max-w-none">
                                <ReactMarkdown>{msg.structured.detailedAnalysis}</ReactMarkdown>
                              </div>
                            </div>
                          )}

                          {/* 3. KEY TAKEAWAYS BLOCK */}
                          {msg.structured.keyTakeaways && msg.structured.keyTakeaways.length > 0 && (
                            <div className="space-y-2.5 bg-[#16181D]/40 border border-[#2A2D35]/60 rounded-xl p-4">
                              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400 font-sans tracking-wide uppercase">
                                <Bot className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Key Actionable Takeaways</span>
                              </div>
                              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs leading-relaxed text-[#C8C8C8]">
                                {msg.structured.keyTakeaways.map((takeaway, idx) => (
                                  <li key={idx} className="flex items-start space-x-2 bg-[#1A1C23] border border-[#2C313C]/60 p-2.5 rounded-lg hover:border-indigo-500/30 transition-all shadow-2xs">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-3xs font-bold mt-0.5">
                                      {idx + 1}
                                    </span>
                                    <span>{takeaway}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* 4. CITATIONS BLOCK */}
                          {msg.structured.citations && msg.structured.citations.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center text-xs mt-1 pt-1 border-t border-slate-800/60">
                              <span className="text-[#808080] font-mono text-3xs uppercase tracking-wider font-bold mr-1.5">Cited Sources:</span>
                              {msg.structured.citations.map((citation, idx) => (
                                <span key={idx} className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-[#16181D] border border-[#2A2D35]/80 text-[#C0C0C0] font-mono text-3xs font-medium shadow-2xs">
                                  <BookOpen className="h-2.5 w-2.5 text-[#525866]" />
                                  <span>{citation}</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* 5. COLLAPSIBLE ADVANCED RAG LOGS */}
                          <div className="pt-2 border-t border-slate-800/40">
                            <button
                              type="button"
                              onClick={() => setExpandedLogs(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                              className="inline-flex items-center space-x-1.5 text-3xs font-mono font-bold text-slate-500 hover:text-indigo-400 uppercase tracking-widest cursor-pointer transition-colors"
                            >
                              <Terminal className="h-3 w-3" />
                              <span>{expandedLogs[msg.id] ? "Hide" : "Show"} Engine Retrieval Logs</span>
                              {expandedLogs[msg.id] ? <ChevronDown className="h-3 w-3 text-indigo-400" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
                            </button>

                            {expandedLogs[msg.id] && (
                              <div className="mt-3 bg-[#111317] border border-[#22252C] rounded-xl p-3.5 font-mono text-3xs text-slate-400 leading-normal max-h-60 overflow-y-auto whitespace-pre-wrap select-text">
                                <div className="flex items-center space-x-1.5 text-[#525866] border-b border-slate-800/60 pb-1.5 mb-2 uppercase font-bold tracking-wider">
                                  <Cpu className="h-3 w-3 text-indigo-400 animate-pulse" />
                                  <span>Technoscope Orchestrator Logs</span>
                                </div>
                                {msg.content.includes("### 📝 Executive Summary") 
                                  ? msg.content.split("### 📝 Executive Summary")[0] || msg.content
                                  : msg.content.includes("#### 📝 Final Response")
                                  ? msg.content.split("#### 📝 Final Response")[0] || msg.content
                                  : msg.content
                                }
                              </div>
                            )}
                          </div>

                        </div>
                      ) : (
                        /* Standard markdown rendering fallback for messages that don't have structured object */
                        <div className={`p-4 text-sm leading-relaxed select-text ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white rounded-2xl rounded-tr-none shadow-xl border border-indigo-500/20 max-w-[80%]"
                            : msg.role === "system"
                            ? "bg-[#16181D] text-[#A0A0A0] border border-[#2A2D35] rounded-xl font-mono text-xs max-w-[80%]"
                            : "bg-[#1F2229] text-[#D1D1D1] border border-[#2A2D35]/40 rounded-2xl rounded-tl-none shadow-sm max-w-[80%]"
                        }`}>
                          {msg.role === "assistant" ? (
                            <div className="prose prose-invert prose-sm max-w-none text-[#D1D1D1]">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          ) : (
                            msg.content
                          )}
                        </div>
                      )}

                      {/* Generation Metrics */}
                      {msg.role === "assistant" && (msg.generationTimeMs !== undefined || msg.totalTokens !== undefined) && (
                        <div className="flex items-center space-x-2 px-1 text-3xs font-mono text-slate-400 mt-1">
                          {msg.generationTimeMs !== undefined && (
                            <span className="flex items-center space-x-1">
                              <Cpu className="h-3 w-3 text-emerald-400/80" />
                              <span>{(msg.generationTimeMs / 1000).toFixed(2)}s generation</span>
                            </span>
                          )}
                          {msg.generationTimeMs !== undefined && msg.totalTokens !== undefined && (
                            <span className="text-[#3a3f4a]">•</span>
                          )}
                          {msg.totalTokens !== undefined && (
                            <span className="flex items-center space-x-1">
                              <Sparkles className="h-3 w-3 text-indigo-400/80" />
                              <span>{msg.totalTokens} tokens <span className="text-slate-500">({msg.promptTokens} prompt, {msg.completionTokens} completion)</span></span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Matching Sources / Passages removed as per request */}
                    </div>
                  ))}
                  
                  {isGenerating && (
                    <div className="flex flex-col items-start space-y-1.5">
                      <div className="flex items-center space-x-2 text-3xs text-indigo-400 font-bold font-mono uppercase tracking-wider animate-pulse">
                        <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                        <span>Technoscope is searching passages and reasoning...</span>
                      </div>
                      <div className="p-4 rounded-2xl rounded-tl-none text-sm bg-[#16181D] text-[#A0A0A0] border border-[#2A2D35] max-w-md italic flex items-center space-x-3 shadow-md">
                        <Loader2 className="h-4.5 w-4.5 text-indigo-500 animate-spin" />
                        <span>Querying local LLM endpoint...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input forms */}
                {documents.length === 0 ? (
                  <div className="bg-[#16181D]/80 border border-[#2A2D35] p-5 rounded-2xl text-center text-xs text-[#A0A0A0] max-w-3xl mx-auto shadow-md">
                    <Info className="h-5 w-5 text-indigo-400 mx-auto mb-2" />
                    <p className="font-bold text-white text-sm">Your Local Library is Currently Empty</p>
                    <p className="text-2xs text-[#525866] mt-1.5">Please navigate to the <span className="font-bold text-indigo-400 cursor-pointer hover:underline" onClick={() => setActiveTab("add")}>"Import Manager"</span> tab above and upload your files or books so the AI can retrieve context to answer!</p>
                  </div>
                ) : (
                  <div className="relative max-w-4xl mx-auto w-full mt-auto flex flex-col space-y-2.5">
                    <form onSubmit={handleChatSubmit} className="relative w-full">
                      <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder={`Query your local knowledge...`}
                        className="w-full bg-[#16181D] border border-[#2A2D35] rounded-2xl py-4 pl-6 pr-16 focus:outline-none focus:border-indigo-500 text-sm text-[#E0E0E0] placeholder-[#525866] shadow-2xl transition-all"
                        disabled={isGenerating}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <button
                          type="submit"
                          disabled={!inputMessage.trim() || isGenerating}
                          className="p-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-[#1F2229] disabled:text-[#525866] text-white rounded-xl shadow-lg transition-all flex items-center justify-center cursor-pointer"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    </form>

                    {/* Chat Control Toolbar */}
                    {settings && (
                      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#16181D]/60 border border-[#2A2D35]/50 rounded-xl text-2xs text-[#A0A0A0] shadow-sm">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                          {/* Live Chat Temperature control */}
                          <div className="flex items-center space-x-2">
                            <span className="text-[#525866] font-bold uppercase tracking-wider text-[10px]">Temperature:</span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={settings.temperature}
                              onChange={(e) => handleSaveSettings({ temperature: parseFloat(e.target.value) })}
                              className="accent-indigo-500 h-1 w-16 md:w-20 bg-[#0B0C0E] rounded-lg appearance-none cursor-pointer"
                              title="Controls response creativity vs deterministic facts"
                            />
                            <span className="font-mono text-indigo-400 font-bold text-xs min-w-[20px]">{settings.temperature}</span>
                          </div>

                          {/* Live Context Window Top K control */}
                          <div className="flex items-center space-x-2">
                            <span className="text-[#525866] font-bold uppercase tracking-wider text-[10px]">Context Window (Top K):</span>
                            <input
                              type="range"
                              min="1"
                              max="100"
                              value={settings.topK}
                              onChange={(e) => handleSaveSettings({ topK: parseInt(e.target.value) })}
                              className="accent-indigo-500 h-1 w-20 md:w-28 bg-[#0B0C0E] rounded-lg appearance-none cursor-pointer"
                              title="Retrieves up to 100 contextual book passages for high capacity reasoning"
                            />
                            <span className="font-mono text-indigo-400 font-bold text-xs min-w-[20px]">{settings.topK}</span>
                          </div>
                        </div>

                        {/* Direct ZIP download button */}
                        <a
                          href="/api/download-zip"
                          download="knowledge-io-docker.zip"
                          className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white rounded-lg transition-all shadow-md shadow-emerald-950/10 cursor-pointer"
                          title="Download Docker Container Deployment package as a ZIP archive"
                        >
                          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          <span>Docker Setup (ZIP)</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: INGEST KNOWLEDGE */}
            {activeTab === "add" && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Add Books, Papers, and Videos to Knowledge Base</h3>
                  <p className="text-xs text-[#525866]">All data is parsed, chunked, and stored portably on your system.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left sub-col: Upload Files */}
                  <div className="space-y-6">
                    <div className="bg-[#16181D]/60 border border-[#2A2D35] p-6 rounded-2xl space-y-4 shadow-md">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center">
                        <UploadCloud className="h-4.5 w-4.5 mr-2" />
                        Upload PDF, Text, HTML or Images
                      </h4>
                      <p className="text-2xs text-[#525866]">
                        Drop textbook PDFs, markdown docs, or book scans. Images will automatically trigger local Tesseract OCR!
                      </p>
                      
                      {/* Drag & drop box */}
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={triggerFileInput}
                        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                          isDragging 
                            ? "border-indigo-500 bg-indigo-500/10 text-white" 
                            : "border-[#2A2D35] hover:border-[#525866] bg-[#0B0C0E]/40 text-[#525866] hover:text-[#A0A0A0]"
                        }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept=".pdf,.doc,.docx,.txt,.md,.html,.htm,.png,.jpg,.jpeg"
                          multiple
                          className="hidden"
                        />
                        {isIngesting === "file" ? (
                          batchProgress ? (
                            <div className="space-y-3 w-full max-w-[280px] mx-auto" onClick={(e) => e.stopPropagation()}>
                              <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mx-auto" />
                              <div className="space-y-1">
                                <p className="text-xs font-bold text-white">
                                  Ingesting {batchProgress.current} of {batchProgress.total}
                                </p>
                                <p className="text-3xs text-indigo-300 font-mono truncate max-w-full block px-2">
                                  {batchProgress.fileName}
                                </p>
                              </div>
                              
                              {/* Progress Bar Container */}
                              <div className="w-full bg-[#1F2229] h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                                />
                              </div>
                              
                              <div className="flex justify-between text-4xs font-mono text-slate-500 px-1">
                                <span>Success: {batchProgress.successCount}</span>
                                <span>Failed: {batchProgress.failCount}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <Loader2 className="h-8 w-8 text-indigo-400 animate-spin mx-auto" />
                              <p className="text-xs font-bold text-white">Extracting document text...</p>
                              <p className="text-3xs text-[#525866] font-mono">Running Local PDF-parser & OCR Engines</p>
                            </div>
                          )
                        ) : (
                          <div className="space-y-2">
                            <UploadCloud className="h-10 w-10 text-[#525866] mx-auto" />
                            <p className="text-xs font-bold">Drag & drop your files here</p>
                            <p className="text-3xs text-[#525866] font-mono">Or click to browse storage</p>
                            <p className="text-3xs text-[#525866]/60 mt-1">Supports PDF, DOC, DOCX, HTML, TXT, MD, Images</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* YouTube subtitles extractor */}
                    <div className="bg-[#16181D]/60 border border-[#2A2D35] p-6 rounded-2xl space-y-4 shadow-md">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center">
                        <Youtube className="h-4.5 w-4.5 mr-2" />
                        Scrape YouTube Transcripts
                      </h4>
                      <p className="text-2xs text-[#525866]">
                        Provide a YouTube video link to extract its caption track. Excellent for video lectures, audiobook transcripts, and talks.
                      </p>
                      <form onSubmit={handleYoutubeIngest} className="flex space-x-2">
                        <input
                          type="url"
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="flex-1 bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-4 py-2.5 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono placeholder-[#525866]"
                          disabled={isIngesting !== false}
                        />
                        <button
                          type="submit"
                          disabled={!youtubeUrl.trim() || isIngesting !== false}
                          className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-[#1F2229] disabled:text-[#525866] text-xs font-bold text-white rounded-xl transition-all shrink-0 flex items-center space-x-1.5 shadow-md shadow-rose-950/20"
                        >
                          {isIngesting === "youtube" ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Scraping...</span>
                            </>
                          ) : (
                            <>
                              <span>Ingest Captions</span>
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right sub-col: Manual Paste */}
                  <div className="bg-[#16181D]/60 border border-[#2A2D35] p-6 rounded-2xl flex flex-col h-full space-y-4 shadow-md">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center">
                      <BookOpen className="h-4.5 w-4.5 mr-2" />
                      Manually Paste Textbook Sections
                    </h4>
                    <p className="text-2xs text-[#525866]">
                      Instantly paste clean chapters, reference definitions, notes, or essays directly.
                    </p>

                    <form onSubmit={handlePasteIngest} className="flex-1 flex flex-col space-y-3">
                      <div>
                        <label className="block text-3xs font-bold uppercase tracking-wider text-[#525866] mb-1">
                          Document Title
                        </label>
                        <input
                          type="text"
                          value={pasteTitle}
                          onChange={(e) => setPasteTitle(e.target.value)}
                          placeholder="e.g. Chapter 1: Foundations of Machine Learning"
                          className="w-full bg-[#0B0C0E] border border-[#2A2D35] rounded-xl px-4 py-2.5 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 placeholder-[#525866]"
                          disabled={isIngesting !== false}
                        />
                      </div>

                      <div className="flex-1 flex flex-col">
                        <label className="block text-3xs font-bold uppercase tracking-wider text-[#525866] mb-1">
                          Textbook / Book Text Content
                        </label>
                        <textarea
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          placeholder="Paste your content here..."
                          className="w-full flex-1 min-h-[160px] bg-[#0B0C0E] border border-[#2A2D35] rounded-xl p-3 text-xs text-[#E0E0E0] focus:outline-none focus:border-indigo-500 font-mono resize-none leading-relaxed placeholder-[#525866]"
                          disabled={isIngesting !== false}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={!pasteTitle.trim() || !pasteText.trim() || isIngesting !== false}
                        className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-[#1F2229] disabled:text-[#525866] text-xs font-bold text-white rounded-xl transition duration-150 flex items-center justify-center space-x-1.5 shadow-md shadow-emerald-950/20"
                      >
                        {isIngesting === "text" ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Processing chunks...</span>
                          </>
                        ) : (
                          <>
                            <span>Add to Knowledge Base</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: MODEL CONFIG & MODEL LIBRARY HUB */}
            {activeTab === "model_hub" && settings && (
              <LocalLLMHub 
                settings={settings} 
                onUpdateSettings={async (updated) => {
                  await handleSaveSettings(updated);
                }}
                onShowSuccess={(msg) => {
                  setIngestStatus({ success: msg });
                  setTimeout(() => setIngestStatus(null), 4000);
                }}
                isGenerating={isGenerating}
              />
            )}

            {/* TAB 4: SOURCES DATABASE */}
            {activeTab === "sources" && (
              <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center">
                      <Database className="h-5 w-5 text-indigo-400 mr-2" />
                      Ingested Sources Database ({documents.length})
                    </h3>
                    <p className="text-xs text-[#525866]">
                      Monitor and manage all ingested textbooks, files, YouTube captions, and active database status.
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={fetchDocuments}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#16181D] hover:bg-[#1F2229] border border-[#2A2D35] rounded-lg text-xs font-medium text-[#E0E0E0] transition"
                      title="Refresh lists"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Refresh DB</span>
                    </button>
                    {(documents.length > 0 || totalChunks > 0) && (
                      <button 
                        onClick={clearAllDocuments}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-950/40 rounded-lg text-xs font-bold text-rose-400 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>WIPE DATABASE</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* DB Stats Bento Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Local Storage Card */}
                  <div className="bg-[#16181D]/60 border border-[#2A2D35] p-5 rounded-2xl flex flex-col justify-between shadow-md">
                    <div>
                      <p className="text-[11px] text-[#525866] font-bold uppercase tracking-widest mb-1">Local Storage Sandbox</p>
                      <div className="flex justify-between items-baseline mt-2">
                        <span className="text-lg font-mono font-extrabold text-white">{currentTotalGb} GB</span>
                        <span className="text-3xs text-[#525866] font-semibold">of {totalCapacityGb} GB limit</span>
                      </div>

                      {/* Capacity Selection Buttons */}
                      <div className="mt-3 pt-3 border-t border-[#2A2D35]/30">
                        <label className="text-[9px] text-[#525866] font-extrabold uppercase tracking-widest block mb-1.5">
                          Adjust Capacity
                        </label>
                        <div className="grid grid-cols-5 gap-1 bg-[#0B0C0E]/50 p-0.5 rounded-lg border border-[#2A2D35]/50">
                          {[64, 128, 256, 384, 512].map((cap) => (
                            <button
                              key={cap}
                              onClick={() => handleSaveSettings({ sandboxCapacity: cap })}
                              title={`${cap} GB Storage Sandbox`}
                              className={`py-1 text-[10px] font-mono font-bold rounded transition-all ${
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
                        <span className="text-green-500 font-bold uppercase">Active sandbox</span>
                      </div>
                    </div>
                  </div>

                  {/* Passages Card */}
                  <div className="bg-[#16181D]/60 border border-[#2A2D35] p-5 rounded-2xl flex flex-col justify-between shadow-md">
                    <div>
                      <p className="text-[11px] text-[#525866] font-bold uppercase tracking-widest mb-1">Indexed Passages</p>
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
                      <p className="text-[11px] text-[#525866] font-bold uppercase tracking-widest mb-1">Total Words Indexed</p>
                      <div className="flex justify-between items-baseline mt-2">
                        <span className="text-2xl font-mono font-extrabold text-white">
                          {documents.reduce((acc, curr) => acc + Math.round(curr.charCount / 5), 0).toLocaleString()}
                        </span>
                        <span className="text-3xs text-emerald-400 font-bold uppercase">Calculated</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#2A2D35]/30 flex justify-between text-3xs text-[#525866]">
                      <span>Average 5 characters per word</span>
                      <span className="font-semibold text-emerald-400 font-mono">{(totalChars / 1024).toFixed(1)} KB Total</span>
                    </div>
                  </div>
                </div>

                {/* Sources Document List/Grid */}
                <div className="bg-[#16181D]/30 border border-[#2A2D35]/60 rounded-2xl p-6">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center">
                    <FileText className="h-4.5 w-4.5 mr-2 text-indigo-400" />
                    Ingested Document Entries ({documents.length})
                  </h4>

                  {documents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center p-12 text-[#525866] border border-dashed border-[#2A2D35] rounded-xl bg-[#0B0C0E]/20">
                      <FileText className="h-10 w-10 text-[#525866]/80 mb-3 stroke-[1.5]" />
                      <p className="text-sm font-semibold text-[#A0A0A0]">No knowledge ingested yet</p>
                      <p className="text-xs text-[#525866]/80 mt-1 max-w-sm">
                        Please upload your textbooks, books, PDFs, or YouTube channels in the "Import Manager" tab to start building your localized database.
                      </p>
                      <button
                        onClick={() => setActiveTab("add")}
                        className="mt-5 px-4 py-2 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-400 rounded-xl transition shadow-lg shadow-indigo-500/10 cursor-pointer"
                      >
                        Go to Import Manager
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {documents.map(doc => (
                        <div 
                          key={doc.id}
                          className="group relative flex flex-col p-4 bg-[#16181D]/60 hover:bg-[#16181D] border border-[#2A2D35]/50 hover:border-[#2A2D35] rounded-xl transition duration-200"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3 overflow-hidden pr-8">
                              <div className="p-2 bg-[#0B0C0E]/40 rounded-lg border border-[#2A2D35]/30">
                                {doc.sourceType === "file" && <FileText className="h-5 w-5 text-indigo-400 shrink-0" />}
                                {doc.sourceType === "youtube" && <Youtube className="h-5 w-5 text-rose-400 shrink-0" />}
                                {doc.sourceType === "text" && <BookOpen className="h-5 w-5 text-emerald-400 shrink-0" />}
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-xs font-bold text-white truncate" title={doc.title}>
                                  {doc.title}
                                </p>
                                <div className="flex items-center space-x-2 mt-1">
                                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-extrabold uppercase tracking-wider">
                                    {doc.sourceType}
                                  </span>
                                  <span className="text-2xs text-[#525866] font-semibold font-mono">
                                    {doc.chunkCount} chunks
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <button 
                              onClick={() => deleteDocument(doc.id)}
                              className="p-1.5 text-[#525866] hover:text-rose-400 hover:bg-[#1F2229] rounded-lg transition duration-150"
                              title="Delete document"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-4 pt-3 border-t border-[#2A2D35]/20 flex items-center justify-between text-3xs text-[#525866]">
                            <span>Added: {new Date(doc.addedAt).toLocaleString()}</span>
                            <span className="font-mono bg-[#0B0C0E]/40 px-1.5 py-0.5 rounded">{(doc.charCount / 1024).toFixed(1)} KB</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: VECTOR STORAGE & EMBEDDINGS HUB */}
            {activeTab === "vector_hub" && settings && (
              <VectorHub 
                settings={settings} 
                onUpdateSettings={handleSaveSettings}
                onShowSuccess={(msg) => {
                  setIngestStatus({ success: msg });
                  setTimeout(() => setIngestStatus(null), 4000);
                }}
                documents={documents}
                totalChunks={totalChunks}
                isGenerating={isGenerating}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
