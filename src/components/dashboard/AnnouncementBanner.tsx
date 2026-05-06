'use client';
import { useState } from 'react';

interface Announcement {
  id: string; title: string; message: string; type: string;
  cta_label: string | null; cta_href: string | null;
}

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  info:        { bg: 'rgba(56,189,248,0.08)',   border: 'rgba(56,189,248,0.2)',   text: '#38BDF8' },
  warning:     { bg: 'rgba(245,158,11,0.08)',   border: 'rgba(245,158,11,0.25)',  text: '#F59E0B' },
  success:     { bg: 'rgba(34,197,94,0.08)',    border: 'rgba(34,197,94,0.25)',   text: '#22C55E' },
  critical:    { bg: 'rgba(239,68,68,0.1)',     border: 'rgba(239,68,68,0.3)',    text: '#EF4444' },
  maintenance: { bg: 'rgba(139,92,246,0.08)',   border: 'rgba(139,92,246,0.2)',   text: '#8B5CF6' },
};

export default function AnnouncementBanner({ announcement }: { announcement: Announcement }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const style = TYPE_STYLES[announcement.type] ?? TYPE_STYLES.info;

  return (
    <div style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 10, padding: '10px 16px', margin: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 700, color: style.text, fontSize: 13 }}>{announcement.title}</span>
        {' · '}
        <span style={{ color: 'rgba(200,220,240,0.8)', fontSize: 13 }}>{announcement.message}</span>
      </div>
      {announcement.cta_label && announcement.cta_href && (
        <a href={announcement.cta_href} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 7, border: `1px solid ${style.border}`, color: style.text, textDecoration: 'none', fontWeight: 700, flexShrink: 0 }}>
          {announcement.cta_label}
        </a>
      )}
      <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: 'rgba(200,220,240,0.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>×</button>
    </div>
  );
}
