'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { AdRotator } from '@/components/ads/AdRotator'
import { BundlesShelf } from '@/components/bundles/BundlesShelf'

interface Message { role: 'user' | 'assistant'; content: string; cards?: ProductCard[]; upsell?: ProductCard | null; recipe?: RecipeCard | null }
interface ProductCard { id: string; name: string; price: number | null; stock: number; image_url: string | null }
interface RecipeCard { recipe_name: string; ingredients: string[]; one_liner: string; matched_products: Array<{ id: string; name: string; price: number | null }> }

const IDLE_PROMPTS = [
  "Ask me anything — what's good today, what's in stock, gift ideas…",
  "Wondering what to try? Just ask.",
  "Need a recommendation? I know the shop well.",
  "Looking for something specific? Tell me what you're after.",
]

const CHIPS_BY_INDUSTRY: Record<string, string[]> = {
  cafe:        ["What's good today?", "Got oat milk?", "Best with a flat white?"],
  coffee:      ["What's good today?", "Got oat milk?", "Best with a flat white?"],
  restaurant:  ["What's good today?", "Gluten-free options?", "Best for a date?"],
  liquor:      ["Wine for steak?", "Gift under $50?", "What's new in?"],
  bottleshop:  ["Wine for steak?", "Gift under $50?", "What's new in?"],
  bakery:      ["What's fresh today?", "Gluten-free options?", "Best with coffee?"],
  pharmacy:    ["Got [hayfever] relief?", "Best for kids?", "What's on special?"],
  retail:      ["What's new today?", "Gift ideas?", "Got [popular item]?"],
}

function chipsForIndustry(industry: string | null): string[] {
  const key = (industry ?? '').toLowerCase().trim()
  return CHIPS_BY_INDUSTRY[key] ?? CHIPS_BY_INDUSTRY.retail
}

// Web Speech API types (browser-only)
type SpeechRecognitionEvent = { results: { 0: { transcript: string } }[] }
type SpeechRecognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: { new(): SpeechRecognition }
    webkitSpeechRecognition?: { new(): SpeechRecognition }
  }
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    u.pitch = 1.0
    u.lang = 'en-AU'
    const voices = window.speechSynthesis.getVoices()
    const auVoice = voices.find(v => v.lang.startsWith('en-AU') || v.lang.startsWith('en-GB'))
    if (auVoice) u.voice = auVoice
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  } catch { /* non-fatal */ }
}

function Confetti({ show }: { show: boolean }) {
  if (!show) return null
  const pieces = Array.from({ length: 30 }, (_, i) => i)
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
      {pieces.map(i => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.3
        const duration = 1.5 + Math.random() * 0.8
        const colour = ['#7FB897', '#F59E0B', '#A78BFA', '#60A5FA'][i % 4]
        return (
          <div key={i} style={{
            position: 'absolute', top: '-10px', left: left + '%',
            width: 8, height: 12, background: colour,
            animation: `kiosk-fall ${duration}s ${delay}s ease-out forwards`,
          }} />
        )
      })}
      <style jsx>{`
        @keyframes kiosk-fall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
      `}</style>
    </div>
  )
}

