'use client';
import React, { useState, useRef, useEffect } from 'react';

export interface DateRange {
  from: Date;
  to: Date;
  preset: string;
}

const PRESETS = ['Today','Yesterday','This Week','Last Week','This Month','Last Month','This Year','Custom'] as const;

function startOfDay(d: Date) { const n = new Date(d); n.setHours(0,0,0,0); return n; }
function endOfDay(d: Date) { const n = new Date(d); n.setHours(23,59,59,999); return n; }
function today() { return startOfDay(new Date()); }

function presetRange(p: string): { from: Date; to: Date } {
  const t = today();
  switch (p) {
    case 'Today': return { from: t, to: endOfDay(new Date()) };
    case 'Yesterday': { const y = new Date(t); y.setDate(y.getDate()-1); return { from: y, to: endOfDay(y) }; }
    case 'This Week': { const s = new Date(t); s.setDate(s.getDate()-s.getDay()+1); return { from: s, to: endOfDay(new Date()) }; }
    case 'Last Week': { const s = new Date(t); s.setDate(s.getDate()-s.getDay()-6); const e = new Date(s); e.setDate(s.getDate()+6); return { from: s, to: endOfDay(e) }; }
    case 'This Month': { const s = new Date(t.getFullYear(), t.getMonth(), 1); return { from: s, to: endOfDay(new Date()) }; }
    case 'Last Month': { const s = new Date(t.getFullYear(), t.getMonth()-1, 1); const e = new Date(t.getFullYear(), t.getMonth(), 0); return { from: s, to: endOfDay(e) }; }
    case 'This Year': { const s = new Date(t.getFullYear(), 0, 1); return { from: s, to: endOfDay(new Date()) }; }
    default: return { from: t, to: endOfDay(new Date()) };
  }
}

interface CalendarProps {
  month: Date;
  from: Date | null;
  to: Date | null;
  onSelect: (d: Date) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

function Calendar({ month, from, to, onSelect, onPrev, onNext, onToday }: CalendarProps) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const cells: (Date|null)[] = Array(startDow).fill(null);
  for (let d=1;d<=daysInMonth;d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  const t = today();

  return (
    <div style={{ width: 220 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button onClick={onPrev} style={navBtn}>←</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {month.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onToday} style={{ ...navBtn, fontSize: 9, padding: '2px 5px' }}>Today</button>
          <button onClick={onNext} style={navBtn}>→</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, textAlign: 'center' }}>
        {['M','T','W','T','F','S','S'].map((d,i) => (
          <div key={i} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', padding: '2px 0' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const isFrom = from && sameDay(d, from);
          const isTo = to && sameDay(d, to);
          const inRange = from && to && d > from && d < to;
          const isToday = sameDay(d, t);
          return (
            <div key={i} onClick={() => onSelect(d)} style={{
              padding: '4px 2px', fontSize: 11, cursor: 'pointer', borderRadius: 4,
              background: (isFrom||isTo) ? 'var(--violet)' : inRange ? 'var(--violet-dim)' : 'transparent',
              color: (isFrom||isTo) ? '#fff' : isToday ? 'var(--violet)' : 'var(--text-primary)',
              fontWeight: (isFrom||isTo||isToday) ? 700 : 400,
            }}>
              {d.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, padding: '2px 6px', borderRadius: 4, fontFamily: 'inherit' };

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

export default function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | null>(null);
  const [month1, setMonth1] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth()-1, 1));
  const [month2, setMonth2] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function selectPreset(p: string) {
    if (p === 'Custom') { setOpen(true); return; }
    const r = presetRange(p);
    onChange({ ...r, preset: p });
  }

  function handleCalendarSelect(d: Date) {
    if (!customFrom) {
      setCustomFrom(d);
    } else {
      const from = d < customFrom ? d : customFrom;
      const to = d < customFrom ? customFrom : d;
      onChange({ from, to: endOfDay(to), preset: 'Custom' });
      setCustomFrom(null);
      setOpen(false);
    }
  }

  const fmtShort = (d: Date) => d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button key={p} onClick={() => selectPreset(p)} style={{
            padding: '5px 10px', borderRadius: 6, border: '1px solid',
            borderColor: value.preset === p ? 'var(--violet)' : 'var(--border-default)',
            background: value.preset === p ? 'var(--violet-dim)' : 'var(--bg-elevated)',
            color: value.preset === p ? 'var(--violet)' : 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>{p}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center', marginLeft: 4 }}>
          {fmtShort(value.from)} – {fmtShort(value.to)}
        </span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 50,
          background: 'var(--bg-elevated)', borderRadius: 14, padding: 16,
          boxShadow: 'var(--shadow-lg)', display: 'flex', gap: 20,
          border: '1px solid var(--border-default)',
        }}>
          <Calendar month={month1} from={customFrom ?? value.from} to={customFrom ? null : value.to}
            onSelect={handleCalendarSelect}
            onPrev={() => setMonth1(new Date(month1.getFullYear(), month1.getMonth()-1, 1))}
            onNext={() => setMonth1(new Date(month1.getFullYear(), month1.getMonth()+1, 1))}
            onToday={() => setMonth1(new Date(new Date().getFullYear(), new Date().getMonth()-1, 1))} />
          <Calendar month={month2} from={customFrom ?? value.from} to={customFrom ? null : value.to}
            onSelect={handleCalendarSelect}
            onPrev={() => setMonth2(new Date(month2.getFullYear(), month2.getMonth()-1, 1))}
            onNext={() => setMonth2(new Date(month2.getFullYear(), month2.getMonth()+1, 1))}
            onToday={() => setMonth2(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} />
        </div>
      )}
    </div>
  );
}
