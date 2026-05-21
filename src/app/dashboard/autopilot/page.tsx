"use client";
import { useState, useEffect, useCallback } from "react";

const C = { bg:"var(--bg-base)", card:"var(--bg-surface)", border:"rgba(255,255,255,0.07)", text:"var(--text-primary)", muted:"var(--text-secondary)", dim:"var(--text-tertiary)", violet:"#8B5CF6", green:"#22C55E", red:"#EF4444", amber:"#F59E0B" };
const CATEGORY_ICON: Record<string,string> = { INVENTORY:"📦", STAFFING:"👥", CUSTOMERS:"👤", PROMOTIONS:"💸", SOCIAL:"📱", FINANCE:"💰", COMPLIANCE:"⚖️", GENERAL:"⚡" };
const PRIORITY_COLOR = {
  urgent: { bg:"rgba(239,68,68,0.08)", border:"rgba(239,68,68,0.25)", accent:C.red, label:"🔴 URGENT" },
  important: { bg:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)", accent:C.amber, label:"🟡 IMPORTANT" },
  routine: { bg:"rgba(34,197,94,0.08)", border:"rgba(34,197,94,0.25)", accent:C.green, label:"🟢 ROUTINE" },
};

interface AutopilotAction { id:string; category:string; priority:string; title:string; description:string; estimated_impact:string|null; status:string; created_at:string; approved_at?:string; executed_at?:string; }

