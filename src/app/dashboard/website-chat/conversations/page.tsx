'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import { supabase } from '@/lib/supabase';

interface ConvMessage { role: string; content: string; }
interface Conversation {
  id: string;
  visitor_id: string;
  messages: ConvMessage[];
  created_at: string;
  updated_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function WidgetConversationsPage() {
  const { business } = useBusinessContext();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('widget_conversations')
      .select('*')
      .eq('business_id', business.id)
      .order('updated_at', { ascending: false })
      .limit(100);

    setConversations((data ?? []) as Conversation[]);
    setLoading(false);
  }, [business?.id]);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const todayCount = conversations.filter(c => c.created_at >= startOfDay).length;
  const weekCount = conversations.filter(c => c.created_at >= startOfWeek).length;
  const monthCount = conversations.filter(c => c.created_at >= startOfMonth).length;

  return (
    <div className="flex-1 overflow-y-auto bg-[#0d0d14] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-white mb-1">Widget Conversations</h1>
            <p className="text-sm text-[rgba(255,255,255,0.4)]">
              Chat sessions from your embedded website widget.
            </p>
          </div>
          <a href="/dashboard/website-chat" className="text-[12px] text-[rgba(255,255,255,0.35)] hover:text-white transition-colors">
            ← Widget settings
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Today', value: todayCount },
            { label: 'This week', value: weekCount },
            { label: 'This month', value: monthCount },
          ].map(s => (
            <div key={s.label} className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-[11px] text-[rgba(255,255,255,0.4)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Conversation list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 text-[rgba(255,255,255,0.3)] text-sm">
            No conversations yet. Embed the widget on your website to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map(conv => {
              const msgs = (conv.messages as ConvMessage[]) ?? [];
              const preview = msgs.find(m => m.role === 'user')?.content ?? 'No messages';
              const isOpen = expanded === conv.id;
              return (
                <div
                  key={conv.id}
                  className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : conv.id)}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-[rgba(29,158,117,0.15)] flex items-center justify-center text-[11px] font-bold text-[#1D9E75] flex-shrink-0">
                      {conv.visitor_id.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-white truncate">{preview}</div>
                      <div className="text-[10px] text-[rgba(255,255,255,0.3)] mt-0.5">
                        {msgs.length} messages · {timeAgo(conv.updated_at)}
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                      className={`w-4 h-4 text-[rgba(255,255,255,0.3)] transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {isOpen && (
                    <div className="border-t border-[rgba(255,255,255,0.05)] px-4 py-4 space-y-3 max-h-[400px] overflow-y-auto">
                      {msgs.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className="max-w-[80%] text-[12px] px-3 py-2 rounded-xl leading-relaxed"
                            style={
                              m.role === 'user'
                                ? { background: '#1D9E75', color: '#fff', borderRadius: '12px 12px 4px 12px' }
                                : { background: 'rgba(255,255,255,0.06)', color: '#e5e7eb', borderRadius: '12px 12px 12px 4px' }
                            }
                          >
                            {m.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}