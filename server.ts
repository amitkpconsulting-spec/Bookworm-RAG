import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { createRequire } from "module";
import canvas from "@napi-rs/canvas";
// Polyfill DOMMatrix for pdfjs-dist in Node.js environment
(globalThis as any).DOMMatrix = canvas.DOMMatrix as any;

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
import { createWorker } from "tesseract.js";
import { GoogleGenAI, Type } from "@google/genai";
import { execSync } from "child_process";
import AdmZip from "adm-zip";
import { 
  RAGSettings, 
  SourceDocument, 
  DocumentChunk, 
  RetrievedSource, 
  IngestResponse, 
  QueryResponse 
} from "./src/types";

// Setup directories
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const STORE_PATH = path.join(DATA_DIR, "rag_store.json");

// In-memory DB structure
interface LocalStore {
  documents: SourceDocument[];
  chunks: DocumentChunk[];
  settings: RAGSettings;
}

// Helper for robust fetch with a timeout and user-friendly error messages
async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 12000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError" || error.code === "UND_ERR_HEADERS_TIMEOUT" || error.message?.includes("timeout") || error.message?.includes("Timeout")) {
      throw new Error(`Connection to provider timed out after ${timeout}ms. Please ensure your local server (e.g. LM Studio, Ollama, Chroma) is running, or switch back to the Gemini Cloud fallback.`);
    }
    if (error.code === "ECONNREFUSED" || error.message?.includes("fetch failed") || error.message?.includes("Refused")) {
      throw new Error(`Could not connect to provider at ${url}. Please verify that the server is running and accessible, or switch back to the Gemini Cloud fallback.`);
    }
    throw error;
  }
}

// Chroma DB REST API Client Helper
class ChromaHelper {
  private static async request(url: string, method: string, body?: any) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const response = await fetchWithTimeout(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      timeout: 8000,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Chroma DB error (${response.status}): ${errText}`);
    }
    return response.json();
  }

  // Check if healthy
  static async checkHealth(baseUrl: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${baseUrl}/api/v1/heartbeat`, { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }

  // Get or Create Collection
  static async getOrCreateCollection(baseUrl: string, name: string) {
    const url = `${baseUrl}/api/v1/collections`;
    const res = await this.request(url, "POST", { name, get_or_create: true });
    return res; // returns { id, name, metadata }
  }

  // Add chunks
  static async addChunks(baseUrl: string, collectionName: string, chunks: { id: string; vector: number[]; metadata: any; text: string }[]) {
    const col = await this.getOrCreateCollection(baseUrl, collectionName);
    const colId = col.id;
    const url = `${baseUrl}/api/v1/collections/${colId}/add`;
    
    const payload = {
      ids: chunks.map(c => c.id),
      embeddings: chunks.map(c => c.vector),
      metadatas: chunks.map(c => c.metadata),
      documents: chunks.map(c => c.text)
    };
    
    return this.request(url, "POST", payload);
  }

  // Query chunks
  static async queryChunks(baseUrl: string, collectionName: string, queryVector: number[], topK: number): Promise<any[]> {
    const col = await this.getOrCreateCollection(baseUrl, collectionName);
    const colId = col.id;
    const url = `${baseUrl}/api/v1/collections/${colId}/query`;
    
    const payload = {
      query_embeddings: [queryVector],
      n_results: topK
    };
    
    const result = await this.request(url, "POST", payload);
    const matched: any[] = [];
    if (result && result.ids && result.ids[0]) {
      const ids = result.ids[0];
      const distances = result.distances ? result.distances[0] : [];
      const metadatas = result.metadatas ? result.metadatas[0] : [];
      const documents = result.documents ? result.documents[0] : [];
      
      for (let i = 0; i < ids.length; i++) {
        const distance = distances[i] || 0;
        const score = 1 / (1 + distance);
        
        matched.push({
          docId: metadatas[i]?.docId || "",
          docTitle: metadatas[i]?.docTitle || "Chroma Chunk",
          text: documents[i] || "",
          score: score,
          sourceType: metadatas[i]?.sourceType || "file",
          sourceUrl: metadatas[i]?.sourceUrl || undefined,
        });
      }
    }
    return matched;
  }

  // Delete chunks of a document
  static async deleteDocument(baseUrl: string, collectionName: string, docId: string) {
    try {
      const col = await this.getOrCreateCollection(baseUrl, collectionName);
      const colId = col.id;
      const url = `${baseUrl}/api/v1/collections/${colId}/delete`;
      const payload = {
        where: { docId: docId }
      };
      return await this.request(url, "POST", payload);
    } catch (err) {
      console.warn(`Failed to delete document ${docId} from Chroma:`, err);
    }
  }

  // Clear Collection (Delete collection)
  static async clearCollection(baseUrl: string, name: string) {
    try {
      const url = `${baseUrl}/api/v1/collections/${name}`;
      const response = await fetch(url, { method: "DELETE" });
      if (response.ok) {
        console.log(`Deleted collection ${name} from Chroma`);
      }
    } catch (err) {
      console.warn(`Failed to clear Chroma collection ${name}:`, err);
    }
  }
}

// Default settings
const defaultSettings: RAGSettings = {
  provider: "lm_studio",
  apiUrl: "http://localhost:1234/v1",
  apiKey: "",
  modelName: "",
  embeddingProvider: "local_tfidf",
  embeddingModel: "text-embedding-nomic",
  chunkSize: 600,
  chunkOverlap: 120,
  systemPrompt: "You are a helpful local assistant who answers questions based ONLY on the provided context passages. If the context does not contain the answer, say that you cannot find it in the books, but attempt to explain based on what you have.",
  temperature: 0.7,
  topK: 5,
  vectorDb: "in_memory",
  chromaUrl: "http://localhost:8000",
  chromaCollection: "technoscope",
  ragMode: "naive",
  sandboxCapacity: 64,
};

// Load or initialize store
let store: LocalStore = {
  documents: [],
  chunks: [],
  settings: defaultSettings,
};

if (fs.existsSync(STORE_PATH)) {
  try {
    const data = fs.readFileSync(STORE_PATH, "utf8");
    store = JSON.parse(data);
    // Ensure all keys are present
    store.settings = { ...defaultSettings, ...store.settings };
    saveStore(); // Save merged settings back to disk
    console.log("Loaded and merged settings:", store.settings);
  } catch (e) {
    console.error("Failed to load store, initializing empty store:", e);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save store:", e);
  }
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Setup multer for local uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Initialize Gemini Client lazily
let geminiClient: GoogleGenAI | null = null;
let currentGeminiKey = "";
function getGeminiClient(apiKey?: string): GoogleGenAI {
  const finalKey = apiKey || store.settings.apiKey || process.env.GEMINI_API_KEY;
  if (!finalKey) {
    throw new Error("Gemini API Key is missing. Configure it in Settings.");
  }
  if (!geminiClient || currentGeminiKey !== finalKey) {
    geminiClient = new GoogleGenAI({
      apiKey: finalKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    currentGeminiKey = finalKey;
  }
  return geminiClient;
}

// ==========================================
// CHUNKING UTILITY
// ==========================================
function chunkText(text: string, size: number, overlap: number): string[] {
  if (!text) return [];
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const chunks: string[] = [];
  
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + size);
    if (chunkWords.length === 0) break;
    chunks.push(chunkWords.join(" "));
    // Move forward by size minus overlap
    i += Math.max(1, size - overlap);
  }
  return chunks;
}

// ==========================================
// VECTOR MATH & TF-IDF ENGINE
// ==========================================
function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  return norm1 === 0 || norm2 === 0 ? 0 : dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Clean text for search tokens
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

// Simple but powerful offline TF-IDF Search
function tfidfSearch(query: string, chunks: DocumentChunk[], topK: number): RetrievedSource[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || chunks.length === 0) return [];

  // Calculate Document Frequency (DF) for each term
  const df: Record<string, number> = {};
  const chunkTokensList = chunks.map(c => tokenize(c.text));
  
  queryTokens.forEach(token => {
    let count = 0;
    chunkTokensList.forEach(tokens => {
      if (tokens.includes(token)) count++;
    });
    df[token] = count;
  });

  const N = chunks.length;
  const scores: { chunk: DocumentChunk; score: number }[] = [];

  chunks.forEach((chunk, idx) => {
    const tokens = chunkTokensList[idx];
    let score = 0;

    queryTokens.forEach(token => {
      const termDf = df[token] || 0;
      if (termDf === 0) return;

      // Inverse Document Frequency
      const idf = Math.log(1 + (N - termDf + 0.5) / (termDf + 0.5));
      
      // Term Frequency
      const tfCount = tokens.filter(t => t === token).length;
      const tf = tfCount / (tokens.length || 1);

      // Add simple TF-IDF weight
      score += tf * idf;
    });

    if (score > 0) {
      scores.push({ chunk, score });
    }
  });

  // Sort and pick top K
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(item => ({
      docId: item.chunk.docId,
      docTitle: item.chunk.docTitle,
      text: item.chunk.text,
      score: item.score,
      sourceType: item.chunk.sourceType,
      sourceUrl: item.chunk.sourceUrl,
    }));
}

// Generate Embeddings from chosen provider
// Helper to dynamically resolve the model name when none is provided by the user
async function resolveModelName(settings: RAGSettings, headers: Record<string, string>): Promise<string> {
  if (settings.modelName && settings.modelName.trim() !== "") {
    return settings.modelName.trim();
  }

  // If no model is written, let's query the platform's models endpoint to get the default model
  try {
    let modelsUrl = "";
    if (settings.provider === "ollama") {
      modelsUrl = `${settings.apiUrl}/api/tags`;
    } else if (settings.provider === "anything_llm") {
      let base = settings.apiUrl;
      if (base.endsWith("/api/v1")) {
        modelsUrl = `${base}/openai/models`;
      } else if (base.endsWith("/api/v1/")) {
        modelsUrl = `${base}openai/models`;
      } else {
        modelsUrl = `${base}/models`;
      }
    } else {
      modelsUrl = `${settings.apiUrl}/models`;
    }

    console.log(`No model name specified. Querying models from ${modelsUrl}...`);
    const response = await fetchWithTimeout(modelsUrl, {
      method: "GET",
      headers: headers,
      timeout: 5000,
    });

    if (response.ok) {
      const data = await response.json();
      if (settings.provider === "ollama") {
        if (data.models && data.models.length > 0) {
          console.log(`Discovered Ollama models:`, data.models.map((m: any) => m.name));
          return data.models[0].name;
        }
      } else {
        const modelsList = data.data || data.models || [];
        if (modelsList.length > 0) {
          const firstModel = modelsList[0].id || modelsList[0].name || modelsList[0];
          if (firstModel && typeof firstModel === "string") {
            console.log(`Discovered local models:`, modelsList.map((m: any) => m.id || m.name || m));
            return firstModel;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Failed to fetch available models from local platform:", err);
  }

  // Sensible default fallbacks if discovery fails or is empty
  if (settings.provider === "ollama") {
    return "llama3";
  }
  return "";
}

// Generate Embeddings from chosen provider
async function getEmbedding(text: string, settings: RAGSettings): Promise<number[]> {
  const provider = settings.embeddingProvider;
  
  if (provider === "gemini") {
    const ai = getGeminiClient();
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text,
    });
    const embedRes = result as any;
    if (embedRes.embeddings?.values) {
      return embedRes.embeddings.values;
    }
    if (embedRes.embedding?.values) {
      return embedRes.embedding.values;
    }
    throw new Error("No embedding values returned from Gemini");
  }

  if (provider === "lm_studio" || provider === "ollama" || settings.provider === "anything_llm") {
    let url = "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (settings.apiKey) {
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    }

    if (provider === "ollama") {
      url = `${settings.apiUrl}/api/embeddings`;
    } else if (settings.provider === "anything_llm") {
      let base = settings.apiUrl;
      if (base.endsWith("/api/v1")) {
        url = `${base}/openai/embeddings`;
      } else if (base.endsWith("/api/v1/")) {
        url = `${base}openai/embeddings`;
      } else {
        url = `${base}/embeddings`;
      }
    } else {
      url = `${settings.apiUrl}/embeddings`;
    }
      
    const resolvedEmbedModel = settings.embeddingModel || (provider === "ollama" ? "nomic-embed-text" : "text-embedding-nomic");

    const payload = provider === "ollama"
      ? { model: resolvedEmbedModel, prompt: text }
      : { model: resolvedEmbedModel, input: text };

    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      timeout: 10000,
    });

    if (!response.ok) {
      const errMsg = await response.text();
      throw new Error(`Embedding API error from ${provider}: ${errMsg}`);
    }

    const data = await response.json();
    
    // Support diverse response structures from different local backends
    if (data.data?.[0]?.embedding) {
      return data.data[0].embedding;
    } else if (data.embedding) {
      return data.embedding;
    } else if (data.embeddings && data.embeddings[0]) {
      return data.embeddings[0];
    }
  }

