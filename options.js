document.addEventListener('DOMContentLoaded', () => {
  const backendUrlInput = document.getElementById('backend-url');
  const webhookInput = document.getElementById('webhook-url');
  const ollamaUrlInput = document.getElementById('ollama-url');
  const ollamaModelInput = document.getElementById('ollama-model');
  const enableRagCheckbox = document.getElementById('enable-rag');
  const enableScoutbookCheckbox = document.getElementById('enable-scoutbook');
  const scoutbookUsernameInput = document.getElementById('scoutbook-username');
  const scoutbookPasswordInput = document.getElementById('scoutbook-password');
  const githubRepoUrlInput = document.getElementById('github-repo-url');
  const githubTokenInput = document.getElementById('github-token');
  const troopNumberInput = document.getElementById('troop-number');
  const saveBtn = document.getElementById('save-btn');
  const testConnectionBtn = document.getElementById('test-connection-btn');
  const testGitHubBtn = document.getElementById('test-github-btn');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const statusEl = document.getElementById('status');

  // Load current settings
  chrome.storage.sync.get([
    'webhookUrl', 'enableRag', 'enableScoutbookSearch',
    'backendUrl', 'scoutbookUsername', 'scoutbookPassword',
    'ollamaUrl', 'ollamaModel',
    'githubRepoUrl', 'githubToken', 'troopNumber'
  ], (result) => {
    backendUrlInput.value = result.backendUrl || 'http://localhost:8000';
    webhookInput.value = result.webhookUrl || '';
    ollamaUrlInput.value = result.ollamaUrl || '';
    ollamaModelInput.value = result.ollamaModel || '';
    enableRagCheckbox.checked = result.enableRag !== false;
    enableScoutbookCheckbox.checked = result.enableScoutbookSearch !== false;
    scoutbookUsernameInput.value = result.scoutbookUsername || '';
    scoutbookPasswordInput.value = result.scoutbookPassword || '';
    githubRepoUrlInput.value = result.githubRepoUrl || '';
    githubTokenInput.value = result.githubToken || '';
    troopNumberInput.value = result.troopNumber || '';
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
      githubRepoUrl: githubRepoUrlInput.value.trim(),
      githubToken: githubTokenInput.value.trim(),
      troopNumber: troopNumberInput.value.trim()
    };

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
    showStatus('Testing backend connection...');

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

  testGitHubBtn.addEventListener('click', async () => {
    const repoUrl = githubRepoUrlInput.value.trim();
    const token = githubTokenInput.value.trim();

    if (!repoUrl || !token) {
      showStatus('Please enter both GitHub repo URL and token.', true);
      return;
    }

    showStatus('Testing GitHub connection...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_GITHUB_CONNECTION',
        payload: { repoUrl, token }
      });

      if (response && response.success) {
        showStatus(`✅ GitHub connected! Repo: ${response.data.owner}/${response.data.repo}`);
      } else {
        showStatus(`❌ GitHub error: ${response?.error || 'Unknown error'}`, true);
      }
    } catch (err) {
      showStatus(`❌ Error: ${err.message}`, true);
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

