document.addEventListener('DOMContentLoaded', () => {
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const optionsBtn = document.getElementById('open-options');
  const scoutbookBtn = document.getElementById('search-scoutbook');
  const backendStatusEl = document.getElementById('backend-status');
  const indexBtn = document.getElementById('index-btn');
  const sourcesBtn = document.getElementById('sources-btn');
  const indexModal = document.getElementById('index-modal');
  const sourcesModal = document.getElementById('sources-modal');
  const startIndexBtn = document.getElementById('start-index');
  const forceIndexBtn = document.getElementById('force-index');
  const closeIndexBtn = document.getElementById('close-index');
  const closeSourcesBtn = document.getElementById('close-sources');
  const indexStatusEl = document.getElementById('index-status');
  const sourcesListEl = document.getElementById('sources-list');

  let isTyping = false;
  let sessionId = null;

  // Get or create session ID for conversation memory
  chrome.storage.local.get(['scouterbotSessionId'], (result) => {
    if (result.scouterbotSessionId) {
      sessionId = result.scouterbotSessionId;
    } else {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      chrome.storage.local.set({ scouterbotSessionId: sessionId });
    }
  });

  // Load existing chat history
  chrome.storage.local.get(['chatHistory'], (result) => {
    const history = result.chatHistory || [];
    history.forEach((msg) => appendMessage(msg.role, msg.content));
  });

  // Check backend status on popup open
  checkBackendStatus();

  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.classList.add('message', role);
    div.textContent = text;
    messagesEl.appendChild(div);
    scrollToBottom();
    return div;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.id = 'typing';
    div.classList.add('message', 'bot', 'typing-indicator');
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    scrollToBottom();
  }

  function hideTyping() {
    const el = document.getElementById('typing');
    if (el) el.remove();
  }

  function scrollToBottom() {
    const container = document.getElementById('chat-container');
    container.scrollTop = container.scrollHeight;
  }

  function saveHistory(role, content) {
    chrome.storage.local.get(['chatHistory'], (result) => {
      const history = result.chatHistory || [];
      history.push({ role, content, timestamp: Date.now() });
      // Keep last 100 messages
      if (history.length > 100) history.shift();
      chrome.storage.local.set({ chatHistory: history });
    });
  }

  async function checkBackendStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_STATUS' });
      if (response && response.success) {
        backendStatusEl.classList.remove('offline', 'unknown');
        backendStatusEl.classList.add('online');
        backendStatusEl.title = `Backend Online - ${response.data.documents_indexed || 0} documents indexed`;
      } else {
        backendStatusEl.classList.remove('online', 'unknown');
        backendStatusEl.classList.add('offline');
        backendStatusEl.title = 'Backend Offline - Is the server running?';
      }
    } catch (err) {
      backendStatusEl.classList.remove('online', 'unknown');
      backendStatusEl.classList.add('offline');
      backendStatusEl.title = 'Backend Offline - ' + err.message;
    }
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isTyping) return;

    appendMessage('user', text);
    saveHistory('user', text);
    inputEl.value = '';
    isTyping = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_MESSAGE',
        payload: { message: text, session_id: sessionId }
      });

      hideTyping();

      if (response && response.success) {
        appendMessage('bot', response.data.reply || 'No response');
        saveHistory('bot', response.data.reply || 'No response');

        // Show sources if available
        if (response.data.sources && response.data.sources.length > 0) {
          const sourcesDiv = document.createElement('div');
          sourcesDiv.classList.add('message', 'bot');
          sourcesDiv.style.fontSize = '12px';
          sourcesDiv.style.opacity = '0.8';
          let sourcesText = '📚 Sources:\n';
          response.data.sources.forEach(src => {
            sourcesText += `• ${src.title} (relevance: ${src.relevance})\n`;
          });
          sourcesDiv.textContent = sourcesText;
          messagesEl.appendChild(sourcesDiv);
          scrollToBottom();
        }
      } else {
        const errText = response?.error || 'Something went wrong. Please try again.';
        appendMessage('error', errText);
      }
    } catch (err) {
      hideTyping();
      appendMessage('error', err.message || 'Failed to reach the assistant.');
    } finally {
      isTyping = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  // Indexing modal handlers
  indexBtn.addEventListener('click', () => {
    indexModal.classList.remove('hidden');
  });

  closeIndexBtn.addEventListener('click', () => {
    indexModal.classList.add('hidden');
  });

  startIndexBtn.addEventListener('click', async () => {
    indexStatusEl.textContent = 'Indexing in progress... This may take a few minutes.';
    startIndexBtn.disabled = true;
    forceIndexBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'INDEX_DOCUMENTS',
        payload: { forceRefresh: false }
      });

      if (response && response.success) {
        indexStatusEl.textContent = `✅ Indexing complete! ${response.data.documents_indexed} documents indexed from: ${response.data.sources_processed.join(', ')}`;
        checkBackendStatus();
      } else {
        indexStatusEl.textContent = `❌ Indexing failed: ${response?.error || 'Unknown error'}`;
      }
    } catch (err) {
      indexStatusEl.textContent = `❌ Error: ${err.message}`;
    } finally {
      startIndexBtn.disabled = false;
      forceIndexBtn.disabled = false;
    }
  });

  forceIndexBtn.addEventListener('click', async () => {
    if (!confirm('This will clear all existing documents and re-index from scratch. Continue?')) {
      return;
    }

    indexStatusEl.textContent = 'Force re-indexing in progress... This may take several minutes.';
    startIndexBtn.disabled = true;
    forceIndexBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'INDEX_DOCUMENTS',
        payload: { forceRefresh: true }
      });

      if (response && response.success) {
        indexStatusEl.textContent = `✅ Re-indexing complete! ${response.data.documents_indexed} documents indexed.`;
        checkBackendStatus();
      } else {
        indexStatusEl.textContent = `❌ Re-indexing failed: ${response?.error || 'Unknown error'}`;
      }
    } catch (err) {
      indexStatusEl.textContent = `❌ Error: ${err.message}`;
    } finally {
      startIndexBtn.disabled = false;
      forceIndexBtn.disabled = false;
    }
  });

  // Sources modal handlers
  sourcesBtn.addEventListener('click', async () => {
    sourcesModal.classList.remove('hidden');
    sourcesListEl.innerHTML = '<p>Loading sources...</p>';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DOCUMENT_SOURCES' });
      if (response && response.success) {
        sourcesListEl.innerHTML = '';
        response.data.sources.forEach(source => {
          const item = document.createElement('div');
          item.classList.add('source-item');
          item.innerHTML = `
            <div class="source-name">${escapeHtml(source.name)}</div>
            <div class="source-url">${escapeHtml(source.url)}</div>
            <div style="color:#888; font-size:11px; margin-top:4px;">${escapeHtml(source.description)}</div>
          `;
          sourcesListEl.appendChild(item);
        });
      } else {
        sourcesListEl.innerHTML = `<p>Error: ${escapeHtml(response?.error || 'Failed to load sources')}</p>`;
      }
    } catch (err) {
      sourcesListEl.innerHTML = `<p>Error: ${escapeHtml(err.message)}</p>`;
    }
  });

  closeSourcesBtn.addEventListener('click', () => {
    sourcesModal.classList.add('hidden');
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  scoutbookBtn.addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://advancements.scouting.org/'
    });
  });

  // Recheck backend status periodically while popup is open
  setInterval(checkBackendStatus, 30000);
});

