# ⚙️ TECHNOSCOPE - Setup & Deployment Guide

Run your highly polished local RAG assistant completely offline on a local folder, portable drive, or containerized via Docker.

---

## 💻 Method A: Windows Portable Drive / Local Installation (Recommended)

Perfect for running directly on external SSDs, USB keys, or local offline folders with zero configuration.

1. **Unzip the Downloaded Package** to any location on your portable drive or local disk (e.g., `D:\Technoscope\`).
2. **Double-click `setup.bat`**:
   - This script auto-detects dependencies like Node.js.
   - It initializes your persistent `data` folders and templates.
   - It downloads and packages all node dependencies and bundles the code.
3. **Double-click `start.bat`**:
   - Launches Technoscope instantly and opens your web browser to `http://localhost:3000`.

---

## 🐳 Method B: Docker Container Deployment

1. **Unzip the Downloaded Package** to a local directory:
   ```bash
   unzip knowledge-io-docker.zip -d technoscope
   cd technoscope
   ```

2. **Configure Environment Variables (Optional)**:
   Create a `.env` file to supply your API key if you want cloud Gemini backup (local search works completely offline out-of-the-box):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Spin Up with Docker Compose**:
   ```bash
   docker compose up -d --build
   ```

4. **Access the Web Interface**:
   Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 📂 Directory Structure & Volume Mounts
The `./data` folder is the physical storage layer. All your uploaded textbooks, papers, scanned documents, and indexed knowledge databases remain **fully persistent** inside `./data` on your host or portable drive even if you rebuild or transfer the folder!

---

## 🛠️ Configuration & Models
- Under **Settings**, you can change model endpoints to connect with local LLM servers (e.g. LM Studio on `http://localhost:1234/v1` or Ollama on `http://localhost:11434`).
- Support for local optical character recognition (OCR) via tesseract.js is fully bundled inside.