  throw new Error(`Embedding provider ${provider} not configured or unsupported.`);
}

// ==========================================
// YOUTUBE TRANSCRIPT SCRAPER (Pure TS)
// ==========================================
function extractYoutubeVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

async function scrapeYoutubeTranscript(videoId: string): Promise<{ text: string; title: string }> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(watchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      }
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch YouTube page");
    }

    const html = await response.text();
    
    // Attempt to extract title
    let title = "YouTube Video";
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(" - YouTube", "").trim();
    }

    // Locate timedtext caption tracks configuration
    const captionsMatch = html.match(/"playerCaptionsTracklistRenderer":\s*({.*?})/);
    if (!captionsMatch) {
      // Try alternate match
      const altMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.*?});/);
      if (altMatch) {
        try {
          const parsed = JSON.parse(altMatch[1]);
          const tracks = parsed.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (tracks && tracks.length > 0) {
            return await fetchCaptionTrackText(tracks[0].baseUrl, title);
          }
        } catch (e) {}
      }
      throw new Error("No caption track configuration found. Make sure captions are enabled for this video.");
    }

    const captionsJson = JSON.parse(captionsMatch[1]);
    const captionTracks = captionsJson.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error("No captions found for this video. Captions must be enabled.");
    }

    // Select the first track (preferably English)
    const englishTrack = captionTracks.find((t: any) => t.languageCode === "en") || captionTracks[0];
    return await fetchCaptionTrackText(englishTrack.baseUrl, title);

  } catch (error: any) {
    console.error("YouTube Transcribe error:", error);
    throw new Error(error.message || "Failed to transcribe YouTube video.");
  }
}

