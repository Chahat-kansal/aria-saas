'use client';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

export default function SharePage({ params }: { params: { token: string } }) {
  const [conv, setConv] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then(r => r.json())
      .then(d => d.error ? setError(d.error) : setConv(d))
      .catch(() => setError('Failed to load'));
  }, [params.token]);

  if (error) return (
    <div className="min-h-screen bg-[#0e0e12] flex items-center justify-center text-[#888899]">
      <div className="text-center"><p className="mb-4">Conversation not found or sharing disabled.</p>
      <Link href="/" className="text-[#6C63FF] hover:underline">Go to Aria →</Link></div>
    </div>
  );

  if (!conv) return (
    <div className="min-h-screen bg-[#0e0e12] flex items-center justify-center">
      <div className="flex gap-1"><span className="w-2 h-2 rounded-full bg-[#6C63FF] animate-bounce" style={{animationDelay:'0ms'}}/><span className="w-2 h-2 rounded-full bg-[#6C63FF] animate-bounce" style={{animationDelay:'150ms'}}/><span className="w-2 h-2 rounded-full bg-[#6C63FF] animate-bounce" style={{animationDelay:'300ms'}}/></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e12] text-[#f0f0f5]">
      {/* Header */}
      <div className="border-b border-white/5 bg-[#16161d] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] flex items-center justify-center text-white text-xs font-bold">A</div>
          <div>
            <div className="font-medium text-sm">{conv.title}</div>
            <div className="text-[10px] text-[#555566]">Shared Aria conversation · {conv.messages.length} messages</div>
          </div>
        </div>
        <Link href="/signup" className="bg-[#6C63FF] hover:bg-[#4b44cc] text-white text-xs px-4 py-2 rounded-xl transition-colors font-medium">
          Try Aria free →
        </Link>
      </div>

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {conv.messages.map((msg: any, i: number) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 self-start mt-0.5 ${msg.role === 'assistant' ? 'bg-gradient-to-br from-[#6C63FF] to-[#a78bfa] text-white' : 'bg-white/10 text-white'}`}>
              {msg.role === 'assistant' ? 'A' : 'U'}
            </div>
            <div className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
              {msg.role === 'user' ? (
                <div className="bg-[#6C63FF] text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed max-w-[80%] break-words">{msg.content}</div>
              ) : (
                <div className="prose-aria text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* CTA footer */}
      <div className="border-t border-white/5 bg-[#16161d] px-6 py-8 text-center mt-8">
        <p className="text-[#888899] text-sm mb-4">Continue this conversation or start your own with Aria</p>
        <Link href="/signup" className="bg-[#6C63FF] hover:bg-[#4b44cc] text-white px-8 py-3 rounded-xl font-medium transition-colors inline-block">
          Get Aria for free →
        </Link>
      </div>
    </div>
  );
}
