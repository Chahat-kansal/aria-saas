'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ClipboardCheck,
  Database,
  Edit3,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

type Priority = 'urgent' | 'high' | 'medium' | 'low';
type ActionStatus = 'pending' | 'approved' | 'ignored' | 'completed' | 'edited';

type DataStatus = {
  has_pos_connection: boolean;
  has_sales_data: boolean;
  has_product_data: boolean;
  has_inventory_data: boolean;
  has_supplier_data: boolean;
  has_customer_data: boolean;
  has_staff_data: boolean;
  has_uploaded_data: boolean;
  has_previous_actions: boolean;
  last_sync_at: string | null;
  missing_required_data: string[];
};

type BrainRecommendation = {
  id?: string;
  title: string;
  category: string;
  priority: Priority;
  recommendation: string;
  reason: string;
  expected_impact: string;
  risk_if_ignored: string;
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
  suggested_action?: {
    type: string;
    label: string;
    requires_owner_approval: boolean;
    payload: Record<string, unknown>;
  };
};

type BrainObservation = {
  title: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  what_happened: string;
  what_it_means: string;
  evidence: string[];
  confidence: 'low' | 'medium' | 'high';
};

type BrainOutput = {
  summary: string;
  business_health_score: number | null;
  data_status: DataStatus | null;
  observations: BrainObservation[];
  recommendations: BrainRecommendation[];
  questions_to_ask_owner: string[];
  missing_data: string[];
  onboarding_guidance?: string;
  error?: string;
  raw_counts?: Record<string, number>;
};

const EMPTY_STATUS: DataStatus = {
  has_pos_connection: false,
  has_sales_data: false,
  has_product_data: false,
  has_inventory_data: false,
  has_supplier_data: false,
  has_customer_data: false,
  has_staff_data: false,
  has_uploaded_data: false,
  has_previous_actions: false,
  last_sync_at: null,
  missing_required_data: ['sales data', 'product catalogue', 'inventory or stock levels'],
};

const EMPTY_OUTPUT: BrainOutput = {
  summary: 'Aria is ready, but live business data is not connected yet.',
  business_health_score: null,
  data_status: EMPTY_STATUS,
  observations: [],
  recommendations: [],
  questions_to_ask_owner: [],
  missing_data: EMPTY_STATUS.missing_required_data,
};

const priorityClass: Record<Priority, string> = {
  urgent: 'bg-red-500/20 text-red-200 border-red-400/30',
  high: 'bg-red-500/15 text-red-300 border-red-400/20',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-400/20',
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/20',
};

const severityClass: Record<BrainObservation['severity'], string> = {
  critical: 'text-red-200',
  high: 'text-red-200',
  medium: 'text-amber-200',
  low: 'text-emerald-200',
};

function dateLabel(value: string | null) {
  if (!value) return 'No sync or import yet';
  return new Date(value).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function postBrain(businessId: string, mode: string, context?: object): Promise<BrainOutput> {
  const res = await fetch('/api/aria/business-brain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: businessId, mode, context }),
  });
  if (!res.ok) throw new Error(`Business brain returned ${res.status}`);
  return res.json();
}

