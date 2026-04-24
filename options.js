document.addEventListener('DOMContentLoaded', () => {
  const backendUrlInput = document.getElementById('backend-url');
  const webhookInput = document.getElementById('webhook-url');
  const ollamaUrlInput = document.getElementById('ollama-url');
  const ollamaModelInput = document.getElementById('ollama-model');
  const enableRagCheckbox = document.getElementById('enable-rag');
  const enableScoutbookCheckbox = document.getElementById('enable-scoutbook');
  const scoutbookUsernameInput = document.getElementById('scoutbook-username');
  const scoutbookPasswordInput = document.getElementById('scoutbook-password');
  const saveBtn = document.getElementById('save-btn');
  const testConnectionBtn = document.getElementById('test-connection-btn');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const statusEl = document.getElementById('status');

  // Load current settings
  chrome.storage.sync.get([
    'webhookUrl', 'enableRag', 'enableScoutbookSearch',
    'backendUrl', 'scoutbookUsername', 'scoutbookPassword',
    'ollamaUrl', 'ollamaModel'
  ], (result) => {
    backendUrlInput.value = result.backendUrl || 'http://localhost:8000';
    webhookInput.value = result.webhookUrl || '';
    ollamaUrlInput.value = result.ollamaUrl || '';
    ollamaModelInput.value = result.ollamaModel || '';
    enableRagCheckbox.checked = result.enableRag !== false;
    enableScoutbookCheckbox.checked = result.enableScoutbookSearch !== false;
    scoutbookUsernameInput.value = result.scoutbookUsername || '';
    scoutbookPasswordInput.value = result.scoutbookPassword || '';
  });

  saveBtn.addEventListener('click', () => {
    const settings = {
      backendUrl: backendUrlInput.value.trim(),
      webhookUrl: webhookInput.value.trim(),
      ollamaUrl: ollamaUrlInput.value.trim(),
      ollamaModel: ollamaModelInput.value.trim(),
      enableRag: enableRagCheckbox.checked,
      enableScoutbookSearch: enableScoutbookCheckbox.checked,
      scoutbookUsername: scoutbookUsernameInput.value.trim(),
      scoutbookPassword: scoutbookPasswordInput.value,
    };

    // Auto-populate webhook URL from backend URL if not set
    if (settings.backendUrl && !settings.webhookUrl) {
      settings.webhookUrl = `${settings.backendUrl}/api/chat`;
    }

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: settings }, (response) => {
      if (response && response.success) {
        showStatus('Settings saved successfully.');
      } else {
        showStatus('Failed to save settings.', true);
      }
    });
  });

  testConnectionBtn.addEventListener('click', async () => {
    const backendUrl = backendUrlInput.value.trim() || 'http://localhost:8000';
    showStatus('Testing connection...');

    try {
      const response = await fetch(`${backendUrl}/api/status`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        showStatus(
          `✅ Backend connected! ${data.documents_indexed || 0} documents indexed. ` +
          `LLM: ${data.llm_available ? 'Available' : 'Not configured'}`,
          false
        );
      } else {
        showStatus(`❌ Backend returned error: ${response.status}`, true);
      }
    } catch (err) {
      showStatus(`❌ Connection failed: ${err.message}. Is the backend running?`, true);
    }
  });

  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['chatHistory', 'scouterbotSessionId'], () => {
      showStatus('Chat history and conversation session cleared.');
    });
  });

  function showStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.style.color = isError ? 'red' : 'green';
    setTimeout(() => {
      statusEl.textContent = '';
    }, 5000);
  }
});

