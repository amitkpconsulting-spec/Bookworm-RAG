Bookworm-RAG is a lightweight, privacy-focused, zero-leakage Retrieval-Augmented Generation (RAG) system. It supports 100% offline local LLMs (Ollama, LM Studio, LocalAI, vLLM) and local vector embeddings (TF-IDF, ChromaDB), as well as managed cloud endpoints like Google Gemini API.
📋 System Prerequisites
Before installing, ensure your environment meets the following requirements:
Node.js: Version 18.x or 20.x or higher installed. (Download Node.js)
Git: Installed on your operating system. (Download Git)
Local Inference Engine (Optional for 100% offline use):
Ollama (Recommended default: ollama run qwen2.5:7b or llama3.2)
LM Studio (Local Server running on http://localhost:1234/v1)
ChromaDB (Optional: for scalable local vector storage)
Cloud API Key (Optional):
Google Gemini API key if using cloud generation.
🚀 Quick Start Installation
Step 1: Clone the GitHub Repository
Open your terminal or command prompt and clone the repository:
code
Bash
git clone https://github.com/amitkpconsulting-spec/Bookworm-RAG.git
cd Bookworm-RAG
Step 2: Install Project Dependencies
Install all necessary Node.js dependencies:
code
Bash
npm install
Step 3: Configure Environment Variables
Create a local environment configuration file:
code
Bash
cp .env.example .env
Open the .env file in your preferred text editor and add any API keys if applicable (e.g., Gemini API key):
code
Env
# Optional: Required only if using Google Gemini API provider
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Default port configuration (Defaults to 3000)
PORT=3000
Step 4: Run the Development Server
Start the full-stack server (Express backend + Vite frontend):
code
Bash
npm run dev
Once running, access the web UI at:
👉 http://localhost:3000
🛠️ Production Build & Deployment
To build and serve the application in a production environment:
code
Bash
# 1. Build the production assets and bundle the server
npm run build

# 2. Start the standalone production Node server
npm start
⚙️ Local LLM & Vector Backend Setup
Once the UI is open at http://localhost:3000, navigate to Settings / Model Hub:
1. Using Ollama (100% Offline)
Start Ollama on your machine: ollama serve
Run your preferred model: ollama run qwen2.5:7b
In Model Hub:
Set Provider to Ollama Local
API URL: http://localhost:11434/v1
Model Name: qwen2.5:7b (or llama3.2)
2. Using LM Studio (100% Offline)
Open LM Studio and load a GGUF model.
Go to the Local Server tab and click Start Server.
In Model Hub:
Set Provider to LM Studio
API URL: http://localhost:1234/v1
3. Using Google Gemini API (Managed Cloud)
Set Provider to Google Gemini API
Enter your API Key in the field or configure GEMINI_API_KEY in .env.
📂 Document Import & Vector Indexing
Click on the Import Manager tab in the top navigation bar.
Select or drag & drop multiple files (PDF, DOCX, DOC, HTML, TXT, or scanned Images).
The system will automatically chunk, parse, and index your documents into the local vector database.
Go to Intelligence Chat to start querying your local documents with grounded AI responses!
