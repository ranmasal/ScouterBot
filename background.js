// Service Worker for ScouterBot

const DEFAULT_WEBHOOK_URL = 'http://localhost:8000/api/chat';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    webhookUrl: DEFAULT_WEBHOOK_URL,
    enableRag: true,
    enableScoutbookSearch: true,
    backendUrl: 'http://localhost:8000',
    scoutbookUsername: '',
    githubRepoUrl: '',
    githubToken: '',
    setupComplete: false
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHAT_MESSAGE') {
    handleChatMessage(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'SCOUTBOOK_SEARCH') {
    handleScoutbookSearch(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'GET_SETTINGS') {
    chrome.storage.sync.get([
      'webhookUrl', 'enableRag', 'enableScoutbookSearch',
      'backendUrl', 'scoutbookUsername', 'githubRepoUrl', 'githubToken'
    ], (result) => {
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

  // ─── GITHUB / INVENTORY HANDLERS ───

  if (request.type === 'TEST_GITHUB_CONNECTION') {
    testGitHubConnection(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'GET_INVENTORY') {
    getInventory().then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'UPDATE_INVENTORY_ITEM') {
    updateInventoryItem(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.type === 'RECORD_ORDER') {
    recordOrder(request.payload).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// ════════════════════════════════════════════
//  EXISTING HANDLERS
// ════════════════════════════════════════════

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

// ════════════════════════════════════════════
//  GITHUB / INVENTORY HANDLERS
// ════════════════════════════════════════════

async function testGitHubConnection(payload) {
  const { repoUrl, token } = payload;
  const { owner, repo } = parseRepoUrl(repoUrl);

  try {
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ScouterBot/1.0'
      }
    });

    if (!repoResponse.ok) {
      const err = await repoResponse.json();
      throw new Error(err.message || `GitHub API error: ${repoResponse.status}`);
    }

    await ensureInventoryFile(owner, repo, token);
    return { success: true, data: { owner, repo } };
  } catch (err) {
    console.error('[ScouterBot] GitHub test error:', err);
    return { success: false, error: err.message };
  }
}

async function getInventory() {
  const settings = await getSettings();
  const { githubRepoUrl, githubToken } = settings;

  if (!githubRepoUrl || !githubToken) {
    return { success: false, error: 'GitHub not configured. Run the setup wizard.' };
  }

  const { owner, repo } = parseRepoUrl(githubRepoUrl);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/inventory.json`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ScouterBot/1.0'
        }
      }
    );

    if (response.status === 404) {
      await ensureInventoryFile(owner, repo, githubToken);
      return { success: true, data: { items: [], last_updated: new Date().toISOString() } };
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const fileData = await response.json();
    const content = JSON.parse(atob(fileData.content));
    content._sha = fileData.sha;
    return { success: true, data: content };
  } catch (err) {
    console.error('[ScouterBot] Get inventory error:', err);
    return { success: false, error: err.message };
  }
}

async function updateInventoryItem(payload) {
  const settings = await getSettings();
  const { githubRepoUrl, githubToken } = settings;

  if (!githubRepoUrl || !githubToken) {
    return { success: false, error: 'GitHub not configured.' };
  }

  const { owner, repo } = parseRepoUrl(githubRepoUrl);

  try {
    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/inventory.json`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ScouterBot/1.0'
        }
      }
    );

    let inventory = { items: [], last_updated: new Date().toISOString() };
    let sha = null;

    if (getResponse.ok) {
      const fileData = await getResponse.json();
      inventory = JSON.parse(atob(fileData.content));
      sha = fileData.sha;
    }

    const item = payload.item;
    const existingIndex = inventory.items.findIndex(i => i.id === item.id);

    if (existingIndex >= 0) {
      inventory.items[existingIndex] = { ...inventory.items[existingIndex], ...item };
    } else {
      inventory.items.push(item);
    }

    inventory.last_updated = new Date().toISOString();

    const updateResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/inventory.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'ScouterBot/1.0'
        },
        body: JSON.stringify({
          message: `Update inventory: ${item.name}`,
          content: btoa(JSON.stringify(inventory, null, 2)),
          sha: sha
        })
      }
    );

    if (!updateResponse.ok) {
      const err = await updateResponse.json();
      throw new Error(err.message || `GitHub update error: ${updateResponse.status}`);
    }

    return { success: true, data: inventory };
  } catch (err) {
    console.error('[ScouterBot] Update inventory error:', err);
    return { success: false, error: err.message };
  }
}

async function recordOrder(payload) {
  const settings = await getSettings();
  const { githubRepoUrl, githubToken } = settings;

  if (!githubRepoUrl || !githubToken) {
    return { success: false, error: 'GitHub not configured.' };
  }

  const { owner, repo } = parseRepoUrl(githubRepoUrl);
  const { itemId, quantity, reason, itemName } = payload;

  try {
    const getResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/inventory.json`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ScouterBot/1.0'
        }
      }
    );

    let inventory = { items: [], last_updated: new Date().toISOString() };
    let sha = null;

    if (getResponse.ok) {
      const fileData = await getResponse.json();
      inventory = JSON.parse(atob(fileData.content));
      sha = fileData.sha;
    }

    const itemIndex = inventory.items.findIndex(i => i.id === itemId);
    if (itemIndex >= 0) {
      inventory.items[itemIndex].on_order = (inventory.items[itemIndex].on_order || 0) + quantity;
    }

    const orderEntry = {
      id: 'order_' + Date.now(),
      item_id: itemId,
      item_name: itemName,
      quantity: quantity,
      reason: reason || '',
      override: !!(reason && reason.length > 0),
      timestamp: new Date().toISOString()
    };

    inventory.pending_orders = inventory.pending_orders || [];
    inventory.pending_orders.push(orderEntry);
    inventory.last_updated = new Date().toISOString();

    const updateResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/inventory.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'ScouterBot/1.0'
        },
        body: JSON.stringify({
          message: `Record order: ${quantity} x ${itemName}`,
          content: btoa(JSON.stringify(inventory, null, 2)),
          sha: sha
        })
      }
    );

    if (!updateResponse.ok) {
      const err = await updateResponse.json();
      throw new Error(err.message || `GitHub update error: ${updateResponse.status}`);
    }

    return { success: true, data: { order: orderEntry } };
  } catch (err) {
    console.error('[ScouterBot] Record order error:', err);
    return { success: false, error: err.message };
  }
}

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════

function parseRepoUrl(url) {
  const match = url.replace(/\.git$/, '').match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error('Invalid GitHub repo URL');
  return { owner: match[1], repo: match[2] };
}

async function ensureInventoryFile(owner, repo, token) {
  try {
    const checkResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/inventory.json`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ScouterBot/1.0'
        }
      }
    );

    if (checkResponse.ok) return;

    const initialInventory = {
      troop_number: '',
      last_updated: new Date().toISOString(),
      items: [],
      pending_orders: []
    };

    const createResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/inventory.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'ScouterBot/1.0'
        },
        body: JSON.stringify({
          message: 'Initialize troop inventory (created by ScouterBot)',
          content: btoa(JSON.stringify(initialInventory, null, 2))
        })
      }
    );

    if (!createResponse.ok) {
      const err = await createResponse.json();
      throw new Error(err.message || `Failed to create inventory file: ${createResponse.status}`);
    }
  } catch (err) {
    console.error('[ScouterBot] Ensure inventory file error:', err);
    throw err;
  }
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([
      'webhookUrl', 'enableRag', 'enableScoutbookSearch',
      'backendUrl', 'scoutbookUsername', 'githubRepoUrl', 'githubToken'
    ], (result) => {
      resolve(result);
    });
  });
}

