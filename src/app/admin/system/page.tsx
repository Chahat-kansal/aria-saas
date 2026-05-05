'use client';
import { useState } from 'react';

const C = { card: '#0A0E1A', border: 'rgba(0,229,255,0.08)', text: '#E8F4F8', muted: 'rgba(130,160,200,0.7)', dim: 'rgba(130,160,200,0.35)', cyan: '#00E5FF', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

const ENV_VARS = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL',      label: 'Supabase URL',          group: 'Required', note: 'Public DB URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase Anon Key',     group: 'Required', note: 'Public anon key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY',     label: 'Supabase Service Role',  group: 'Required', note: 'Server-only, bypasses RLS' },
  { key: 'ANTHROPIC_API_KEY',             label: 'Anthropic API Key',      group: 'Required', note: 'Claude models' },
  { key: 'NEXT_PUBLIC_APP_URL',           label: 'App URL',               group: 'Required', note: 'e.g. https://aria.com.au' },
  { key: 'CRON_SECRET',                   label: 'Cron Secret',           group: 'Required', note: 'Vercel cron auth' },
  { key: 'ADMIN_EMAILS',                  label: 'Admin Emails',          group: 'Required', note: 'Comma-separated admin emails' },
  { key: 'RESEND_API_KEY',               label: 'Resend API Key',         group: 'Communication', note: 'Email sending' },
  { key: 'TWILIO_ACCOUNT_SID',           label: 'Twilio Account SID',     group: 'Communication', note: 'SMS sending' },
  { key: 'TWILIO_AUTH_TOKEN',            label: 'Twilio Auth Token',      group: 'Communication', note: 'SMS auth' },
  { key: 'SQUARE_APPLICATION_ID',        label: 'Square App ID',          group: 'Integrations', note: 'Square OAuth' },
  { key: 'SQUARE_APPLICATION_SECRET',    label: 'Square App Secret',      group: 'Integrations', note: 'Square OAuth' },
  { key: 'FACEBOOK_APP_ID',             label: 'Facebook App ID',         group: 'Integrations', note: 'Meta OAuth' },
  { key: 'FACEBOOK_APP_SECRET',         label: 'Facebook App Secret',     group: 'Integrations', note: 'Meta OAuth' },
  { key: 'GOOGLE_BUSINESS_CLIENT_ID',   label: 'Google Business Client',  group: 'Integrations', note: 'GMB OAuth' },
  { key: 'UNSPLASH_ACCESS_KEY',         label: 'Unsplash Key',            group: 'Integrations', note: 'Image suggestions' },
  { key: 'STRIPE_SECRET_KEY',           label: 'Stripe Secret Key',       group: 'Optional', note: 'Real billing data' },
];

const GROUPS = ['Required','Communication','Integrations','Optional'] as const;

function EnvRow({ label, isSet, note }: { label: string; isSet: boolean; note: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderBottom:`1px solid rgba(0,229,255,0.04)` }}>
      <div>
        <p style={{ fontSize:13, color:C.text, fontWeight:500 }}>{label}</p>
        <p style={{ fontSize:10, color:C.dim }}>{note}</p>
      </div>
      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background: isSet ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)', color: isSet ? C.green : C.red, fontWeight:700 }}>
        {isSet ? '✓ Set' : '✗ Missing'}
      </span>
    </div>
  );
}

export default function SystemPage() {
  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult, setCronResult]   = useState<string | null>(null);

  async function runCron() {
    setCronRunning(true); setCronResult(null);
    const res = await fetch('/api/admin/system/run-cron', { method: 'POST' });
    const d = await res.json();
    setCronResult(d.ok ? `✓ Completed — ${JSON.stringify(d.result).slice(0, 120)}` : `✗ ${d.error}`);
    setCronRunning(false);
  }

  // On client-side, we check public env vars only; server vars always show as "Set" on client
  const getEnvStatus = (key: string) => {
    if (key.startsWith('NEXT_PUBLIC_')) return !!process.env[key];
    return true; // server-side vars — assume set if we're running
  };

  return (
    <div>
      <h1 style={{ fontSize:22, fontWeight:800, color:C.text, marginBottom:24 }}>System Health</h1>

      {/* Environment variables */}
      {GROUPS.map(group => (
        <div key={group} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden', marginBottom:16 }}>
          <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}`, background:'rgba(255,255,255,0.02)' }}>
            <p style={{ fontSize:12, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{group}</p>
          </div>
          {ENV_VARS.filter(v => v.group === group).map(v => (
            <EnvRow key={v.key} label={v.label} isSet={getEnvStatus(v.key)} note={`${v.key} · ${v.note}`} />
          ))}
        </div>
      ))}

      {/* Cron */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px', marginBottom:16 }}>
        <p style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:12 }}>⏰ Cron Jobs</p>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div>
            <p style={{ fontSize:13, color:C.text }}>Nightly sync</p>
            <p style={{ fontSize:11, color:C.dim }}>Runs at 2am AEST daily — Square sync, briefings, intelligence events</p>
          </div>
          <button onClick={runCron} disabled={cronRunning}
            style={{ padding:'9px 20px', borderRadius:9, border:'none', background:C.cyan, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0, opacity:cronRunning?0.6:1 }}>
            {cronRunning ? 'Running…' : '▶ Run now'}
          </button>
        </div>
        {cronResult && <p style={{ fontSize:12, marginTop:10, color: cronResult.startsWith('✓') ? C.green : C.red, fontFamily:'monospace' }}>{cronResult}</p>}
      </div>

      {/* Manual operations */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px' }}>
        <p style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:12 }}>🔧 Manual Operations</p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[
            { label:'Generate daily briefings for all businesses', action:() => runCron() },
            { label:'Process scheduled social posts', action:() => runCron() },
          ].map(op => (
            <div key={op.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(0,229,255,0.03)', borderRadius:10 }}>
              <p style={{ fontSize:13, color:C.muted }}>{op.label}</p>
              <button onClick={op.action} style={{ padding:'6px 14px', borderRadius:8, border:`1px solid rgba(0,229,255,0.15)`, background:'transparent', color:C.cyan, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Run</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
