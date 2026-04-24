// Content Script for Scouting America / Scoutbook Plus pages

(function () {
  'use strict';

  console.log('[ScouterBot] Content script active on', window.location.href);

  // Listen for messages from popup or background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_PAGE_TEXT') {
      const text = document.body.innerText || '';
      sendResponse({ success: true, data: { text: text.substring(0, 5000) } });
      return true;
    }

    if (request.type === 'HIGHLIGHT_TEXT') {
      highlightText(request.payload.query);
      sendResponse({ success: true });
      return true;
    }

    if (request.type === 'INJECT_SEARCH_WIDGET') {
      injectFloatingWidget();
      sendResponse({ success: true });
      return true;
    }
  });

  function highlightText(query) {
    if (!query) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.toLowerCase().includes(query.toLowerCase())) {
        nodes.push(node);
      }
    }

    nodes.forEach((textNode) => {
      const span = document.createElement('span');
      span.style.backgroundColor = 'yellow';
      span.style.color = 'black';
      const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
      const parts = textNode.nodeValue.split(regex);
      parts.forEach((part) => {
        if (part.toLowerCase() === query.toLowerCase()) {
          const mark = document.createElement('mark');
          mark.textContent = part;
          span.appendChild(mark);
        } else {
          span.appendChild(document.createTextNode(part));
        }
      });
      textNode.parentNode.replaceChild(span, textNode);
    });
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function injectFloatingWidget() {
    if (document.getElementById('scouterbot-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'scouterbot-widget';
    widget.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: sans-serif;
      overflow: hidden;
    `;

    widget.innerHTML = `
      <div style="background:#003f7f;color:#fff;padding:10px 14px;font-weight:bold;display:flex;justify-content:space-between;align-items:center;">
        <span>ScouterBot</span>
        <button id="sbw-close" style="background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;">×</button>
      </div>
      <div style="padding:12px;">
        <p style="font-size:13px;color:#555;margin-bottom:8px;">Quick Search Scoutbook Plus</p>
        <input id="sbw-input" type="text" placeholder="Search..." style="width:100%;padding:8px;border:1px solid #ccc;border-radius:6px;" />
        <button id="sbw-search" style="margin-top:8px;width:100%;padding:8px;background:#003f7f;color:#fff;border:none;border-radius:6px;cursor:pointer;">Search</button>
      </div>
    `;

    document.body.appendChild(widget);

    document.getElementById('sbw-close').addEventListener('click', () => widget.remove());
    document.getElementById('sbw-search').addEventListener('click', () => {
      const query = document.getElementById('sbw-input').value.trim();
      if (query) {
        window.open(`https://scoutbook.scouting.org/search?query=${encodeURIComponent(query)}`, '_blank');
      }
    });
  }
})();

