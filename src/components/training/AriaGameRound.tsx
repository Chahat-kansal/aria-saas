'use client'
import { useEffect, useRef } from 'react'

// TP-3 — React host for a ported TRAIN-1 game round. Mounts the engine into a scoped
// container, injects the (scoped) game CSS, and reports the 0-100 score via onComplete.
// Logic lives in aria-game-engine.ts (lazy-imported so the game JS only loads when played).

export default function AriaGameRound({ roundId, onComplete }: { roundId: string; onComplete: (score: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const doneRef = useRef(onComplete)
  doneRef.current = onComplete

  useEffect(() => {
    let cleanup = () => {}
    let active = true
    import('./aria-game-engine').then(({ mountRound }) => {
      if (!active || !ref.current) return
      cleanup = mountRound(ref.current, roundId, score => doneRef.current(score))
    })
    return () => { active = false; cleanup() }
  }, [roundId])

  return <><style>{GAME_CSS}</style><div ref={ref} /></>
}

// Scoped under .aria-game-root so nothing leaks into the portal. Adapted from
// prototypes/aria-game/styles.css (round surfaces only; the prototype's page chrome is dropped).
const GAME_CSS = `
.aria-game-root{--sage:#7FB897;--green:#2D5240;--green-soft:#3c6b54;--sand:#C9A37A;--amber:#BA7517;--red:#E24B4A;--cream:#FBF7F0;--cream-2:#F3EBDD;--ink:#2b332e;--glass:rgba(255,255,255,0.55);--line:rgba(45,82,64,0.12);color:var(--ink);}
.aria-game-root *{box-sizing:border-box;}
.aria-game-root .bubble{position:relative;background:#fff;border:1px solid var(--line);border-radius:16px;padding:11px 14px;font-size:14px;line-height:1.4;color:var(--ink);box-shadow:0 8px 20px -12px rgba(45,82,64,.4);text-align:center;margin-bottom:12px;}
.aria-game-root .bubble.pulse{animation:agpulse .4s ease;}
@keyframes agpulse{0%{transform:scale(1)}40%{transform:scale(1.03)}100%{transform:scale(1)}}
.aria-game-root .round{display:flex;flex-direction:column;gap:14px;}
.aria-game-root .qmeta{font-size:12px;color:#7d8a82;font-weight:600;}
.aria-game-root .panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 16px;box-shadow:0 6px 14px -12px rgba(45,82,64,.5);}
.aria-game-root .panel .ph{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--sand);font-weight:700;margin-bottom:8px;}
.aria-game-root .panel .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;}
.aria-game-root .stat{background:var(--cream);border-radius:12px;padding:10px 12px;}
.aria-game-root .stat .n{font-family:var(--font-display,'Cormorant',serif);font-style:italic;font-weight:600;font-size:22px;color:var(--green);line-height:1.1;}
.aria-game-root .stat .l{font-size:11px;color:#8a958d;text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-top:2px;}
.aria-game-root .prompt{font-size:16px;font-weight:600;color:var(--ink);line-height:1.4;}
.aria-game-root .choices{display:flex;flex-direction:column;gap:10px;}
.aria-game-root .choice{background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:13px 15px;font-size:14.5px;font-weight:500;color:var(--ink);cursor:pointer;text-align:left;transition:transform .08s,border-color .15s,background .15s;display:flex;align-items:center;gap:10px;line-height:1.35;font-family:inherit;}
.aria-game-root .choice:hover{border-color:var(--sage);}
.aria-game-root .choice:active{transform:scale(.99);}
.aria-game-root .choice.right{background:linear-gradient(120deg,rgba(127,184,151,.25),rgba(45,82,64,.1));border-color:var(--green);}
.aria-game-root .choice.wrong{background:rgba(226,75,74,.1);border-color:var(--red);}
.aria-game-root .choice .mk{font-weight:800;font-size:16px;width:18px;text-align:center;}
.aria-game-root .choice.locked{pointer-events:none;}
.aria-game-root .explain{background:var(--cream-2);border-radius:12px;padding:11px 14px;font-size:13.5px;color:var(--ink);line-height:1.4;}
.aria-game-root .explain b{color:var(--green);}
.aria-game-root .btn{border:none;border-radius:14px;padding:12px 18px;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:transform .08s ease,opacity .15s;}
.aria-game-root .btn:active{transform:translateY(1px) scale(.99);}
.aria-game-root .btn-primary{background:linear-gradient(120deg,var(--green),var(--green-soft));color:#fff;box-shadow:0 12px 24px -12px rgba(45,82,64,.9);}
.aria-game-root .btn-primary:disabled{opacity:.4;cursor:not-allowed;box-shadow:none;}
.aria-game-root .btn-row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;}
.aria-game-root .order-card{background:linear-gradient(120deg,var(--green),var(--green-soft));color:#fff;border-radius:16px;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;position:relative;overflow:hidden;}
.aria-game-root .order-card .label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.8;font-weight:600;}
.aria-game-root .order-card .want{font-size:16px;font-weight:600;margin-top:3px;}
.aria-game-root .order-card .cust{font-size:38px;line-height:1;}
.aria-game-root .timerbar{position:absolute;left:0;bottom:0;height:4px;background:var(--sage);width:100%;transition:width .12s linear;}
.aria-game-root .timerbar.warn{background:var(--amber);}
.aria-game-root .timerbar.danger{background:var(--red);}
.aria-game-root .panes{display:grid;grid-template-columns:1fr 260px;gap:14px;}
@media(max-width:640px){.aria-game-root .panes{grid-template-columns:1fr;}}
.aria-game-root .pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
@media(max-width:640px){.aria-game-root .pgrid{grid-template-columns:repeat(3,1fr);}}
.aria-game-root .tile{background:#fff;border:1px solid var(--line);border-radius:16px;padding:11px 6px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;transition:transform .08s,border-color .15s;box-shadow:0 6px 14px -10px rgba(45,82,64,.5);user-select:none;}
.aria-game-root .tile:hover{border-color:var(--sage);}
.aria-game-root .tile:active{transform:scale(.93);}
.aria-game-root .tile.flash{animation:agflash .35s ease;}
@keyframes agflash{0%{box-shadow:0 0 0 0 rgba(127,184,151,.7)}100%{box-shadow:0 0 0 14px rgba(127,184,151,0)}}
.aria-game-root .tile .emoji{font-size:26px;}
.aria-game-root .tile .nm{font-size:11.5px;font-weight:600;text-align:center;line-height:1.1;}
.aria-game-root .tile .pr{font-size:11.5px;color:var(--amber);font-weight:700;}
.aria-game-root .ticket{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:8px;min-height:200px;}
.aria-game-root .ticket h3{font-family:var(--font-display,'Cormorant',serif);font-style:italic;font-weight:600;font-size:19px;color:var(--green);display:flex;align-items:center;justify-content:space-between;}
.aria-game-root .ticket h3 .pill{font-family:inherit;font-style:normal;font-size:11px;background:var(--cream-2);color:var(--green);border-radius:999px;padding:3px 9px;font-weight:600;}
.aria-game-root .items{display:flex;flex-direction:column;gap:6px;flex:1;overflow:auto;max-height:230px;}
.aria-game-root .tempty{color:#9aa69e;font-size:13px;text-align:center;padding:22px 6px;font-style:italic;}
.aria-game-root .trow{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--cream);border-radius:10px;padding:7px 10px;font-size:13px;}
.aria-game-root .trow .ql{display:flex;align-items:center;gap:7px;}
.aria-game-root .trow .q{background:var(--green);color:#fff;border-radius:7px;font-size:11px;font-weight:700;padding:2px 6px;min-width:24px;text-align:center;}
.aria-game-root .trow .lt{font-weight:700;color:var(--green);}
.aria-game-root .trow .x{margin-left:4px;color:var(--red);cursor:pointer;font-weight:700;font-size:14px;padding:0 4px;border-radius:6px;}
.aria-game-root .ttotal{display:flex;align-items:center;justify-content:space-between;border-top:1px dashed var(--line);padding-top:10px;margin-top:4px;}
.aria-game-root .ttotal .lbl{font-size:13px;color:#7d8a82;font-weight:600;}
.aria-game-root .ttotal .amt{font-family:var(--font-display,'Cormorant',serif);font-style:italic;font-weight:600;font-size:24px;color:var(--green);}
.aria-game-root .change-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
.aria-game-root .change-opt{background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:14px;font-size:20px;font-weight:700;color:var(--green);cursor:pointer;font-family:var(--font-display,'Cormorant',serif);font-style:italic;transition:transform .08s,border-color .15s;}
.aria-game-root .change-opt:hover{border-color:var(--sage);}
.aria-game-root .change-opt:active{transform:scale(.96);}
.aria-game-root .change-opt.right{background:linear-gradient(120deg,var(--sage),var(--green));color:#fff;border-color:transparent;}
.aria-game-root .change-opt.wrong{background:rgba(226,75,74,.12);border-color:var(--red);color:var(--red);}
.aria-game-root .list{display:flex;flex-direction:column;gap:9px;}
.aria-game-root .lrow{display:flex;align-items:center;gap:12px;background:#fff;border:1.5px solid var(--line);border-radius:14px;padding:11px 14px;transition:border-color .15s,background .15s;}
.aria-game-root .lrow .lico{font-size:24px;width:30px;text-align:center;}
.aria-game-root .lrow .lbody{flex:1;}
.aria-game-root .lrow .lname{font-weight:600;font-size:14px;color:var(--ink);}
.aria-game-root .lrow .lmeta{font-size:12px;color:#7d8a82;margin-top:1px;}
.aria-game-root .lrow .cover{font-weight:700;}
.aria-game-root .lrow.sel{border-color:var(--green);background:linear-gradient(120deg,rgba(127,184,151,.18),rgba(255,255,255,.6));}
.aria-game-root .lrow.pick{cursor:pointer;}
.aria-game-root .lrow.pick:hover{border-color:var(--sage);}
.aria-game-root .lrow .check{width:22px;height:22px;border-radius:7px;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800;flex:none;}
.aria-game-root .lrow.sel .check{background:var(--green);border-color:var(--green);}
.aria-game-root .lrow.good{border-color:var(--sage);background:rgba(127,184,151,.14);}
.aria-game-root .lrow.bad{border-color:var(--red);background:rgba(226,75,74,.1);}
.aria-game-root .stepper{display:flex;align-items:center;gap:8px;}
.aria-game-root .stepper button{width:30px;height:30px;border-radius:9px;border:1px solid var(--line);background:#fff;font-size:18px;font-weight:700;color:var(--green);cursor:pointer;line-height:1;}
.aria-game-root .stepper .val{min-width:30px;text-align:center;font-weight:700;font-size:16px;color:var(--green);}
.aria-game-root .fb{font-size:11.5px;margin-top:3px;font-weight:600;}
.aria-game-root .fb.ok{color:var(--green);}
.aria-game-root .fb.warn{color:var(--red);}
.aria-game-root .ag-fx{position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden;}
.aria-game-root .confetti{position:absolute;width:9px;height:14px;border-radius:2px;will-change:transform,opacity;}
@keyframes agfall{0%{transform:translateY(-20px) rotate(0);opacity:1;}100%{transform:translateY(110vh) rotate(720deg);opacity:0;}}
.aria-game-root .ag-toast{position:fixed;left:50%;top:16%;transform:translateX(-50%) translateY(-12px);background:var(--green);color:#fff;border-radius:14px;padding:11px 20px;font-weight:700;font-size:16px;z-index:70;opacity:0;transition:opacity .2s,transform .2s;}
.aria-game-root .ag-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
.aria-game-root .ag-toast.bad{background:var(--red);}
.aria-game-root .hidden{display:none !important;}
`
