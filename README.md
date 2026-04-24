# ScouterBot

AI-powered assistant for Scouting America Adult Leaders. A Chrome extension with a Python RAG (Retrieval-Augmented Generation) backend for answering questions from official Scouting America documents.

## Features

- **Chat Interface** — Ask questions about Scouting America policies, procedures, and guidelines
- **RAG Document Retrieval** — Backend fetches and indexes official documents (Guide to Safe Scouting, Guide to Advancement, etc.)
- **Scoutbook Plus Integration** — Quick links and search helpers for Scoutbook Plus
- **No C Compiler Required** — Backend runs on stock Windows Python 3.13 with pre-built wheels only

## Project Structure

```
ScouterBot/
├── manifest.json          # Chrome Extension Manifest V3
├── popup.html             # Extension popup (chat UI)
├── popup.css              # Chat styling
├── popup.js               # Chat logic
├── background.js          # Service worker (webhook handler)
├── content-script.js      # In-page Scoutbook Plus helpers
├── options.html           # Extension settings page
├── options.js             # Settings logic
├── icons/                 # Extension icons (SVG placeholder + README)
├── backend/               # Python RAG server
│   ├── server.py          # FastAPI app
│   ├── rag_engine.py      # RAG pipeline
│   ├── vector_store.py    # FastEmbed + NumPy embeddings
│   ├── document_fetcher.py # Web/PDF document fetcher
│   ├── config.py          # Environment configuration
│   ├── requirements.txt   # Python dependencies
│   └── README.md          # Backend docs
├── README.md              # This file
└── TODO.md                # Build progress tracker
```

## Quick Start

### 1. Backend (Python RAG Server)

Requirements: Python 3.13+ (no C compiler needed)

```bash
cd backend
pip install -r requirements.txt
python server.py
```

Server starts on `http://localhost:8000`. The first run downloads a 67 MB ONNX embedding model from HuggingFace.

### 2. Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → Select the `ScouterBot/` folder
4. Click the ScouterBot icon in your toolbar

### 3. Connect Extension to Backend

1. Click the **⚙️ Settings** button in the popup
2. Set **RAG Webhook URL** to: `http://localhost:8000/api/chat`
3. Save settings

### 4. Index Documents

Before chatting, index Scouting America documents:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/index -Method POST `
  -ContentType "application/json" -Body '{"force_refresh":true}'
```

Or use the backend README for more details.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3, vanilla JS |
| Backend Server | FastAPI, uvicorn |
| Embeddings | FastEmbed 0.8.0 (ONNX Runtime) |
| Vector Search | NumPy in-memory cosine similarity |
| Document Parsing | BeautifulSoup, lxml, PyPDF |
| LLM (optional) | OpenAI API (gpt-3.5-turbo) |

## Why No C Compiler?

The original stack used `sentence-transformers` + `chromadb` + `numpy==1.26.3`, which required building from source on Python 3.13. We refactored to:

- **FastEmbed** — Pre-built ONNX wheels, downloads models automatically
- **NumPy 2.4.4** — Has pre-built wheels for Python 3.13
- **In-memory storage** — Eliminates ChromaDB dependency entirely

This makes the backend installable on any stock Windows Python 3.13 without Visual Studio Build Tools.

## API Endpoints

See `backend/README.md` for full API documentation.

## Contributing

This is a personal project for Scouting America Adult Leaders. Feel free to fork and adapt for your troop or council.

## License

MIT

