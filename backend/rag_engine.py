"""RAG Engine for ScouterBot.

Handles query processing, document retrieval, response generation,
and conversation memory.
"""

import logging
import time
from typing import Dict, List, Optional

from config import LLM_PROVIDER
from llm_providers import LLMManager
from vector_store import VectorStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ConversationStore:
    """Simple in-memory conversation store per session."""

    def __init__(self, max_history: int = 20):
        self.sessions: Dict[str, List[Dict]] = {}
        self.max_history = max_history

    def get_history(self, session_id: str) -> List[Dict]:
        """Get conversation history for a session."""
        return self.sessions.get(session_id, [])

    def add_turn(self, session_id: str, question: str, answer: str, sources: List[Dict]):
        """Add a conversation turn."""
        if session_id not in self.sessions:
            self.sessions[session_id] = []

        self.sessions[session_id].append({
            "question": question,
            "answer": answer,
            "sources": sources,
            "timestamp": time.time(),
        })

        # Trim to max history
        if len(self.sessions[session_id]) > self.max_history:
            self.sessions[session_id] = self.sessions[session_id][-self.max_history:]

    def clear(self, session_id: Optional[str] = None):
        """Clear conversation history."""
        if session_id:
            self.sessions.pop(session_id, None)
        else:
            self.sessions.clear()

    def get_all_sessions(self) -> List[str]:
        """Get all active session IDs."""
        return list(self.sessions.keys())


class RAGEngine:
    """Retrieval-Augmented Generation engine for Scouting America queries."""

    def __init__(self, vector_store: VectorStore):
        self.vector_store = vector_store
        self.llm_manager = LLMManager()
        self.conversations = ConversationStore()

    def query(self, question: str, session_id: Optional[str] = None, top_k: int = 5) -> Dict:
        """Process a user question through the RAG pipeline.

        Args:
            question: User's question
            session_id: Optional session ID for conversation memory
            top_k: Number of documents to retrieve

        Returns:
            Dictionary with reply, sources, and metadata
        """
        logger.info(f"Processing query: {question} (session: {session_id})")

        # Retrieve relevant documents
        retrieved_docs = self.vector_store.search(question, top_k=top_k)

        if not retrieved_docs:
            return {
                "reply": (
                    "I don't have any Scouting America documents in my knowledge base yet. "
                    "Please run the document indexing process first. You can do this by "
                    "sending a request to the /api/index endpoint or by clicking the "
                    "'Index Documents' button in the extension settings."
                ),
                "sources": [],
                "context_used": False,
                "documents_retrieved": 0,
                "session_id": session_id,
            }

        # Build context from retrieved documents
        context = self._build_context(retrieved_docs)

        # Get conversation history
        history = self.conversations.get_history(session_id) if session_id else None

        # Generate response
        try:
            reply = self.llm_manager.generate(question, context, history)
        except Exception as e:
            logger.error(f"LLM generation failed: {e}")
            reply = self._generate_fallback(question, context, retrieved_docs)

        # Format sources
        sources = []
        seen_urls = set()
        for doc in retrieved_docs:
            if doc["url"] and doc["url"] not in seen_urls:
                seen_urls.add(doc["url"])
                sources.append({
                    "title": doc["source"],
                    "url": doc["url"],
                    "relevance": round(doc["score"], 3),
                })

        # Store conversation turn
        if session_id:
            self.conversations.add_turn(session_id, question, reply, sources)

        return {
            "reply": reply,
            "sources": sources,
            "context_used": True,
            "documents_retrieved": len(retrieved_docs),
            "session_id": session_id,
            "llm_provider": self.llm_manager.get_status()["active_provider"],
        }

    def _build_context(self, documents: List[Dict]) -> str:
        """Build a context string from retrieved documents."""
        context_parts = []
        for i, doc in enumerate(documents, 1):
            context_parts.append(
                f"[Document {i} - Source: {doc['source']} - URL: {doc.get('url', 'N/A')}]\n{doc['text'][:1000]}"
            )
        return "\n\n".join(context_parts)

    def _generate_fallback(self, question: str, context: str, documents: List[Dict]) -> str:
        """Generate a fallback response without an LLM API."""
        if not documents:
            return (
                "I'm unable to generate a response right now. "
                "Please configure an LLM (Ollama for free local use, or OpenAI API key)."
            )

        # Build a simple response from the most relevant document
        best_doc = documents[0]

        response = (
            f"Based on the {best_doc['source']}, here's what I found:\n\n"
            f"{best_doc['text'][:1200]}...\n\n"
        )

        if len(documents) > 1:
            response += "Additional relevant sources:\n"
            for doc in documents[1:3]:
                response += f"- {doc['source']}: {doc['text'][:200]}...\n"

        response += (
            "\nNote: For more detailed and synthesized answers, "
            "install Ollama (free, local) or configure an OpenAI API key."
        )

        return response

    def get_document_summary(self, source_filter: Optional[str] = None) -> Dict:
        """Get a summary of indexed documents."""
        stats = self.vector_store.get_stats()
        llm_status = self.llm_manager.get_status()

        summary = {
            "total_documents_indexed": stats["total_documents"],
            "store_type": stats["store_type"],
            "llm_available": llm_status["active_provider"] != "none",
            "llm_provider": llm_status["active_provider"],
            "llm_model": llm_status["active_provider"],
            "available_llm_providers": llm_status["available_providers"],
        }

        return summary

    def get_conversation_history(self, session_id: str) -> List[Dict]:
        """Get conversation history for a session."""
        return self.conversations.get_history(session_id)

    def clear_conversation(self, session_id: Optional[str] = None):
        """Clear conversation history."""
        self.conversations.clear(session_id)

    def get_active_sessions(self) -> List[str]:
        """Get all active conversation sessions."""
        return self.conversations.get_all_sessions()

