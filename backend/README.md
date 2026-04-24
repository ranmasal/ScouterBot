# ScouterBot RAG Backend

FastAPI-based backend for the ScouterBot Chrome extension. Provides document retrieval, chat/webhook processing, and Scoutbook Plus integration.

## Architecture

- **FastAPI** — HTTP server with async endpoints
- **FastEmbed (ONNX Runtime)** — Pre-built embedding model (`BAAI/bge-small-en-v1.5`) with no C compiler required
- **NumPy (in-memory)** — Lightweight vector similarity search without ChromaDB or PyTorch
- **BeautifulSoup + lxml** — HTML parsing for document fetching
- **PyPDF** — PDF text extraction

> **Note:** This backend uses **in-memory storage** for documents. Data is lost on restart. Call `/api/index` after each startup to re-index documents.

## Requirements

- Python 3.13+ (tested on 3.13.13)
- Windows 10/11 (or any OS with Python 3.13 wheels available)
- **No C compiler required** — all dependencies install from pre-built wheels

## Installation

```bash
cd backend
pip install -r requirements.txt
```

The first server startup downloads the ONNX embedding model (~67 MB) from HuggingFace automatically.

## Running the Server

```bash
python server.py
```

Server starts on `http://localhost:8000`.

## Environment Variables (Optional)

Create a `.env` file in the `backend/` folder:

```
OPENAI_API_KEY=sk-...          # Optional — enables LLM-generated responses
LLM_MODEL=gpt-3.5-turbo        # OpenAI model to use
HOST=0.0.0.0                   # Bind address
PORT=8000                      # Port
DEBUG=false                    # Enable FastAPI debug/reload
```

Without `OPENAI_API_KEY`, the server returns fallback responses with raw document snippets.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Server info & endpoint list |
| GET | `/api/status` | Backend health & stats |
| POST | `/api/chat` | Main chat/webhook endpoint |
| POST | `/api/index` | Index all Scouting America documents |
| POST | `/api/index/pdf` | Index a specific PDF by URL |
| GET | `/api/sources` | List configured document sources |
| GET | `/api/guide-to-safe-scouting` | Get latest GSS PDF URL |
| GET | `/api/guide-to-advancement` | Get latest GTA PDF URL |
| GET | `/api/scoutbook/resources` | Scoutbook Plus resource info |
| POST | `/api/scoutbook/search` | Scoutbook Plus search (placeholder) |
| DELETE | `/api/documents` | Clear all indexed documents |

## Testing the Chat Endpoint

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/chat -Method POST `
  -ContentType "application/json" `
  -Body '{"message":"What is the Scout Oath?"}'
```

## Chrome Extension Connection

Configure the extension's webhook URL in **Settings (⚙️)** to:

```
http://localhost:8000/api/chat
```

CORS is configured to allow all origins for development.

## File Overview

| File | Purpose |
|------|---------|
| `server.py` | FastAPI app with all endpoints |
| `rag_engine.py` | RAG pipeline: query → retrieve → respond |
| `vector_store.py` | FastEmbed embeddings + numpy similarity search |
| `document_fetcher.py` | Fetch & parse Scouting America web pages/PDFs |
| `config.py` | Environment-based configuration |
| `requirements.txt` | Python dependencies (no compiler needed) |

## Troubleshooting

### "No pre-built wheel for mmh3"
Install the latest `mmh3` with a pre-built wheel before installing other requirements:
```bash
pip install mmh3==5.2.1
pip install -r requirements.txt
```

### "Module not found" errors
Ensure you're in the `backend/` directory when running `python server.py`.

### ONNX model download fails
The embedding model downloads from HuggingFace on first run. If behind a proxy, set:
```
HTTPS_PROXY=http://your-proxy:port
```

## Next Steps

- Add persistent storage (SQLite, disk-based numpy arrays, or a lightweight DB)
- Implement Scoutbook Plus authenticated search
- Add document re-indexing scheduler
- Deploy to a cloud service (Render, Railway, Fly.io)

