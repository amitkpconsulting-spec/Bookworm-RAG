# Bookworm-RAG
Bookworm-RAG is a lightweight, privacy-focused, zero-leakage Retrieval-Augmented Generation (RAG) system. It supports 100% offline local LLMs (Ollama, LM Studio, LocalAI, vLLM) and local vector embeddings (TF-IDF, ChromaDB), as well as managed cloud endpoints like Google Gemini API.

Overview & Evolution
The platform empowers users to alternate between local model control and deep vector database configuration—all through a unified, high-fidelity interface.

┌─────────────────────────────────────────────────────────────────────────┐
│                           LOCAL RAG SANDBOX                             │
├───────────────────────────────────┬─────────────────────────────────────┤
│             MODEL HUB             │             VECTOR HUB              │
│  • HuggingFace / Ollama / Studio  │  • Sparse TF-IDF & Hybrid Search    │
│  • GGUF Downloads & Discovery     │  • Vector DB Alignments & Limits    │
│  • Active Host Engine Connection  │  • Text Chunking & Extraction Controls│
└───────────────────────────────────┴─────────────────────────────────────┘
The Development Journey
Initial State: Monolithic, high-density configuration layout combining text extraction, API endpoints, and model selectors into a single view (App.tsx ~1,800 lines).

Intermediate Milestones: Isolated model download simulators and library indexes into a unified Model Hub interface (LocalLLMHub.tsx).

Final State: Fully modularized architecture with dedicated, decoupled interfaces—Model Hub for discovery/downloads and Vector Hub for storage, chunking, and database settings—complete with consolidated high-contrast persistent action controls.

✅ Key Achievements & Architecture Highlights
Separation of Concerns: Split monolithic workflows into modular components (LocalLLMHub.tsx, VectorHub.tsx), reducing App.tsx line density by >400 lines to enhance maintainability and prevent context window issues.

Resilient Engine Fallbacks: Engineered multi-tier pipeline fallbacks in server.ts that automatically relax schema constraints (JSON Schema → JSON Object → Raw Text Completion) to maintain output continuity across diverse local engines.

Strict Code Quality: Fully validated across every phase with zero strict TypeScript (tsc --noEmit) or build warnings.
True Local RAG Capability: We successfully built a full-stack, client-server application capable of scanning PDF files, text documents, and YouTube videos. The app extracts text, creates vector chunks, indexes them into a local vector database, and queries them directly.
Double-Fallback Intelligence: We created a dual-engine architecture. The application prioritizes high-performance local endpoints (like LM Studio or Ollama), but gracefully fails over to cloud-hosted Gemini models if your local hardware is offline or under-configured.
Unified Workspace UI: Implemented a responsive, polished single-screen dashboard using Tailwind CSS and Lucide icons that houses document uploads, chat interfaces, system parameters, and model status in one viewport.


File Tree 
local-rag-studio/
├── 🐋 docker/                         # Docker enablement and service setups
│   ├── docker-compose.yml             # Orchestrates Chroma DB and Local LLM containers
│   └── chroma.Dockerfile              # Custom build configuration for isolated Vector Store
├── 🌐 src/                            # React Front-end UI Components (TypeScript)
│   ├── components/
│   │   ├── LocalLLMHub.tsx            # Unified Model Config, Download, and HF Model Integrator
│   │   ├── VectorHub.tsx              # Vector DB Config (Chroma/In-Memory) & Sandbox Limits
│   │   ├── ChatContainer.tsx          # Real-time RAG Chat Interface and Context Viewer
│   │   └── IngestDashboard.tsx        # File, YouTube, and Raw Text Chunking Dashboard
│   ├── types.ts                       # Shared TypeScript definitions (RAGSettings, Docs)
│   ├── App.tsx                        # Main client entry point & Tab-State Routing
│   ├── index.css                      # Tailwind styling entries and custom typography
│   └── main.tsx                       # React application bootstrap
├── 🖥️ server.ts                        # Full-Stack Node.js (Express & Vite) RAG Proxy Engine
├── 📦 package.json                    # Dependency manifest and execution scripts
├── ⚙️ vite.config.ts                   # Fast Vite Bundler configuration
├── 📖 README.md                       # Main instructions page
├── .env.example                       # Reference environment variables
└── .gitignore                         # Build artifact ignore targets

