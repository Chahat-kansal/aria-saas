export const runtime = 'edge'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _req: Request,
  { params }: { params: { api_key: string } }
) {
  const apiKey = params.api_key
  if (!apiKey) return new Response('// missing api_key', { headers: { 'Content-Type': 'application/javascript' } })

  // Verify api_key is valid and widget is enabled; also fetch chat_token for the emitted JS
  const { data: config } = await supabaseAdmin
    .from('widget_configs')
    .select('bot_name, primary_color, greeting, enabled, chat_token')
    .eq('api_key', apiKey)
    .eq('enabled', true)
    .maybeSingle()

  if (!config) {
    return new Response('// Widget not found or disabled', {
      headers: { 'Content-Type': 'application/javascript' }
    })
  }

  const botName = (config.bot_name ?? 'Aria').replace(/'/g, "\\'")
  const color = (config.primary_color ?? '#1D9E75').replace(/'/g, "\\'")
  const greeting = (config.greeting ?? 'Hi! How can I help you today?').replace(/'/g, "\\'")
  const chatToken = ((config.chat_token as string | null) ?? '').replace(/'/g, "\\'")
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ariaos.site'

  const js = `
(function() {
  if (window.__ariaWidget) return;
  window.__ariaWidget = true;

  var CHAT_TOKEN = '${chatToken}';
  var BOT_NAME = '${botName}';
  var COLOR = '${color}';
  var GREETING = '${greeting}';
  var BASE_URL = '${baseUrl}';
  var conversationId = null;
  var messages = [];
  var visitorId = localStorage.getItem('aria_visitor_id') || (Math.random().toString(36).slice(2));
  localStorage.setItem('aria_visitor_id', visitorId);

  // ── Inject styles ─────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#aria-widget-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,0,0,0.25);z-index:99999;transition:transform 0.2s,box-shadow 0.2s;background:' + COLOR + '}',
    '#aria-widget-btn:hover{transform:scale(1.08);box-shadow:0 8px 32px rgba(0,0,0,0.3)}',
    '#aria-widget-btn svg{width:26px;height:26px;fill:#fff}',
    '#aria-widget-badge{position:absolute;top:-4px;right:-4px;width:18px;height:18px;background:#ef4444;border-radius:50%;font-size:11px;font-weight:700;color:#fff;display:none;align-items:center;justify-content:center;border:2px solid #fff}',
    '#aria-widget-panel{position:fixed;bottom:92px;right:24px;width:360px;height:520px;border-radius:20px;background:#fff;box-shadow:0 16px 64px rgba(0,0,0,0.22);z-index:99998;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;transition:opacity 0.2s,transform 0.2s;opacity:0;transform:translateY(12px) scale(0.97)}',
    '#aria-widget-panel.open{display:flex;opacity:1;transform:translateY(0) scale(1)}',
    '@media(max-width:480px){#aria-widget-panel{width:calc(100vw - 16px);height:calc(100vh - 100px);bottom:80px;right:8px;border-radius:16px}}',
    '#aria-w-header{background:' + COLOR + ';padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}',
    '#aria-w-avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}',
    '#aria-w-name{color:#fff;font-weight:700;font-size:14px}',
    '#aria-w-status{color:rgba(255,255,255,0.7);font-size:11px}',
    '#aria-w-close{margin-left:auto;background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:20px;line-height:1;padding:4px 6px;border-radius:8px}',
    '#aria-w-close:hover{background:rgba(255,255,255,0.15);color:#fff}',
    '#aria-w-messages{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}',
    '#aria-w-messages::-webkit-scrollbar{width:4px}',
    '#aria-w-messages::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.1);border-radius:2px}',
    '.aria-msg{max-width:82%;padding:10px 13px;border-radius:16px;font-size:13.5px;line-height:1.55;word-break:break-word}',
    '.aria-msg-bot{background:#f3f4f6;color:#111;border-bottom-left-radius:4px;align-self:flex-start}',
    '.aria-msg-user{background:' + COLOR + ';color:#fff;border-bottom-right-radius:4px;align-self:flex-end}',
    '.aria-typing{display:flex;gap:5px;align-items:center;padding:10px 14px}',
    '.aria-dot{width:7px;height:7px;border-radius:50%;background:#9ca3af;animation:aria-bounce 1.2s infinite}',
    '.aria-dot:nth-child(2){animation-delay:0.2s}.aria-dot:nth-child(3){animation-delay:0.4s}',
    '@keyframes aria-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}',
    '#aria-w-footer{padding:10px 12px;border-top:1px solid #f0f0f0;display:flex;gap:8px;flex-shrink:0;align-items:flex-end}',
    '#aria-w-input{flex:1;border:1.5px solid #e5e7eb;border-radius:12px;padding:9px 13px;font-size:13px;font-family:inherit;resize:none;outline:none;max-height:100px;min-height:40px;transition:border-color 0.15s;line-height:1.45}',
    '#aria-w-input:focus{border-color:' + COLOR + '}',
    '#aria-w-send{width:38px;height:38px;border-radius:11px;background:' + COLOR + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity 0.15s}',
    '#aria-w-send:hover{opacity:0.85}',
    '#aria-w-send svg{width:16px;height:16px;fill:#fff}',
    '#aria-w-powered{text-align:center;padding:4px 0 8px;font-size:10px;color:#9ca3af}',
    '#aria-w-powered a{color:' + COLOR + ';text-decoration:none;font-weight:600}',
    '.aria-booking-card{background:linear-gradient(135deg,' + COLOR + '18,' + COLOR + '08);border:1.5px solid ' + COLOR + '33;border-radius:12px;padding:12px;margin-top:4px;font-size:12.5px;color:#111}',
    '.aria-booking-card strong{color:' + COLOR + '}',
  ].join('');
  document.head.appendChild(style);

  // ── Build DOM ─────────────────────────────────────────────────────
  var btn = document.createElement('button');
  btn.id = 'aria-widget-btn';
  btn.setAttribute('aria-label', 'Chat with us');
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg><div id="aria-widget-badge"></div>';
  document.body.appendChild(btn);

  var panel = document.createElement('div');
  panel.id = 'aria-widget-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat with ' + BOT_NAME);
  panel.innerHTML = [
    '<div id="aria-w-header">',
    '  <div id="aria-w-avatar">✦</div>',
    '  <div><div id="aria-w-name">' + BOT_NAME + '</div><div id="aria-w-status">● Online</div></div>',
    '  <button id="aria-w-close" aria-label="Close chat">×</button>',
    '</div>',
    '<div id="aria-w-messages"></div>',
    '<div id="aria-w-footer">',
    '  <textarea id="aria-w-input" placeholder="Type a message..." rows="1" aria-label="Chat message"></textarea>',
    '  <button id="aria-w-send" aria-label="Send message"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>',
    '</div>',
    '<div id="aria-w-powered">Powered by <a href="https://ariaos.site" target="_blank" rel="noopener">Aria OS</a></div>',
  ].join('');
  document.body.appendChild(panel);

  var msgContainer = document.getElementById('aria-w-messages');
  var input = document.getElementById('aria-w-input');
  var badge = document.getElementById('aria-widget-badge');
  var isOpen = false;

  function addMsg(role, text, isBooking) {
    var div = document.createElement('div');
    div.className = 'aria-msg aria-msg-' + (role === 'user' ? 'user' : 'bot');
    if (isBooking) {
      div.innerHTML = text;
      div.className = '';
    } else {
      div.textContent = text;
    }
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
    return div;
  }

  function showTyping() {
    var t = document.createElement('div');
    t.className = 'aria-typing aria-msg-bot';
    t.innerHTML = '<div class="aria-dot"></div><div class="aria-dot"></div><div class="aria-dot"></div>';
    t.id = 'aria-typing';
    msgContainer.appendChild(t);
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }
  function hideTyping() { var t = document.getElementById('aria-typing'); if (t) t.remove(); }

  function openPanel() {
    isOpen = true;
    panel.style.display = 'flex';
    setTimeout(function() { panel.classList.add('open'); input.focus(); }, 10);
    badge.style.display = 'none';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    if (messages.length === 0) {
      setTimeout(function() { addMsg('bot', GREETING); }, 300);
    }
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
    setTimeout(function() { panel.style.display = 'none'; }, 220);
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg><div id="aria-widget-badge" style="display:none"></div>';
  }

  btn.addEventListener('click', function() { isOpen ? closePanel() : openPanel(); });
  document.getElementById('aria-w-close').addEventListener('click', closePanel);

  async function sendMessage() {
    var text = input.value.trim();
    if (!text) return;
    input.value = ''; input.style.height = '40px';
    addMsg('user', text);
    messages.push({ role: 'user', content: text });
    showTyping();

    try {
      var res = await fetch(BASE_URL + '/api/public/widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_token: CHAT_TOKEN,
          message: text,
          conversation_id: conversationId,
          visitor_id: visitorId,
          messages: messages.slice(-8),
        }),
      });
      var data = await res.json();
      hideTyping();

      if (data.reply) {
        addMsg('bot', data.reply);
        messages.push({ role: 'assistant', content: data.reply });
        if (data.conversation_id) conversationId = data.conversation_id;

        // Show booking confirmation card
        if (data.booking_created) {
          var card = document.createElement('div');
          card.className = 'aria-booking-card';
          card.innerHTML = '<strong>✅ Appointment confirmed!</strong><br>You will receive a confirmation shortly. See you soon!';
          msgContainer.appendChild(card);
          msgContainer.scrollTop = msgContainer.scrollHeight;
        }
      } else {
        addMsg('bot', 'Sorry, something went wrong. Please try again.');
      }
    } catch(e) {
      hideTyping();
      addMsg('bot', 'Connection error. Please try again.');
    }
  }

  document.getElementById('aria-w-send').addEventListener('click', sendMessage);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  input.addEventListener('input', function() {
    this.style.height = '40px';
    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
  });

  // ── Auto-open hint after 8 seconds (first visit only) ─────────────
  if (!localStorage.getItem('aria_widget_seen')) {
    setTimeout(function() {
      if (!isOpen) {
        badge.textContent = '1';
        badge.style.display = 'flex';
        localStorage.setItem('aria_widget_seen', '1');
      }
    }, 8000);
  }
})();
`

  return new Response(js, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    }
  })
}
