// Service Worker for ScouterBot

const DEFAULT_WEBHOOK_URL = 'http://localhost:8000/api/chat';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    webhookUrl: DEFAULT_WEBHOOK_URL,
    enableRag: true,
    enableScoutbookSearch: true,
    backendUrl: 'http://localhost:8000',
    scoutbookUsername: '',
    scoutbookPassword: ''
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHAT_MESSAGE') {
    handleChatMessage(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  }

  if (request.type === 'SCOUTBOOK_SEARCH') {
    handleScoutbookSearch(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'GET_SETTINGS') {
    chrome.storage.sync.get(['webhookUrl', 'enableRag', 'enableScoutbookSearch', 'backendUrl', 'scoutbookUsername'], (result) => {
      sendResponse({ success: true, data: result });
    });
    return true;
  }

  if (request.type === 'SAVE_SETTINGS') {
    chrome.storage.sync.set(request.payload, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'INDEX_DOCUMENTS') {
    indexDocuments(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'GET_BACKEND_STATUS') {
    getBackendStatus().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'GET_DOCUMENT_SOURCES') {
    getDocumentSources().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

async function handleChatMessage(payload) {
  const settings = await getSettings();
  const webhookUrl = settings.webhookUrl || DEFAULT_WEBHOOK_URL;

  if (!webhookUrl) {
    return {
      success: true,
      data: {
        reply: 'No webhook URL configured. Please open the extension settings (⚙️) and set your RAG webhook endpoint.'
      }
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: payload.message,
        session_id: payload.session_id || null,
        source: 'scouterbot_chrome_extension',
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    console.error('[ScouterBot] Webhook error:', err);
    return {
      success: false,
      error: `Webhook error: ${err.message}. Is the backend running at ${webhookUrl}?`
    };
  }
}

async function handleScoutbookSearch(payload) {
  const settings = await getSettings();
  const backendUrl = settings.backendUrl || 'http://localhost:8000';

  try {
    const response = await fetch(`${backendUrl}/api/scoutbook/search?query=${encodeURIComponent(payload.query)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    console.error('[ScouterBot] Scoutbook search error:', err);
    return {
      success: false,
      error: `Scoutbook search error: ${err.message}`
    };
  }
}

async function indexDocuments(payload) {
  const settings = await getSettings();
  const backendUrl = settings.backendUrl || 'http://localhost:8000';

  try {
    const response = await fetch(`${backendUrl}/api/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        force_refresh: payload?.forceRefresh || false,
        sources: payload?.sources || null
      })
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    console.error('[ScouterBot] Index error:', err);
    return {
      success: false,
      error: `Indexing error: ${err.message}. Is the backend running at ${backendUrl}?`
    };
  }
}

async function getBackendStatus() {
  const settings = await getSettings();
  const backendUrl = settings.backendUrl || 'http://localhost:8000';

  try {
    const response = await fetch(`${backendUrl}/api/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    console.error('[ScouterBot] Status check error:', err);
    return {
      success: false,
      error: err.message,
      offline: true
    };
  }
}

async function getDocumentSources() {
  const settings = await getSettings();
  const backendUrl = settings.backendUrl || 'http://localhost:8000';

  try {
    const response = await fetch(`${backendUrl}/api/sources`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    console.error('[ScouterBot] Sources error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([
      'webhookUrl', 'enableRag', 'enableScoutbookSearch',
      'backendUrl', 'scoutbookUsername'
    ], (result) => {
      resolve(result);
    });
  });
}

