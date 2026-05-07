"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const C = { bg:"#0F0F1A", card:"rgba(26,23,40,0.9)", border:"transparent", text:"#EDE8FF", muted:"#8B85A8", dim:"#4A4565", violet:"#8B5CF6", green:"#22C55E", red:"#EF4444", amber:"#F59E0B" };

const PLATFORM_COLOR: Record<string,string> = { instagram:"#E1306C", facebook:"#1877F2", google_business:"#4285F4", tiktok:"#000000", twitter:"#1DA1F2" };

interface Post { id:string; platform:string; caption:string; scheduled_for:string|null; status:string; image_url:string|null; }

function getDaysInMonth(year:number,month:number){return new Date(year,month+1,0).getDate();}
function getFirstDayOfMonth(year:number,month:number){return new Date(year,month,1).getDay();}

const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function SocialCalendarPage(){
  const now=new Date();
  const [year,setYear]=useState(now.getFullYear());
  const [month,setMonth]=useState(now.getMonth());
  const [posts,setPosts]=useState<Post[]>([]);
  const [selectedDay,setSelectedDay]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    fetch("/api/social/posts?limit=100")
      .then(r=>r.json())
      .then(d=>setPosts(d.posts??d.data??[]))
      .catch(()=>{})
      .finally(()=>setLoading(false));
  },[]);

  function shiftMonth(dir:number){
    let m=month+dir,y=year;
    if(m<0){m=11;y--;}if(m>11){m=0;y++;}
    setMonth(m);setYear(y);setSelectedDay(null);
  }

  const daysInMonth=getDaysInMonth(year,month);
  const firstDay=getFirstDayOfMonth(year,month);

  function postsForDay(day:number):Post[]{
    return posts.filter(p=>{
      if(!p.scheduled_for)return false;
      const d=new Date(p.scheduled_for);
      return d.getFullYear()===year&&d.getMonth()===month&&d.getDate()===day;
    });
  }

  const dayPosts=selectedDay?postsForDay(selectedDay):[];

  return(
    <div style={{minHeight:"100%",background:C.bg,color:C.text,fontFamily:"'Manrope',sans-serif",padding:"24px 28px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div>
          <h1 style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:2}}>Post Calendar</h1>
          <p style={{fontSize:12,color:C.muted}}>View and manage scheduled social media posts</p>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Link href="/dashboard/social" style={{padding:"9px 16px",borderRadius:9,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:13,textDecoration:"none",fontWeight:600}}>
            ← Posts
          </Link>
          <button onClick={()=>shiftMonth(-1)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>◄</button>
          <span style={{fontSize:15,fontWeight:700,color:C.text,minWidth:160,textAlign:"center"}}>{MONTHS[month]} {year}</span>
          <button onClick={()=>shiftMonth(1)} style={{padding:"7px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>►</button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:20,alignItems:"start"}}>
        {/* Calendar grid */}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"rgba(139,92,246,0.08)"}}>
            {DOW.map(d=>(
              <div key={d} style={{padding:"10px 0",textAlign:"center",fontSize:11,fontWeight:700,textTransform:"uppercase",color:C.dim}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {Array.from({length:firstDay},(_,i)=>(
              <div key={`empty-${i}`} style={{padding:"10px 8px",minHeight:80,borderTop:`1px solid ${C.border}`}}/>
            ))}
            {Array.from({length:daysInMonth},(_,i)=>{
              const day=i+1;
              const dayPosts2=postsForDay(day);
              const isToday=year===now.getFullYear()&&month===now.getMonth()&&day===now.getDate();
              const isSelected=selectedDay===day;
              return(
                <div key={day} onClick={()=>setSelectedDay(day===selectedDay?null:day)} style={{padding:"10px 8px",minHeight:80,borderTop:`1px solid ${C.border}`,borderLeft:(i+firstDay)%7!==0?`1px solid ${C.border}`:"none",cursor:"pointer",background:isSelected?"rgba(139,92,246,0.1)":undefined,transition:"background 150ms"}}>
                  <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:6,background:isToday?"#8B5CF6":undefined}}>
                    <span style={{fontSize:13,fontWeight:isToday||isSelected?700:400,color:isToday?"#fff":isSelected?C.violet:C.muted}}>{day}</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                    {dayPosts2.slice(0,3).map(p=>(
                      <div key={p.id} style={{width:8,height:8,borderRadius:"50%",background:PLATFORM_COLOR[p.platform]??"#8B5CF6"}} title={p.platform}/>
                    ))}
                    {dayPosts2.length>3&&<span style={{fontSize:9,color:C.dim}}>+{dayPosts2.length-3}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {selectedDay?(
            <>
              <div style={{padding:"14px 16px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12}}>
                <p style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:2}}>{MONTHS[month]} {selectedDay}</p>
                <p style={{fontSize:12,color:C.muted}}>{dayPosts.length} post{dayPosts.length!==1?"s":""} scheduled</p>
              </div>
              {dayPosts.length===0&&(
                <div style={{padding:"20px 16px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,textAlign:"center"}}>
                  <p style={{fontSize:12,color:C.dim,marginBottom:12}}>No posts scheduled</p>
                  <Link href="/dashboard/social" style={{fontSize:12,color:C.violet,textDecoration:"none",fontWeight:600}}>+ Schedule a post →</Link>
                </div>
              )}
              {dayPosts.map(p=>(
                <div key={p.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                  {p.image_url&&<img src={p.image_url} alt="" style={{width:"100%",height:120,objectFit:"cover"}}/>}
                  <div style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:PLATFORM_COLOR[p.platform]??"#8B5CF6",flexShrink:0,display:"inline-block"}}/>
                      <span style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"capitalize"}}>{p.platform.replace("_"," ")}</span>
                      <span style={{marginLeft:"auto",fontSize:10,padding:"2px 8px",borderRadius:99,background:"rgba(34,197,94,0.1)",color:C.green,fontWeight:700}}>Scheduled</span>
                    </div>
                    <p style={{fontSize:12,color:C.muted,lineHeight:1.5,WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",display:"-webkit-box"}}>{p.caption}</p>
                    {p.scheduled_for&&<p style={{fontSize:11,color:C.dim,marginTop:6}}>{new Date(p.scheduled_for).toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})}</p>}
                  </div>
                </div>
              ))}
            </>
          ):(
            <div style={{padding:"24px 16px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,textAlign:"center"}}>
              <p style={{fontSize:13,color:C.dim}}>Click a day to view scheduled posts</p>
            </div>
          )}

          {/* Legend */}
          <div style={{padding:"12px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12}}>
            <p style={{fontSize:11,fontWeight:700,color:C.dim,textTransform:"uppercase",marginBottom:10}}>Platforms</p>
            {Object.entries(PLATFORM_COLOR).map(([p,color])=>(
              <div key={p} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:color}}/>
                <span style={{fontSize:12,color:C.muted,textTransform:"capitalize"}}>{p.replace("_"," ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}