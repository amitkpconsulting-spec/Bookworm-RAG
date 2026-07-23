# Bookworm RAG - Portable & Local-First Intelligence Engine 📚⚡

**Bookworm RAG** is a powerful, portable Retrieval-Augmented Generation (RAG) web application that allows you to ingest documents, books, scanned files, and YouTube videos to build localized vector knowledge bases and query them using local or cloud AI models.

Repository URL: [https://github.com/amitkpconsulting-spec/Bookworm-RAG](https://github.com/amitkpconsulting-spec/Bookworm-RAG)

---

## ✨ Features

- **Multi-Format Batch Ingestion**:
  - **Batch File Uploads**: Upload multiple PDFs, Word documents (`.docx`, `.doc`), Plain Text (`.txt`), HTML files, or Markdown simultaneously.
  - **OCR Engine**: Extracts text from scanned document images (`.png`, `.jpg`, `.jpeg`, `.webp`) using built-in Tesseract OCR.
  - **YouTube Transcripts**: Parse and chunk full transcripts directly from YouTube videos or channels.
  - **Raw Text / Markdown Paste**: Ingest custom articles or notes on the fly.
- **Hybrid Search & Vector Store**:
  - Smart text chunking with configurable chunk size and overlap.
  - Flexible embedding providers: Local TF-IDF sparse vector search or Google Gemini vector embeddings.
- **LLM Flexibility**:
  - Connect to local LLMs (e.g., **Ollama**, **LM Studio**, **LocalAI**) running on `localhost`.
  - Seamless fallback or primary integration with **Google Gemini API**.
- **Vector Hub & Database Management**:
  - Inspect, filter, search, export, and import document chunks and vector indices.
  - Persistent data storage for local knowledge retrieval.
- **Modern UI**:
  - Dark/Light responsive dashboard powered by React 19, Tailwind CSS v4, Lucide Icons, and Motion transitions.

---

## 🛠️ Prerequisites

Before installing, ensure you have the following installed on your machine:

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher (comes with Node.js)
- **Git**: Installed and configured on your system

*Optional Services:*
- **Google Gemini API Key**: Optional, if you wish to use Gemini models for embeddings or generation ([Get an API Key](https://aistudio.google.com/)).
- **Local LLM Server (Ollama / LM Studio)**: Optional, if you prefer running models entirely offline on your GPU/CPU (e.g., `ollama run llama3`).

---

## 🚀 Quick Self-Installation Guide

Follow these steps to clone, set up, and launch **Bookworm RAG** locally:

### 1. Clone the Repository

Open your terminal or command prompt and clone the repository:

```bash
git clone https://github.com/amitkpconsulting-spec/Bookworm-RAG.git
cd Bookworm-RAG
```

### 2. Install Dependencies

Install all required node packages:

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file from the provided `.env.example`:

```bash
cp .env.example .env
```

Open `.env` in your text editor and add your configuration (e.g., your Gemini API Key if applicable):

```env
GEMINI_API_KEY="your_gemini_api_key_here"
APP_URL="http://localhost:3000"
```

*Note: If you plan to use only local models (TF-IDF embeddings + Ollama), a Gemini API Key is optional.*

### 4. Start the Local Development Server

Run the application in development mode:

```bash
npm run dev
```

The application server will boot on `http://localhost:3000`.

### 5. Access the Web Application

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📦 Production Build & Deployment

To compile the application for production deployment:

### 1. Build the Production Assets & Server

```bash
npm run build
```

This compiles the client-side single-page app into `dist/` and bundles `server.ts` into a standalone CJS server script at `dist/server.cjs`.

### 2. Run the Production Server

```bash
npm run start
```

The server will listen on port `3000` (or `PORT` environment variable if specified).

---

## 💡 Usage Guide

1. **Upload Documents ("Import Manager" Tab)**:
   - Drag & drop or select multiple PDF, Word, Image, or Text files to upload them in batch.
   - Or paste a YouTube video URL / plain text snippet.
2. **Configure Embeddings & LLM ("Local LLM & RAG Settings")**:
   - Select your preferred embedding provider (**Local TF-IDF** or **Gemini Embeddings**).
   - Set up your local LLM base URL (default: `http://localhost:11434` for Ollama) or Gemini API.
3. **Chat & Retrieve**:
   - Type queries in the main chat view to search your indexed documents and generate context-aware answers.

---

## 📁 Repository Structure

```
Bookworm-RAG/
├── server.ts              # Express backend server (RAG engine, file ingestion, vector store)
├── src/
│   ├── App.tsx            # Primary React application interface
│   ├── main.tsx           # Client entry point
│   └── index.css          # Global styling & Tailwind directives
├── package.json           # Dependencies and runtime scripts
├── vite.config.ts         # Vite build configuration
├── tsconfig.json          # TypeScript compiler options
├── .env.example           # Example environment variable declaration
└── README.md              # Installation & documentation guide
```

---
# Generate a clean Markdown file containing the complete Use Case specification and README documentation
markdown_content = """# Local RAG & LLM Sandbox: Product Specification & Use Case

## Document Overview
This document outlines the complete architectural evolution, technical implementation, and real-world consumer use case for the **Local RAG & LLM Sandbox Platform**.

---

## Part 1: GitHub Project README & Architectural Summary

### 🚀 Overview
A high-performance, offline-first **Local Retrieval-Augmented Generation (RAG) Platform** designed to seamlessly bridge local LLM orchestration engines (*LM Studio, Ollama, AnythingLLM*) with direct open-weight model discovery and vector index management.
## 🤝 Contributing & Support

If you encounter issues, feel free to open an issue or pull request on the repository:
[https://github.com/amitkpconsulting-spec/Bookworm-RAG](https://github.com/amitkpconsulting-spec/Bookworm-RAG)
