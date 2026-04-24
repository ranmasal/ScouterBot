document.addEventListener('DOMContentLoaded', () => {
  // ─── ELEMENT REFERENCES ───
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const optionsBtn = document.getElementById('open-options');
  const scoutbookBtn = document.getElementById('search-scoutbook');
  const backendStatusEl = document.getElementById('backend-status');
  const indexBtn = document.getElementById('index-btn');
  const sourcesBtn = document.getElementById('sources-btn');
  const inventoryBtn = document.getElementById('inventory-btn');
  const setupWizardBtn = document.getElementById('setup-wizard-btn');

  // Modals
  const indexModal = document.getElementById('index-modal');
  const sourcesModal = document.getElementById('sources-modal');
  const inventoryModal = document.getElementById('inventory-modal');
  const itemModal = document.getElementById('item-modal');
  const orderModal = document.getElementById('order-modal');

  // Wizard
  const wizardOverlay = document.getElementById('setup-wizard');
  const wizardProgressBar = document.getElementById('wizard-progress-bar');

  let isTyping = false;
  let sessionId = null;
  let currentWizardStep = 1;
  let editingItemId = null;
  let pendingOrderItem = null;

  // ─── SESSION ID ───
  chrome.storage.local.get(['scouterbotSessionId'], (result) => {
    if (result.scouterbotSessionId) {
      sessionId = result.scouterbotSessionId;
    } else {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      chrome.storage.local.set({ scouterbotSessionId: sessionId });
    }
  });

  // ─── FIRST-RUN CHECK ───
  chrome.storage.sync.get(['setupComplete', 'githubRepoUrl', 'githubToken'], (result) => {
    if (!result.setupComplete) {
      showWizard();
    }
    // Show setup button if wizard was skipped
    if (result.setupComplete && (!result.githubRepoUrl || !result.githubToken)) {
      setupWizardBtn.classList.remove('hidden');
    }
  });

  // ─── LOAD CHAT HISTORY ───
  chrome.storage.local.get(['chatHistory'], (result) => {
    const history = result.chatHistory || [];
    history.forEach((msg) => appendMessage(msg.role, msg.content));
  });

  checkBackendStatus();

  // ════════════════════════════════════════════
  //  CHAT FUNCTIONS
  // ════════════════════════════════════════════

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

  // ════════════════════════════════════════════
  //  SETUP WIZARD
  // ════════════════════════════════════════════

  function showWizard() {
    wizardOverlay.classList.remove('hidden');
    currentWizardStep = 1;
    updateWizardStep();
    checkWizardBackend();
  }

  function hideWizard() {
    wizardOverlay.classList.add('hidden');
  }

  function updateWizardStep() {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
    const stepEl = document.querySelector(`.wizard-step[data-step="${currentWizardStep}"]`);
    if (stepEl) stepEl.classList.remove('hidden');

    const progress = ((currentWizardStep - 1) / 3) * 100;
    wizardProgressBar.style.width = progress + '%';

    // Reset GitHub sub-steps when entering step 3
    if (currentWizardStep === 3) {
      document.getElementById('github-setup-flow').classList.add('hidden');
      document.getElementById('github-later-msg').classList.add('hidden');
      document.getElementById('step3-actions').classList.remove('hidden');
      resetGitHubSubsteps();
    }
  }

  function resetGitHubSubsteps() {
    document.querySelectorAll('.github-substep').forEach(el => el.classList.add('hidden'));
    document.getElementById('gh-step-account').classList.remove('hidden');
    document.getElementById('gh-account-help').classList.add('hidden');
    document.getElementById('wizard-repo-url').value = '';
    document.getElementById('wizard-repo-token').value = '';
    document.getElementById('gh-test-status').textContent = 'Click "Test & Save" to verify everything works.';
  }

  async function checkWizardBackend() {
    const statusEl = document.getElementById('wizard-backend-status');
    const infoEl = document.getElementById('wizard-backend-info');
    const nextBtn = document.getElementById('backend-next-btn');

    statusEl.innerHTML = '<span class="status-dot checking"></span><span>Checking connection...</span>';
    infoEl.classList.add('hidden');
    nextBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_BACKEND_STATUS' });
      if (response && response.success) {
        statusEl.innerHTML = '<span class="status-dot online"></span><span>Backend connected!</span>';
        infoEl.classList.add('hidden');
        nextBtn.disabled = false;
      } else {
        statusEl.innerHTML = '<span class="status-dot offline"></span><span>Backend not connected</span>';
        infoEl.classList.remove('hidden');
        nextBtn.disabled = false;
      }
    } catch (err) {
      statusEl.innerHTML = '<span class="status-dot offline"></span><span>Backend not connected</span>';
      infoEl.classList.remove('hidden');
      nextBtn.disabled = false;
    }
  }

  // Wizard navigation
  document.querySelectorAll('.wizard-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentWizardStep < 4) {
        currentWizardStep++;
        updateWizardStep();
      }
    });
  });

  document.querySelectorAll('.wizard-back').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentWizardStep > 1) {
        currentWizardStep--;
        updateWizardStep();
      }
    });
  });

  document.querySelector('.wizard-skip').addEventListener('click', () => {
    chrome.storage.sync.set({ setupComplete: true }, () => {
      hideWizard();
      setupWizardBtn.classList.remove('hidden');
    });
  });

  document.querySelector('.wizard-finish').addEventListener('click', () => {
    chrome.storage.sync.set({ setupComplete: true }, () => {
      hideWizard();
      setupWizardBtn.classList.remove('hidden');
    });
  });

  document.getElementById('wizard-test-backend').addEventListener('click', (e) => {
    e.preventDefault();
    checkWizardBackend();
  });

  // GitHub decision tree
  document.getElementById('github-connect-now').addEventListener('click', () => {
    document.querySelector('.decision-tree').classList.add('hidden');
    document.getElementById('github-setup-flow').classList.remove('hidden');
    document.getElementById('step3-actions').classList.add('hidden');
  });

  document.getElementById('github-connect-later').addEventListener('click', () => {
    document.querySelector('.decision-tree').classList.add('hidden');
    document.getElementById('github-later-msg').classList.remove('hidden');
    document.getElementById('step3-actions').classList.remove('hidden');
  });

  // GitHub sub-step: Account
  document.getElementById('gh-has-account').addEventListener('click', () => {
    document.getElementById('gh-step-account').classList.add('hidden');
    document.getElementById('gh-step-repo').classList.remove('hidden');
  });

  document.getElementById('gh-no-account').addEventListener('click', () => {
    document.getElementById('gh-account-help').classList.remove('hidden');
  });

  // GitHub sub-step: Repo
  document.getElementById('gh-repo-next').addEventListener('click', () => {
    const url = document.getElementById('wizard-repo-url').value.trim();
    if (!url || !url.includes('github.com')) {
      alert('Please enter a valid GitHub repository URL.');
      return;
    }
    document.getElementById('gh-step-repo').classList.add('hidden');
    document.getElementById('gh-step-token').classList.remove('hidden');
  });

  document.getElementById('gh-repo-back').addEventListener('click', () => {
    document.getElementById('gh-step-repo').classList.add('hidden');
    document.getElementById('gh-step-account').classList.remove('hidden');
  });

  // GitHub sub-step: Token
  document.getElementById('gh-token-next').addEventListener('click', () => {
    const token = document.getElementById('wizard-repo-token').value.trim();
    if (!token || !token.startsWith('ghp_')) {
      alert('Please enter a valid GitHub Personal Access Token (starts with ghp_).');
      return;
    }
    document.getElementById('gh-step-token').classList.add('hidden');
    document.getElementById('gh-step-test').classList.remove('hidden');
  });

  document.getElementById('gh-token-back').addEventListener('click', () => {
    document.getElementById('gh-step-token').classList.add('hidden');
    document.getElementById('gh-step-repo').classList.remove('hidden');
  });

  // GitHub sub-step: Test & Save
  document.getElementById('gh-test-save').addEventListener('click', async () => {
    const url = document.getElementById('wizard-repo-url').value.trim();
    const token = document.getElementById('wizard-repo-token').value.trim();
    const statusEl = document.getElementById('gh-test-status');

    statusEl.textContent = 'Testing connection...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TEST_GITHUB_CONNECTION',
        payload: { repoUrl: url, token: token }
      });

      if (response && response.success) {
        // Save settings
        await chrome.storage.sync.set({
          githubRepoUrl: url,
          githubToken: token,
          setupComplete: true
        });

        statusEl.innerHTML = '<span style="color:#2e7d32">✅ Connected! Inventory file initialized.</span>';

        // Generate summary for step 4
        const summary = `
          <p><strong>✅ Backend:</strong> ${backendStatusEl.classList.contains('online') ? 'Connected' : 'Not connected (optional for now)'}</p>
          <p><strong>✅ GitHub Inventory:</strong> Connected to ${url.replace('https://github.com/', '')}</p>
          <p class="wizard-hint">You can always update these in Settings ⚙️</p>
        `;
        document.getElementById('wizard-summary').innerHTML = summary;

        setTimeout(() => {
          currentWizardStep = 4;
          updateWizardStep();
        }, 1000);
      } else {
        statusEl.innerHTML = `<span style="color:#c62828">❌ Failed: ${escapeHtml(response?.error || 'Unknown error')}</span>`;
      }
    } catch (err) {
      statusEl.innerHTML = `<span style="color:#c62828">❌ Error: ${escapeHtml(err.message)}</span>`;
    }
  });

  document.getElementById('gh-test-back').addEventListener('click', () => {
    document.getElementById('gh-step-test').classList.add('hidden');
    document.getElementById('gh-step-token').classList.remove('hidden');
  });

  // ════════════════════════════════════════════
  //  INVENTORY MODAL
  // ════════════════════════════════════════════

  inventoryBtn.addEventListener('click', openInventory);
  setupWizardBtn.addEventListener('click', showWizard);

  async function openInventory() {
    inventoryModal.classList.remove('hidden');
    document.getElementById('inventory-loading').classList.remove('hidden');
    document.getElementById('inventory-not-connected').classList.add('hidden');
    document.getElementById('inventory-list').classList.add('hidden');

    const settings = await new Promise(r => chrome.storage.sync.get(['githubRepoUrl', 'githubToken'], r));

    if (!settings.githubRepoUrl || !settings.githubToken) {
      document.getElementById('inventory-loading').classList.add('hidden');
      document.getElementById('inventory-not-connected').classList.remove('hidden');
      return;
    }

    await loadInventory();
  }

  async function loadInventory() {
    document.getElementById('inventory-loading').classList.remove('hidden');
    document.getElementById('inventory-list').classList.add('hidden');

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_INVENTORY' });
      if (response && response.success) {
        renderInventory(response.data);
        document.getElementById('inventory-loading').classList.add('hidden');
        document.getElementById('inventory-list').classList.remove('hidden');
      } else {
        document.getElementById('inventory-loading').textContent = 'Error: ' + (response?.error || 'Failed to load');
      }
    } catch (err) {
      document.getElementById('inventory-loading').textContent = 'Error: ' + err.message;
    }
  }

  function renderInventory(data) {
    const container = document.getElementById('inventory-categories');
    container.innerHTML = '';

    const items = data.items || [];
    const categories = groupBy(items, 'category');

    Object.keys(categories).sort().forEach(cat => {
      const catItems = categories[cat];
      const catEl = document.createElement('div');
      catEl.className = 'inventory-category';

      const header = document.createElement('div');
      header.className = 'inventory-category-header';
      header.innerHTML = `<span>${escapeHtml(cat)} (${catItems.length})</span><span>▼</span>`;
      header.addEventListener('click', () => catEl.classList.toggle('collapsed'));
      catEl.appendChild(header);

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'inventory-category-items';

      catItems.forEach(item => {
        const total = item.on_hand + item.on_order;
        const needed = Math.max((item.min_stock || 0) - total, 0);
        let stockClass = 'stock-ok';
        if (total === 0) stockClass = 'stock-out';
        else if (needed > 0) stockClass = 'stock-low';

        const itemEl = document.createElement('div');
        itemEl.className = 'inventory-item';
        itemEl.innerHTML = `
          <span class="inventory-item-name">${escapeHtml(item.name)}</span>
          <div class="inventory-item-stock">
            <span class="stock-badge ${stockClass}">${total} ${escapeHtml(item.unit || '')}</span>
            <div class="inventory-item-actions">
              <button title="Order" data-order="${item.id}">🛒</button>
              <button title="Edit" data-edit="${item.id}">✏️</button>
            </div>
          </div>
        `;
        itemsContainer.appendChild(itemEl);
      });

      catEl.appendChild(itemsContainer);
      container.appendChild(catEl);
    });

    // Bind order/edit buttons
    container.querySelectorAll('[data-order]').forEach(btn => {
      btn.addEventListener('click', () => openOrderModal(btn.dataset.order, items));
    });
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.edit, items));
    });
  }

  function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
      const k = item[key] || 'Other';
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  }

  // Inventory toolbar
  document.getElementById('inventory-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.inventory-item').forEach(el => {
      const name = el.querySelector('.inventory-item-name').textContent.toLowerCase();
      el.style.display = name.includes(term) ? '' : 'none';
    });
  });

  document.getElementById('btn-refresh-inventory').addEventListener('click', loadInventory);

  document.getElementById('inventory-open-wizard').addEventListener('click', () => {
    inventoryModal.classList.add('hidden');
    showWizard();
    currentWizardStep = 3;
    updateWizardStep();
  });

  document.getElementById('inventory-open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('close-inventory').addEventListener('click', () => {
    inventoryModal.classList.add('hidden');
  });

  // ════════════════════════════════════════════
  //  ADD/EDIT ITEM MODAL
  // ════════════════════════════════════════════

  document.getElementById('btn-add-item').addEventListener('click', () => {
    editingItemId = null;
    document.getElementById('item-modal-title').textContent = 'Add Item';
    document.getElementById('item-name').value = '';
    document.getElementById('item-category').value = 'advancements';
    document.getElementById('item-on-hand').value = '0';
    document.getElementById('item-on-order').value = '0';
    document.getElementById('item-min-stock').value = '0';
    document.getElementById('item-unit').value = 'each';
    document.getElementById('item-sku').value = '';
    document.getElementById('item-notes').value = '';
    itemModal.classList.remove('hidden');
  });

  document.getElementById('close-item').addEventListener('click', () => itemModal.classList.add('hidden'));
  document.getElementById('cancel-item').addEventListener('click', () => itemModal.classList.add('hidden'));

  document.getElementById('btn-save-item').addEventListener('click', async () => {
    const item = {
      id: editingItemId || 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: document.getElementById('item-name').value.trim(),
      category: document.getElementById('item-category').value,
      on_hand: parseInt(document.getElementById('item-on-hand').value) || 0,
      on_order: parseInt(document.getElementById('item-on-order').value) || 0,
      min_stock: parseInt(document.getElementById('item-min-stock').value) || 0,
      unit: document.getElementById('item-unit').value.trim() || 'each',
      sku: document.getElementById('item-sku').value.trim(),
      notes: document.getElementById('item-notes').value.trim()
    };

    if (!item.name) {
      alert('Please enter an item name.');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_INVENTORY_ITEM',
        payload: { item }
      });

      if (response && response.success) {
        itemModal.classList.add('hidden');
        await loadInventory();
      } else {
        alert('Error saving item: ' + (response?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  function openEditModal(itemId, items) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    editingItemId = item.id;
    document.getElementById('item-modal-title').textContent = 'Edit Item';
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category || 'advancements';
    document.getElementById('item-on-hand').value = item.on_hand;
    document.getElementById('item-on-order').value = item.on_order;
    document.getElementById('item-min-stock').value = item.min_stock || 0;
    document.getElementById('item-unit').value = item.unit || 'each';
    document.getElementById('item-sku').value = item.sku || '';
    document.getElementById('item-notes').value = item.notes || '';
    itemModal.classList.remove('hidden');
  }

  // ════════════════════════════════════════════
  //  ORDER RECOMMENDATION MODAL
  // ════════════════════════════════════════════

  function openOrderModal(itemId, items) {
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    pendingOrderItem = item;
    const total = item.on_hand + item.on_order;
    const needed = Math.max((item.min_stock || 0) - total, 0);
    const recommended = needed > 0 ? needed : 0;

    const calcHtml = `
      <div class="calc-row"><span>On Hand:</span><span>${item.on_hand}</span></div>
      <div class="calc-row"><span>On Order:</span><span>${item.on_order}</span></div>
      <div class="calc-row"><span>Min Stock:</span><span>${item.min_stock || 0}</span></div>
      <div class="calc-row total"><span>Recommended Order:</span><span>${recommended}</span></div>
    `;

    document.getElementById('order-calculation').innerHTML = calcHtml;
    document.getElementById('order-override-qty').value = recommended;
    document.getElementById('order-override-reason').value = '';
    document.getElementById('order-hint').textContent = recommended > 0
      ? `You need ${recommended} to reach minimum stock. You can override if you want more.`
      : 'Stock is sufficient. Only order if you want extras.';

    orderModal.classList.remove('hidden');
  }

  document.getElementById('close-order').addEventListener('click', () => orderModal.classList.add('hidden'));
  document.getElementById('cancel-order').addEventListener('click', () => orderModal.classList.add('hidden'));

  document.getElementById('btn-confirm-order').addEventListener('click', async () => {
    if (!pendingOrderItem) return;

    const qty = parseInt(document.getElementById('order-override-qty').value) || 0;
    const reason = document.getElementById('order-override-reason').value.trim();

    if (qty <= 0) {
      orderModal.classList.add('hidden');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RECORD_ORDER',
        payload: {
          itemId: pendingOrderItem.id,
          quantity: qty,
          reason: reason,
          itemName: pendingOrderItem.name
        }
      });

      if (response && response.success) {
        orderModal.classList.add('hidden');
        appendMessage('bot', `🛒 Order recorded: ${qty} × ${pendingOrderItem.name}${reason ? ' (' + reason + ')' : ''}. The on-order count has been updated in your inventory.`);
        await loadInventory();
      } else {
        alert('Error recording order: ' + (response?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // ════════════════════════════════════════════
  //  INDEXING & SOURCES MODALS
  // ════════════════════════════════════════════

  indexBtn.addEventListener('click', () => indexModal.classList.remove('hidden'));
  sourcesBtn.addEventListener('click', () => sourcesModal.classList.remove('hidden'));
  document.getElementById('close-index').addEventListener('click', () => indexModal.classList.add('hidden'));
  document.getElementById('close-sources').addEventListener('click', () => sourcesModal.classList.add('hidden'));

  document.getElementById('start-index').addEventListener('click', async () => {
    const status = document.getElementById('index-status');
    status.textContent = 'Indexing in progress...';
    document.getElementById('start-index').disabled = true;
    document.getElementById('force-index').disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'INDEX_DOCUMENTS',
        payload: { forceRefresh: false }
      });

      if (response && response.success) {
        status.textContent = `✅ Indexed ${response.data.documents_indexed} documents.`;
        checkBackendStatus();
      } else {
        status.textContent = `❌ Failed: ${response?.error || 'Unknown'}`;
      }
    } catch (err) {
      status.textContent = `❌ Error: ${err.message}`;
    } finally {
      document.getElementById('start-index').disabled = false;
      document.getElementById('force-index').disabled = false;
    }
  });

  document.getElementById('force-index').addEventListener('click', async () => {
    if (!confirm('This will re-index all documents from scratch. Continue?')) return;

    const status = document.getElementById('index-status');
    status.textContent = 'Force re-indexing...';
    document.getElementById('start-index').disabled = true;
    document.getElementById('force-index').disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'INDEX_DOCUMENTS',
        payload: { forceRefresh: true }
      });

      if (response && response.success) {
        status.textContent = `✅ Re-indexed ${response.data.documents_indexed} documents.`;
        checkBackendStatus();
      } else {
        status.textContent = `❌ Failed: ${response?.error || 'Unknown'}`;
      }
    } catch (err) {
      status.textContent = `❌ Error: ${err.message}`;
    } finally {
      document.getElementById('start-index').disabled = false;
      document.getElementById('force-index').disabled = false;
    }
  });

  document.getElementById('sources-btn').addEventListener('click', async () => {
    sourcesModal.classList.remove('hidden');
    const list = document.getElementById('sources-list');
    list.innerHTML = '<p>Loading...</p>';

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DOCUMENT_SOURCES' });
      if (response && response.success) {
        list.innerHTML = '';
        (response.data.sources || []).forEach(src => {
          const item = document.createElement('div');
          item.className = 'source-item';
          item.innerHTML = `
            <div class="source-name">${escapeHtml(src.name)}</div>
            <div class="source-url">${escapeHtml(src.url)}</div>
            <div style="color:#888;font-size:11px;margin-top:4px;">${escapeHtml(src.description || '')}</div>
          `;
          list.appendChild(item);
        });
      } else {
        list.innerHTML = `<p style="color:red">Error: ${escapeHtml(response?.error || 'Failed')}</p>`;
      }
    } catch (err) {
      list.innerHTML = `<p style="color:red">Error: ${escapeHtml(err.message)}</p>`;
    }
  });

  // ════════════════════════════════════════════
  //  GENERAL EVENT BINDINGS
  // ════════════════════════════════════════════

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  scoutbookBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://advancements.scouting.org/' });
  });

  setInterval(checkBackendStatus, 30000);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});

