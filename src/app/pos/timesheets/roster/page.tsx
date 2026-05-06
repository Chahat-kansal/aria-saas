"use client";
import { useState, useEffect, useCallback } from "react";

const C = { bg:"rgba(17,15,26,0.95)", card:"rgba(26,23,40,0.9)", border:"#2A2540", text:"#EDE8FF", muted:"#8B85A8", dim:"#4A4565", violet:"#8B5CF6", green:"#22C55E", red:"#EF4444", amber:"#F59E0B", cyan:"#00E5FF" };

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const BREAK_OPTS = [0,15,30,45,60];

interface Shift { staff_id:string; staff_name:string; date:string; start_time:string; end_time:string; break_minutes:number; role:string; hours:number; cost_cents:number; }
interface Roster { id:string; name:string; week_starting:string; status:string; shifts:Shift[]; total_hours:number; total_cost_cents:number; aria_reasoning:string; }
interface PosUser { id:string; name:string; role:string; hourly_rate_cents:number; }

function getWeekDates(weekStart:string): string[] {
  const base = new Date(weekStart);
  return Array.from({length:7},(_,i)=>{const d=new Date(base);d.setDate(d.getDate()+i);return d.toISOString().split("T")[0];});
}

function hoursFromTimes(start:string,end:string,breakMin:number):number {
  const [sh,sm]=start.split(":").map(Number);
  const [eh,em]=end.split(":").map(Number);
  return Math.max(0,(eh*60+em-sh*60-sm-breakMin)/60);
}

