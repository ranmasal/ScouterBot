"""Configuration for ScouterBot RAG Backend."""

import os
from dotenv import load_dotenv

load_dotenv()

# Server Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

# LLM Provider Configuration
# Supported: "ollama", "openai", "none" (fallback only)
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")

# OpenAI Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-3.5-turbo")

# Ollama Configuration (local LLM - no API key needed)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

# Embedding Model (FastEmbed compatible models)
# Popular options: "BAAI/bge-small-en-v1.5", "sentence-transformers/all-MiniLM-L6-v2",
#                  "thenlper/gte-small", "BAAI/bge-base-en-v1.5"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")

# Vector Store (in-memory numpy arrays - no persistent DB required)
# Documents are stored in RAM and lost on restart. Run /api/index to re-index.
VECTOR_STORE_PATH = os.getenv("VECTOR_STORE_PATH", "./data")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "scouting_docs")

# Scouting America Document Sources
DOCUMENT_SOURCES = {
    "guide_to_safe_scouting": {
        "name": "Guide to Safe Scouting",
        "url": "https://www.scouting.org/health-and-safety/gss/",
        "type": "webpage",
        "description": "Official safety guidelines updated quarterly",
        "pdf_pattern": None,  # Will be extracted from page
    },
    "guide_to_advancement": {
        "name": "Guide to Advancement",
        "url": "https://www.scouting.org/resources/guide-to-advancement/",
        "type": "webpage",
        "description": "Official advancement procedures and policies",
        "pdf_pattern": None,  # Will be extracted from page
    },
    "troop_leader_resources": {
        "name": "Troop Leader Resources",
        "url": "https://troopleader.scouting.org/",
        "type": "webpage",
        "description": "Resources for troop leaders",
        "pdf_pattern": None,
    },
    "scouting_org_resources": {
        "name": "Scouting.org Resources",
        "url": "https://www.scouting.org/resources/",
        "type": "webpage",
        "description": "General Scouting America resources page",
        "pdf_pattern": None,
    },
}

# Known Filestore PDFs (direct links when known)
KNOWN_PDF_URLS = [
    # Guide to Safe Scouting (these URLs change - fetched dynamically)
    # "https://filestore.scouting.org/filestore/pdf/19-30828.pdf",
]

# Filestore base URL
FILESTORE_BASE = "https://filestore.scouting.org/filestore/pdf/"

# Scoutbook Plus Configuration
SCOUTBOOK_PLUS_URL = "https://advancements.scouting.org/"
SCOUTBOOK_LOGIN_URL = "https://advancements.scouting.org/#/login"

# Authentication (for Scoutbook Plus access)
SCOUTBOOK_USERNAME = os.getenv("SCOUTBOOK_USERNAME", "")
SCOUTBOOK_PASSWORD = os.getenv("SCOUTBOOK_PASSWORD", "")

# Request settings
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))
REQUEST_DELAY = float(os.getenv("REQUEST_DELAY", "1.0"))  # Delay between requests

# Document processing
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))  # Characters per chunk
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))  # Overlap between chunks
MAX_DOCUMENTS = int(os.getenv("MAX_DOCUMENTS", "100"))  # Max docs to store

# CORS origins (for extension access)
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "chrome-extension://*").split(",")

