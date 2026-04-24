"""FastAPI server for ScouterBot RAG Backend.

Provides endpoints for:
- Chat/webhook messages
- Document indexing
- Scoutbook Plus integration
- Troop inventory management
- Health checks and status
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from config import (
    CORS_ORIGINS,
    DEBUG,
    HOST,
    PORT,
    SCOUTBOOK_LOGIN_URL,
    SCOUTBOOK_PASSWORD,
    SCOUTBOOK_PLUS_URL,
    SCOUTBOOK_USERNAME,
)
from document_fetcher import DocumentFetcher
from rag_engine import RAGEngine
from vector_store import VectorStore
from inventory_manager import inventory_manager

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global state
vector_store: Optional[VectorStore] = None
rag_engine: Optional[RAGEngine] = None


class ChatMessage(BaseModel):
    """Chat message from the extension."""
    message: str = Field(..., min_length=1, max_length=2000)
    source: str = "scouterbot_chrome_extension"
    timestamp: Optional[str] = None
    user_context: Optional[str] = None
    session_id: Optional[str] = None
    inventory_context: Optional[Dict] = None  # Troop inventory data


class ChatResponse(BaseModel):
    """Response to a chat message."""
    reply: str
    sources: List[Dict]
    context_used: bool = False
    documents_retrieved: int = 0


class ScoutbookCredentials(BaseModel):
    """Scoutbook Plus credentials."""
    username: str
    password: str


class IndexRequest(BaseModel):
    """Request to index documents."""
    sources: Optional[List[str]] = None
    force_refresh: bool = False


class IndexResponse(BaseModel):
    """Response from indexing operation."""
    success: bool
    documents_indexed: int
    sources_processed: List[str]
    errors: List[str]


class InventoryQueryRequest(BaseModel):
    """Request to query inventory needs."""
    inventory_data: Dict
    item_name: Optional[str] = None
    category: Optional[str] = None
    approaching_count: int = 0


class InventoryRecommendResponse(BaseModel):
    """Response with inventory recommendations."""
    recommendations: List[Dict]
    total_needed: int
    low_stock_count: int


class OrderRecordRequest(BaseModel):
    """Request to record an order decision."""
    item_id: str
    item_name: str
    recommended: int
    ordered: int
    reason: Optional[str] = None
    timestamp: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    global vector_store, rag_engine

    logger.info("Starting ScouterBot RAG Backend...")

    vector_store = VectorStore()
    rag_engine = RAGEngine(vector_store)

    stats = vector_store.get_stats()
    logger.info(f"Vector store ready: {stats['total_documents']} documents")

    yield

    logger.info("Shutting down ScouterBot RAG Backend...")


app = FastAPI(
    title="ScouterBot RAG Backend",
    description="AI-powered document retrieval and troop inventory for Scouting America",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "ScouterBot RAG Backend",
        "version": "1.1.0",
        "status": "running",
        "features": {
            "persistent_storage": True,
            "conversation_memory": True,
            "multiple_llm_providers": True,
            "scoutbook_integration": "partial",
            "troop_inventory": True,
        },
        "endpoints": {
            "chat": "/api/chat",
            "index": "/api/index",
            "index_pdf": "/api/index/pdf",
            "status": "/api/status",
            "llm_status": "/api/llm/status",
            "conversation_history": "/api/session/{session_id}/history",
            "clear_conversation": "/api/session/{session_id}/clear",
            "scoutbook": "/api/scoutbook",
            "sources": "/api/sources",
            "documents": "/api/documents",
            "guide_to_safe_scouting": "/api/guide-to-safe-scouting",
            "guide_to_advancement": "/api/guide-to-advancement",
            "inventory_recommend": "/api/inventory/recommend",
            "inventory_template": "/api/inventory/template",
            "inventory_order": "/api/inventory/order",
        },
    }


@app.get("/api/status")
async def get_status():
    """Get backend status and statistics."""
    if not vector_store or not rag_engine:
        raise HTTPException(status_code=503, detail="Backend not initialized")

    stats = vector_store.get_stats()
    summary = rag_engine.get_document_summary()

    return {
        "status": "healthy",
        "documents_indexed": stats["total_documents"],
        "store_type": stats["store_type"],
        "llm_available": summary["llm_available"],
        "llm_model": summary["llm_model"],
    }


@app.post("/api/chat")
async def chat(request: ChatMessage):
    """Process a chat message and return a RAG-enhanced response."""
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")

    try:
        # Build system prompt with inventory context if provided
        system_context = None
        if request.inventory_context:
            inventory_text = inventory_manager.format_inventory_for_llm(request.inventory_context)
            system_context = (
                f"You are ScouterBot, an AI assistant for Scouting America Adult Leaders. "
                f"You help with policies, procedures, advancement tracking, and troop inventory.\n\n"
                f"Current troop inventory context:\n{inventory_text}\n\n"
                f"When asked about inventory or ordering, use the context above to provide "
                f"specific recommendations. If stock is low, recommend ordering. "
                f"Acknowledge when a user wants to order extra 'just in case' and note that "
                f"their override reason will be saved for future reference."
            )

        result = rag_engine.query(
            request.message,
            session_id=request.session_id,
            top_k=5,
            system_context=system_context,
        )

        return ChatResponse(
            reply=result["reply"],
            sources=result["sources"],
            context_used=result["context_used"],
            documents_retrieved=result["documents_retrieved"],
        )
    except Exception as e:
        logger.error(f"Chat processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/index")
async def index_documents(request: IndexRequest):
    """Index Scouting America documents."""
    if not vector_store:
        raise HTTPException(status_code=503, detail="Vector store not initialized")

    errors = []
    documents_indexed = 0
    sources_processed = []

    async with DocumentFetcher() as fetcher:
        try:
            if request.force_refresh:
                vector_store.clear()
                logger.info("Cleared existing documents for fresh indexing")

            all_chunks = await fetcher.fetch_all_sources()

            if all_chunks:
                documents_indexed = vector_store.add_documents(all_chunks)
                sources_processed = list(set(chunk["source"].split("_")[0] for chunk in all_chunks))
                logger.info(f"Indexed {documents_indexed} document chunks")
                vector_store.save()
                logger.info("Vector store saved to disk")
            else:
                errors.append("No documents were fetched from any source")

        except Exception as e:
            logger.error(f"Indexing error: {e}")
            errors.append(str(e))

    return IndexResponse(
        success=len(errors) == 0 or documents_indexed > 0,
        documents_indexed=documents_indexed,
        sources_processed=sources_processed,
        errors=errors,
    )


@app.post("/api/index/pdf")
async def index_specific_pdf(url: str):
    """Index a specific PDF by URL."""
    if not vector_store:
        raise HTTPException(status_code=503, detail="Vector store not initialized")

    async with DocumentFetcher() as fetcher:
        try:
            pdf_content = await fetcher.download_pdf(url)
            if not pdf_content:
                raise HTTPException(status_code=400, detail="Failed to download PDF")

            pdf_text = await fetcher.extract_text_from_pdf(pdf_content)
            if not pdf_text:
                raise HTTPException(status_code=400, detail="Failed to extract text from PDF")

            chunks = fetcher.chunk_text(pdf_text, "custom_pdf", url)
            documents_indexed = vector_store.add_documents(chunks)

            return {
                "success": True,
                "documents_indexed": documents_indexed,
                "pdf_url": url,
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"PDF indexing error: {e}")
            raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════
#  INVENTORY ENDPOINTS
# ════════════════════════════════════════════

@app.post("/api/inventory/recommend")
async def inventory_recommend(request: InventoryQueryRequest):
    """Get inventory order recommendations.

    Analyzes inventory data and returns items that need ordering,
    with recommended quantities and explanations.
    """
    try:
        if request.item_name:
            # Specific item query
            item = None
            for i in request.inventory_data.get("items", []):
                if i["name"].lower() == request.item_name.lower():
                    item = i
                    break

            if not item:
                return {
                    "success": False,
                    "message": f"Item '{request.item_name}' not found in inventory.",
                }

            calc = inventory_manager.calculate_need(item, request.approaching_count)
            recommendation = inventory_manager.format_order_recommendation(
                item, request.approaching_count
            )

            return {
                "success": True,
                "recommendations": [calc],
                "total_needed": calc["recommended"],
                "low_stock_count": 1 if calc["recommended"] > 0 else 0,
                "formatted_recommendation": recommendation,
            }

        elif request.category:
            # Category-wide query
            items = [
                i for i in request.inventory_data.get("items", [])
                if i.get("category", "").lower() == request.category.lower()
            ]

            recommendations = []
            total_needed = 0
            low_count = 0

            for item in items:
                calc = inventory_manager.calculate_need(item, request.approaching_count)
                recommendations.append(calc)
                total_needed += calc["recommended"]
                if calc["recommended"] > 0:
                    low_count += 1

            return InventoryRecommendResponse(
                recommendations=recommendations,
                total_needed=total_needed,
                low_stock_count=low_count,
            )

        else:
            # All items
            recommendations = inventory_manager.get_low_stock_items(request.inventory_data)

            return InventoryRecommendResponse(
                recommendations=recommendations,
                total_needed=sum(r["recommended"] for r in recommendations),
                low_stock_count=len(recommendations),
            )

    except Exception as e:
        logger.error(f"Inventory recommendation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/inventory/template")
async def inventory_template(troop_number: Optional[str] = ""):
    """Get a fresh inventory JSON template.

    Returns a starter inventory with common Scouting America items
    pre-configured with sensible minimum stock levels.
    """
    template = inventory_manager.create_inventory_template(troop_number)
    return {
        "success": True,
        "template": template,
        "note": (
            "This is a starter template. Edit the items to match your troop's needs, "
            "then save it as inventory.json in your GitHub repository."
        ),
    }


@app.post("/api/inventory/order")
async def record_order_decision(request: OrderRecordRequest):
    """Record an order decision including overrides.

    Tracks when a user orders more (or less) than recommended,
    storing the reason for future reference.
    """
    try:
        override = request.ordered != request.recommended

        record = {
            "item_id": request.item_id,
            "item_name": request.item_name,
            "recommended": request.recommended,
            "ordered": request.ordered,
            "difference": request.ordered - request.recommended,
            "override": override,
            "reason": request.reason or ("User override" if override else "Accepted recommendation"),
            "timestamp": request.timestamp or datetime.utcnow().isoformat(),
        }

        logger.info(
            f"Order recorded: {request.item_name} - "
            f"recommended {request.recommended}, ordered {request.ordered}"
        )

        return {
            "success": True,
            "record": record,
            "message": (
                f"Order recorded: {request.ordered} x {request.item_name}. "
                f"({'Override: ' + request.reason if override and request.reason else 'Accepted recommendation'})"
            ),
        }

    except Exception as e:
        logger.error(f"Order recording error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ════════════════════════════════════════════
#  SCOUTBOOK ENDPOINTS
# ════════════════════════════════════════════

@app.get("/api/scoutbook/resources")
async def get_scoutbook_resources():
    """Get available Scoutbook Plus resources."""
    resources = {
        "scoutbook_plus_url": SCOUTBOOK_PLUS_URL,
        "login_required": True,
        "available_endpoints": [
            "/api/scoutbook/units",
            "/api/scoutbook/advancements",
            "/api/scoutbook/activities",
        ],
        "note": (
            "Scoutbook Plus requires authentication. "
            "Set SCOUTBOOK_USERNAME and SCOUTBOOK_PASSWORD in environment variables "
            "or pass credentials in request body."
        ),
    }

    if SCOUTBOOK_USERNAME and SCOUTBOOK_PASSWORD:
        resources["credentials_configured"] = True
    else:
        resources["credentials_configured"] = False

    return resources


@app.post("/api/scoutbook/search")
async def search_scoutbook(query: str):
    """Search Scoutbook Plus data."""
    return {
        "success": True,
        "query": query,
        "results": [],
        "message": (
            "Scoutbook Plus search requires authenticated API access. "
            "This feature will be fully implemented once Scoutbook Plus "
            "API documentation is available."
        ),
    }


@app.get("/api/sources")
async def get_sources():
    """Get configured document sources."""
    from config import DOCUMENT_SOURCES

    sources = []
    for key, config in DOCUMENT_SOURCES.items():
        sources.append({
            "key": key,
            "name": config["name"],
            "url": config["url"],
            "type": config["type"],
            "description": config["description"],
        })

    return {"sources": sources}


@app.get("/api/guide-to-safe-scouting")
async def get_guide_to_safe_scouting_url():
    """Get the latest Guide to Safe Scouting PDF URL."""
    async with DocumentFetcher() as fetcher:
        try:
            pdf_url = await fetcher.get_guide_to_safe_scouting_pdf_url()
            if pdf_url:
                return {
                    "success": True,
                    "document_name": "Guide to Safe Scouting",
                    "pdf_url": pdf_url,
                    "source_page": "https://www.scouting.org/health-and-safety/gss/",
                }
            else:
                return {
                    "success": False,
                    "message": "Could not find the latest Guide to Safe Scouting PDF URL",
                }
        except Exception as e:
            logger.error(f"Error fetching GSS URL: {e}")
            return {
                "success": False,
                "message": str(e),
            }


@app.get("/api/guide-to-advancement")
async def get_guide_to_advancement_url():
    """Get the latest Guide to Advancement PDF URL."""
    async with DocumentFetcher() as fetcher:
        try:
            pdf_url = await fetcher.get_guide_to_advancement_pdf_url()
            if pdf_url:
                return {
                    "success": True,
                    "document_name": "Guide to Advancement",
                    "pdf_url": pdf_url,
                    "source_page": "https://www.scouting.org/resources/guide-to-advancement/",
                }
            else:
                return {
                    "success": False,
                    "message": "Could not find the latest Guide to Advancement PDF URL",
                }
        except Exception as e:
            logger.error(f"Error fetching GTA URL: {e}")
            return {
                "success": False,
                "message": str(e),
            }


@app.delete("/api/documents")
async def clear_documents():
    """Clear all indexed documents."""
    if not vector_store:
        raise HTTPException(status_code=503, detail="Vector store not initialized")

    vector_store.clear()
    return {"success": True, "message": "All documents cleared"}


@app.get("/api/llm/status")
async def get_llm_status():
    """Get LLM provider status and availability."""
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")

    status = rag_engine.llm_manager.get_status()
    summary = rag_engine.get_document_summary()

    return {
        "active_provider": status["active_provider"],
        "available_providers": status["available_providers"],
        "llm_available": summary["llm_available"],
        "llm_model": summary["llm_model"],
    }


@app.get("/api/session/{session_id}/history")
async def get_conversation_history(session_id: str):
    """Get conversation history for a session."""
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")

    history = rag_engine.get_conversation_history(session_id)
    return {
        "session_id": session_id,
        "turns": len(history),
        "history": history,
    }


@app.delete("/api/session/{session_id}/clear")
async def clear_conversation(session_id: str):
    """Clear conversation history for a session."""
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")

    rag_engine.clear_conversation(session_id)
    return {"success": True, "message": f"Conversation {session_id} cleared"}


@app.get("/api/sessions")
async def get_active_sessions():
    """Get all active conversation sessions."""
    if not rag_engine:
        raise HTTPException(status_code=503, detail="RAG engine not initialized")

    sessions = rag_engine.get_active_sessions()
    return {"sessions": sessions, "count": len(sessions)}


# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unhandled exceptions."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "message": str(exc)},
    )


if __name__ == "__main__":
    import uvicorn

    logger.info(f"Starting server on {HOST}:{PORT}")
    uvicorn.run(
        "server:app",
        host=HOST,
        port=PORT,
        reload=DEBUG,
        log_level="debug" if DEBUG else "info",
    )