export default function KioskClient() {
  const { business_id } = useParams<{ business_id: string }>()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [idleIdx, setIdleIdx] = useState(0)
  const [kioskName, setKioskName] = useState('Aria')
  const [greeting, setGreeting] = useState('')
  const [industry, setIndustry] = useState<string | null>(null)
  const [showSignup, setShowSignup] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')
  const [signupName, setSignupName] = useState('')
  const [signupBusy, setSignupBusy] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  // Load kiosk config for header
  useEffect(() => {
    if (!business_id) return
    fetch(`/api/public/instore/config?business_id=${business_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        if (d.kiosk_name) setKioskName(d.kiosk_name)
        if (d.greeting) setGreeting(d.greeting)
        if (d.voice_enabled === false) setVoiceEnabled(false)
        if (d.industry) setIndustry(d.industry)
      })
      .catch(() => { /* non-fatal */ })
  }, [business_id])

  // Rotate idle prompts every 6s
  useEffect(() => {
    const iv = setInterval(() => setIdleIdx(i => (i + 1) % IDLE_PROMPTS.length), 6000)
    return () => clearInterval(iv)
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return
    setSending(true)
    setError('')
    const userMsg: Message = { role: 'user', content: text }
    // Push the user message + an empty assistant placeholder we'll stream tokens into
    setMessages(m => [...m, userMsg, { role: 'assistant', content: '' }])
    setInput('')
    try {
      const res = await fetch('/api/public/instore/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id,
          message: text,
          conversation_id: conversationId,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? ('HTTP ' + res.status))
      }

      // ── Parse SSE stream ───────────────────────────────────────────
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let streamedReply = ''
      let metadata: {
        conversation_id?: string | null
        product_cards?: ProductCard[]
        upsell?: ProductCard | null
        suggest_recipe?: boolean
        suggest_loyalty_signup?: boolean
        full_reply?: string
      } = {}

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n\n')
        buf = lines.pop() ?? ''
        for (const block of lines) {
          const line = block.trim()
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (payload === '[DONE]') continue
          let evt: { type?: string; text?: string; message?: string;
            conversation_id?: string | null; product_cards?: ProductCard[];
            upsell?: ProductCard | null; suggest_recipe?: boolean;
            suggest_loyalty_signup?: boolean; full_reply?: string } = {}
          try { evt = JSON.parse(payload) } catch { continue }
          if (evt.type === 'token' && evt.text) {
            streamedReply += evt.text
            const snapshot = streamedReply
            setMessages(m => {
              const next = m.slice()
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'assistant') {
                  next[i] = { ...next[i], content: snapshot }
                  break
                }
              }
              return next
            })
          } else if (evt.type === 'metadata') {
            metadata = evt
          } else if (evt.type === 'error') {
            throw new Error(evt.message ?? 'stream_error')
          }
        }
      }

      const finalText = metadata.full_reply ?? streamedReply
      setConversationId(metadata.conversation_id ?? null)

      // Trigger recipe fetch if signalled
      let recipe: RecipeCard | null = null
      if (metadata.suggest_recipe) {
        try {
          const r = await fetch('/api/public/instore/recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id, query: text }),
          }).then(r => r.json())
          if (r.recipe) recipe = r.recipe
        } catch { /* non-fatal */ }
      }

      // Finalise the assistant message with full text + cards + recipe
      setMessages(m => {
        const next = m.slice()
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant') {
            next[i] = {
              role: 'assistant',
              content: finalText,
              cards: metadata.product_cards,
              upsell: metadata.upsell,
              recipe,
            }
            break
          }
        }
        return next
      })

      if (voiceEnabled && finalText) speak(finalText)
      if (metadata.suggest_loyalty_signup) setShowSignup(true)
    } catch (e: unknown) {
      // Roll back the empty placeholder if the stream blew up before any tokens
      setMessages(m => {
        const next = m.slice()
        if (next.length > 0 && next[next.length - 1].role === 'assistant' && !next[next.length - 1].content) {
          next.pop()
        }
        return next
      })
      setError((e as Error).message)
    }
    setSending(false)
  }, [business_id, conversationId, messages, sending, voiceEnabled])

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') return
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      setError('Voice input is not supported in this browser. Try typing instead.')
      return
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      setListening(false)
      return
    }
    const rec = new SR()
    rec.lang = 'en-AU'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript
      setInput(transcript)
      setTimeout(() => sendMessage(transcript), 100)
    }
    rec.onerror = () => { setListening(false); recognitionRef.current = null }
    rec.onend = () => { setListening(false); recognitionRef.current = null }
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }, [sendMessage])

  async function submitSignup() {
    if (!signupEmail) return
    setSignupBusy(true)
    try {
      const res = await fetch('/api/public/instore/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id, email: signupEmail, name: signupName, conversation_id: conversationId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Signup failed')
      setMessages(m => [...m, { role: 'assistant', content: d.welcome_message }])
      if (voiceEnabled) speak(d.welcome_message)
      setShowSignup(false)
      setSignupEmail('')
      setSignupName('')
      setShowConfetti(true)
      setTimeout(() => setShowConfetti(false), 2200)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
    setSignupBusy(false)
  }

  const C = {
    bg: '#0E1812', card: 'rgba(255,255,255,0.04)', cardHi: 'rgba(127,184,151,0.08)',
    text: '#F0F4F0', muted: 'rgba(255,255,255,0.55)', dim: 'rgba(255,255,255,0.3)',
    green: '#7FB897', darkGreen: '#2D5240', border: 'rgba(127,184,151,0.18)',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <Confetti show={showConfetti} />

      {/* Header */}
      <header style={{ padding: '28px 32px 16px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: C.darkGreen, color: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, animation: messages.length === 0 ? 'kiosk-wave 2.4s ease-in-out infinite' : undefined }}>👋</div>
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{kioskName}</h1>
              <p style={{ fontSize: 14, color: C.muted, margin: '2px 0 0' }}>{greeting || 'Ask me anything — voice or text'}</p>
            </div>
          </div>
        </div>
        {voiceEnabled && (
          <button onClick={() => { window.speechSynthesis?.cancel(); setVoiceEnabled(v => !v) }}
            style={{ background: 'transparent', border: '1px solid ' + C.border, color: C.green, fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>
            🔊 Voice on
          </button>
        )}
        {!voiceEnabled && (
          <button onClick={() => setVoiceEnabled(true)}
            style={{ background: 'transparent', border: '1px solid ' + C.dim, color: C.dim, fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>
            🔇 Voice off
          </button>
        )}
      </header>

      {/* Chat area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 880, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: C.muted }}>
            <p style={{ fontSize: 22, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: C.green, marginBottom: 12 }}>
              {IDLE_PROMPTS[idleIdx]}
            </p>
            <p style={{ fontSize: 14, color: C.dim }}>Tap the mic to speak, or type below.</p>

            {/* Suggested starter chips — industry aware, disappear after first send */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 22, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
              {chipsForIndustry(industry).map(chip => (
                <button
                  key={chip}
                  onClick={() => sendMessage(chip)}
                  disabled={sending}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 999,
                    background: 'rgba(127,184,151,0.08)',
                    border: '1px solid rgba(127,184,151,0.28)',
                    color: C.green,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    minHeight: 40,
                    opacity: sending ? 0.5 : 1,
                  }}>
                  {chip}
                </button>
              ))}
            </div>

            <BundlesShelf businessId={business_id} variant="kiosk" />
            <AdRotator businessId={business_id} variant="kiosk" />
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 18, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '78%' }}>
              <div style={{
                padding: '14px 18px', borderRadius: 16, fontSize: 17, lineHeight: 1.5,
                background: m.role === 'user' ? C.darkGreen : C.card,
                color: m.role === 'user' ? '#fff' : C.text,
                border: m.role === 'user' ? 'none' : '1px solid ' + C.border,
              }}>
                {m.content}
              </div>
              {m.cards && m.cards.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginTop: 10 }}>
                  {m.cards.map(c => (
                    <div key={c.id} style={{ background: C.cardHi, border: '1px solid ' + C.border, borderRadius: 12, padding: 12 }}>
                      {c.image_url && <img src={c.image_url} alt={c.name} style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />}
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.text }}>{c.name}</p>
                      {c.price != null && <p style={{ fontSize: 13, color: C.green, margin: '4px 0 0', fontWeight: 700 }}>A${c.price.toFixed(2)}</p>}
                      {c.stock <= 3 && c.stock > 0 && <p style={{ fontSize: 11, color: '#F59E0B', margin: '4px 0 0' }}>Only {c.stock} left</p>}
                    </div>
                  ))}
                </div>
              )}
              {m.upsell && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, fontSize: 13 }}>
                  <span style={{ color: '#F59E0B', fontWeight: 700, marginRight: 6 }}>✨ Pairs well:</span>
                  <span style={{ color: C.text }}>{m.upsell.name}</span>
                  {m.upsell.price != null && <span style={{ color: C.green, marginLeft: 8 }}>A${m.upsell.price.toFixed(2)}</span>}
                </div>
              )}
              {m.recipe && (
                <div style={{ marginTop: 10, padding: '14px 16px', background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 12 }}>
                  <p style={{ fontSize: 11, color: '#A78BFA', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>Recipe idea</p>
                  <p style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 6px', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{m.recipe.recipe_name}</p>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 8px' }}>{m.recipe.ingredients.join(' · ')}</p>
                  <p style={{ fontSize: 13, color: C.green, margin: 0 }}>{m.recipe.one_liner}</p>
                  {m.recipe.matched_products.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {m.recipe.matched_products.map(p => (
                        <span key={p.id} style={{ padding: '4px 10px', background: 'rgba(127,184,151,0.12)', border: '1px solid ' + C.border, borderRadius: 14, fontSize: 12, color: C.green }}>
                          {p.name}{p.price != null ? ' · A$' + p.price.toFixed(2) : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 14, fontStyle: 'italic', padding: '0 4px' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: `kiosk-dot 1.2s ${i * 0.15}s ease-in-out infinite` }} />)}
            </div>
            hmm, good one…
          </div>
        )}
        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#F87171', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ padding: '16px 32px 24px', borderTop: '1px solid ' + C.border, background: C.bg, maxWidth: 880, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={startListening} disabled={sending}
            aria-label={listening ? 'Stop listening' : 'Start voice input'}
            style={{
              width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: listening ? '#EF4444' : C.darkGreen, color: '#fff', fontSize: 24,
              flexShrink: 0, transition: 'all 0.2s', opacity: sending ? 0.5 : 1,
              animation: listening ? 'kiosk-pulse 1.2s ease-in-out infinite' : undefined,
            }}>
            {listening ? '⏹' : '🎤'}
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
            placeholder="Type or tap the mic to ask…"
            disabled={sending}
            style={{
              flex: 1, padding: '16px 20px', borderRadius: 14,
              background: C.card, border: '1px solid ' + C.border,
              color: C.text, fontSize: 17, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button onClick={() => sendMessage(input)} disabled={sending || !input.trim()}
            style={{
              padding: '14px 24px', borderRadius: 14, border: 'none', cursor: 'pointer',
              background: C.green, color: '#0E1812', fontSize: 15, fontWeight: 700,
              opacity: !input.trim() || sending ? 0.5 : 1, fontFamily: 'inherit',
            }}>
            Send
          </button>
        </div>
      </div>

      {/* Loyalty signup modal */}
      {showSignup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div style={{ background: '#13201A', padding: 28, borderRadius: 18, maxWidth: 420, width: '100%', border: '1px solid ' + C.border }}>
            <p style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Loyalty Rewards</p>
            <h3 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 8px', fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>Free perks on us</h3>
            <p style={{ fontSize: 14, color: C.muted, margin: '0 0 16px', lineHeight: 1.55 }}>Pop your email in and I'll set you up. Takes 5 seconds.</p>
            <input value={signupName} onChange={e => setSignupName(e.target.value)} placeholder="Your name (optional)"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: C.card, border: '1px solid ' + C.border, color: C.text, fontSize: 15, marginBottom: 8, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <input value={signupEmail} onChange={e => setSignupEmail(e.target.value)} type="email" placeholder="you@email.com"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: C.card, border: '1px solid ' + C.border, color: C.text, fontSize: 15, marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSignup(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
                No thanks
              </button>
              <button onClick={submitSignup} disabled={signupBusy || !signupEmail}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: C.green, color: '#0E1812', cursor: 'pointer', fontSize: 14, fontWeight: 700, opacity: signupBusy || !signupEmail ? 0.5 : 1, fontFamily: 'inherit' }}>
                {signupBusy ? 'Signing you up…' : 'Sign me up'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes kiosk-wave { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-20deg); } 75% { transform: rotate(15deg); } }
        @keyframes kiosk-dot { 0%, 60%, 100% { opacity: 0.3; transform: scale(0.85); } 30% { opacity: 1; transform: scale(1.15); } }
        @keyframes kiosk-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.6); } 50% { box-shadow: 0 0 0 12px rgba(239,68,68,0); } }
        body { margin: 0; }
      `}</style>
    </div>
  )
}