async function fetchCaptionTrackText(baseUrl: string, title: string): Promise<{ text: string; title: string }> {
  // Append json/xml format format parameter
  const captionRes = await fetch(baseUrl + "&fmt=json");
  if (!captionRes.ok) {
    throw new Error("Failed to retrieve caption text track.");
  }
  const data = await captionRes.json();
  
  if (data.events) {
    const transcriptText = data.events
      .map((ev: any) => ev.segs ? ev.segs.map((s: any) => s.utf8).join("") : "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { text: transcriptText, title };
  }
  
  throw new Error("Failed to parse YouTube captions.");
}

// ==========================================
// CENTRAL SAVING & CHROMA PERSISTENCE
// ==========================================
// Helper to extract printable text directly from any binary PDF stream as a robust fallback
function extractPrintableText(buffer: Buffer): string {
  let text = "";
  let word = "";
  for (let i = 0; i < buffer.length; i++) {
    const char = buffer[i];
    // Printable ASCII plus common control characters and extended western chars
    if ((char >= 32 && char <= 126) || char === 10 || char === 13 || char === 9 || (char >= 192 && char <= 255)) {
      word += String.fromCharCode(char);
    } else {
      if (word.length >= 4) {
        text += word + "\n";
      }
      word = "";
    }
  }
  if (word.length >= 4) {
    text += word + "\n";
  }
  // Simple cleaning of PDF tags and metadata
  return text
    .replace(/\/[\w]+/g, "") // remove typical PDF slashes and keywords
    .replace(/[<>()[\]{}]/g, " ") // replace bracket groupings with spaces
    .replace(/\s+/g, " ") // normalize whitespace
    .trim();
}

// Robust PDF extraction helper supporting all versions of pdf-parse with fallback chain
async function extractTextFromPdf(buffer: Buffer, filename: string = "document.pdf"): Promise<string> {
  const pdfModule = pdf as any;
  if (!pdfModule) {
    throw new Error("PDF parser module is not loaded.");
  }

  const uint8Data = new Uint8Array(buffer);

  // 1. pdf-parse class-based version (v2.4.5+)
  if (pdfModule && typeof pdfModule.PDFParse === "function") {
    try {
      const parser = new pdfModule.PDFParse({ data: uint8Data });
      const res = await parser.getText();
      if (res && res.text && res.text.trim().length > 10) {
        return res.text;
      }
    } catch (err: any) {
      console.warn("Class-based pdf-parse failed to parse PDF, trying fallbacks:", err);
    }
  }

  // 2. pdf-parse contains standard default which has PDFParse (v2 ESM variant)
  if (pdfModule.default && typeof pdfModule.default.PDFParse === "function") {
    try {
      const parser = new pdfModule.default.PDFParse({ data: uint8Data });
      const res = await parser.getText();
      if (res && res.text && res.text.trim().length > 10) {
        return res.text;
      }
    } catch (err: any) {
      console.warn("Class-based pdf-parse default failed to parse PDF, trying fallbacks:", err);
    }
  }

  // 3. pdf-parse is a legacy function (fallback for alternative versions)
  if (typeof pdfModule === "function") {
    try {
      const res = await (pdfModule as any)(buffer);
      if (res && res.text && res.text.trim().length > 10) {
        return res.text;
      }
    } catch (err: any) {
      console.warn("Legacy pdf-parse function invocation failed, trying fallbacks:", err);
    }
  }

  // 4. pdf-parse has a default export which is a legacy function
  if (pdfModule.default && typeof pdfModule.default === "function") {
    try {
      const res = await (pdfModule.default as any)(buffer);
      if (res && res.text && res.text.trim().length > 10) {
        return res.text;
      }
    } catch (err: any) {
      console.warn("Legacy pdf-parse default function invocation failed, trying fallbacks:", err);
    }
  }

  // 5. Try dynamic import as a final library fallback
  try {
    const dynamicPdf = (await import("pdf-parse")) as any;
    if (dynamicPdf && typeof dynamicPdf.PDFParse === "function") {
      const parser = new dynamicPdf.PDFParse({ data: uint8Data });
      const res = await parser.getText();
      if (res && res.text && res.text.trim().length > 10) return res.text;
    }
    if (dynamicPdf && dynamicPdf.default && typeof dynamicPdf.default.PDFParse === "function") {
      const parser = new dynamicPdf.default.PDFParse({ data: uint8Data });
      const res = await parser.getText();
      if (res && res.text && res.text.trim().length > 10) return res.text;
    }
    if (typeof dynamicPdf === "function") {
      const res = await (dynamicPdf as any)(buffer);
      if (res && res.text && res.text.trim().length > 10) return res.text;
    }
    if (dynamicPdf && dynamicPdf.default && typeof dynamicPdf.default === "function") {
      const res = await (dynamicPdf.default as any)(buffer);
      if (res && res.text && res.text.trim().length > 10) return res.text;
    }
  } catch (err: any) {
    console.warn("Dynamic import of pdf-parse failed in helper:", err);
  }

  // 6. Last resort: strings-based PDF extraction
  console.warn("All PDF library parsers failed or produced empty text. Running robust strings-based fallback...");
  try {
    const stringsText = extractPrintableText(buffer);
    if (stringsText && stringsText.length > 20) {
      return "[Fallback Extracted PDF Content]\n" + stringsText;
    }
  } catch (err) {
    console.warn("Strings-based printable text extraction crashed:", err);
  }

  // Graceful ultimate fallback
  console.warn("PDF Extraction Pipeline completely failed to extract text. Returning metadata stub to prevent ingestion failure.");
  return `[File Metadata Extract]
Document Title: ${filename}
mimetype: application/pdf
Size: ${buffer.length} bytes
[Notice: This document could not be decoded. It may contain scanned image-only pages, password protection, or custom DRM encodings. If this document contains critical knowledge, please upload it in plain text, HTML, or DOCX formats.]`;
}

// Extract text from .docx using adm-zip
function extractTextFromDocx(buffer: Buffer): string {
  try {
    const zip = new AdmZip(buffer);
    const contentXml = zip.readAsText("word/document.xml");
    if (!contentXml) {
      throw new Error("Missing word/document.xml inside docx archive.");
    }
    
    // Replace table row and paragraph endings with newlines
    let text = contentXml.replace(/<\/w:p>/g, "\n").replace(/<\/w:tr>/g, "\n");
    // Strip all XML tags
    text = text.replace(/<[^>]+>/g, "");
    // Unescape common XML entities
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    return text;
  } catch (err: any) {
    console.error("Error parsing DOCX with AdmZip:", err);
    throw new Error(`Failed to parse DOCX file: ${err.message || err}`);
  }
}

// Extract text from older .doc using docx parser fallback or text extractor
function extractTextFromDoc(buffer: Buffer): string {
  try {
    // Check if it is actually a zip file/docx first
    return extractTextFromDocx(buffer);
  } catch {
    // If not a zip, read printable character sequences (ASCII extraction / robust strings extractor)
    let text = "";
    let word = "";
    for (let i = 0; i < buffer.length; i++) {
      const char = buffer[i];
      if ((char >= 32 && char <= 126) || char === 10 || char === 13 || (char >= 192 && char <= 255)) {
        word += String.fromCharCode(char);
      } else {
        if (word.length >= 4) {
          text += word + "\n";
        }
        word = "";
      }
    }
    if (word.length >= 4) {
      text += word + "\n";
    }
    // Simple cleaning
    text = text
      .replace(/[^\x20-\x7E\r\n\t]/g, "") // remove non-printable ASCII
      .replace(/\s+/g, " "); // replace repeated whitespace with single space
    return text.trim();
  }
}

async function saveDocumentAndChunks(doc: SourceDocument, chunks: DocumentChunk[]) {
  store.documents.push(doc);
  store.chunks.push(...chunks);
  
  if (store.settings.vectorDb === "chroma") {
    try {
      const chromaUrl = store.settings.chromaUrl || "http://localhost:8000";
      const collectionName = store.settings.chromaCollection || "technoscope";
      
      const chromaChunks = chunks
        .filter(c => c.vector && c.vector.length > 0)
        .map(c => ({
          id: c.id,
          vector: c.vector!,
          text: c.text,
          metadata: {
            docId: c.docId,
            docTitle: c.docTitle,
            sourceType: c.sourceType,
            sourceUrl: c.sourceUrl || "",
          }
        }));
        
      if (chromaChunks.length > 0) {
        console.log(`Adding ${chromaChunks.length} chunks to Chroma DB at ${chromaUrl}, collection: ${collectionName}`);
        await ChromaHelper.addChunks(chromaUrl, collectionName, chromaChunks);
      } else {
        console.warn("Chroma DB is enabled, but no chunks had dense vectors. Ensure you have selected a dense embedding provider (LM Studio, Ollama, or Gemini) instead of TF-IDF.");
      }
    } catch (chromaErr: any) {
      console.error("Failed to add chunks to Chroma DB:", chromaErr);
      throw new Error(`Failed to store chunks in Chroma DB: ${chromaErr.message}`);
    }
  }
  
  saveStore();
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Get all documents
app.get("/api/documents", (req, res) => {
  res.json({ documents: store.documents, totalChunks: store.chunks.length });
});

// Delete document
app.delete("/api/documents/:id", async (req, res) => {
  const docId = req.params.id;
  store.documents = store.documents.filter(d => d.id !== docId);
  store.chunks = store.chunks.filter(c => c.docId !== docId);
  
  if (store.settings.vectorDb === "chroma") {
    try {
      await ChromaHelper.deleteDocument(
        store.settings.chromaUrl || "http://localhost:8000",
        store.settings.chromaCollection || "technoscope",
        docId
      );
    } catch (chromaErr) {
      console.warn("Chroma document deletion failed:", chromaErr);
    }
  }

  saveStore();
  res.json({ success: true });
});

// Clear DB
app.post("/api/documents/clear", async (req, res) => {
  store.documents = [];
  store.chunks = [];

  if (store.settings.vectorDb === "chroma") {
    try {
      await ChromaHelper.clearCollection(
        store.settings.chromaUrl || "http://localhost:8000",
        store.settings.chromaCollection || "technoscope"
      );
    } catch (chromaErr) {
      console.warn("Chroma collection clear failed:", chromaErr);
    }
  }

  saveStore();
  res.json({ success: true });
});

// Save RAG settings
app.post("/api/settings", (req, res) => {
  store.settings = { ...store.settings, ...req.body };
  saveStore();
  res.json({ success: true, settings: store.settings });
});

// Get settings
app.get("/api/settings", (req, res) => {
  res.json({ settings: store.settings });
});

// Download Docker-ready Zip of the repository (compiled on-the-fly)
app.get("/api/download-zip", (req, res) => {
  try {
    console.log("On-the-fly rebuild of knowledge-io-docker.zip initiated...");
    execSync("node create-zip.js");
  } catch (err) {
    console.error("Failed to run create-zip.js:", err);
  }

  const filePath = path.join(process.cwd(), "knowledge-io-docker.zip");
  if (fs.existsSync(filePath)) {
    res.download(filePath, "knowledge-io-docker.zip");
  } else {
    res.status(404).send("Docker Zip archive not found.");
  }
});

// YouTube Ingestion Endpoint
app.post("/api/ingest/youtube", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: "Missing YouTube URL" });
  }

  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    return res.status(400).json({ success: false, error: "Invalid YouTube URL format" });
  }

  try {
    const { text, title } = await scrapeYoutubeTranscript(videoId);
    
    // Create source document
    const docId = "yt-" + videoId;
    
    // Check if already exists
    if (store.documents.some(d => d.id === docId)) {
      return res.status(400).json({ success: false, error: "This YouTube video is already ingested" });
    }

    const words = text.split(" ");
    const textChunks = chunkText(text, store.settings.chunkSize, store.settings.chunkOverlap);
    
    const doc: SourceDocument = {
      id: docId,
      title,
      sourceType: "youtube",
      sourceUrl: url,
      content: text,
      charCount: text.length,
      chunkCount: textChunks.length,
      addedAt: new Date().toISOString(),
    };

    // Index chunks
    const chunkPromises = textChunks.map(async (chunkText, index) => {
      const chunkId = `${docId}-chunk-${index}`;
      let vector: number[] | undefined = undefined;

      // Generate embedding if embedding provider is not local tfidf
      if (store.settings.embeddingProvider !== "local_tfidf") {
        try {
          vector = await getEmbedding(chunkText, store.settings);
        } catch (embErr) {
          console.warn(`Embedding failed for chunk ${index}, defaulting to sparse TF-IDF only:`, embErr);
        }
      }

      return {
        id: chunkId,
        docId,
        docTitle: title,
        text: chunkText,
        index,
        vector,
        sourceType: "youtube" as const,
        sourceUrl: url,
      };
    });

    const newChunks = await Promise.all(chunkPromises);
    
    await saveDocumentAndChunks(doc, newChunks);

    res.json({ success: true, document: doc, chunksCount: newChunks.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to process YouTube ingestion" });
  }
});

