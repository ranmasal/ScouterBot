"""Document fetcher for Scouting America resources.

Handles scraping of Scouting America websites, Cloudflare challenges,
and PDF downloads from the filestore.
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import aiohttp
import requests
from bs4 import BeautifulSoup

# Optional imports - may not be available in all environments
try:
    import cloudscraper
    HAS_CLOUDSCRAPER = True
except ImportError:
    HAS_CLOUDSCRAPER = False

try:
    from playwright.async_api import async_playwright
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

from config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    DOCUMENT_SOURCES,
    FILESTORE_BASE,
    KNOWN_PDF_URLS,
    REQUEST_DELAY,
    REQUEST_TIMEOUT,
)

# Feature flags (no longer in config.py since packages are optional)
USE_CLOUDSCRAPER = HAS_CLOUDSCRAPER
USE_PLAYWRIGHT = HAS_PLAYWRIGHT

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class DocumentFetcher:
    """Fetches and processes Scouting America documents."""

    def __init__(self):
        self.session = None
        self.cloud_scraper = None
        self.playwright = None
        self.browser = None
        self.cache_dir = Path("./document_cache")
        self.cache_dir.mkdir(exist_ok=True)

        if HAS_CLOUDSCRAPER and USE_CLOUDSCRAPER:
            self.cloud_scraper = cloudscraper.create_scraper()
            logger.info("Cloudscraper initialized")

    async def __aenter__(self):
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": (
                    "text/html,application/xhtml+xml,application/xml;"
                    "q=0.9,image/webp,*/*;q=0.8"
                ),
                "Accept-Language": "en-US,en;q=0.5",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
            },
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    def _get_cache_path(self, url: str) -> Path:
        """Get cache file path for a URL."""
        url_hash = hashlib.md5(url.encode()).hexdigest()
        return self.cache_dir / f"{url_hash}.json"

    def _load_from_cache(self, url: str) -> Optional[Dict]:
        """Load document from cache if available and recent (< 7 days)."""
        cache_path = self._get_cache_path(url)
        if cache_path.exists():
            age = time.time() - cache_path.stat().st_mtime
            if age < 7 * 24 * 3600:  # 7 days
                try:
                    with open(cache_path, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception as e:
                    logger.warning(f"Failed to load cache for {url}: {e}")
        return None

    def _save_to_cache(self, url: str, data: Dict):
        """Save document to cache."""
        cache_path = self._get_cache_path(url)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Failed to cache {url}: {e}")

    async def fetch_with_cloudscraper(self, url: str) -> Optional[str]:
        """Fetch using cloudscraper to bypass Cloudflare."""
        if not self.cloud_scraper:
            return None
        try:
            logger.info(f"Fetching with cloudscraper: {url}")
            response = self.cloud_scraper.get(url, timeout=REQUEST_TIMEOUT)
            if response.status_code == 200:
                return response.text
            else:
                logger.warning(f"Cloudscraper returned {response.status_code} for {url}")
        except Exception as e:
            logger.warning(f"Cloudscraper failed for {url}: {e}")
        return None

    async def fetch_with_playwright(self, url: str) -> Optional[str]:
        """Fetch using Playwright browser automation."""
        if not HAS_PLAYWRIGHT or not USE_PLAYWRIGHT:
            return None
        try:
            logger.info(f"Fetching with playwright: {url}")
            if not self.playwright:
                self.playwright = await async_playwright().start()
                self.browser = await self.playwright.chromium.launch(headless=True)

            context = await self.browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                )
            )
            page = await context.new_page()
            await page.goto(url, wait_until="networkidle", timeout=REQUEST_TIMEOUT * 1000)
            content = await page.content()
            await context.close()
            return content
        except Exception as e:
            logger.warning(f"Playwright failed for {url}: {e}")
        return None

    async def fetch_with_aiohttp(self, url: str) -> Optional[str]:
        """Fetch using aiohttp."""
        try:
            logger.info(f"Fetching with aiohttp: {url}")
            async with self.session.get(url) as response:
                if response.status == 200:
                    return await response.text()
                else:
                    logger.warning(f"aiohttp returned {response.status} for {url}")
        except Exception as e:
            logger.warning(f"aiohttp failed for {url}: {e}")
        return None

    async def fetch_url(self, url: str) -> Optional[str]:
        """Fetch URL with multiple fallback strategies."""
        # Check cache first
        cached = self._load_from_cache(url)
        if cached and "html" in cached:
            logger.info(f"Using cached content for {url}")
            return cached["html"]

        content = None

        # Try cloudscraper first (best for Cloudflare)
        if not content and HAS_CLOUDSCRAPER and USE_CLOUDSCRAPER:
            content = await self.fetch_with_cloudscraper(url)
            await asyncio.sleep(REQUEST_DELAY)

        # Try aiohttp
        if not content:
            content = await self.fetch_with_aiohttp(url)
            await asyncio.sleep(REQUEST_DELAY)

        # Try playwright as last resort
        if not content and HAS_PLAYWRIGHT and USE_PLAYWRIGHT:
            content = await self.fetch_with_playwright(url)
            await asyncio.sleep(REQUEST_DELAY)

        if content:
            self._save_to_cache(url, {"html": content, "url": url})

        return content

    def extract_text_from_html(self, html: str, url: str) -> str:
        """Extract clean text from HTML."""
        soup = BeautifulSoup(html, "lxml")

        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.decompose()

        # Try to find main content area
        main_content = (
            soup.find("main")
            or soup.find("article")
            or soup.find("div", class_=re.compile("content|main", re.I))
            or soup.find("div", role="main")
        )

        if main_content:
            text = main_content.get_text(separator="\n", strip=True)
        else:
            text = soup.get_text(separator="\n", strip=True)

        # Clean up whitespace
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        return "\n".join(lines)

    def find_pdf_links(self, html: str, base_url: str) -> List[str]:
        """Find PDF links in HTML content."""
        soup = BeautifulSoup(html, "lxml")
        pdf_links = []

        for link in soup.find_all("a", href=True):
            href = link["href"]
            if href.lower().endswith(".pdf"):
                full_url = urljoin(base_url, href)
                pdf_links.append(full_url)

        # Also look for links containing filestore
        for link in soup.find_all("a", href=True):
            href = link["href"]
            if FILESTORE_BASE in href:
                full_url = urljoin(base_url, href)
                if full_url not in pdf_links:
                    pdf_links.append(full_url)

        return list(set(pdf_links))

    async def download_pdf(self, url: str) -> Optional[bytes]:
        """Download a PDF file."""
        cache_path = self.cache_dir / f"{hashlib.md5(url.encode()).hexdigest()}.pdf"

        if cache_path.exists():
            age = time.time() - cache_path.stat().st_mtime
            if age < 30 * 24 * 3600:  # 30 days for PDFs
                logger.info(f"Using cached PDF: {url}")
                with open(cache_path, "rb") as f:
                    return f.read()

        try:
            logger.info(f"Downloading PDF: {url}")

            if self.cloud_scraper:
                response = self.cloud_scraper.get(url, timeout=REQUEST_TIMEOUT)
                if response.status_code == 200:
                    content = response.content
                    with open(cache_path, "wb") as f:
                        f.write(content)
                    return content
            else:
                async with self.session.get(url) as response:
                    if response.status == 200:
                        content = await response.read()
                        with open(cache_path, "wb") as f:
                            f.write(content)
                        return content
        except Exception as e:
            logger.warning(f"Failed to download PDF {url}: {e}")

        return None

    def chunk_text(self, text: str, source: str, url: str) -> List[Dict]:
        """Split text into overlapping chunks."""
        chunks = []
        start = 0
        chunk_id = 0

        while start < len(text):
            end = min(start + CHUNK_SIZE, len(text))

            # Try to end at a sentence or paragraph boundary
            if end < len(text):
                # Look for paragraph break
                para_break = text.rfind("\n\n", start, end)
                if para_break != -1 and para_break > start + CHUNK_SIZE // 2:
                    end = para_break + 2
                else:
                    # Look for sentence break
                    sentence_break = text.rfind(". ", start, end)
                    if sentence_break != -1 and sentence_break > start + CHUNK_SIZE // 2:
                        end = sentence_break + 2

            chunk_text_content = text[start:end].strip()
            if chunk_text_content:
                chunks.append({
                    "id": f"{source}_{chunk_id}",
                    "text": chunk_text_content,
                    "source": source,
                    "url": url,
                    "chunk_index": chunk_id,
                })
                chunk_id += 1

            start = end - CHUNK_OVERLAP
            if start >= end:
                start = end

        return chunks

    async def fetch_source(self, source_key: str, source_config: Dict) -> List[Dict]:
        """Fetch and process a single document source."""
        url = source_config["url"]
        name = source_config["name"]

        logger.info(f"Processing source: {name} ({url})")

        html = await self.fetch_url(url)
        if not html:
            logger.error(f"Failed to fetch {name}")
            return []

        # Extract text from main page
        text = self.extract_text_from_html(html, url)
        all_chunks = []

        if text:
            chunks = self.chunk_text(text, source_key, url)
            all_chunks.extend(chunks)
            logger.info(f"Extracted {len(chunks)} chunks from {name} main page")

        # Find and process PDF links
        pdf_links = self.find_pdf_links(html, url)
        logger.info(f"Found {len(pdf_links)} PDF links on {name}")

        for pdf_url in pdf_links[:5]:  # Limit to first 5 PDFs per source
            try:
                pdf_content = await self.download_pdf(pdf_url)
                if pdf_content:
                    pdf_text = await self.extract_text_from_pdf(pdf_content)
                    if pdf_text:
                        pdf_chunks = self.chunk_text(
                            pdf_text, f"{source_key}_pdf", pdf_url
                        )
                        all_chunks.extend(pdf_chunks)
                        logger.info(
                            f"Extracted {len(pdf_chunks)} chunks from PDF: {pdf_url}"
                        )
            except Exception as e:
                logger.warning(f"Failed to process PDF {pdf_url}: {e}")

            await asyncio.sleep(REQUEST_DELAY)

        return all_chunks

    async def extract_text_from_pdf(self, pdf_bytes: bytes) -> Optional[str]:
        """Extract text from PDF bytes."""
        try:
            from pypdf import PdfReader
            import io

            reader = PdfReader(io.BytesIO(pdf_bytes))
            text_parts = []

            for page in reader.pages:
                try:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                except Exception as e:
                    logger.warning(f"Failed to extract text from PDF page: {e}")

            return "\n".join(text_parts)
        except Exception as e:
            logger.warning(f"Failed to parse PDF: {e}")
            return None

    async def fetch_all_sources(self) -> List[Dict]:
        """Fetch and process all configured sources."""
        all_chunks = []

        for source_key, source_config in DOCUMENT_SOURCES.items():
            try:
                chunks = await self.fetch_source(source_key, source_config)
                all_chunks.extend(chunks)
            except Exception as e:
                logger.error(f"Failed to process source {source_key}: {e}")

        logger.info(f"Total chunks collected: {len(all_chunks)}")
        return all_chunks

    async def get_guide_to_safe_scouting_pdf_url(self) -> Optional[str]:
        """Specifically fetch the latest Guide to Safe Scouting PDF URL."""
        html = await self.fetch_url(DOCUMENT_SOURCES["guide_to_safe_scouting"]["url"])
        if not html:
            return None

        soup = BeautifulSoup(html, "lxml")

        # Look for PDF links related to Guide to Safe Scouting
        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            text = link.get_text(strip=True).lower()

            if ".pdf" in href.lower() and ("safe" in text or "gss" in text or "guide to safe" in text):
                return urljoin(DOCUMENT_SOURCES["guide_to_safe_scouting"]["url"], href)

            # Also check for filestore links
            if FILESTORE_BASE in href:
                return href if href.startswith("http") else urljoin("https://www.scouting.org", href)

        return None

    async def get_guide_to_advancement_pdf_url(self) -> Optional[str]:
        """Specifically fetch the latest Guide to Advancement PDF URL."""
        html = await self.fetch_url(DOCUMENT_SOURCES["guide_to_advancement"]["url"])
        if not html:
            return None

        soup = BeautifulSoup(html, "lxml")

        for link in soup.find_all("a", href=True):
            href = link.get("href", "")
            text = link.get_text(strip=True).lower()

            if ".pdf" in href.lower() and ("advancement" in text or "guide to advancement" in text):
                return urljoin(DOCUMENT_SOURCES["guide_to_advancement"]["url"], href)

            if FILESTORE_BASE in href:
                return href if href.startswith("http") else urljoin("https://www.scouting.org", href)

        return None

