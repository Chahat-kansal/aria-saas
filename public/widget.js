(function () {
  'use strict';

  // ── Read config from script tag ──────────────────────────────────
  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var API_KEY = currentScript.getAttribute('data-key');
  var BASE_URL = (function () {
    var src = currentScript.getAttribute('src') || '';
    var match = src.match(/^(https?:\/\/[^/]+)/);
    return match ? match[1] : '';
  })();

  if (!API_KEY || !BASE_URL) return;

  // ── Visitor ID (persisted for session) ──────────────────────────
  var VISITOR_KEY = 'aria_widget_visitor_' + API_KEY;
  var visitorId = sessionStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(VISITOR_KEY, visitorId);
  }

  // ── State ────────────────────────────────────────────────────────
  var config = null;
  var isOpen = false;
  var isLoading = false;
  var conversationHistory = [];

  // ── Fetch config ─────────────────────────────────────────────────
  fetch(BASE_URL + '/api/widget/config?key=' + encodeURIComponent(API_KEY))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.enabled) return;
      config = data;
      injectWidget();
    })
    .catch(function () {});

  // ── Inject Shadow DOM ────────────────────────────────────────────
  function injectWidget() {
    var host = document.createElement('div');
    host.id = 'aria-widget-host';
    host.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    document.body.appendChild(host);

    var shadow = host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = getStyles();
    shadow.appendChild(style);

    var container = document.createElement('div');
    container.id = 'container';
    shadow.appendChild(container);

    renderBubble(shadow);
  }

  // ── Render chat bubble ───────────────────────────────────────────
  function renderBubble(shadow) {
    var container = shadow.getElementById('container');
    container.innerHTML = '';

    var bubble = document.createElement('button');
    bubble.id = 'bubble';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.style.background = config.primary_color;
    bubble.innerHTML = CHAT_ICON;
    bubble.addEventListener('click', function () { openPanel(shadow); });
    container.appendChild(bubble);
  }

  // ── Open chat panel ──────────────────────────────────────────────
  function openPanel(shadow) {
    if (isOpen) return;
    isOpen = true;

    var container = shadow.getElementById('container');
    container.innerHTML = '';

    // Panel
    var panel = document.createElement('div');
    panel.id = 'panel';

    // Header
    var header = document.createElement('div');
    header.id = 'header';
    header.style.background = config.primary_color;
    header.innerHTML =
      '<div class="header-inner">' +
        '<div class="avatar" style="background:rgba(255,255,255,0.2)">' +
          escapeHtml((config.bot_name || 'A').charAt(0).toUpperCase()) +
        '</div>' +
        '<div class="header-text">' +
          '<div class="bot-name">' + escapeHtml(config.bot_name || 'Aria') + '</div>' +
          '<div class="bot-status">● Online</div>' +
        '</div>' +
        '<button id="close-btn" aria-label="Close chat">' + CLOSE_ICON + '</button>' +
      '</div>';
    panel.appendChild(header);

    // Messages
    var messages = document.createElement('div');
    messages.id = 'messages';
    panel.appendChild(messages);

    // Input area
    var inputArea = document.createElement('div');
    inputArea.id = 'input-area';
    inputArea.innerHTML =
      '<input id="msg-input" type="text" placeholder="Type a message…" autocomplete="off" />' +
      '<button id="send-btn" style="background:' + config.primary_color + '">' + SEND_ICON + '</button>';
    panel.appendChild(inputArea);

    // Powered by
    var footer = document.createElement('div');
    footer.id = 'powered';
    footer.innerHTML = 'Powered by <a href="https://getaria.com.au" target="_blank" rel="noopener">Aria</a>';
    panel.appendChild(footer);

    container.appendChild(panel);

    // Events
    shadow.getElementById('close-btn').addEventListener('click', function () {
      closePanel(shadow);
    });

    var input = shadow.getElementById('msg-input');
    shadow.getElementById('send-btn').addEventListener('click', function () {
      sendMessage(shadow);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendMessage(shadow);
    });

    // Show greeting
    if (conversationHistory.length === 0) {
      appendMessage(shadow, 'assistant', config.greeting || 'Hi! How can I help you today?');
    } else {
      // Re-render existing history
      conversationHistory.forEach(function (m) {
        appendMessage(shadow, m.role, m.content, true);
      });
    }

    input.focus();

    // Animate in
    requestAnimationFrame(function () {
      panel.classList.add('open');
    });
  }

  // ── Close panel ──────────────────────────────────────────────────
  function closePanel(shadow) {
    isOpen = false;
    var container = shadow.getElementById('container');
    var panel = shadow.getElementById('panel');
    if (panel) {
      panel.classList.remove('open');
      setTimeout(function () { renderBubble(shadow); }, 250);
    } else {
      renderBubble(shadow);
    }
  }

  // ── Send message ─────────────────────────────────────────────────
  function sendMessage(shadow) {
    if (isLoading) return;
    var input = shadow.getElementById('msg-input');
    var text = (input.value || '').trim();
    if (!text) return;

    input.value = '';
    appendMessage(shadow, 'user', text);

    // Remove suggested chips
    var chips = shadow.getElementById('chips');
    if (chips) chips.remove();

    conversationHistory.push({ role: 'user', content: text });

    showTyping(shadow);
    isLoading = true;

    fetch(BASE_URL + '/api/widget/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-widget-key': API_KEY,
      },
      body: JSON.stringify({
        message: text,
        conversation_history: conversationHistory.slice(-10),
        visitor_id: visitorId,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        hideTyping(shadow);
        isLoading = false;
        var reply = data.reply || 'Sorry, something went wrong.';
        appendMessage(shadow, 'assistant', reply);
        conversationHistory.push({ role: 'assistant', content: reply });

        if (data.suggested_questions && data.suggested_questions.length > 0) {
          showSuggestions(shadow, data.suggested_questions);
        }
      })
      .catch(function () {
        hideTyping(shadow);
        isLoading = false;
        appendMessage(shadow, 'assistant', 'Sorry, I\'m having trouble connecting. Please try again.');
      });
  }

  // ── Append message bubble ────────────────────────────────────────
  function appendMessage(shadow, role, text, noScroll) {
    var messages = shadow.getElementById('messages');
    if (!messages) return;

    var row = document.createElement('div');
    row.className = 'msg-row ' + (role === 'user' ? 'msg-user' : 'msg-bot');

    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (role === 'user') {
      bubble.style.background = config.primary_color;
    }
    bubble.textContent = text;

    row.appendChild(bubble);
    messages.appendChild(row);

    if (!noScroll) {
      messages.scrollTop = messages.scrollHeight;
    }
  }

  // ── Typing indicator ─────────────────────────────────────────────
  function showTyping(shadow) {
    var messages = shadow.getElementById('messages');
    if (!messages) return;
    var row = document.createElement('div');
    row.className = 'msg-row msg-bot';
    row.id = 'typing-indicator';
    row.innerHTML = '<div class="msg-bubble typing"><span></span><span></span><span></span></div>';
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping(shadow) {
    var el = shadow.getElementById('typing-indicator');
    if (el) el.remove();
  }

  // ── Suggested follow-up chips ────────────────────────────────────
  function showSuggestions(shadow, questions) {
    var messages = shadow.getElementById('messages');
    if (!messages) return;

    var chips = document.createElement('div');
    chips.id = 'chips';
    chips.className = 'chips';

    questions.slice(0, 3).forEach(function (q) {
      var chip = document.createElement('button');
      chip.className = 'chip';
      chip.style.borderColor = config.primary_color;
      chip.style.color = config.primary_color;
      chip.textContent = q;
      chip.addEventListener('click', function () {
        shadow.getElementById('msg-input').value = q;
        sendMessage(shadow);
      });
      chips.appendChild(chip);
    });

    messages.appendChild(chips);
    messages.scrollTop = messages.scrollHeight;
  }

  // ── Escape HTML ──────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── SVG Icons ────────────────────────────────────────────────────
  var CHAT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>';
  var CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="white" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var SEND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

  // ── Styles ───────────────────────────────────────────────────────
  function getStyles() {
    return [
      '#bubble{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.25);transition:transform .2s,box-shadow .2s;}',
      '#bubble:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,0.3);}',
      '#panel{position:absolute;bottom:70px;right:0;width:380px;height:520px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.18);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(16px) scale(0.97);transition:opacity .22s ease,transform .22s ease;pointer-events:none;}',
      '#panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:all;}',
      '#header{flex-shrink:0;padding:14px 16px;}',
      '.header-inner{display:flex;align-items:center;gap:10px;}',
      '.avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0;}',
      '.header-text{flex:1;min-width:0;}',
      '.bot-name{font-size:14px;font-weight:600;color:#fff;line-height:1.2;}',
      '.bot-status{font-size:11px;color:rgba(255,255,255,0.75);margin-top:1px;}',
      '#close-btn{background:rgba(255,255,255,0.15);border:none;border-radius:8px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;}',
      '#close-btn:hover{background:rgba(255,255,255,0.25);}',
      '#messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;}',
      '#messages::-webkit-scrollbar{width:4px;}',
      '#messages::-webkit-scrollbar-track{background:transparent;}',
      '#messages::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:4px;}',
      '.msg-row{display:flex;}',
      '.msg-user{justify-content:flex-end;}',
      '.msg-bot{justify-content:flex-start;}',
      '.msg-bubble{max-width:78%;padding:9px 13px;border-radius:16px;font-size:13px;line-height:1.5;color:#1a1a1a;background:#f0f0f0;word-wrap:break-word;}',
      '.msg-user .msg-bubble{color:#fff;border-radius:16px 16px 4px 16px;}',
      '.msg-bot .msg-bubble{border-radius:16px 16px 16px 4px;}',
      '.typing{display:flex;align-items:center;gap:4px;padding:12px 14px;}',
      '.typing span{width:7px;height:7px;border-radius:50%;background:#bbb;animation:bounce 1.2s infinite;}',
      '.typing span:nth-child(2){animation-delay:.2s;}',
      '.typing span:nth-child(3){animation-delay:.4s;}',
      '@keyframes bounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-6px);}}',
      '.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}',
      '.chip{background:#fff;border:1px solid;border-radius:20px;padding:5px 12px;font-size:12px;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap;}',
      '.chip:hover{opacity:0.8;}',
      '#input-area{flex-shrink:0;padding:10px 12px;border-top:1px solid #f0f0f0;display:flex;align-items:center;gap:8px;}',
      '#msg-input{flex:1;border:1px solid #e8e8e8;border-radius:10px;padding:8px 12px;font-size:13px;outline:none;color:#1a1a1a;transition:border-color .15s;font-family:inherit;}',
      '#msg-input:focus{border-color:#999;}',
      '#msg-input::placeholder{color:#aaa;}',
      '#send-btn{width:34px;height:34px;border:none;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s;}',
      '#send-btn:hover{opacity:0.85;}',
      '#powered{flex-shrink:0;text-align:center;padding:6px;font-size:10px;color:#bbb;}',
      '#powered a{color:#bbb;text-decoration:none;}',
      '#powered a:hover{color:#888;}',
      '@media(max-width:480px){#panel{width:calc(100vw - 24px);bottom:76px;right:0;height:480px;}}',
    ].join('');
  }
})();