function fmt(s:string):string{try{return new Date(s).toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"});}catch{return s;}}

function prevMonday(d:Date):string{const dow=d.getDay();const diff=dow===0?6:dow-1;const m=new Date(d);m.setDate(m.getDate()-diff);return m.toISOString().split("T")[0];}

export default function RosterPage(){
  const [weekStart,setWeekStart]=useState(()=>prevMonday(new Date()));
  const [roster,setRoster]=useState<Roster|null>(null);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [staff,setStaff]=useState<PosUser[]>([]);
  const [editShift,setEditShift]=useState<Shift|null>(null);
  const [editDate,setEditDate]=useState<string|null>(null);
  const [editStaffId,setEditStaffId]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);

  const dates=getWeekDates(weekStart);

  const load=useCallback(async()=>{
    try{
      const [rRes,sRes]=await Promise.all([
        fetch(`/api/aria/roster`).then(r=>r.json()),
        fetch("/api/pos/users?business_id=").then(r=>r.json()),
      ]);
      const matching=(rRes.rosters??[]).find((r:Roster)=>r.week_starting===weekStart);
      setRoster(matching??null);
      setStaff(sRes.users??[]);
    }catch{setError("Could not load roster");}
  },[weekStart]);

  useEffect(()=>{load();},[load]);

  async function generate(){
    setGenerating(true);setError(null);
    try{
      const res=await fetch("/api/aria/roster",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({week_starting:weekStart})});
      const d=await res.json();
      if(!res.ok||d.error){setError(d.error||"Generation failed");setGenerating(false);return;}
      setRoster(d.roster);
    }catch(e:unknown){setError(e instanceof Error?e.message:"Failed");}
    setGenerating(false);
  }

  async function approve(){
    if(!roster)return;
    setSaving(true);
    const res=await fetch(`/api/aria/roster?id=${roster.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"published"})});
    const d=await res.json();
    if(d.roster)setRoster(d.roster);
    setSaving(false);
  }

  async function discard(){
    if(!roster||!confirm("Discard this roster?"))return;
    await fetch(`/api/aria/roster?id=${roster.id}`,{method:"DELETE"});
    setRoster(null);
  }

  function openShiftEditor(staffId:string,date:string){
    const existing=roster?.shifts.find(s=>s.staff_id===staffId&&s.date===date);
    const su=staff.find(s=>s.id===staffId);
    setEditShift(existing??{staff_id:staffId,staff_name:su?.name??"",date,start_time:"09:00",end_time:"17:00",break_minutes:30,role:su?.role??"Cashier",hours:7.5,cost_cents:Math.round((su?.hourly_rate_cents??2500)/100*7.5*100)});
    setEditDate(date);setEditStaffId(staffId);
  }

  function saveShiftEdit(updated:Shift){
    if(!roster)return;
    const filtered=roster.shifts.filter(s=>!(s.staff_id===editStaffId&&s.date===editDate));
    const newShifts=[...filtered,updated];
    const tHours=newShifts.reduce((a,s)=>a+(s.hours??0),0);
    const tCost=newShifts.reduce((a,s)=>a+(s.cost_cents??0),0);
    const updated2={...roster,shifts:newShifts,total_hours:tHours,total_cost_cents:tCost};
    setRoster(updated2);
    fetch(`/api/aria/roster?id=${roster.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({shifts:newShifts})});
    setEditShift(null);setEditDate(null);setEditStaffId(null);
  }

  function removeShift(){
    if(!roster||!editStaffId||!editDate)return;
    const filtered=roster.shifts.filter(s=>!(s.staff_id===editStaffId&&s.date===editDate));
    const updated={...roster,shifts:filtered,total_hours:filtered.reduce((a,s)=>a+(s.hours??0),0),total_cost_cents:filtered.reduce((a,s)=>a+(s.cost_cents??0),0)};
    setRoster(updated);
    fetch(`/api/aria/roster?id=${roster.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({shifts:filtered})});
    setEditShift(null);setEditDate(null);setEditStaffId(null);
  }

  function shiftWeek(dir:number){
    const d=new Date(weekStart);d.setDate(d.getDate()+dir*7);
    setWeekStart(d.toISOString().split("T")[0]);
    setRoster(null);
  }

  const staffList=staff.length>0?staff:roster?[...new Set((roster.shifts??[]).map(s=>({id:s.staff_id,name:s.staff_name,role:s.role,hourly_rate_cents:0})))].filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i):[];

  return(
    <div style={{minHeight:"100%",background:C.bg,color:C.text,fontFamily:"'Manrope',sans-serif"}}>
      {/* Header */}
      <div style={{padding:"18px 28px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:2}}>Staff Roster</h1>
          <p style={{fontSize:12,color:C.muted}}>AI-generated weekly schedule with Fair Work compliance</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>shiftWeek(-1)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>◄</button>
          <span style={{fontSize:13,fontWeight:700,color:C.text,minWidth:180,textAlign:"center"}}>Week of {fmt(weekStart)}</span>
          <button onClick={()=>shiftWeek(1)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>►</button>
          <button onClick={generate} disabled={generating} style={{padding:"9px 20px",borderRadius:10,border:"none",background:C.violet,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:generating?0.6:1}}>
            {generating?"✨ Generating…":"✨ Generate Roster"}
          </button>
        </div>
      </div>

      <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:16}}>
        {error&&<div style={{padding:"12px 16px",background:"rgba(239,68,68,0.08)",border:`1px solid rgba(239,68,68,0.25)`,borderRadius:10,fontSize:13,color:C.red}}>⚠️ {error}</div>}

        {/* Aria reasoning */}
        {roster?.aria_reasoning&&(
          <div style={{background:C.card,borderLeft:`4px solid ${C.violet}`,borderRadius:"0 12px 12px 0",padding:"14px 18px"}}>
            <p style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.violet,marginBottom:6}}>Aria Scheduling Notes</p>
            <p style={{fontSize:13,color:C.muted,lineHeight:1.7}}>{roster.aria_reasoning}</p>
          </div>
        )}

        {/* Roster grid */}
        {(roster||staffList.length>0)&&(
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden"}}>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",minWidth:800}}>
                <thead>
                  <tr style={{background:"rgba(139,92,246,0.08)"}}>
                    <th style={{padding:"10px 14px",textAlign:"left",fontSize:11,fontWeight:700,textTransform:"uppercase",color:C.dim,width:140}}>Staff</th>
                    {dates.map((date,i)=>(
                      <th key={date} style={{padding:"10px 12px",textAlign:"center",fontSize:11,fontWeight:700,color:C.dim,borderLeft:`1px solid ${C.border}`}}>
                        <div>{DAYS[i]}</div>
                        <div style={{fontSize:10,fontWeight:500,color:C.dim,marginTop:2}}>{new Date(date).getDate()}</div>
                      </th>
                    ))}
                    <th style={{padding:"10px 12px",textAlign:"center",fontSize:11,fontWeight:700,color:C.dim,borderLeft:`1px solid ${C.border}`}}>Total Hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((su,ri)=>{
                    const staffShifts=roster?.shifts.filter(s=>s.staff_id===su.id)??[];
                    const totalHrs=staffShifts.reduce((a,s)=>a+(s.hours??0),0);
                    return(
                      <tr key={su.id} style={{borderTop:`1px solid ${C.border}`,background:ri%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                        <td style={{padding:"10px 14px"}}>
                          <p style={{fontSize:13,fontWeight:600,color:C.text}}>{su.name}</p>
                          <p style={{fontSize:10,color:C.dim,textTransform:"capitalize"}}>{su.role}</p>
                        </td>
                        {dates.map(date=>{
                          const sh=staffShifts.find(s=>s.date===date);
                          const compliance=sh&&sh.hours>10;
                          return(
                            <td key={date} onClick={()=>openShiftEditor(su.id,date)} style={{padding:"6px 8px",textAlign:"center",borderLeft:`1px solid ${C.border}`,cursor:"pointer",background:compliance?"rgba(239,68,68,0.08)":undefined}}>
                              {sh?(
                                <div style={{padding:"4px 6px",borderRadius:6,background:compliance?"rgba(239,68,68,0.12)":"rgba(34,197,94,0.1)",border:`1px solid ${compliance?"rgba(239,68,68,0.3)":"rgba(34,197,94,0.25)"}`}}>
                                  <p style={{fontSize:11,fontWeight:700,color:compliance?C.red:C.green,whiteSpace:"nowrap"}}>{sh.start_time}–{sh.end_time}</p>
                                  <p style={{fontSize:9,color:C.dim,marginTop:1}}>{sh.hours.toFixed(1)}h</p>
                                </div>
                              ):(
                                <span style={{fontSize:11,color:C.dim}}>OFF</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{padding:"10px 12px",textAlign:"center",borderLeft:`1px solid ${C.border}`,fontSize:13,fontWeight:700,color:C.text}}>{totalHrs.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals row */}
            {roster&&(
              <div style={{padding:"14px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:24,flexWrap:"wrap"}}>
                <span style={{fontSize:13,color:C.muted}}>Total hours: <strong style={{color:C.text}}>{roster.total_hours.toFixed(1)}</strong></span>
                <span style={{fontSize:13,color:C.muted}}>Labour cost: <strong style={{color:C.amber}}>A${(roster.total_cost_cents/100).toFixed(2)}</strong></span>
                <span style={{fontSize:11,padding:"3px 10px",borderRadius:99,background:roster.status==="published"?"rgba(34,197,94,0.15)":"rgba(139,92,246,0.15)",color:roster.status==="published"?C.green:C.violet,fontWeight:700,textTransform:"uppercase"}}>{roster.status}</span>
              </div>
            )}
          </div>
        )}

        {!roster&&!generating&&(
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"48px 24px",textAlign:"center"}}>
            <p style={{fontSize:32,marginBottom:12}}>📅</p>
            <p style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:6}}>No roster for this week</p>
            <p style={{fontSize:13,color:C.muted,marginBottom:24}}>Click "Generate Roster" to let Aria create an optimised schedule based on sales patterns and staff availability.</p>
            <button onClick={generate} style={{padding:"12px 28px",borderRadius:12,border:"none",background:C.violet,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✨ Generate Roster</button>
          </div>
        )}

        {/* Approval buttons */}
        {roster&&roster.status==="draft"&&(
          <div style={{display:"flex",gap:10}}>
            <button onClick={approve} disabled={saving} style={{padding:"12px 28px",borderRadius:12,border:"none",background:C.green,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:saving?0.6:1}}>
              ✓ Approve &amp; Publish Roster
            </button>
            <button onClick={discard} style={{padding:"12px 20px",borderRadius:12,border:`1px solid rgba(239,68,68,0.3)`,background:"transparent",color:C.red,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              ✗ Discard
            </button>
          </div>
        )}
        {roster&&roster.status==="published"&&(
          <div style={{padding:"12px 16px",background:"rgba(34,197,94,0.08)",border:`1px solid rgba(34,197,94,0.25)`,borderRadius:10,fontSize:13,color:C.green}}>
            ✓ This roster has been published and is visible to staff.
          </div>
        )}
      </div>

      {/* Shift editor modal */}
      {editShift&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
          <ShiftEditor
            shift={editShift}
            onSave={saveShiftEdit}
            onRemove={removeShift}
            onCancel={()=>{setEditShift(null);setEditDate(null);setEditStaffId(null);}}
          />
        </div>
      )}
    </div>
  );
}

function ShiftEditor({shift,onSave,onRemove,onCancel}:{shift:Shift;onSave:(s:Shift)=>void;onRemove:()=>void;onCancel:()=>void;}){
  const [start,setStart]=useState(shift.start_time);
  const [end,setEnd]=useState(shift.end_time);
  const [role,setRole]=useState(shift.role);
  const [brk,setBrk]=useState(shift.break_minutes);
  const C2={...{bg:"rgba(17,15,26,0.95)",card:"rgba(26,23,40,0.9)",border:"#2A2540",text:"#EDE8FF",muted:"#8B85A8",dim:"#4A4565",violet:"#8B5CF6",green:"#22C55E",red:"#EF4444"}};
  const hours=hoursFromTimes(start,end,brk);
  const iCls={background:"rgba(10,9,16,0.8)",border:`1px solid ${C2.border}`,borderRadius:8,padding:"9px 12px",fontSize:13,color:C2.text,outline:"none",fontFamily:"inherit",width:"100%"} as React.CSSProperties;

  function save(){
    onSave({...shift,start_time:start,end_time:end,role,break_minutes:brk,hours:Math.round(hours*100)/100,cost_cents:shift.cost_cents});
  }

  return(
    <div style={{background:C2.card,border:`1px solid ${C2.border}`,borderRadius:18,padding:28,width:360,display:"flex",flexDirection:"column",gap:16}}>
      <div>
        <p style={{fontSize:15,fontWeight:700,color:C2.text,marginBottom:2}}>{shift.staff_name}</p>
        <p style={{fontSize:12,color:C2.muted}}>{new Date(shift.date).toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C2.muted,marginBottom:6,textTransform:"uppercase"}}>Start</label>
          <input type="time" value={start} onChange={e=>setStart(e.target.value)} style={iCls}/>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C2.muted,marginBottom:6,textTransform:"uppercase"}}>End</label>
          <input type="time" value={end} onChange={e=>setEnd(e.target.value)} style={iCls}/>
        </div>
      </div>
      <div>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:C2.muted,marginBottom:6,textTransform:"uppercase"}}>Role</label>
        <input value={role} onChange={e=>setRole(e.target.value)} style={iCls} placeholder="Cashier"/>
      </div>
      <div>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:C2.muted,marginBottom:8,textTransform:"uppercase"}}>Break</label>
        <div style={{display:"flex",gap:6}}>
          {BREAK_OPTS.map(b=>(
            <button key={b} onClick={()=>setBrk(b)} style={{flex:1,padding:"7px 4px",borderRadius:7,border:`1px solid ${b===brk?C2.violet:C2.border}`,background:b===brk?"rgba(139,92,246,0.15)":"transparent",color:b===brk?C2.violet:C2.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:b===brk?700:400}}>
              {b===0?"None":`${b}m`}
            </button>
          ))}
        </div>
      </div>
      <div style={{padding:"10px 14px",background:"rgba(0,0,0,0.3)",borderRadius:10,display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:13,color:C2.muted}}>Hours: <strong style={{color:C2.text}}>{hours.toFixed(2)}</strong></span>
        {hours>10&&<span style={{fontSize:11,color:"#EF4444",fontWeight:700}}>⚠ Over 10h limit</span>}
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={save} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:C2.violet,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Save Shift</button>
        <button onClick={onRemove} style={{padding:"10px 14px",borderRadius:10,border:`1px solid rgba(239,68,68,0.3)`,background:"transparent",color:C2.red,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Remove</button>
        <button onClick={onCancel} style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${C2.border}`,background:"transparent",color:C2.muted,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
      </div>
    </div>
  );
}