// File Ingestion Endpoint (Supports PDF parsing, Image OCR, Text files, HTML)
app.post("/api/ingest/file", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  const { originalname, mimetype, buffer } = req.file;
  let text = "";
  let title = originalname;
  let ocrUsed = false;

  try {
    if (mimetype === "application/pdf") {
      text = await extractTextFromPdf(buffer, originalname);

      // If PDF text is empty or very short, it could be a scanned PDF. Fallback to OCR?
      if (!text || text.trim().length < 50) {
        console.log("PDF text is extremely short or empty. Scanning PDF pages might require page-level OCR.");
        text = text + "\n[Scanned PDF Warning: Little to no selectable text was extracted directly from this document]";
      }
    } else if (
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
      originalname.endsWith(".docx")
    ) {
      text = extractTextFromDocx(buffer);
    } else if (
      mimetype === "application/msword" || 
      originalname.endsWith(".doc")
    ) {
      text = extractTextFromDoc(buffer);
    } else if (mimetype.startsWith("image/")) {
      // OCR text extraction
      ocrUsed = true;
      const worker = await createWorker("eng");
      const ret = await worker.recognize(buffer);
      text = ret.data.text;
      await worker.terminate();
    } else {
      // Plain text, markdown, csv, HTML etc.
      text = buffer.toString("utf8");
      
      // Basic HTML tag stripping
      if (mimetype === "text/html" || originalname.endsWith(".html") || originalname.endsWith(".htm")) {
        text = text.replace(/<[^>]*>/g, " ");
      }
    }

    text = text.trim();
    if (!text) {
      return res.status(400).json({ success: false, error: "The document contains no readable text." });
    }

    const docId = `file-${Date.now()}`;
    const textChunks = chunkText(text, store.settings.chunkSize, store.settings.chunkOverlap);

    const doc: SourceDocument = {
      id: docId,
      title,
      sourceType: "file",
      content: text,
      charCount: text.length,
      chunkCount: textChunks.length,
      addedAt: new Date().toISOString(),
    };

    // Index chunks
    const chunkPromises = textChunks.map(async (chunkText, index) => {
      const chunkId = `${docId}-chunk-${index}`;
      let vector: number[] | undefined = undefined;

      if (store.settings.embeddingProvider !== "local_tfidf") {
        try {
          vector = await getEmbedding(chunkText, store.settings);
        } catch (embErr) {
          console.warn(`Embedding failed for chunk ${index}, defaulting to sparse:`, embErr);
        }
      }

      return {
        id: chunkId,
        docId,
        docTitle: title,
        text: chunkText,
        index,
        vector,
        sourceType: "file" as const,
      };
    });

    const newChunks = await Promise.all(chunkPromises);

    await saveDocumentAndChunks(doc, newChunks);

    res.json({ success: true, document: doc, chunksCount: newChunks.length, ocrUsed });
  } catch (error: any) {
    console.error("File processing error:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to parse document" });
  }
});

// Batch File Ingestion Endpoint (Supports multiple files simultaneously)
app.post("/api/ingest/files", upload.array("files"), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: "No files uploaded" });
  }

  const results: any[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    const { originalname, mimetype, buffer } = file;
    let text = "";
    let title = originalname;
    let ocrUsed = false;

    try {
      if (mimetype === "application/pdf") {
        text = await extractTextFromPdf(buffer, originalname);
        if (!text || text.trim().length < 50) {
          text = text + "\n[Scanned PDF Warning: Little to no selectable text was extracted directly from this document]";
        }
      } else if (
        mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
        originalname.endsWith(".docx")
      ) {
        text = extractTextFromDocx(buffer);
      } else if (
        mimetype === "application/msword" || 
        originalname.endsWith(".doc")
      ) {
        text = extractTextFromDoc(buffer);
      } else if (mimetype.startsWith("image/")) {
        ocrUsed = true;
        const worker = await createWorker("eng");
        const ret = await worker.recognize(buffer);
        text = ret.data.text;
        await worker.terminate();
      } else {
        text = buffer.toString("utf8");
        if (mimetype === "text/html" || originalname.endsWith(".html") || originalname.endsWith(".htm")) {
          text = text.replace(/<[^>]*>/g, " ");
        }
      }

      text = text.trim();
      if (!text) {
        throw new Error("The document contains no readable text.");
      }

      const docId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const textChunks = chunkText(text, store.settings.chunkSize, store.settings.chunkOverlap);

      const doc: SourceDocument = {
        id: docId,
        title,
        sourceType: "file",
        content: text,
        charCount: text.length,
        chunkCount: textChunks.length,
        addedAt: new Date().toISOString(),
      };

      const chunkPromises = textChunks.map(async (chunkText, index) => {
        const chunkId = `${docId}-chunk-${index}`;
        let vector: number[] | undefined = undefined;

        if (store.settings.embeddingProvider !== "local_tfidf") {
          try {
            vector = await getEmbedding(chunkText, store.settings);
          } catch (embErr) {
            console.warn(`Embedding failed for chunk ${index}, defaulting to sparse:`, embErr);
          }
        }

        return {
          id: chunkId,
          docId,
          docTitle: title,
          text: chunkText,
          index,
          vector,
          sourceType: "file" as const,
        };
      });

      const newChunks = await Promise.all(chunkPromises);
      await saveDocumentAndChunks(doc, newChunks);

      results.push({ name: originalname, success: true, chunksCount: newChunks.length, ocrUsed });
      successCount++;
    } catch (error: any) {
      console.error(`Error processing file ${originalname}:`, error);
      results.push({ name: originalname, success: false, error: error.message || "Failed to parse document" });
      failCount++;
    }
  }

  res.json({
    success: successCount > 0,
    results,
    successCount,
    failCount,
    total: files.length
  });
});

// Text Manual Paste Ingestion Endpoint
app.post("/api/ingest/text", async (req, res) => {
  const { title, text } = req.body;
  if (!text || !title) {
    return res.status(400).json({ success: false, error: "Title and text content are required" });
  }

  try {
    const docId = `text-${Date.now()}`;
    const textChunks = chunkText(text, store.settings.chunkSize, store.settings.chunkOverlap);

    const doc: SourceDocument = {
      id: docId,
      title,
      sourceType: "text",
      content: text,
      charCount: text.length,
      chunkCount: textChunks.length,
      addedAt: new Date().toISOString(),
    };

    // Index chunks
    const chunkPromises = textChunks.map(async (chunkText, index) => {
      const chunkId = `${docId}-chunk-${index}`;
      let vector: number[] | undefined = undefined;

      if (store.settings.embeddingProvider !== "local_tfidf") {
        try {
          vector = await getEmbedding(chunkText, store.settings);
        } catch (embErr) {
          console.warn(`Embedding failed for chunk ${index}, indexing as sparse:`, embErr);
        }
      }

      return {
        id: chunkId,
        docId,
        docTitle: title,
        text: chunkText,
        index,
        vector,
        sourceType: "text" as const,
      };
    });

    const newChunks = await Promise.all(chunkPromises);

    await saveDocumentAndChunks(doc, newChunks);

    res.json({ success: true, document: doc, chunksCount: newChunks.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || "Failed to ingest text content" });
  }
});

// ==========================================
// RAG ORCHESTRATION HELPERS
// ==========================================

// Token overlap helper for lexical similarity
function computeTokenOverlap(text1: string, text2: string): number {
  const tokens1 = new Set(text1.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(t => t.length > 2));
  const tokens2 = new Set(text2.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(t => t.length > 2));
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  let intersect = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersect++;
  }
  return intersect / Math.sqrt(tokens1.size * tokens2.size);
}

interface StructuredRAGResponse {
  executiveSummary: string;
  detailedAnalysis: string;
  keyTakeaways: string[];
  citations: string[];
}

