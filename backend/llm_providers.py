"""Unified LLM provider interface for ScouterBot.

Supports multiple backends:
- Ollama (local, free, no API key)
- OpenAI (cloud, requires API key)
- Fallback (no LLM, returns raw document snippets)
"""

import json
import logging
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import requests

from config import (
    LLM_MODEL,
    LLM_PROVIDER,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_TIMEOUT,
    OPENAI_API_KEY,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are ScouterBot, an AI assistant for Scouting America Adult Leaders. "
    "You provide accurate, helpful information based on official Scouting America "
    "documents. Always cite your sources when possible. If you're unsure about "
    "something, say so rather than making up information. "
    "Be concise but thorough in your responses. "
    "Answer based ONLY on the provided documents."
)


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this provider is available."""
        pass

    @abstractmethod
    def generate(self, question: str, context: str, history: Optional[List[Dict]] = None) -> str:
        """Generate a response given question and context."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name."""
        pass


class OllamaProvider(BaseLLMProvider):
    """Local LLM via Ollama (http://localhost:11434)."""

    def __init__(self):
        self.base_url = OLLAMA_BASE_URL.rstrip("/")
        self.model = OLLAMA_MODEL
        self.timeout = OLLAMA_TIMEOUT
        self._available = None

    @property
    def name(self) -> str:
        return f"ollama/{self.model}"

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            self._available = resp.status_code == 200
            if self._available:
                logger.info(f"Ollama available at {self.base_url}")
            return self._available
        except Exception as e:
            logger.debug(f"Ollama not available: {e}")
            self._available = False
            return False

    def generate(self, question: str, context: str, history: Optional[List[Dict]] = None) -> str:
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if history:
            for turn in history[-6:]:  # Keep last 6 turns for context
                messages.append({"role": "user", "content": turn.get("question", "")})
                messages.append({"role": "assistant", "content": turn.get("answer", "")})

        user_prompt = (
            f"Based on the following official Scouting America documents, "
            f"please answer this question:\n\n"
            f"Question: {question}\n\n"
            f"Relevant Documents:\n{context}\n\n"
            f"Please provide a clear, accurate answer."
        )
        messages.append({"role": "user", "content": user_prompt})

        try:
            resp = requests.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": 800},
                },
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "")
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            raise


class OpenAIProvider(BaseLLMProvider):
    """OpenAI API provider."""

    def __init__(self):
        self.api_key = OPENAI_API_KEY
        self.model = LLM_MODEL
        self._client = None
        self._available = None

    @property
    def name(self) -> str:
        return f"openai/{self.model}"

    def is_available(self) -> bool:
        if self._available is not None:
            return self._available
        self._available = bool(self.api_key)
        if self._available:
            try:
                from openai import OpenAI
                self._client = OpenAI(api_key=self.api_key)
                logger.info("OpenAI client initialized")
            except ImportError:
                logger.warning("OpenAI package not installed")
                self._available = False
        return self._available

    def generate(self, question: str, context: str, history: Optional[List[Dict]] = None) -> str:
        if not self._client:
            raise RuntimeError("OpenAI client not initialized")

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if history:
            for turn in history[-6:]:
                messages.append({"role": "user", "content": turn.get("question", "")})
                messages.append({"role": "assistant", "content": turn.get("answer", "")})

        user_prompt = (
            f"Based on the following official Scouting America documents, "
            f"please answer this question:\n\n"
            f"Question: {question}\n\n"
            f"Relevant Documents:\n{context}\n\n"
            f"Please provide a clear, accurate answer."
        )
        messages.append({"role": "user", "content": user_prompt})

        try:
            response = self._client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=1000,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI generation failed: {e}")
            raise


class FallbackProvider(BaseLLMProvider):
    """Fallback provider when no LLM is available - returns raw snippets."""

    @property
    def name(self) -> str:
        return "fallback"

    def is_available(self) -> bool:
        return True

    def generate(self, question: str, context: str, history: Optional[List[Dict]] = None) -> str:
        # Extract the documents from context
        lines = context.split("\n")
        # Find document sections
        docs = []
        current_doc = []
        for line in lines:
            if line.startswith("[Document"):
                if current_doc:
                    docs.append("\n".join(current_doc))
                current_doc = [line]
            else:
                current_doc.append(line)
        if current_doc:
            docs.append("\n".join(current_doc))

        if not docs:
            return "I found some relevant documents but couldn't extract the text properly."

        best_doc = docs[0]
        # Extract the text after the header line
        doc_lines = best_doc.split("\n")
        header = doc_lines[0] if doc_lines else ""
        text = "\n".join(doc_lines[1:]) if len(doc_lines) > 1 else best_doc

        response = f"Based on {header}, here's what I found:\n\n{text[:1200]}"

        if len(docs) > 1:
            response += "\n\nAdditional relevant sources:\n"
            for doc in docs[1:3]:
                doc_lines = doc.split("\n")
                header = doc_lines[0] if doc_lines else ""
                text_preview = " ".join(doc_lines[1:3]) if len(doc_lines) > 1 else ""
                response += f"- {header}: {text_preview[:150]}...\n"

        response += (
            "\n\nNote: For more detailed and synthesized answers, "
            "configure an LLM (Ollama for free local use, or OpenAI API key)."
        )

        return response


class LLMManager:
    """Manages LLM providers with automatic fallback."""

    def __init__(self):
        self.providers = {
            "ollama": OllamaProvider(),
            "openai": OpenAIProvider(),
            "none": FallbackProvider(),
        }
        self.active_provider: Optional[BaseLLMProvider] = None
        self._select_provider()

    def _select_provider(self):
        """Select the best available provider based on config."""
        preferred = LLM_PROVIDER.lower()

        # Check preferred provider first
        if preferred in self.providers:
            provider = self.providers[preferred]
            if provider.is_available():
                self.active_provider = provider
                logger.info(f"Using LLM provider: {provider.name}")
                return
            else:
                logger.warning(f"Preferred provider '{preferred}' not available")

        # Auto-select from available providers
        for name, provider in self.providers.items():
            if name != "none" and provider.is_available():
                self.active_provider = provider
                logger.info(f"Auto-selected LLM provider: {provider.name}")
                return

        # Fallback
        self.active_provider = self.providers["none"]
        logger.info("No LLM available - using fallback provider")

    def generate(self, question: str, context: str, history: Optional[List[Dict]] = None) -> str:
        """Generate response using active provider."""
        if not self.active_provider:
            raise RuntimeError("No LLM provider available")

        try:
            return self.active_provider.generate(question, context, history)
        except Exception as e:
            logger.error(f"Generation failed with {self.active_provider.name}: {e}")
            # Try fallback
            if self.active_provider.name != "fallback":
                logger.info("Falling back to raw document snippets")
                return self.providers["none"].generate(question, context, history)
            raise

    def get_status(self) -> Dict:
        """Get provider status."""
        return {
            "active_provider": self.active_provider.name if self.active_provider else "none",
            "available_providers": [
                name for name, p in self.providers.items() if p.is_available()
            ],
        }