export default function AutopilotPage(){
  const [actions,setActions]=useState<AutopilotAction[]>([]);
  const [history,setHistory]=useState<AutopilotAction[]>([]);
  const [tab,setTab]=useState<"pending"|"history">("pending");
  const [loading,setLoading]=useState(true);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [lastRun,setLastRun]=useState<string|null>(null);
  const [stats,setStats]=useState({approved:0,rejected:0,executed:0,pending:0});

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [pendingRes,histRes]=await Promise.all([
        fetch("/api/aria/autopilot?status=pending").then(r=>r.json()),
        fetch("/api/aria/autopilot?status=approved").then(r=>r.json()),
      ]);
      const pendingActions: AutopilotAction[] = pendingRes.actions ?? [];
      const histActions: AutopilotAction[] = histRes.actions ?? [];
      setActions(pendingActions);
      setHistory(histActions);
      setStats({ pending:pendingActions.length, approved:histActions.filter(a=>a.approved_at).length, rejected:0, executed:histActions.filter(a=>a.executed_at).length });
    }catch{setError("Could not load actions");}
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  async function runAnalysis(){
    setRunning(true);setError(null);
    try{
      const res=await fetch("/api/aria/autopilot",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
      const d=await res.json();
      if(!res.ok||d.error){setError(d.error||"Analysis failed");setRunning(false);return;}
      setLastRun(new Date().toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"}));
      await load();
    }catch(e:unknown){setError(e instanceof Error?e.message:"Failed");}
    setRunning(false);
  }

  async function updateAction(id:string,status:string){
    const res=await fetch(('/api/aria/autopilot?id=' + id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
    const d=await res.json();
    if(d.action){ setActions(prev=>prev.filter(a=>a.id!==id)); if(status==="approved"||status==="rejected"){await load();} }
  }

  async function approveAllRoutine(){
    const routines=actions.filter(a=>a.priority==="routine");
    await Promise.all(routines.map(a=>updateAction(a.id,"approved")));
    await load();
  }

  const byPriority=(p:string)=>actions.filter(a=>a.priority===p);

  return(
    <div style={{minHeight:"100%",background:C.bg,color:C.text,fontFamily:"'Inter',sans-serif"}}>
      {/* Header */}
      <div style={{padding:"20px 28px",borderBottom:('1px solid ' + C.border),display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700,marginBottom:2}}>⚡ Aria Autopilot</h1>
          <p style={{fontSize:12,color:C.muted}}>AI-generated actions based on your live business data{lastRun&&(' — analysed at ' + lastRun)}</p>
        </div>
        <button onClick={runAnalysis} disabled={running} style={{padding:"10px 22px",borderRadius:10,border:"none",background:C.violet,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:running?0.6:1}}>
          {running?"✨ Analysing…":"▶ Run Analysis"}
        </button>
      </div>

      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,borderBottom:('1px solid ' + C.border),background:C.border}}>
        {[
          {label:"Pending",value:stats.pending,color:C.amber},
          {label:"Approved",value:stats.approved,color:C.green},
          {label:"Executed",value:stats.executed,color:C.violet},
          {label:"Total today",value:stats.pending+stats.approved+stats.executed,color:C.muted},
        ].map(s=>(
          <div key={s.label} style={{background:C.bg,padding:"14px 20px",textAlign:"center"}}>
            <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</div>
            <div style={{fontSize:10,color:C.dim,textTransform:"uppercase",letterSpacing:"0.06em",marginTop:2}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,borderBottom:('1px solid ' + C.border),padding:"0 28px"}}>
        {(["pending","history"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"12px 16px",border:"none",borderBottom:('2px solid ' + tab===t?C.violet:"transparent"),background:"transparent",color:tab===t?C.text:C.muted,fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",fontFamily:"inherit",textTransform:"capitalize"}}>
            {t==="pending"?('Pending actions (' + stats.pending + ')'):"History"}
          </button>
        ))}
      </div>

      <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:20}}>
        {error&&<div style={{padding:"12px 16px",background:"rgba(239,68,68,0.08)",border:'1px solid rgba(239,68,68,0.25)',borderRadius:10,fontSize:13,color:C.red}}>⚠️ {error}</div>}
        {loading&&<div style={{textAlign:"center",padding:"40px 0",color:C.dim}}>Loading…</div>}

        {tab==="pending"&&!loading&&(
          <>
            {actions.length===0&&(
              <div style={{background:C.card,border:('1px solid ' + C.border),borderRadius:14,padding:"48px 24px",textAlign:"center"}}>
                <p style={{fontSize:32,marginBottom:12}}>⚡</p>
                <p style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>No pending actions</p>
                <p style={{fontSize:13,color:C.muted,marginBottom:24}}>Run analysis to generate AI-powered recommendations from your live sales data.</p>
                <button onClick={runAnalysis} disabled={running} style={{padding:"12px 28px",borderRadius:12,border:"none",background:C.violet,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:running?0.6:1}}>
                  {running?"Analysing…":"▶ Run Analysis Now"}
                </button>
              </div>
            )}
            {(["urgent","important","routine"] as const).map(priority=>{
              const items=byPriority(priority);
              if(!items.length)return null;
              const pStyle=PRIORITY_COLOR[priority];
              return(
                <div key={priority}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <h2 style={{fontSize:13,fontWeight:700,color:pStyle.accent}}>{pStyle.label} — {items.length} action{items.length!==1?"s":""}</h2>
                    {priority==="routine"&&items.length>1&&(
                      <button onClick={approveAllRoutine} style={{padding:"6px 14px",borderRadius:8,border:('1px solid ' + pStyle.border),background:pStyle.bg,color:pStyle.accent,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                        ✓ Approve All Routine
                      </button>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {items.map(action=>(
                      <div key={action.id} style={{background:pStyle.bg,border:('1px solid ' + pStyle.border),borderLeft:('4px solid ' + pStyle.accent),borderRadius:"0 12px 12px 0",padding:"16px 18px",display:"flex",alignItems:"flex-start",gap:14}}>
                        <span style={{fontSize:22,flexShrink:0,marginTop:2}}>{CATEGORY_ICON[action.category]??CATEGORY_ICON.GENERAL}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:99,background:(pStyle.accent + '20'),color:pStyle.accent}}>{action.category}</span>
                            <p style={{fontSize:14,fontWeight:700,color:C.text}}>{action.title}</p>
                          </div>
                          <p style={{fontSize:13,color:C.muted,lineHeight:1.6,marginBottom:action.estimated_impact?6:0}}>{action.description}</p>
                          {action.estimated_impact&&<p style={{fontSize:12,fontWeight:600,color:pStyle.accent}}>💡 {action.estimated_impact}</p>}
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <button onClick={()=>updateAction(action.id,"approved")} style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.green,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓ Approve</button>
                          <button onClick={()=>updateAction(action.id,"rejected")} style={{padding:"8px 12px",borderRadius:8,border:('1px solid ' + C.border),background:"transparent",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✗ Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab==="history"&&!loading&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {history.length===0&&<p style={{color:C.muted,textAlign:"center",padding:"40px 0"}}>No approved actions yet. Run an analysis and approve some actions to see them here.</p>}
            {history.map(action=>{
              const pStyle=PRIORITY_COLOR[action.priority as keyof typeof PRIORITY_COLOR]??PRIORITY_COLOR.routine;
              return(
                <div key={action.id} style={{background:C.card,border:('1px solid ' + C.border),borderRadius:12,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,opacity:0.8}}>
                  <span style={{fontSize:20}}>{CATEGORY_ICON[action.category]??CATEGORY_ICON.GENERAL}</span>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:600,color:C.text}}>{action.title}</p>
                    {action.estimated_impact&&<p style={{fontSize:11,color:C.muted}}>{action.estimated_impact}</p>}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:99,background:(pStyle.accent + '15'),color:pStyle.accent}}>{action.status.toUpperCase()}</span>
                    {action.approved_at&&<p style={{fontSize:10,color:C.dim,marginTop:4}}>{new Date(action.approved_at).toLocaleDateString("en-AU")}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
