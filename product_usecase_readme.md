# Local RAG & LLM Sandbox: Product Specification & Use Case

## Document Overview
This document outlines the complete architectural evolution, technical implementation, and real-world consumer use case for the **Local RAG & LLM Sandbox Platform**.

---

## Part 1: GitHub Project README & Architectural Summary

### 🚀 Overview
A high-performance, offline-first **Local Retrieval-Augmented Generation (RAG) Platform** designed to seamlessly bridge local LLM orchestration engines (*LM Studio, Ollama, AnythingLLM*) with direct open-weight model discovery and vector index management.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LOCAL RAG SANDBOX                             │
├───────────────────────────────────┬─────────────────────────────────────┤
│             MODEL HUB             │             VECTOR HUB              │
│  • HuggingFace / Ollama / Studio  │  • Sparse TF-IDF & Hybrid Search    │
│  • GGUF Downloads & Discovery     │  • Vector DB Alignments & Limits    │
│  • Active Host Engine Connection  │  • Text Chunking & Extraction       │
└───────────────────────────────────┴─────────────────────────────────────┘
```

### 🛣️ The Development Journey
* **Initial State:** Monolithic, high-density configuration layout combining text extraction, API endpoints, and model selectors into a single view (`App.tsx` ~1,800 lines).
* **Intermediate Milestones:** Isolated model download simulators and library indexes into a unified **Model Hub** interface (`LocalLLMHub.tsx`).
* **Final State:** Fully modularized architecture with dedicated, decoupled interfaces—**Model Hub** for discovery/downloads and **Vector Hub** for storage, chunking, and database settings—complete with consolidated high-contrast persistent action controls.

### ✅ Key Technical Highlights
* **Separation of Concerns:** Split monolithic workflows into modular components (`LocalLLMHub.tsx`, `VectorHub.tsx`), reducing `App.tsx` line density by **>400 lines** to enhance maintainability and prevent context window issues.
* **Resilient Engine Fallbacks:** Engineered multi-tier pipeline fallbacks in `server.ts` that automatically relax schema constraints (JSON Schema → JSON Object → Raw Text Completion) to maintain output continuity across diverse local engines.
* **Strict Code Quality:** Fully validated across every phase with zero strict TypeScript (`tsc --noEmit`) or build warnings.

### 🛠️ Challenges & Technical Solutions
| Challenge | Impact | Resolution Strategy |
| :--- | :--- | :--- |
| **Context Desynchronization** | Surgical edits failed on large template files (`App.tsx`) due to minor code drifts. | Implemented tight line-span verification prior to edits to maintain precise spatial mapping. |
| **Model Load Mismatches** | Hardcoded fallbacks (`qwen2.5-7b`, `llama3`) caused queries to fail if models weren't active. | Added **"Use Loaded" Auto-Detection**, allowing the backend (`resolveModelName`) to dynamically target whichever GGUF/parameter set is currently active in the user's engine. |
| **Local API Schema Failures** | Strict JSON-schema constraints broke legacy or lightweight local inference builds. | Built an adaptive request-stripping mechanism inside the server middleware to safely strip incompatible constraints on the fly. |

---

## Part 2: Product Use Case Specification

### 📄 Product Name
**Local Personal Knowledge Engine (Local RAG & LLM Sandbox)**

### 🎯 Primary Use Case Domain
**Personal Data Intelligence (Health, Wealth, Banking, and Legal/Insurance)**

### 💻 Deployment Target
**Consumer-grade Personal Computers / Laptops (Standard CPU/GPU, 100% Offline / Air-Gapped)**

---

### 1. Problem Statement & Friction Points
Individuals accrue thousands of highly sensitive personal documents over a lifetime—spanning medical history (EHRs, lab reports, prescriptions), financial statements (tax forms, investments), banking records, and insurance policies.

1. **Privacy Concerns:** Users are rightfully hesitant to upload confidential documents (tax records, medical files, policy documents containing PII) to cloud-based LLM services like OpenAI or Anthropic due to data leak risks.
2. **Fragmentation & Silos:** Essential personal information is scattered across deep folder trees, password-protected PDFs, and scanned physical documents.
3. **Data Complexity:** Finding specific answers (*"Is pre-existing knee surgery covered after a 2-year waiting period?"* or *"What was my total out-of-pocket medical spending in 2024?"*) requires hours of manual cross-referencing.

---

### 2. Target Persona
* **Persona:** "The Privacy-Conscious Everyday Household User"
* **Demographics:** Individuals, household managers, or caregivers using everyday laptops (e.g., Apple Silicon Mac, Windows laptops with standard CPU/integrated GPU).
* **Technical Ability:** Non-technical to intermediate; requiring a intuitive interface to query personal data without setting up cloud infrastructure or writing code.
* **Core Need:** A fast, 100% offline personal copilot that operates without internet access and leaves zero digital footprint outside their local machine.

---

### 3. Architecture Overview (Air-Gapped Personal Vault)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LOCAL AIR-GAPPED ENVIRONMENT                          │
│                                                                             │
│  📁 Personal Documents      ➡️  📦 Vector Hub           ➡️  🤖 Model Hub    │
│  • Medical Reports               • Local Text Chunking       • Ollama / LM  │
│  • Bank Statements               • Sparse TF-IDF Index       • GGUF / Open   │
│  • Insurance Policies            • Local Embedding Models      Weights LLM  │
│                                                                             │
│                    💬 Output: Private, Grounded Q&A                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 4. Real-World Sub-Use Cases

#### A. Health & Medical History Copilot
* **Scenario:** A user wants to understand their longitudinal medical history over 5 years across doctor summaries, blood work reports, and prescriptions.
* **Example Queries:**
  * *"Summarize my last three lipid profile test results. Has my LDL dropped?"*
  * *"List all medications I was prescribed in 2024 along with dosage instructions."*
* **Value:** Eliminates panic during doctor appointments; enables rapid retrieval of historical health metrics without relying on cloud portals.

#### B. Insurance Policy & Claim Assessor
* **Scenario:** Evaluating complex insurance contracts to figure out active coverage, waiting periods, exclusions, or claim filing rules.
* **Example Queries:**
  * *"Does my health insurance policy cover day-care procedures for cataracts? Show me the clause."*
  * *"What is the deductible and co-pay structure for out-of-network hospitals under my plan?"*
* **Value:** Decodes complex legalese instantly; prevents claim rejection surprises.

#### C. Financial & Banking History Analyzer
* **Scenario:** Reviewing multi-year tax filings, loan agreements, bank statements, and mutual fund disclosures.
* **Example Queries:**
  * *"What were my major recurring subscription costs based on my bank statements last year?"*
  * *"Extract the interest rates, lock-in periods, and maturity dates from my bank fixed deposit certificates."*
* **Value:** Instant personal financial auditing without sharing financial statements with third-party aggregators.

---

### 5. Platform Feature Mapping

| Platform Feature | Functional Role in Use Case | User Benefit |
| :--- | :--- | :--- |
| **Model Hub (`LocalLLMHub.tsx`)** | Connects to local runners (*Ollama, LM Studio*) to execute open-weight models (*Llama-3, Qwen-2.5*). | Guarantees zero data leaves the local device; fully operational offline. |
| **Vector Hub (`VectorHub.tsx`)** | Handles local chunking, storage limits, and TF-IDF/Hybrid local vector indexing. | Delivers precise context extraction from dense PDFs like policy terms and tax forms. |
| **"Use Loaded" Auto-Detection** | Dynamically adapts to whichever GGUF model is currently active in memory. | Operates smoothly on consumer hardware with limited RAM/VRAM. |
| **Multi-Stage Fallbacks** | Automatically relaxes strict JSON-schema bounds to standard text if needed. | Ensures reliable answers regardless of model footprint or local engine capability. |

---

### 6. Value Proposition
* **100% Data Sovereignty:** Total privacy compliance (GDPR/HIPAA compliant by design—data never reaches an external API).
* **Zero Recurring Cost:** Free execution without per-token charges when querying hundreds of personal pages.
* **Accessibility:** Converts unstructured household records into an interactive, conversational search engine.
