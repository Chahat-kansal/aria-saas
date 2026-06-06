'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Task {
  key: string;
  label: string;
  href: string;
  optional?: boolean;
}

const PRODUCT_TASKS: Task[] = [
  { key: 'add_product',    label: 'Add your first product',               href: '/pos/products?guide=add_product' },
  { key: 'test_sale',      label: 'Make a test sale on the POS',          href: '/pos/terminal?guide=test_sale' },
  { key: 'set_hours',      label: 'Confirm your trading hours',           href: '/dashboard/settings?guide=set_hours' },
  { key: 'invite_staff',   label: 'Invite a team member',                 href: '/dashboard/staff/new?guide=invite_staff', optional: true },
  { key: 'connect_google', label: 'Connect your Google Business listing', href: '/dashboard/settings?guide=connect_google' },
];

const SERVICE_TASKS: Task[] = [
  { key: 'add_service',    label: 'Add your first service or class',      href: '/dashboard/bookings?guide=add_service' },
  { key: 'add_customer',   label: 'Add your first customer / family',     href: '/dashboard/customers?guide=add_customer' },
  { key: 'set_hours',      label: 'Confirm your opening hours',           href: '/dashboard/settings?guide=set_hours' },
  { key: 'invite_staff',   label: 'Invite a team member',                 href: '/dashboard/staff/new?guide=invite_staff', optional: true },
  { key: 'connect_google', label: 'Connect your Google Business listing', href: '/dashboard/settings?guide=connect_google' },
];

interface Progress {
  completedTasks: string[];
  dismissed: boolean;
  businessModel: string;
}

export function SetupGuide() {
  const { business } = useBusinessContext();
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/setup-guide');
      if (!res.ok) return;
      const data = await res.json() as Progress;
      setProgress(data);
      const tasks = data.businessModel === 'service' ? SERVICE_TASKS : PRODUCT_TASKS;
      const required = tasks.filter(t => !t.optional);
      const done = required.every(t => data.completedTasks.includes(t.key));
      if (done) { setAllDone(true); setShowDone(true); setTimeout(() => setShowDone(false), 3000); }
    } catch (e) { console.warn('[non-fatal]', e) }
  }, []);

  useEffect(() => {
    if (business?.id) fetchProgress();
  }, [business?.id, fetchProgress]);

  const dismiss = async () => {
    await fetch('/api/setup-guide', { method: 'PATCH' });
    setProgress(p => p ? { ...p, dismissed: true } : p);
  };

  if (!progress || progress.dismissed) return null;

  if (allDone && !showDone) return null;

  const tasks = progress.businessModel === 'service' ? SERVICE_TASKS : PRODUCT_TASKS;
  const done = progress.completedTasks;
  const completedCount = tasks.filter(t => done.includes(t.key)).length;

  if (allDone) {
    return (
      <div className="rounded-2xl border p-5 mb-6"
        style={{ background: 'rgba(127,184,151,0.08)', borderColor: 'rgba(127,184,151,0.25)' }}>
        <p className="text-sm font-medium" style={{ color: '#7FB897' }}>
          You&apos;re all set! Aria is ready to run your business.
        </p>
      </div>
    );
  }

  const pct = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="rounded-2xl border p-5 mb-6"
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold"
            style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: 'italic', color: '#E8EDE7' }}>
            Get started
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {completedCount} of {tasks.length} done
          </p>
        </div>
        <button onClick={dismiss} className="text-xs hover:underline"
          style={{ color: 'rgba(255,255,255,0.25)' }}>
          Dismiss
        </button>
      </div>

      <div className="rounded-full overflow-hidden mb-4" style={{ height: 4, background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: (pct + '%'), background: '#7FB897' }} />
      </div>

      <ul className="space-y-2">
        {tasks.map(task => {
          const isDone = done.includes(task.key);
          return (
            <li key={task.key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{
                    background: isDone ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.06)',
                    border: isDone ? '1px solid rgba(127,184,151,0.4)' : '1px solid rgba(255,255,255,0.12)',
                  }}>
                  {isDone && (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="#7FB897" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="text-xs truncate"
                  style={{
                    color: isDone ? 'rgba(255,255,255,0.3)' : '#E8EDE7',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}>
                  {task.label}
                  {task.optional && (
                    <span className="ml-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>(optional)</span>
                  )}
                </span>
              </div>
              {!isDone && (
                <button
                  onClick={() => router.push(task.href)}
                  className="flex-shrink-0 text-[11px] px-3 py-1 rounded-lg font-medium transition-colors"
                  style={{
                    background: 'rgba(127,184,151,0.12)',
                    border: '1px solid rgba(127,184,151,0.3)',
                    color: '#7FB897',
                  }}>
                  Do it
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