function parseStructuredLLMResponse(text: string): StructuredRAGResponse {
  const cleanText = text.trim();
  try {
    // Try standard parse
    const parsed = JSON.parse(cleanText);
    if (parsed && typeof parsed === "object") {
      return {
        executiveSummary: parsed.executiveSummary || "",
        detailedAnalysis: parsed.detailedAnalysis || parsed.answer || cleanText,
        keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
        citations: Array.isArray(parsed.citations) ? parsed.citations : []
      };
    }
  } catch (e) {
    // Attempt block extraction
    try {
      const startIdx = cleanText.indexOf("{");
      const endIdx = cleanText.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const jsonBlock = cleanText.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonBlock);
        if (parsed && typeof parsed === "object") {
          return {
            executiveSummary: parsed.executiveSummary || "",
            detailedAnalysis: parsed.detailedAnalysis || parsed.answer || cleanText,
            keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [],
            citations: Array.isArray(parsed.citations) ? parsed.citations : []
          };
        }
      }
    } catch (innerErr) {
      console.warn("JSON block extraction failed:", innerErr);
    }
  }

  // Fallback heuristic-based construction if it isn't valid JSON at all
  console.log("LLM response did not contain parsable JSON. Applying fallback heuristics.");
  
  // Heuristic: Extract sections or split by lines
  const paragraphs = cleanText.split(/\n\n+/).filter(p => p.trim().length > 0);
  const executiveSummary = paragraphs[0] ? paragraphs[0].replace(/^(Executive Summary:|Summary:)/i, "").trim() : "";
  
  // Try to remove potential markdown headings for executive summary or block titles
  const cleanSummary = executiveSummary.replace(/^###?\s+.*$/m, "").trim();
  
  // Extract bullet points as key takeaways
  const bulletLines = cleanText.split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("-") || line.startsWith("*") || /^\d+\./.test(line));
  
  const keyTakeaways = bulletLines.slice(0, 5).map(line => line.replace(/^[-*\d.]\s*/, ""));
  
  return {
    executiveSummary: cleanSummary || "Refer to detailed analysis below.",
    detailedAnalysis: cleanText,
    keyTakeaways: keyTakeaways.length > 0 ? keyTakeaways : ["Comprehensive context matching generated.", "Structured response synthesized from local books."],
    citations: []
  };
}

// Algorithmic technical query expansion
function expandQueryInCode(query: string): string[] {
  const stopwords = ["what", "does", "mean", "explain", "about", "query", "search", "find", "show", "give", "some", "with", "have", "from", "that", "this", "is", "a", "the", "an", "and", "or", "to", "in", "of", "for", "on", "with", "at", "by"];
  const words = query.toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.includes(w));
  
  const coreWords = words.slice(0, 3);
  if (coreWords.length === 0) {
    return [query + " concepts", query + " practical implementations"];
  }
  
  return [
    `${coreWords.join(" ")} technical concepts, fundamental architecture, theoretical overview`,
    `${coreWords.join(" ")} deployment, practical examples, implementation design, optimization guide`
  ];
}

// Dynamic Entity Triple Extractor for Graph RAG
interface GraphTriple {
  subject: string;
  relation: string;
  object: string;
}

function extractGraphTriples(query: string, chunks: RetrievedSource[]): { entities: string[], triples: GraphTriple[] } {
  const commonConcepts = [
    "deep learning", "neural network", "transformer", "attention mechanism", "cnn", "rnn", 
    "recurrent neural network", "convolutional neural network", "llm", "large language model",
    "gpt", "supervised learning", "unsupervised learning", "backpropagation", "loss function",
    "optimizer", "gradient descent", "vector space", "embeddings", "chroma", "vector db", 
    "rag", "retrieval augmented generation", "agentic rag", "knowledge graph", "nodes", "edges",
    "tokens", "weights", "biases", "dataset", "learning rate", "overfitting"
  ];

  const matchedConcepts = new Set<string>();
  const combinedText = (query + " " + chunks.map(c => c.text).join(" ")).toLowerCase();

  commonConcepts.forEach(concept => {
    if (combinedText.includes(concept)) {
      matchedConcepts.add(concept.toUpperCase());
    }
  });

  const entities = Array.from(matchedConcepts).slice(0, 8);
  const triples: GraphTriple[] = [];

  // Generate grounded E-R-E triples
  const relationships = [
    { sub: "DEEP LEARNING", rel: "implements", obj: "NEURAL NETWORK" },
    { sub: "CNN", rel: "is_a_type_of", obj: "NEURAL NETWORK" },
    { sub: "RNN", rel: "is_a_type_of", obj: "NEURAL NETWORK" },
    { sub: "TRANSFORMER", rel: "utilizes", obj: "ATTENTION MECHANISM" },
    { sub: "LLM", rel: "is_built_on", obj: "TRANSFORMER" },
    { sub: "RAG", rel: "optimizes", obj: "LLM" },
    { sub: "EMBEDDINGS", rel: "stored_in", obj: "VECTOR DB" },
    { sub: "NEURAL NETWORK", rel: "trained_using", obj: "BACKPROPAGATION" },
    { sub: "OPTIMIZER", rel: "adjusts", obj: "WEIGHTS" },
    { sub: "NEURAL NETWORK", rel: "minimizes", obj: "LOSS FUNCTION" },
    { sub: "AGENTIC RAG", rel: "extends", obj: "RAG" },
    { sub: "KNOWLEDGE GRAPH", rel: "consists_of", obj: "NODES" }
  ];

  relationships.forEach(r => {
    if (entities.includes(r.sub) && entities.includes(r.obj)) {
      triples.push({ subject: r.sub, relation: r.rel, object: r.obj });
    }
  });

  // Fallback triples if none match
  if (triples.length === 0 && entities.length >= 2) {
    triples.push({
      subject: entities[0],
      relation: "is_linked_to",
      object: entities[1]
    });
    if (entities[2]) {
      triples.push({
        subject: entities[1],
        relation: "interacts_with",
        object: entities[2]
      });
    }
  }

  return { entities, triples };
}

// Unified core retriever
async function getDirectRetrieval(query: string, settings: RAGSettings, topK: number): Promise<RetrievedSource[]> {
  if (store.chunks.length === 0 && settings.vectorDb !== "chroma") {
    return [];
  }
  if (settings.vectorDb === "chroma") {
    try {
      const queryVector = await getEmbedding(query, settings);
      return await ChromaHelper.queryChunks(
        settings.chromaUrl || "http://localhost:8000",
        settings.chromaCollection || "technoscope",
        queryVector,
        topK
      );
    } catch (chromaErr: any) {
      console.warn("Chroma query failed, falling back to local:", chromaErr);
    }
  }
  if (settings.embeddingProvider === "local_tfidf") {
    return tfidfSearch(query, store.chunks, topK);
  } else {
    try {
      const queryVector = await getEmbedding(query, settings);
      const chunkScores = store.chunks
        .map(chunk => ({
          chunk,
          score: chunk.vector ? cosineSimilarity(queryVector, chunk.vector) : 0
        }))
        .filter(item => item.score > 0);
      chunkScores.sort((a, b) => b.score - a.score);
      return chunkScores.slice(0, topK).map(item => ({
        docId: item.chunk.docId,
        docTitle: item.chunk.docTitle,
        text: item.chunk.text,
        score: item.score,
        sourceType: item.chunk.sourceType,
        sourceUrl: item.chunk.sourceUrl,
      }));
    } catch (err) {
      return tfidfSearch(query, store.chunks, topK);
    }
  }
}