async function saveAction(
  businessId: string,
  action: BrainRecommendation,
  status: ActionStatus
) {
  const created = await fetch('/api/aria/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      title: action.title,
      category: action.category,
      priority: action.priority === 'urgent' ? 'high' : action.priority,
      recommendation: action.recommendation,
      reason: action.reason,
      expected_impact: action.expected_impact,
      confidence: action.confidence,
      source: 'business_brain:morning_command_centre',
      payload: {
        evidence: action.evidence,
        risk_if_ignored: action.risk_if_ignored,
        suggested_action: action.suggested_action,
      },
    }),
  });
  if (!created.ok) throw new Error(`Action create failed ${created.status}`);
  const json = await created.json();
  const id = json.action?.id;
  if (!id) return;

  const updated = await fetch(`/api/aria/actions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!updated.ok) throw new Error(`Action update failed ${updated.status}`);
}

export function MorningCommandCentre() {
  const { business } = useBusinessContext();
  const [data, setData] = useState<BrainOutput>(EMPTY_OUTPUT);
  const [loading, setLoading] = useState(true);
  const [why, setWhy] = useState<BrainOutput | null>(null);
  const [whyLoading, setWhyLoading] = useState(false);
  const [editing, setEditing] = useState<BrainRecommendation | null>(null);
  const [actionState, setActionState] = useState<Record<string, ActionStatus>>({});
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!business?.id) {
      setData(EMPTY_OUTPUT);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await postBrain(business.id, 'daily');
      setData({ ...EMPTY_OUTPUT, ...result, data_status: result.data_status ?? EMPTY_STATUS });
    } catch (error) {
      console.error('Morning Command Centre: business brain failed', error);
      setData({
        ...EMPTY_OUTPUT,
        summary: 'Aria could not analyse business data right now.',
        error: 'Unable to generate business intelligence.',
      });
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const status = data.data_status ?? EMPTY_STATUS;
  const hasAnyData = status.has_sales_data || status.has_product_data || status.has_inventory_data || status.has_supplier_data || status.has_customer_data || status.has_uploaded_data;

  const topActions = useMemo(() => {
    const order: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return [...(data.recommendations ?? [])].sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 6);
  }, [data.recommendations]);

  async function persist(action: BrainRecommendation, statusToSet: ActionStatus) {
    if (!business?.id) return;
    const key = action.title;
    setWorking(key);
    try {
      await saveAction(business.id, action, statusToSet);
      setActionState(prev => ({ ...prev, [key]: statusToSet }));
    } catch (error) {
      console.error('Morning Command Centre: action save failed', error);
    } finally {
      setWorking(null);
    }
  }

  async function askWhy(action: BrainRecommendation) {
    if (!business?.id) return;
    setWhyLoading(true);
    setWhy(null);
    try {
      const result = await postBrain(business.id, 'explain', action);
      setWhy(result);
    } catch (error) {
      console.error('Morning Command Centre: explanation failed', error);
      setWhy({
        ...EMPTY_OUTPUT,
        summary: 'Aria could not explain this recommendation right now.',
        missing_data: status.missing_required_data,
      });
    } finally {
      setWhyLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#12131a]/95 shadow-2xl shadow-black/20">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(29,158,117,0.18),rgba(255,255,255,0.02))] p-5 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#1D9E75] text-xs font-bold text-white">A</span>
              <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#5ee0b1]">AI Co-owner</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#1D9E75] animate-pulse" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Today&apos;s business plan</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">
              {loading ? 'Checking connected records...' : data.summary}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/import-data" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10">
              <Upload className="h-3.5 w-3.5" />
              Upload sales data
            </Link>
            <Link href="/dashboard/ask-aria" className="inline-flex items-center gap-2 rounded-xl bg-[#1D9E75] px-3 py-2 text-xs font-semibold text-white hover:bg-[#188765]">
              Ask Aria
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-4 md:p-5">
        <Panel>
          <SectionTitle icon={<Database className="h-4 w-4" />} title="Data Status" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <StatusPill label="POS connected" connected={status.has_pos_connection} />
            <StatusPill label="Sales data" connected={status.has_sales_data} />
            <StatusPill label="Products" connected={status.has_product_data} />
            <StatusPill label="Inventory" connected={status.has_inventory_data} />
            <StatusPill label="Supplier costs" connected={status.has_supplier_data} />
            <StatusPill label="Customers" connected={status.has_customer_data} />
            <StatusPill label="Staff" connected={status.has_staff_data} />
            <StatusPill label="Uploaded data" connected={status.has_uploaded_data} />
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 sm:col-span-2 lg:col-span-4">
              <p className="text-[10px] uppercase tracking-[.12em] text-white/35">Last sync/import</p>
              <p className="mt-1 text-xs font-medium text-white/65">{loading ? 'Checking...' : dateLabel(status.last_sync_at)}</p>
            </div>
          </div>
          {!hasAnyData && (
            <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-500/10 p-4">
              <p className="text-sm font-medium text-amber-100">Aria is ready, but live business data is not connected yet.</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
                Connect Square, use Aria POS, or upload sales/product/inventory data to generate your first real briefing.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <OnboardingLink href="/dashboard/integrations" label="Connect Square" />
                <OnboardingLink href="/pos" label="Use Aria POS" />
                <OnboardingLink href="/dashboard/import-data" label="Upload sales CSV" />
                <OnboardingLink href="/pos/products" label="Add products" />
              </div>
            </div>
          )}
        </Panel>

        <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
          <Panel>
            <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} title="Business Health Score" />
            {typeof data.business_health_score === 'number' ? (
              <div>
                <p className="text-5xl font-semibold text-white">{data.business_health_score}</p>
                <p className="mt-2 text-sm text-white/45">Calculated from connected business records.</p>
              </div>
            ) : (
              <EmptyMessage text="Connect sales, product and inventory data to calculate business health." />
            )}
          </Panel>

          <Panel>
            <SectionTitle icon={<Sparkles className="h-4 w-4" />} title="What Aria Found" />
            {data.observations.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {data.observations.slice(0, 4).map(observation => (
                  <div key={`${observation.category}-${observation.title}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{observation.title}</p>
                      <span className={`text-[10px] font-semibold uppercase ${severityClass[observation.severity]}`}>{observation.severity}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-white/50">{observation.what_happened}</p>
                    <p className="mt-2 text-xs leading-relaxed text-white/35">{observation.what_it_means}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMessage text={status.missing_required_data.length ? `Not enough live data to generate intelligence yet. Missing: ${status.missing_required_data.join(', ')}.` : 'No urgent changes found in connected records.'} />
            )}
          </Panel>
        </div>

        <Panel>
          <SectionTitle icon={<ClipboardCheck className="h-4 w-4" />} title="Today's AI Decisions" />
          {topActions.length ? (
            <div className="space-y-3">
              {topActions.map(action => {
                const statusText = actionState[action.title] ?? 'pending';
                return (
                  <div key={action.title} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityClass[action.priority]}`}>{action.priority}</span>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium capitalize text-white/55">{action.category}</span>
                          {statusText !== 'pending' && <span className="rounded-full border border-[#1D9E75]/30 bg-[#1D9E75]/10 px-2 py-0.5 text-[10px] text-[#8ff1c9]">{statusText}</span>}
                        </div>
                        <h3 className="text-sm font-semibold text-white">{action.recommendation}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-white/50">{action.reason}</p>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          <InfoTile label="Expected impact" value={action.expected_impact} />
                          <InfoTile label="Risk if ignored" value={action.risk_if_ignored} />
                          <InfoTile label="Confidence" value={action.confidence} />
                        </div>
                        {action.evidence.length > 0 && (
                          <div className="mt-3 rounded-lg bg-black/20 px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[.12em] text-white/30">Evidence used</p>
                            <ul className="mt-1 space-y-1 text-[11px] text-white/50">
                              {action.evidence.slice(0, 4).map(item => <li key={item}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <ActionButton disabled={working === action.title} onClick={() => persist(action, 'approved')}><Check className="h-3.5 w-3.5" />Approve</ActionButton>
                        <ActionButton onClick={() => setEditing(action)}><Edit3 className="h-3.5 w-3.5" />Edit</ActionButton>
                        <ActionButton disabled={working === action.title} onClick={() => persist(action, 'ignored')}><X className="h-3.5 w-3.5" />Ignore</ActionButton>
                        <ActionButton onClick={() => askWhy(action)}><HelpCircle className="h-3.5 w-3.5" />Ask Why</ActionButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyMessage text="No real recommendations yet. Connect POS, use Aria POS, or upload sales/product/inventory data." />
          )}
        </Panel>

        <Panel>
          <SectionTitle icon={<HelpCircle className="h-4 w-4" />} title="Ask Aria Why" />
          <div className="rounded-xl border border-[#1D9E75]/20 bg-[#1D9E75]/10 p-4">
            <p className="text-sm font-medium text-white">I checked your connected business records. Ask why I recommended an action.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Why should I order this?', 'Where am I losing margin?', 'What should I discount?', 'What should I not reorder?', 'What changed since last week?'].map(prompt => (
                <Link key={prompt} href={`/dashboard/ask-aria?q=${encodeURIComponent(prompt)}`} className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-white/65 hover:bg-white/10 hover:text-white">
                  {prompt}
                </Link>
              ))}
            </div>
          </div>
          {(whyLoading || why) && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#8ff1c9]">Aria explains</p>
                <button onClick={() => setWhy(null)} className="text-white/35 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              {whyLoading ? (
                <p className="text-sm text-white/45">Checking the evidence...</p>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-white/65">{why?.summary}</p>
                  {why?.missing_data?.length ? <p className="mt-2 text-xs text-white/35">Missing data: {why.missing_data.join(', ')}</p> : null}
                </>
              )}
            </div>
          )}
        </Panel>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151720] p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Edit recommendation</p>
                <p className="mt-1 text-xs text-white/40">This saves your edited version as an owner-reviewed action.</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-white/35 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <textarea
              value={editing.recommendation}
              onChange={event => setEditing({ ...editing, recommendation: event.target.value })}
              className="min-h-28 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none focus:border-[#1D9E75]/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-white/60 hover:bg-white/10">Cancel</button>
              <button
                onClick={() => {
                  persist(editing, 'edited');
                  setEditing(null);
                }}
                className="rounded-xl bg-[#1D9E75] px-4 py-2 text-xs font-semibold text-white hover:bg-[#188765]"
              >
                Save edit
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-white">
      <span className="text-[#8ff1c9]">{icon}</span>
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">{children}</div>;
}

function StatusPill({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-[10px] uppercase tracking-[.12em] text-white/35">{label}</p>
      <p className={`mt-1 text-xs font-semibold ${connected ? 'text-[#8ff1c9]' : 'text-white/35'}`}>
        {connected ? 'Connected' : 'Not connected'}
      </p>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
        <p className="text-sm leading-relaxed text-white/45">{text}</p>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-lg bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-white/55">
      <span className="block text-white/30">{label}</span>
      {value || 'Not available'}
    </p>
  );
}

function ActionButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/65 hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function OnboardingLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white">
      {label}
    </Link>
  );
}
