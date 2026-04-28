(function () {
  'use strict';

  var currentScript = document.currentScript || (function () {
    var s = document.getElementsByTagName('script');
    return s[s.length - 1];
  })();

  var API_KEY = currentScript.getAttribute('data-key');
  var BASE_URL = (function () {
    var src = currentScript.getAttribute('src') || '';
    var m = src.match(/^(https?:\/\/[^/]+)/);
    return m ? m[1] : '';
  })();

  if (!API_KEY || !BASE_URL) return;

  // ── Visitor ID ───────────────────────────────────────────────────
  var VISITOR_KEY = 'aria_widget_v_' + API_KEY;
  var visitorId;
  try {
    visitorId = sessionStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(VISITOR_KEY, visitorId);
    }
  } catch (e) {
    visitorId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // ── State ────────────────────────────────────────────────────────
  var config = null;
  var isOpen = false;
  var isLoading = false;
  var history = [];
  var shadow = null;

  // ── Load config ──────────────────────────────────────────────────
  fetch(BASE_URL + '/api/widget/config?key=' + encodeURIComponent(API_KEY))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.enabled) return;
      config = d;
      inject();
      setTimeout(showBubbleHint, 5000);
    })
    .catch(function () {});

  // ── Shadow DOM inject ────────────────────────────────────────────
  function inject() {
    var host = document.createElement('div');
    host.id = 'aria-widget-host';
    host.style.cssText = 'position:fixed;bottom:0;right:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    document.body.appendChild(host);
    shadow = host.attachShadow({ mode: 'open' });

    var color = config.primary_color || '#1D9E75';
    var botName = config.bot_name || 'Aria';
    var greeting = config.greeting || 'Hi! How can I help you today?';

    shadow.innerHTML = '<style>' + css(color) + '</style>' + html(color, botName, greeting);

    shadow.getElementById('aria-btn').addEventListener('click', togglePanel);
    shadow.getElementById('aria-close').addEventListener('click', closePanel);
    shadow.getElementById('aria-send').addEventListener('click', sendMessage);
    shadow.getElementById('aria-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    shadow.getElementById('aria-hint-close').addEventListener('click', function (e) {
      e.stopPropagation();
      hideHint();
    });
    shadow.getElementById('aria-hint').addEventListener('click', function () {
      hideHint();
      openPanel();
    });
  }

  function css(color) {
    return '*{box-sizing:border-box;margin:0;padding:0}' +
      '.btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:' + color + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,.25);transition:transform .2s,box-shadow .2s}' +
      '.btn:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,.3)}' +
      '.btn svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:2}' +
      '.badge{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;display:none}' +
      '.hint{position:fixed;bottom:90px;right:24px;background:#fff;border-radius:12px;padding:10px 14px 10px 12px;box-shadow:0 4px 20px rgba(0,0,0,.15);max-width:220px;font-size:13px;color:#111;display:none;cursor:pointer;animation:hintin .3s ease}' +
      '.hint span{display:block;line-height:1.4}' +
      '.hint-x{position:absolute;top:6px;right:8px;background:none;border:none;cursor:pointer;color:#999;font-size:16px;line-height:1;padding:0}' +
      '@keyframes hintin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
      '.panel{position:fixed;bottom:90px;right:24px;width:380px;height:560px;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;animation:panelin .25s ease}' +
      '@keyframes panelin{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}' +
      '@media(max-width:640px){.panel{width:100vw;height:70vh;bottom:0;right:0;border-radius:16px 16px 0 0}}' +
      '.head{background:' + color + ';padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}' +
      '.avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;flex-shrink:0}' +
      '.head-info{flex:1;min-width:0}' +
      '.head-name{color:#fff;font-size:14px;font-weight:600;line-height:1.2}' +
      '.head-status{display:flex;align-items:center;gap:4px;margin-top:2px}' +
      '.status-dot{width:7px;height:7px;border-radius:50%;background:#86efac}' +
      '.head-status span{color:rgba(255,255,255,.75);font-size:11px}' +
      '.close-btn{background:rgba(255,255,255,.2);border:none;border-radius:8px;padding:6px;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center}' +
      '.close-btn:hover{background:rgba(255,255,255,.3)}' +
      '.msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}' +
      '.msgs::-webkit-scrollbar{width:4px}.msgs::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:2px}' +
      '.msg{display:flex;gap:8px;max-width:88%}' +
      '.msg.user{align-self:flex-end;flex-direction:row-reverse}' +
      '.bubble{padding:10px 13px;border-radius:16px;font-size:13px;line-height:1.5;color:#111}' +
      '.msg.bot .bubble{background:#f3f4f6;border-radius:4px 16px 16px 16px}' +
      '.msg.user .bubble{background:' + color + ';color:#fff;border-radius:16px 4px 16px 16px}' +
      '.typing{display:flex;align-items:center;gap:4px;padding:12px 14px;background:#f3f4f6;border-radius:4px 16px 16px 16px}' +
      '.dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:bounce 1.2s infinite}' +
      '.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes bounce{0%,80%,100%{transform:scale(.8);opacity:.5}40%{transform:scale(1.1);opacity:1}}' +
      '.suggestions{display:flex;flex-wrap:wrap;gap:6px;padding:0 16px 12px}' +
      '.sug{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:20px;padding:6px 12px;font-size:12px;color:#374151;cursor:pointer;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;transition:background .15s}' +
      '.sug:hover{background:' + color + '20;border-color:' + color + ';color:' + color + '}' +
      '.footer-input{padding:12px 16px;border-top:1px solid #f0f0f0;display:flex;gap:8px;align-items:flex-end;flex-shrink:0}' +
      '.input-wrap{flex:1;background:#f9fafb;border:1.5px solid #e5e7eb;border-radius:12px;display:flex;align-items:center;padding:8px 12px;gap:8px;transition:border-color .15s}' +
      '.input-wrap:focus-within{border-color:' + color + '}' +
      '.input{flex:1;border:none;background:none;font-size:13px;color:#111;outline:none;resize:none;max-height:80px;min-height:20px;line-height:1.4}' +
      '.input::placeholder{color:#9ca3af}' +
      '.send{width:34px;height:34px;border-radius:10px;background:' + color + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s}' +
      '.send:hover{opacity:.85}.send:disabled{opacity:.4;cursor:not-allowed}' +
      '.send svg{width:15px;height:15px;fill:none;stroke:#fff;stroke-width:2}' +
      '.powered{text-align:center;padding:4px 0 8px;font-size:10px;color:#c4c4c4}' +
      '.powered a{color:#c4c4c4;text-decoration:none}';
  }

  function html(color, botName, greeting) {
    var initials = botName.charAt(0).toUpperCase();
    return '<div class="hint" id="aria-hint"><button class="hint-x" id="aria-hint-close">×</button><span>👋 Hi! Ask me anything about us</span></div>' +
      '<button class="btn" id="aria-btn" aria-label="Open chat">' +
        '<div class="badge" id="aria-badge">1</div>' +
        '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>' +
      '</button>' +
      '<div class="panel" id="aria-panel">' +
        '<div class="head">' +
          '<div class="avatar">' + initials + '</div>' +
          '<div class="head-info"><div class="head-name">' + esc(botName) + '</div><div class="head-status"><div class="status-dot"></div><span>Online</span></div></div>' +
          '<button class="close-btn" id="aria-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path stroke-linecap="round" d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div class="msgs" id="aria-msgs"></div>' +
        '<div class="suggestions" id="aria-suggestions"></div>' +
        '<div class="footer-input">' +
          '<div class="input-wrap"><textarea class="input" id="aria-input" placeholder="Ask a question…" rows="1"></textarea></div>' +
          '<button class="send" id="aria-send" aria-label="Send"><svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg></button>' +
        '</div>' +
        '<div class="powered">Powered by <a href="https://aria.com.au" target="_blank">Aria</a></div>' +
      '</div>';
  }

  // ── UI helpers ───────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showBubbleHint() {
    var hint = shadow && shadow.getElementById('aria-hint');
    if (hint && !isOpen) {
      hint.style.display = 'block';
      setTimeout(hideHint, 8000);
    }
  }
  function hideHint() {
    var hint = shadow && shadow.getElementById('aria-hint');
    if (hint) hint.style.display = 'none';
  }

  function togglePanel() { isOpen ? closePanel() : openPanel(); }

  function openPanel() {
    isOpen = true;
    hideHint();
    var panel = shadow.getElementById('aria-panel');
    panel.style.display = 'flex';
    var input = shadow.getElementById('aria-input');
    setTimeout(function () { input && input.focus(); }, 100);
    if (shadow.getElementById('aria-msgs').children.length === 0) {
      addBotMessage(config.greeting || 'Hi! How can I help you today?');
      showSuggestions(['What are your opening hours?', 'What products do you have?', 'How can I contact you?']);
    }
    scrollToBottom();
  }

  function closePanel() {
    isOpen = false;
    var panel = shadow.getElementById('aria-panel');
    panel.style.display = 'none';
  }

  function scrollToBottom() {
    var msgs = shadow.getElementById('aria-msgs');
    if (msgs) setTimeout(function () { msgs.scrollTop = msgs.scrollHeight; }, 50);
  }

  function addBotMessage(text) {
    var msgs = shadow.getElementById('aria-msgs');
    var div = document.createElement('div');
    div.className = 'msg bot';
    div.innerHTML = '<div class="bubble">' + esc(text).replace(/\n/g, '<br>') + '</div>';
    msgs.appendChild(div);
    scrollToBottom();
  }

  function addUserMessage(text) {
    var msgs = shadow.getElementById('aria-msgs');
    var div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = '<div class="bubble">' + esc(text) + '</div>';
    msgs.appendChild(div);
    scrollToBottom();
  }

  function showTyping() {
    var msgs = shadow.getElementById('aria-msgs');
    var div = document.createElement('div');
    div.className = 'msg bot';
    div.id = 'aria-typing';
    div.innerHTML = '<div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
    msgs.appendChild(div);
    scrollToBottom();
    return div;
  }

  function removeTyping() {
    var t = shadow.getElementById('aria-typing');
    if (t) t.remove();
  }

  function showSuggestions(questions) {
    var sug = shadow.getElementById('aria-suggestions');
    sug.innerHTML = '';
    (questions || []).slice(0, 3).forEach(function (q) {
      var btn = document.createElement('button');
      btn.className = 'sug';
      btn.textContent = q;
      btn.addEventListener('click', function () {
        sug.innerHTML = '';
        handleSend(q);
      });
      sug.appendChild(btn);
    });
  }

  // ── Send message ─────────────────────────────────────────────────
  function sendMessage() {
    var input = shadow.getElementById('aria-input');
    var text = (input.value || '').trim();
    if (!text || isLoading) return;
    input.value = '';
    input.style.height = '';
    shadow.getElementById('aria-suggestions').innerHTML = '';
    handleSend(text);
  }

  function handleSend(text) {
    addUserMessage(text);
    history.push({ role: 'user', content: text });
    isLoading = true;
    shadow.getElementById('aria-send').disabled = true;
    var typingEl = showTyping();

    fetch(BASE_URL + '/api/widget/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-widget-key': API_KEY },
      body: JSON.stringify({
        message: text,
        conversation_history: history.slice(-12),
        visitor_id: visitorId,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        removeTyping();
        if (d.error) {
          addBotMessage('Sorry, I\'m having trouble right now. Please call us directly.');
        } else {
          var reply = d.reply || '';
          addBotMessage(reply);
          history.push({ role: 'assistant', content: reply });
          if (d.suggested_questions && d.suggested_questions.length > 0) {
            showSuggestions(d.suggested_questions);
          }
        }
      })
      .catch(function () {
        removeTyping();
        addBotMessage('Sorry, I\'m having trouble connecting. Please call us or visit us in store.');
      })
      .finally(function () {
        isLoading = false;
        shadow.getElementById('aria-send').disabled = false;
        scrollToBottom();
      });
  }

  // Auto-resize textarea
  document.addEventListener('DOMContentLoaded', function () {});
  // Use event delegation after shadow DOM ready
  setTimeout(function () {
    var input = shadow && shadow.getElementById('aria-input');
    if (!input) return;
    input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });
  }, 500);

})();