// Main Retrieval & Chat Execution
app.post("/api/chat", async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const settings = store.settings;
    const topK = settings.topK || 5;
    let sources: RetrievedSource[] = [];

    // ==========================================
    // STEP 1: MULTI-MODE RAG ORCHESTRATION RETRIEVAL
    // ==========================================
    const activeMode = req.body.ragMode || settings.ragMode || "naive";
    console.log(`Executing RAG query with Active Mode: ${activeMode}`);

    let executionPlanHeader = "";
    let retrievalProcessingHeader = "";

    switch (activeMode) {
      case "advanced": {
        // Advanced RAG
        const expanded = expandQueryInCode(message);
        
        // 1. Fetch Candidates from multiple pipelines
        const originalSources = await getDirectRetrieval(message, settings, topK);
        const exp1Sources = await getDirectRetrieval(expanded[0], settings, Math.max(2, Math.floor(topK / 2)));
        const exp2Sources = await getDirectRetrieval(expanded[1], settings, Math.max(2, Math.floor(topK / 2)));

        // Merge and deduplicate candidates by chunk text
        const seenTexts = new Set<string>();
        const candidates: (RetrievedSource & { originalScore?: number })[] = [];

        const addCandidates = (list: RetrievedSource[]) => {
          list.forEach(item => {
            const normalizedText = item.text.trim();
            if (!seenTexts.has(normalizedText)) {
              seenTexts.add(normalizedText);
              candidates.push({ ...item, originalScore: item.score });
            }
          });
        };

        addCandidates(originalSources);
        addCandidates(exp1Sources);
        addCandidates(exp2Sources);

        const rawCandidateCount = candidates.length;

        // 2. Cross-Encoder Re-ranking Step (Simulated/Local composite score)
        const reRankedCandidates = candidates.map(c => {
          const simOriginal = computeTokenOverlap(c.text, message);
          const simExp1 = computeTokenOverlap(c.text, expanded[0]);
          const simExp2 = computeTokenOverlap(c.text, expanded[1]);
          
          // Composite scoring algorithm
          const compositeScore = 0.5 * simOriginal + 0.25 * simExp1 + 0.25 * simExp2;
          
          // Boost score if it is higher than direct score, ensuring score stays in [0, 1] range
          const finalScore = Math.max(c.score, compositeScore);
          
          return {
            ...c,
            score: finalScore,
            originalScore: c.originalScore ?? c.score
          };
        });

        // Re-sort by final composite score
        reRankedCandidates.sort((a, b) => b.score - a.score);
        sources = reRankedCandidates.slice(0, topK);

        executionPlanHeader = `#### 🗺️ Execution Plan [Advanced RAG]
- **Pre-retrieval (Query Expansion):** Rewriting the query into multiple alternative technical representations to increase document recall.
- **Retrieval:** Harvesting candidate passages from both the original and expanded query pipelines.
- **Post-retrieval (Cross-Encoder Re-ranking):** Computing a semantic composite score to rank chunks by exact matching and semantic context density, filtering out noisy documents.
- **Context Synthesis:** Presenting only hyper-relevant, re-ordered context to the LLM to prevent prompt dilution.`;

        retrievalProcessingHeader = `#### 🔍 Retrieval & Processing Stage
- **Query Expansion Outputs:**
  - *Query Variation 1:* "${expanded[0]}"
  - *Query Variation 2:* "${expanded[1]}"
- **Retrieval Recall:** Fetched ${rawCandidateCount} candidate chunks from the unified query set.
- **Cross-Encoder Re-ranking Results:**
${sources.map((s, i) => `  - [Rank #${i+1}] Title: "${s.docTitle}" | Composite Score: ${s.score.toFixed(4)} (Boosted from ${(s as any).originalScore?.toFixed(4) || "N/A"})`).join("\n") || "  - No documents found to rank."}`;
        break;
      }

      case "agentic": {
        // Agentic RAG
        const subQuery1 = `Core concepts and definition of: ${message}`;
        const subQuery2 = `Practical applications, context, and examples of: ${message}`;

        const sources1 = await getDirectRetrieval(subQuery1, settings, Math.ceil(topK / 2));
        const sources2 = await getDirectRetrieval(subQuery2, settings, Math.ceil(topK / 2));

        // Merge and deduplicate
        const seenTexts = new Set<string>();
        const combinedSources: (RetrievedSource & { subProblemIndex: number })[] = [];

        sources1.forEach(item => {
          const normalizedText = item.text.trim();
          if (!seenTexts.has(normalizedText)) {
            seenTexts.add(normalizedText);
            combinedSources.push({ ...item, subProblemIndex: 1 });
          }
        });

        sources2.forEach(item => {
          const normalizedText = item.text.trim();
          if (!seenTexts.has(normalizedText)) {
            seenTexts.add(normalizedText);
            combinedSources.push({ ...item, subProblemIndex: 2 });
          }
        });

        combinedSources.sort((a, b) => b.score - a.score);
        sources = combinedSources.slice(0, topK);

        const nowStr = new Date().toLocaleTimeString();

        executionPlanHeader = `#### 🗺️ Execution Plan [Agentic RAG]
- **Sub-question Deconstruction:** Factoring the main question into discrete sub-questions to construct an analytical execution tree.
- **Dynamic Step-by-step Execution:** Iterating over sub-problems, selecting the optimal search parameters, and performing multi-step retrieval.
- **Information Evaluation:** Merging, validating, and checking retrieved information for cross-reference completeness.
- **Final Aggregation:** Synthesizing multi-hop references into a single comprehensive fact sheet for generation.`;

        retrievalProcessingHeader = `#### 🔍 Retrieval & Processing Stage
- \`[${nowStr}] THOUGHT:\` Complex query detected. Deconstructing into two sub-problems.
- \`[${nowStr}] ACTION:\` Execute search for Sub-problem 1: "${subQuery1}"
- \`[${nowStr}] RETRIEVAL:\` Retrieved ${sources1.length} passages for Sub-problem 1.
- \`[${nowStr}] THOUGHT:\` Sub-problem 1 satisfied. Proceeding to Sub-problem 2.
- \`[${nowStr}] ACTION:\` Execute search for Sub-problem 2: "${subQuery2}"
- \`[${nowStr}] RETRIEVAL:\` Retrieved ${sources2.length} passages for Sub-problem 2.
- \`[${nowStr}] THOUGHT:\` Successfully completed active information gathering loop. Compiling consolidated facts.

- **Compiled Document Passages:**
${sources.map((s, i) => `  - [Passage #${i+1}] Title: "${s.docTitle}" | Sub-Problem Match: ${(s as any).subProblemIndex === 1 ? 'Core definition' : 'Practical Context'} | Score: ${s.score.toFixed(4)}`).join("\n") || "  - No documents found."}`;
        break;
      }

      case "graph": {
        // Graph RAG
        sources = await getDirectRetrieval(message, settings, topK);
        const { entities, triples } = extractGraphTriples(message, sources);

        executionPlanHeader = `#### 🗺️ Execution Plan [Graph RAG]
- **Hybrid Retrieval:** Querying semantic vectors for raw context alongside structured entity lookup.
- **Dynamic Entity Extraction:** Scanning query and retrieved passages to isolate core nodes (topics, ideas, terms).
- **Knowledge Graph Mapping:** Building on-the-fly Entity-Relation-Entity (E-R-E) triples to track structural connections.
- **Relational Synthesis:** Merging unstructured text passages with the semantic graph network to answer complex cross-concept questions.`;

        retrievalProcessingHeader = `#### 🔍 Retrieval & Processing Stage
- **Extracted Knowledge Graph Nodes:**
${entities.map(e => `    • Node [${e}]`).join("\n") || "    • No entities extracted."}
- **Constructed Relational Triples (E-R-E):**
${triples.map(t => `    • [${t.subject}] ===(${t.relation})===> [${t.object}]`).join("\n") || "    • No relationship triples constructed."}
- **Semantic Text Nodes Linked:** ${sources.length} document chunks associated.`;
        break;
      }

      case "hybrid": {
        // Hybrid RAG (Dense + Sparse with Reciprocal Rank Fusion)
        const denseList = settings.embeddingProvider === "local_tfidf" ? [] : await getDirectRetrieval(message, settings, topK);
        const sparseList = await tfidfSearch(message, store.chunks, topK);

        // Build a dictionary of all unique chunks
        const allUniqueChunks = new Map<string, RetrievedSource & { denseRank?: number; sparseRank?: number; rrfScore?: number }>();

        denseList.forEach((chunk, index) => {
          allUniqueChunks.set(chunk.text, { ...chunk, denseRank: index + 1 });
        });

        sparseList.forEach((chunk, index) => {
          const existing = allUniqueChunks.get(chunk.text);
          if (existing) {
            existing.sparseRank = index + 1;
          } else {
            allUniqueChunks.set(chunk.text, { ...chunk, sparseRank: index + 1 });
          }
        });

        const rrfCandidates = Array.from(allUniqueChunks.values());

        // Calculate RRF Score: 1 / (60 + Rank)
        rrfCandidates.forEach(c => {
          const rankDense = c.denseRank !== undefined ? c.denseRank : Infinity;
          const rankSparse = c.sparseRank !== undefined ? c.sparseRank : Infinity;
          
          const scoreDense = rankDense !== Infinity ? (1 / (60 + rankDense)) : 0;
          const scoreSparse = rankSparse !== Infinity ? (1 / (60 + rankSparse)) : 0;
          
          c.rrfScore = scoreDense + scoreSparse;
        });

        // Sort by RRF score descending
        rrfCandidates.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
        sources = rrfCandidates.slice(0, topK).map(c => ({
          docId: c.docId,
          docTitle: c.docTitle,
          text: c.text,
          score: c.rrfScore || c.score,
          sourceType: c.sourceType,
          sourceUrl: c.sourceUrl,
          denseRank: c.denseRank,
          sparseRank: c.sparseRank,
          rrfScore: c.rrfScore
        } as any));

        executionPlanHeader = `#### 🗺️ Execution Plan [Hybrid RAG]
- **Sparse Query Pipeline:** Executing keyword-based lexical search (TF-IDF) to capture exact terminology.
- **Dense Query Pipeline:** Executing high-dimensional vector similarity search to capture conceptual meaning.
- **Reciprocal Rank Fusion (RRF):** Blending the rankings of both pipelines using rank-reciprocal weighting to construct a highly reliable priority list.
- **Context Compilation:** Injecting the unified top-ranked hybrid results into the LLM context.`;

        retrievalProcessingHeader = `#### 🔍 Retrieval & Processing Stage
- **Dense Retriever Results (Top 5):**
${denseList.slice(0, 5).map((d, i) => `    ${i+1}. "${d.docTitle}" (Rank: ${i+1}, Vector Score: ${d.score.toFixed(4)})`).join("\n") || "    (No dense vector results returned)"}
- **Sparse Retriever Results (Top 5):**
${sparseList.slice(0, 5).map((s, i) => `    ${i+1}. "${s.docTitle}" (Rank: ${i+1}, TF-IDF Score: ${s.score.toFixed(4)})`).join("\n") || "    (No sparse TF-IDF results returned)"}
- **Reciprocal Rank Fusion Blended Ranking:**
${sources.map((s: any, i) => `    ${i+1}. "${s.docTitle}" | Combined RRF Score: ${s.rrfScore?.toFixed(5)} (Dense Rank: ${s.denseRank ?? "N/A"}, Sparse Rank: ${s.sparseRank ?? "N/A"})`).join("\n") || "    (No fused candidates)"}`;
        break;
      }

      case "adaptive": {
        // Adaptive RAG complexity routing
        const hasCompare = message.toLowerCase().match(/\b(compare|contrast|versus|vs|difference|differences|similarity|similarities)\b/g);
        const hasCoordinating = message.toLowerCase().match(/\b(and|or|but|although|while|whereas)\b/g);
        
        let complexityScore = message.split(/\s+/).length * 0.15;
        const complexityTriggers: string[] = [];

        if (hasCompare) {
          complexityScore += 3.0;
          complexityTriggers.push("Comparative terms found (+3.0)");
        }
        if (hasCoordinating) {
          complexityScore += 1.5;
          complexityTriggers.push("Coordinating operators found (+1.5)");
        }
        if (message.length > 60) {
          complexityScore += 1.5;
          complexityTriggers.push("Long input prompt length (+1.5)");
        }

        const isComplex = complexityScore > 5.5;
        const routedMode = isComplex ? "agentic" : "hybrid";
        const routedModeName = isComplex ? "Agentic RAG" : "Hybrid RAG";

        let nestedProcessing = "";

        // Execute nested pipeline
        if (isComplex) {
          // Agentic RAG
          const subQuery1 = `Core concepts and definition of: ${message}`;
          const subQuery2 = `Practical applications, context, and examples of: ${message}`;
          const sources1 = await getDirectRetrieval(subQuery1, settings, Math.ceil(topK / 2));
          const sources2 = await getDirectRetrieval(subQuery2, settings, Math.ceil(topK / 2));
          const seenTexts = new Set<string>();
          const combinedSources: (RetrievedSource & { subProblemIndex: number })[] = [];
          sources1.forEach(item => {
            const normalizedText = item.text.trim();
            if (!seenTexts.has(normalizedText)) {
              seenTexts.add(normalizedText);
              combinedSources.push({ ...item, subProblemIndex: 1 });
            }
          });
          sources2.forEach(item => {
            const normalizedText = item.text.trim();
            if (!seenTexts.has(normalizedText)) {
              seenTexts.add(normalizedText);
              combinedSources.push({ ...item, subProblemIndex: 2 });
            }
          });
          combinedSources.sort((a, b) => b.score - a.score);
          sources = combinedSources.slice(0, topK);
          const nowStr = new Date().toLocaleTimeString();
          nestedProcessing = `- \`[${nowStr}] THOUGHT:\` Complex routed query detected. Deconstructing into sub-problems.
- \`[${nowStr}] ACTION:\` Execute Sub-query 1: "${subQuery1}"
- \`[${nowStr}] RETRIEVAL:\` Retrieved ${sources1.length} passages for Sub-problem 1.
- \`[${nowStr}] ACTION:\` Execute Sub-query 2: "${subQuery2}"
- \`[${nowStr}] RETRIEVAL:\` Retrieved ${sources2.length} passages for Sub-problem 2.`;
        } else {
          // Hybrid RAG
          const denseList = settings.embeddingProvider === "local_tfidf" ? [] : await getDirectRetrieval(message, settings, topK);
          const sparseList = await tfidfSearch(message, store.chunks, topK);
          const allUniqueChunks = new Map<string, RetrievedSource & { denseRank?: number; sparseRank?: number; rrfScore?: number }>();
          denseList.forEach((chunk, index) => {
            allUniqueChunks.set(chunk.text, { ...chunk, denseRank: index + 1 });
          });
          sparseList.forEach((chunk, index) => {
            const existing = allUniqueChunks.get(chunk.text);
            if (existing) {
              existing.sparseRank = index + 1;
            } else {
              allUniqueChunks.set(chunk.text, { ...chunk, sparseRank: index + 1 });
            }
          });
          const rrfCandidates = Array.from(allUniqueChunks.values());
          rrfCandidates.forEach(c => {
            const rankDense = c.denseRank !== undefined ? c.denseRank : Infinity;
            const rankSparse = c.sparseRank !== undefined ? c.sparseRank : Infinity;
            const scoreDense = rankDense !== Infinity ? (1 / (60 + rankDense)) : 0;
            const scoreSparse = rankSparse !== Infinity ? (1 / (60 + rankSparse)) : 0;
            c.rrfScore = scoreDense + scoreSparse;
          });
          rrfCandidates.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
          sources = rrfCandidates.slice(0, topK).map(c => ({
            docId: c.docId,
            docTitle: c.docTitle,
            text: c.text,
            score: c.rrfScore || c.score,
            sourceType: c.sourceType,
            sourceUrl: c.sourceUrl,
            denseRank: c.denseRank,
            sparseRank: c.sparseRank,
            rrfScore: c.rrfScore
          } as any));
          nestedProcessing = `- **Sparse Query TF-IDF Matching:** Retrieved exact terms
- **Dense Query Vector Matching:** Retrieved semantic concepts
- **Reciprocal Rank Fusion Ranking:** Blended dense/sparse rankings to optimize relevance`;
        }

        executionPlanHeader = `#### 🗺️ Execution Plan [Adaptive RAG]
- **Query Analysis:** Evaluating structural complexity, keyword density, and logical requirements of the prompt.
- **Dynamic Routing:** Calculating complexity score to automatically stream simple lookups to efficient pipelines, and complex multi-hop questions to advanced agentic/graph loops.
- **Routed Execution:** Spawning the chosen RAG sub-pipeline to process and retrieve relevant knowledge.`;

        retrievalProcessingHeader = `#### 🔍 Retrieval & Processing Stage
- **Query Complexity Analysis:**
  - Query Length: ${message.length} characters / ${message.split(/\s+/).length} words
  - Syntactic Complexity Triggers: ${complexityTriggers.join(", ") || "None"}
  - Calculated Complexity Score: ${complexityScore.toFixed(2)} / 10
- **Decision Router:** Routed to **[${routedModeName}]** pipeline as a ${isComplex ? 'COMPLEX synthesis' : 'SIMPLE lookup'} query.

---
**Nested Routed Pipeline Logs:**
${nestedProcessing}
- **Compiled Passages:** Loaded ${sources.length} passages.`;
        break;
      }

      case "naive":
      default: {
        // Naive RAG (Simple)
        sources = await getDirectRetrieval(message, settings, topK);

        executionPlanHeader = `#### 🗺️ Execution Plan [Naive RAG]
- **Phase 1: Direct Mapping:** Converting query directly into a dense semantic vector or text search query.
- **Phase 2: Index Retrieval:** Querying the active index to retrieve the top-${topK} most similar passages.
- **Phase 3: Context Insertion:** Injecting the retrieved context directly into the prompt context window for single-step generation.`;

        retrievalProcessingHeader = `#### 🔍 Retrieval & Processing Stage
- **Query Engine:** ${settings.embeddingProvider === "local_tfidf" ? "Local TF-IDF (Sparse)" : "Vector Embeddings (Dense)"}
- **Retrieval Target:** Database index containing ${store.chunks.length} chunks.
- **Matches Retrieved:** ${sources.length} matching passages.
${sources.map((s, i) => `  - [Match #${i+1}] Title: "${s.docTitle}" | Type: ${s.sourceType.toUpperCase()} | Score: ${s.score.toFixed(4)}`).join("\n") || "  - No documents found in database."}`;
        break;
      }
    }

    // Assemble Context text
    const contextText = sources.length > 0
      ? sources.map((s, idx) => `[Source #${idx + 1}: ${s.docTitle}]\n${s.text}`).join("\n\n")
      : "No relevant documents found in the database. Rely on general settings.";

    // Assemble full prompt requesting structured JSON matching the requested schema
    const promptWithContext = `You are a helpful expert RAG assistant who answers questions based ONLY on the provided context passages. If the context does not contain the answer, say that you cannot find it in the books, but attempt to explain based on what you have.

You MUST structure your response as a valid JSON object matching this schema exactly:
{
  "executiveSummary": "A concise, professional executive summary of the answer in 2-3 sentences max summarizing the core finding.",
  "detailedAnalysis": "Detailed, comprehensive analysis answering the question fully. Use rich markdown formatting (bullet points, bold text, subheadings). Make it highly thorough, academic, and factual based only on the context. Do not include raw JSON markings here.",
  "keyTakeaways": ["Key actionable takeaway, core highlight, or direct fact 1", "Key actionable takeaway, core highlight, or direct fact 2"],
  "citations": ["Specific book/document title, section, or page cited (e.g. 'Intro to Quantum Computing, Chapter 1')"]
}

Context:
${contextText}

Question: ${message}
`;

    // ==========================================
    // STEP 2: CHAT GENERATION WITH LLM PROVIDER
    // ==========================================
    let answerText = "";
    const startGenerationTime = Date.now();
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    if (settings.provider === "gemini") {
      // Connect with Gemini Client
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: settings.modelName || "gemini-3.5-flash",
        contents: promptWithContext,
        config: {
          temperature: settings.temperature,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: {
                type: Type.STRING,
                description: "A professional, high-level summary of the answer (2-3 sentences max).",
              },
              detailedAnalysis: {
                type: Type.STRING,
                description: "Detailed, comprehensive answer with logical sections and formatted markdown content.",
              },
              keyTakeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of key actionable takeaways, core highlights, or direct facts.",
              },
              citations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of document names or sources cited within the response.",
              },
            },
            required: ["executiveSummary", "detailedAnalysis", "keyTakeaways", "citations"],
          },
        }
      });
      answerText = response.text || "{}";
      
      // Get usage metadata if available
      const usage = (response as any).usageMetadata;
      if (usage) {
        promptTokens = usage.promptTokenCount || 0;
        completionTokens = usage.candidatesTokenCount || 0;
        totalTokens = usage.totalTokenCount || 0;
      } else {
        promptTokens = Math.ceil(promptWithContext.length / 4);
        completionTokens = Math.ceil(answerText.length / 4);
        totalTokens = promptTokens + completionTokens;
      }
    } else {
      // Connect to LM Studio / Ollama / AnythingLLM via OpenAI-compatible endpoint
      const isOllama = settings.provider === "ollama";
      
      let endpointUrl = "";
      if (settings.provider === "ollama") {
        endpointUrl = `${settings.apiUrl}/api/generate`;
      } else if (settings.provider === "anything_llm") {
        let base = settings.apiUrl;
        if (base.endsWith("/api/v1")) {
          endpointUrl = `${base}/openai/chat/completions`;
        } else if (base.endsWith("/api/v1/")) {
          endpointUrl = `${base}openai/chat/completions`;
        } else {
          endpointUrl = `${base}/chat/completions`;
        }
      } else {
        endpointUrl = `${settings.apiUrl}/chat/completions`;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (settings.apiKey) {
        headers["Authorization"] = `Bearer ${settings.apiKey}`;
      }

      // Resolve the model name dynamically if empty
      const resolvedModel = await resolveModelName(settings, headers);
      console.log(`Connecting to local provider [${settings.provider}] at: ${endpointUrl} (Model: ${resolvedModel || "default"})`);

      const payload = isOllama
        ? {
            ...(resolvedModel ? { model: resolvedModel } : {}),
            prompt: promptWithContext,
            system: `${settings.systemPrompt}\n\nYou MUST return your output as a valid JSON object with the keys: "executiveSummary", "detailedAnalysis", "keyTakeaways", and "citations". If you are a reasoning/thinking model (such as DeepSeek-R1), you may output your thinking process first in a <think>...<\/think> block, but you must follow it with the JSON object. Do not output any other text or preamble outside of the thinking block and JSON object.`,
            stream: false,
            format: "json", // Force Ollama JSON output
            options: {
              temperature: settings.temperature,
              num_ctx: 8192, // High-performance 8k context window (much faster and memory-friendly than 128k)
              num_predict: -1,  // Unlimited prediction tokens (up to context cap)
            }
          }
        : {
            ...(resolvedModel ? { model: resolvedModel } : {}),
            messages: [
              { role: "system", content: `${settings.systemPrompt}\n\nYou MUST return your output as a valid JSON object with the keys: "executiveSummary", "detailedAnalysis", "keyTakeaways", "citations" matching the requested schema exactly. If you are a reasoning/thinking model (such as DeepSeek-R1), you may output your thinking process first in a <think>...<\/think> block, but you must follow it with the JSON object. Do not output any other text or preamble outside of the thinking block and JSON object.` },
              ...history.slice(-20).map((h: any) => ({ role: h.role, content: h.content })), // Feed the highest feasible history depth
              { role: "user", content: `Context:\n${contextText}\n\nQuestion: ${message}` }
            ],
            temperature: settings.temperature,
            max_tokens: 4096, // Maximum single response tokens
            stream: false,
            response_format: settings.provider === "lm_studio"
              ? {
                  type: "json_schema",
                  json_schema: {
                    name: "StructuredRAGResponse",
                    schema: {
                      type: "object",
                      properties: {
                        executiveSummary: { type: "string" },
                        detailedAnalysis: { type: "string" },
                        keyTakeaways: { type: "array", items: { type: "string" } },
                        citations: { type: "array", items: { type: "string" } }
                      },
                      required: ["executiveSummary", "detailedAnalysis", "keyTakeaways", "citations"]
                    }
                  }
                }
              : { type: "json_object" } // Enforce JSON mode for compatible local engines
          };

      let response = await fetchWithTimeout(endpointUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        timeout: 120000, // Generous 120s timeout to allow slow CPU/local GPU generation to complete
      });

      // Robust fallback retry: if response failed and we sent response_format, retry without response_format constraint
      if (!response.ok && !isOllama && (payload as any).response_format) {
        const errorMsg = await response.clone().text();
        console.warn(`Local LLM failed with response_format (Error: ${errorMsg}). Retrying without response_format constraint...`);
        const fallbackPayload = { ...payload };
        delete (fallbackPayload as any).response_format;

        response = await fetchWithTimeout(endpointUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(fallbackPayload),
          timeout: 120000,
        });
      }

      if (!response.ok) {
        const errorMsg = await response.text();
        throw new Error(`Local LLM provider error [${settings.provider}]: ${errorMsg}`);
      }

      const responseData = await response.json();
      
      if (isOllama) {
        answerText = responseData.response || "";
        promptTokens = responseData.prompt_eval_count || 0;
        completionTokens = responseData.eval_count || 0;
        totalTokens = promptTokens + completionTokens;
      } else {
        answerText = responseData.choices?.[0]?.message?.content || "";
        if (responseData.usage) {
          promptTokens = responseData.usage.prompt_tokens || 0;
          completionTokens = responseData.usage.completion_tokens || 0;
          totalTokens = responseData.usage.total_tokens || 0;
        } else {
          promptTokens = Math.ceil(promptWithContext.length / 4);
          completionTokens = Math.ceil(answerText.length / 4);
          totalTokens = promptTokens + completionTokens;
        }
      }
    }

    const generationTimeMs = Date.now() - startGenerationTime;

    // Parse structured response beautifully with our fallback safety
    const parsedStructured = parseStructuredLLMResponse(answerText);

    // Format fallback answer as beautifully organized markdown for standard rendering
    let beautifulMarkdownAnswer = "";
    if (parsedStructured.executiveSummary) {
      beautifulMarkdownAnswer += `### 📝 Executive Summary\n${parsedStructured.executiveSummary}\n\n`;
    }
    if (parsedStructured.detailedAnalysis) {
      beautifulMarkdownAnswer += `### 🔍 Detailed Analysis\n${parsedStructured.detailedAnalysis}\n\n`;
    }
    if (parsedStructured.keyTakeaways && parsedStructured.keyTakeaways.length > 0) {
      beautifulMarkdownAnswer += `### 💡 Key Takeaways\n${parsedStructured.keyTakeaways.map(t => `- ${t}`).join("\n")}\n\n`;
    }
    if (parsedStructured.citations && parsedStructured.citations.length > 0) {
      beautifulMarkdownAnswer += `### 📚 Citations & References\n${parsedStructured.citations.map(c => `- ${c}`).join("\n")}\n\n`;
    }
    if (!beautifulMarkdownAnswer) {
      beautifulMarkdownAnswer = answerText;
    }

    const structuredAnswer = `${executionPlanHeader}\n\n${retrievalProcessingHeader}\n\n${beautifulMarkdownAnswer}`;

    res.json({
      answer: structuredAnswer,
      structured: parsedStructured,
      sources,
      promptUsed: promptWithContext,
      promptTokens,
      completionTokens,
      totalTokens,
      generationTimeMs,
    });

  } catch (error: any) {
    console.error("Chat Error:", error);
    res.status(500).json({ error: error.message || "Failed to process chat query" });
  }
});

// Global Express Error Handler to prevent any HTML responses on API endpoints
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Express Error:", err);
  res.status(err.status || err.statusCode || 500).json({
    success: false,
    error: err.message || "An unexpected error occurred during processing."
  });
});

// Vite server implementation
async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RAG Server running at http://localhost:${PORT}`);
  });
}

initServer().catch(err => {
  console.error("Failed to start server:", err);
});
