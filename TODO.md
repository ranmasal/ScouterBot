# ScouterBot MVP Build Plan

## Steps

- [x] Create TODO.md with build steps
- [x] Create `manifest.json` (Chrome Manifest V3)
- [x] Create `popup.html` (Chat UI structure)
- [x] Create `popup.css` (Chat UI styling)
- [x] Create `popup.js` (Chat UI logic)
- [x] Create `background.js` (Service worker for webhooks)
- [x] Create `content-script.js` (Scoutbook Plus integration)
- [x] Create `options.html` (Settings page structure)
- [x] Create `options.js` (Settings page logic)
- [x] Add placeholder icons in `icons/`
- [x] Update `README.md` with setup and file structure docs

## Backend (Python RAG Server)

- [x] Refactor `vector_store.py` — replace ChromaDB + sentence-transformers with FastEmbed + ONNX + NumPy
- [x] Update `requirements.txt` — remove PyTorch/ChromaDB, add fastembed/onnxruntime
- [x] Fix dependency conflict (`mmh3` pre-built wheel for Python 3.13)
- [x] Install all backend dependencies successfully on Python 3.13
- [x] Fix `rag_engine.py` bug — missing `documents_retrieved` in early return
- [x] Clean up `config.py` — remove unused cloudscraper/playwright references
- [x] Fix `document_fetcher.py` — remove stale config imports
- [x] Update `backend/README.md` with new architecture docs
- [x] Start server and verify endpoints (`/`, `/api/status`, `/api/chat`)

## Feature Round: All 4 Major Features

### 1. Persistent Document Indexing ✅
- [x] Add disk serialization to `vector_store.py` (save/load embeddings + documents)
- [x] Integrate `DocumentFetcher` with indexing endpoint in `server.py`
- [x] Test end-to-end: index docs → save → restart server → query works

### 2. Local LLM Support (Ollama) ✅
- [x] Add Ollama client class in new `llm_providers.py`
- [x] Refactor `rag_engine.py` to use provider-based LLM selection
- [x] Support fallback chain: Ollama → OpenAI → raw snippets
- [x] Test with `llama3.2` or `phi4` model

### 3. Conversation Memory ✅
- [x] Add session/conversation storage (backend memory store)
- [x] Include conversation history in RAG prompts
- [x] Add session management endpoints (`/api/session`, `/api/history`)
- [x] Update extension popup to maintain chat context across restarts

### 4. Real Scoutbook Plus Integration 🟡 (Partial)
- [x] Add Scoutbook Plus placeholder endpoints
- [ ] Add authenticated Scoutbook Plus API/scraping module
- [ ] Create backend endpoints for merit badge lookup, advancement search
- [ ] Update extension content script with real search widget
- [ ] Add Scoutbook Plus search UI to extension popup

## Verified Working

- Server running on `http://localhost:8000`
- FastEmbed ONNX model loaded (`BAAI/bge-small-en-v1.5`)
- Chat endpoint returns proper response with conversation memory
- Status endpoint reports `store_type: fastembed_numpy`
- Session endpoints work (`/api/session/{id}/history`, `/api/session/{id}/clear`)
- LLM status endpoint shows available providers
- **No C compiler required** — all deps installed from pre-built wheels

## Next Steps After This Round

- [ ] Generate PNG icons from SVG placeholder
- [ ] Add Firefox/Edge manifest compatibility
- [ ] Deploy backend to cloud (Render, Railway, etc.)
- [ ] Implement scheduled document re-indexing

