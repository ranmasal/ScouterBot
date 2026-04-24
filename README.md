# ScouterBot

AI-powered assistant for Scouting America Adult Leaders. A Chrome extension with a Python RAG (Retrieval-Augmented Generation) backend for answering questions from official Scouting America documents — now with **Troop Inventory Management via GitHub**.

## Features

- **Chat Interface** — Ask questions about Scouting America policies, procedures, and guidelines
- **RAG Document Retrieval** — Backend fetches and indexes official documents (Guide to Safe Scouting, Guide to Advancement, etc.)
- **Scoutbook Plus Integration** — Quick links and search helpers for Scoutbook Plus
- **Troop Inventory Management** — Track patches, awards, equipment in a GitHub repo; get smart ordering recommendations
- **Setup Wizard** — First-run wizard guides you through backend connection and GitHub inventory setup
- **"Just in Case" Overrides** — Order more than recommended; your reasons are saved for future reference
- **No C Compiler Required** — Backend runs on stock Windows Python 3.13 with pre-built wheels only

## Project Structure

```
ScouterBot/
├── manifest.json          # Chrome Extension Manifest V3
├── popup.html             # Extension popup (chat UI + wizard)
├── popup.css              # Chat + wizard styling
├── popup.js               # Chat logic + setup wizard + inventory UI
├── background.js          # Service worker (webhook + GitHub API handler)
├── content-script.js      # In-page Scoutbook Plus helpers
├── options.html           # Extension settings page
├── options.js             # Settings logic
├── icons/                 # Extension icons
├── backend/               # Python RAG server
│   ├── server.py          # FastAPI app with inventory endpoints
│   ├── inventory_manager.py # Inventory calculations + templates
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

### 3. Setup Wizard (First Run)

When you first open ScouterBot, a setup wizard will guide you through:

1. **Welcome** — What ScouterBot can do
2. **Backend Check** — Verify the Python server is running
3. **GitHub Inventory** — Optional: connect your troop's inventory repo
4. **All Set** — Start chatting!

You can skip any step and return later via **Settings ⚙️**.

### 4. Connect to Backend & GitHub

The wizard handles this, or you can do it manually:

**Backend:**
1. Click the **⚙️ Settings** button in the popup
2. Set **Backend URL** to: `http://localhost:8000`
3. Save settings

**GitHub Inventory (optional):**
1. In Settings, scroll to **Troop Inventory**
2. Enter your **GitHub Repository URL** (e.g., `https://github.com/yourname/Troop123-Inventory`)
3. Enter your **Personal Access Token** (with `repo` scope)
4. Click **Test GitHub** to verify
5. Save settings

### 5. Index Documents

Before chatting, index Scouting America documents:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/index -Method POST `
  -ContentType "application/json" -Body '{"force_refresh":true}'
```

Or click **📚 Index Docs** in the extension popup.

---

## Troop Inventory System

ScouterBot can connect to a **private GitHub repository** to track your troop's inventory — patches, awards, equipment, and more. The bot can then tell you exactly what to order and when.

### How It Works

1. **Store inventory in GitHub** — A JSON file (`inventory.json`) in your private repo
2. **Track stock levels** — `on_hand`, `on_order`, `min_stock` for each item
3. **Smart recommendations** — The bot calculates: `needed = max(min_stock - available, approaching_scouts - available)`
4. **Order with overrides** — Accept the recommendation or order more/less with a reason
5. **Everything is saved** — Order history with override reasons goes back to GitHub

### Inventory JSON Format

```json
{
  "troop_number": "123",
  "last_updated": "2025-01-15T10:00:00Z",
  "items": [
    {
      "id": "advancements_tenderfoot_patch",
      "name": "Tenderfoot Rank Patch",
      "category": "advancements",
      "on_hand": 2,
      "on_order": 0,
      "min_stock": 3,
      "unit": "each",
      "sku": "scoutshop.org #641234",
      "notes": "Keep extra for mid-year crossovers"
    }
  ],
  "pending_orders": []
}
```

### Using the Inventory

- **📦 Inventory button** — View all items, search, add/edit, see stock status
- **🛒 Order button** — Click on any item to see the recommendation and place an order
- **Chat integration** — Ask "How many Tenderfoot patches do I need?" and the bot checks your inventory

### "Just in Case" Overrides

When you place an order, you can:
- **Accept the recommendation** — Exact quantity needed
- **Order more** — Enter a higher number and give a reason (e.g., "Ordering 10 for bulk discount")
- **Order less** — If you know you won't need them

Your override reasons are saved in `pending_orders` and shown in future recommendations so the bot learns your troop's patterns.

---

## Setup Wizard Details

The first-run wizard appears automatically and can be re-opened via the **🧙 Setup** button.

### Wizard Flow

```
First Launch
├── Step 1: Welcome to ScouterBot
├── Step 2: Backend Connection Check
│   └── Shows instructions if backend is not running
├── Step 3: GitHub Inventory Integration
│   ├── "Yes, connect now"
│   │   ├── Do you have a GitHub account?
│   │   ├── Create a private repo (e.g., "Troop123-Inventory")
│   │   ├── Create a Personal Access Token (classic) with 'repo' scope
│   │   ├── Enter repo URL and token
│   │   └── Test & Save
│   └── "Later"
│       └── Skips; shows reminder that you can connect anytime in Settings
└── Step 4: You're Ready!
    └── Summary of what's connected
```

You can always run the wizard again from the popup toolbar.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3, vanilla JS |
| Backend Server | FastAPI, uvicorn |
| Embeddings | FastEmbed 0.8.0 (ONNX Runtime) |
| Vector Search | NumPy in-memory cosine similarity |
| Document Parsing | BeautifulSoup, lxml, PyPDF |
| LLM (optional) | OpenAI API (gpt-3.5-turbo) or Ollama (local) |
| Inventory Storage | GitHub API (JSON files in private repo) |

## Why No C Compiler?

The original stack used `sentence-transformers` + `chromadb` + `numpy==1.26.3`, which required building from source on Python 3.13. We refactored to:

- **FastEmbed** — Pre-built ONNX wheels, downloads models automatically
- **NumPy 2.4.4** — Has pre-built wheels for Python 3.13
- **In-memory storage** — Eliminates ChromaDB dependency entirely

This makes the backend installable on any stock Windows Python 3.13 without Visual Studio Build Tools.

## API Endpoints

See `backend/README.md` for full API documentation. Key endpoints:

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | Main chat webhook |
| `POST /api/index` | Index Scouting America documents |
| `GET /api/status` | Backend health check |
| `GET /api/sources` | List configured document sources |
| `POST /api/inventory/recommend` | Get order recommendations |
| `GET /api/inventory/template` | Get starter inventory template |
| `POST /api/inventory/order` | Record an order decision |

## Contributing

This is a personal project for Scouting America Adult Leaders. Feel free to fork and adapt for your troop or council.

## License

MIT

