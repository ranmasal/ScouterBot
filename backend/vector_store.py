"""Vector store for Scouting America documents using FastEmbed + NumPy.

FastEmbed uses ONNX Runtime under the hood - no PyTorch/TensorFlow needed.
Documents are stored in-memory with NumPy arrays for embeddings.
"""

import json
import logging
import os
from typing import Dict, List, Optional

import numpy as np

from config import COLLECTION_NAME, EMBEDDING_MODEL, VECTOR_STORE_PATH

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VectorStore:
    """Manages document embeddings and similarity search using FastEmbed."""

    def __init__(self, auto_load: bool = True):
        self.embedding_model = None
        self.documents: List[Dict] = []
        self.embeddings: Optional[np.ndarray] = None
        self._init_store()
        if auto_load:
            self.load()

    def _init_store(self):
        """Initialize embedding model."""
        try:
            from fastembed import TextEmbedding

            logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
            self.embedding_model = TextEmbedding(model_name=EMBEDDING_MODEL)
            logger.info("Embedding model loaded")
        except ImportError:
            logger.error("fastembed not installed. Run: pip install fastembed")
            raise
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

    def _embed_texts(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings for a list of texts."""
        embeddings = list(self.embedding_model.embed(texts))
        return np.array(embeddings)

    def add_documents(self, documents: List[Dict]) -> int:
        """Add documents to the vector store.

        Args:
            documents: List of document chunks with 'id', 'text', 'source', 'url'

        Returns:
            Number of documents added
        """
        if not documents:
            return 0

        texts = [doc["text"] for doc in documents]
        embeddings = self._embed_texts(texts)

        self.documents.extend(documents)

        if self.embeddings is None:
            self.embeddings = embeddings
        else:
            self.embeddings = np.vstack([self.embeddings, embeddings])

        logger.info(f"Added {len(documents)} documents. Total: {len(self.documents)}")
        return len(documents)

    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        """Search for documents similar to the query.

        Args:
            query: Search query text
            top_k: Number of results to return

        Returns:
            List of relevant document chunks with metadata
        """
        if not self.documents or self.embeddings is None:
            return []

        query_embedding = self._embed_texts([query])

        # Compute cosine similarities
        similarities = self._cosine_similarity(query_embedding, self.embeddings)

        # Get top-k indices
        top_indices = np.argsort(similarities)[::-1][:top_k]

        results = []
        for idx in top_indices:
            doc = self.documents[idx]
            results.append({
                "id": doc["id"],
                "text": doc["text"],
                "source": doc.get("source", ""),
                "url": doc.get("url", ""),
                "score": float(similarities[idx]),
            })
        return results

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        """Compute cosine similarity between vectors."""
        a_norm = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-8)
        b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-8)
        return np.dot(a_norm, b_norm.T).flatten()

    def get_stats(self) -> Dict:
        """Get vector store statistics."""
        return {
            "total_documents": len(self.documents),
            "collection_name": COLLECTION_NAME,
            "store_type": "fastembed_numpy",
            "embedding_model": EMBEDDING_MODEL,
        }

    def clear(self):
        """Clear all documents from the store."""
        self.documents = []
        self.embeddings = None
        logger.info("Vector store cleared")

    def save(self, path: Optional[str] = None):
        """Save documents and embeddings to disk."""
        save_path = path or VECTOR_STORE_PATH
        os.makedirs(save_path, exist_ok=True)

        docs_path = os.path.join(save_path, "documents.json")
        with open(docs_path, "w", encoding="utf-8") as f:
            json.dump(self.documents, f, ensure_ascii=False, indent=2)

        if self.embeddings is not None:
            embeddings_path = os.path.join(save_path, "embeddings.npy")
            np.save(embeddings_path, self.embeddings)

        logger.info(f"Saved vector store to {save_path}")

    def load(self, path: Optional[str] = None):
        """Load documents and embeddings from disk."""
        load_path = path or VECTOR_STORE_PATH
        docs_path = os.path.join(load_path, "documents.json")
        embeddings_path = os.path.join(load_path, "embeddings.npy")

        if os.path.exists(docs_path):
            with open(docs_path, "r", encoding="utf-8") as f:
                self.documents = json.load(f)
            logger.info(f"Loaded {len(self.documents)} documents")

        if os.path.exists(embeddings_path):
            self.embeddings = np.load(embeddings_path)
            logger.info(f"Loaded embeddings shape: {self.embeddings.shape}")


