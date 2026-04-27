'use client';
import { useState, useEffect } from 'react';
interface Session { id: string; opened_at: string; closed_at: string | null; opening_float: number | null; closing_float: number | null; cash_sales: number | null; card_sales: number | null; status: string; }
export default function RegisterClosuresPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/pos/sessions').then(r=>r.json()).then(d=>{
      setSessions((d.sessions||[]).filter((s:Session)=>s.status==='closed'));
      setLoading(false);
    });
  }, []);

  function variance(s: Session) {
    const expected = (s.opening_float??0) + (s.cash_sales??0);
    return (s.closing_float??0) - expected;
  }

  function exportCSV() {
    const rows = [['Date','Opened','Closed','Opening Float','Cash Sales','Card Sales','Closing Float','Variance']];
    sessions.forEach(s => {
      const v = variance(s);
      rows.push([
        s.opened_at ? new Date(s.opened_at).toLocaleDateString() : '',
        s.opened_at ? new Date(s.opened_at).toLocaleTimeString() : '',
        s.closed_at ? new Date(s.closed_at).toLocaleTimeString() : '',
        String(s.opening_float??0), String(s.cash_sales??0), String(s.card_sales??0),
        String(s.closing_float??0), v.toFixed(2),
      ]);
    });
    const csv = rows.map(r=>r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = 'register-closures.csv'; a.click();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-semibold text-[#1a1a16]">Register Closures</h1><p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">{sessions.length} closed session{sessions.length!==1?'s':''}</p></div>
        <button onClick={exportCSV} className="px-3 py-2 rounded-xl text-xs font-medium border border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)] hover:bg-[rgba(0,0,0,.04)] transition-colors">Export CSV</button>
      </div>
      {loading ? <p className="text-sm text-[rgba(26,26,22,.4)]">Loading…</p> : sessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-10 text-center"><p className="text-sm text-[rgba(26,26,22,.4)]">No closed sessions yet. Sessions appear here after you close the register.</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[rgba(0,0,0,.06)]">{['Date','Open','Close','Float','Cash Sales','Card Sales','Closing Float','Variance'].map(h=><th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,.45)]">{h}</th>)}</tr></thead>
            <tbody>
              {sessions.map(s => {
                const v = variance(s);
                return (
                  <tr key={s.id} className="border-b border-[rgba(0,0,0,.04)] hover:bg-[rgba(0,0,0,.02)]">
                    <td className="px-4 py-3 text-[#1a1a16] font-medium">{s.opened_at?new Date(s.opened_at).toLocaleDateString():'-'}</td>
                    <td className="px-4 py-3 text-[rgba(26,26,22,.6)]">{s.opened_at?new Date(s.opened_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'-'}</td>
                    <td className="px-4 py-3 text-[rgba(26,26,22,.6)]">{s.closed_at?new Date(s.closed_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'-'}</td>
                    <td className="px-4 py-3 text-[rgba(26,26,22,.6)]">${(s.opening_float??0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-[rgba(26,26,22,.6)]">${(s.cash_sales??0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-[rgba(26,26,22,.6)]">${(s.card_sales??0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-[rgba(26,26,22,.6)]">${(s.closing_float??0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`font-semibold ${Math.abs(v)<5?'text-green-600':Math.abs(v)<20?'text-amber-600':'text-red-600'}`}>
                        {v>=0?'+':''}{v.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
