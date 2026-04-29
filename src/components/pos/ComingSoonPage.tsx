'use client';
import Link from 'next/link';

interface Props {
  title: string;
  description: string;
  ariaQuery: string;
  icon?: string;
}

export default function ComingSoonPage({ title, description, ariaQuery, icon = '🔧' }: Props) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-[#1a1a16]">{title}</h1>
        <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{description}</p>
      </div>
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] shadow-sm p-12 text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <p className="text-base font-semibold text-[#1a1a16] mb-2">{title}</p>
        <p className="text-sm text-[rgba(26,26,22,.5)] mb-6 max-w-sm mx-auto">
          This feature is being built. In the meantime, Aria can help you with {description.toLowerCase()}.
        </p>
        <Link
          href={`/dashboard/ask-aria?q=${encodeURIComponent(ariaQuery)}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#1D9E75,#0fa86d)' }}
        >
          <span>✦</span>
          Ask Aria about {title.toLowerCase()}
        </Link>
      </div>
    </div>
  );
}
